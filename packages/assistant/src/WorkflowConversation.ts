import type {
  ConversationAudioOutput,
  ConversationMessage,
  ConversationSnapshot,
} from "./index.js";
import type { CompanionWorkflowClient } from "./ServerWorkflowClient.js";

/**
 * Desktop side of the Pi companion workflow (read-only; no app actions).
 *
 * - Speech onset stops playback and queued speech, but keeps the workflow.
 * - A new message while a workflow runs is sent as steering; if the server
 *   reports the workflow already settled, a new workflow starts after the old
 *   terminal event is consumed, so the message is neither dropped nor sent twice.
 * - An answer is not spoken while a newer local utterance awaits transcription
 *   or submission; it is held and spoken only if that utterance is discarded.
 * - Only `cancelTurn` cancels the workflow.
 */

export interface WorkflowConversationOptions {
  readonly client: CompanionWorkflowClient;
  readonly audioOutput: ConversationAudioOutput;
  readonly onChange?: (snapshot: ConversationSnapshot) => void;
  readonly createSessionId?: () => string;
  readonly createId?: (prefix: string) => string;
  readonly historyMessageLimit?: number;
  readonly language?: string;
}

interface ActiveWorkflow {
  readonly id: string;
  readonly stream: AbortController;
  readonly done: Promise<void>;
  latestInputId: string;
  /** Steering inputs sent but not yet acknowledged; an answer may already cover one. */
  readonly pendingInputIds: Set<string>;
  terminal: boolean;
  cancelled: boolean;
}

const MAX_MESSAGE_LENGTH = 12_000;
const MAX_HISTORY_MESSAGES = 12;
let idSequence = 0;

function defaultId(prefix: string): string {
  idSequence += 1;
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${idSequence.toString(36)}`}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WorkflowConversationOrchestrator {
  readonly sessionId: string;

  private readonly client: CompanionWorkflowClient;
  private readonly audioOutput: ConversationAudioOutput;
  private readonly onChange: WorkflowConversationOptions["onChange"];
  private readonly createId: (prefix: string) => string;
  private readonly historyMessageLimit: number;
  private readonly language: string;
  private history: ConversationMessage[] = [];
  private active: ActiveWorkflow | undefined;
  private speech: { readonly id: string; readonly abort: AbortController } | undefined;
  private heldAnswer: string | undefined;
  private utterancePending = false;
  private submissions = 0;
  private snapshot: ConversationSnapshot;

  constructor(options: WorkflowConversationOptions) {
    this.client = options.client;
    this.audioOutput = options.audioOutput;
    this.onChange = options.onChange;
    this.createId = options.createId ?? defaultId;
    this.sessionId = (options.createSessionId ?? (() => this.createId("session")))();
    this.historyMessageLimit = options.historyMessageLimit ?? MAX_HISTORY_MESSAGES;
    this.language = options.language ?? "nl-NL";
    if (!Number.isInteger(this.historyMessageLimit) || this.historyMessageLimit < 2 || this.historyMessageLimit > MAX_HISTORY_MESSAGES) {
      throw new RangeError(`Conversation history limit must be between two and ${MAX_HISTORY_MESSAGES}.`);
    }
    this.snapshot = { sessionId: this.sessionId, state: "idle", userTranscript: "", assistantText: "", interruptible: true };
  }

  get state(): ConversationSnapshot {
    return this.snapshot;
  }

  private get running(): boolean {
    return Boolean(this.active && !this.active.terminal);
  }

  setListening(listening: boolean): void {
    if (this.running || this.speech) return;
    if (listening) this.update({ state: "listening", error: undefined });
    else if (this.snapshot.state === "listening") this.update({ state: "idle", error: undefined });
  }

  /** Speech onset: stop talking now, keep the workflow, and hold answers until the utterance resolves. */
  setTranscribing(): void {
    this.utterancePending = true;
    this.stopSpeech();
    this.update({ state: "transcribing", userTranscript: "", error: undefined });
  }

  /** The pending utterance produced no message; a held answer may now be spoken. */
  discardUtterance(): void {
    if (!this.utterancePending) return;
    this.utterancePending = false;
    this.releaseHeldAnswer();
    if (!this.speech) this.update({ state: this.running ? "thinking" : "idle" });
  }

  /** Barge-in: stop speaking only. */
  setInterrupted(): void {
    this.stopSpeech();
    this.update({ state: this.running ? "thinking" : "interrupted", error: undefined });
  }

  /** Explicit task cancellation. */
  cancelTurn(): void {
    this.stopSpeech();
    this.heldAnswer = undefined;
    const active = this.active;
    if (active && !active.terminal) {
      active.cancelled = true;
      active.terminal = true;
      void this.client.cancel(active.id).catch((error: unknown) => console.error("Cancelling the workflow failed:", error));
      active.stream.abort(new DOMException("Workflow cancelled.", "AbortError"));
      this.update({ state: "interrupted", error: undefined });
    }
  }

  reportError(error: unknown): void {
    this.cancelTurn();
    this.update({ state: "error", error: message(error) });
  }

  reportInputError(error: unknown): void {
    this.discardUtterance();
    if (this.running) return;
    this.update({ state: "error", error: message(error) });
  }

  notifyPlaybackState(speechId: string, speaking: boolean): void {
    if (this.speech?.id !== speechId) return;
    if (speaking) this.update({ state: "speaking", error: undefined });
  }

  async confirmPendingAction(_confirmationId?: string): Promise<void> {
    throw new Error("Assistant actions are not available in companion workflows.");
  }

  cancelPendingAction(_confirmationId?: string): void {
    throw new Error("Assistant actions are not available in companion workflows.");
  }

  async submitUserMessage(text: string): Promise<void> {
    const userText = text.trim();
    this.utterancePending = false;
    if (!userText) {
      this.releaseHeldAnswer();
      return;
    }
    if (userText.length > MAX_MESSAGE_LENGTH) {
      this.update({ state: "error", error: `Messages must be no longer than ${MAX_MESSAGE_LENGTH} characters.` });
      return;
    }
    this.stopSpeech();
    // An answer that arrived during this utterance stays in the history unspoken.
    this.heldAnswer = undefined;
    this.submissions += 1;
    this.update({ state: "thinking", userTranscript: userText, assistantText: "", error: undefined });
    try {
      const active = this.active;
      if (active && !active.terminal) {
        const inputId = this.createId("input");
        const entry: ConversationMessage = { role: "user", content: userText };
        // Recorded first so an answer covering this input follows it in the history.
        this.appendHistory(entry);
        active.pendingInputIds.add(inputId);
        let result: Awaited<ReturnType<CompanionWorkflowClient["steer"]>>;
        try {
          result = await this.client.steer({ workflowId: active.id, inputId, text: userText });
        } catch (error) {
          console.error("Steering the workflow failed:", error);
          result = "not_running";
        } finally {
          active.pendingInputIds.delete(inputId);
        }
        if (result === "accepted" || result === "duplicate") {
          if (!active.terminal) active.latestInputId = inputId;
          return;
        }
        // The workflow settled first: consume its terminal event, then start anew.
        await active.done;
        this.heldAnswer = undefined;
        this.history = this.history.filter((candidate) => candidate !== entry);
      }
      this.startWorkflow(userText);
    } finally {
      this.submissions -= 1;
      if (!this.utterancePending) this.releaseHeldAnswer();
    }
  }

  private startWorkflow(userText: string): void {
    const previous = this.active;
    if (previous && !previous.terminal) this.cancelTurn();
    const workflowId = this.createId("workflow");
    const inputId = this.createId("input");
    this.appendHistory({ role: "user", content: userText });
    const stream = new AbortController();
    let markDone!: () => void;
    const active: ActiveWorkflow = {
      id: workflowId,
      stream,
      done: new Promise<void>((resolve) => {
        markDone = resolve;
      }),
      latestInputId: inputId,
      pendingInputIds: new Set(),
      terminal: false,
      cancelled: false,
    };
    this.active = active;
    this.update({ turnId: workflowId, state: "thinking", error: undefined });
    void this.consume(active, [...this.history], inputId).finally(() => {
      active.terminal = true;
      markDone();
    });
  }

  private async consume(active: ActiveWorkflow, messages: ConversationMessage[], inputId: string): Promise<void> {
    try {
      for await (const event of this.client.start({
        sessionId: this.sessionId,
        workflowId: active.id,
        inputId,
        messages,
        signal: active.stream.signal,
      })) {
        if (active.cancelled || this.active !== active) return;
        if (event.type === "started") continue;
        active.terminal = true;
        if (event.type === "cancelled") {
          this.update({ state: "interrupted" });
        } else if (event.type === "answer") {
          if (event.inputId !== active.latestInputId && !active.pendingInputIds.has(event.inputId)) {
            throw new Error("Assistant answered an outdated message.");
          }
          active.latestInputId = event.inputId;
          this.deliver(event.text);
        } else {
          this.deliver(event.residentMessage);
        }
        return;
      }
      if (!active.cancelled && this.active === active) {
        throw new Error("The assistant workflow ended without a result.");
      }
    } catch (error) {
      if (active.cancelled || active.stream.signal.aborted || this.active !== active) return;
      active.terminal = true;
      this.update({ state: "error", error: message(error) });
    }
  }

  private deliver(text: string): void {
    this.appendHistory({ role: "assistant", content: text });
    if (this.utterancePending || this.submissions > 0) {
      this.heldAnswer = text;
      return;
    }
    void this.speak(text);
  }

  private releaseHeldAnswer(): void {
    const text = this.heldAnswer;
    this.heldAnswer = undefined;
    if (text !== undefined && this.submissions === 0) void this.speak(text);
  }

  private async speak(text: string): Promise<void> {
    this.stopSpeech();
    const speech = { id: this.createId("speech"), abort: new AbortController() };
    this.speech = speech;
    this.update({ assistantText: text, state: "thinking", error: undefined });
    try {
      await this.audioOutput.speak(
        { sessionId: this.sessionId, speechId: speech.id, text, language: this.language },
        speech.abort.signal,
      );
      if (this.speech === speech) {
        this.speech = undefined;
        this.update({ state: this.running ? "thinking" : "idle" });
      }
    } catch (error) {
      if (this.speech !== speech || speech.abort.signal.aborted) return;
      this.speech = undefined;
      this.update({ state: "error", error: message(error) });
    }
  }

  private stopSpeech(): void {
    const speech = this.speech;
    this.speech = undefined;
    speech?.abort.abort(new DOMException("Speech stopped.", "AbortError"));
    this.audioOutput.stopPlayback();
    this.audioOutput.cancelTts();
  }

  private appendHistory(entry: ConversationMessage): void {
    this.history = [...this.history, entry].slice(-this.historyMessageLimit);
    while (this.history.length && this.history[0]!.role !== "user") this.history = this.history.slice(1);
  }

  private update(patch: Partial<Omit<ConversationSnapshot, "sessionId">>): void {
    this.snapshot = { ...this.snapshot, ...patch, sessionId: this.sessionId };
    this.onChange?.(this.snapshot);
  }
}
