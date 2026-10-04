import type { SpeechRequest } from "@sodalis/speech";
import {
  extractAssistantUtteranceTextPrefix,
  parseAssistantUtterance,
} from "./AssistantUtterance.js";
import type { AssistantUtterance } from "./AssistantUtterance.js";

export {
  ASSISTANT_EXPRESSIONS,
  ASSISTANT_GESTURES,
  normalizeAssistantUtterance,
  parseAssistantUtterance,
  type AssistantAffect,
  type AssistantExpression,
  type AssistantGesture,
  type AssistantUtterance,
} from "./AssistantUtterance.js";

export type ConversationState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error";

export interface AssistantAppContext {
  readonly appId: string;
  readonly appName: string;
  readonly category?: string;
}

export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface LlmStreamRequest {
  readonly sessionId: string;
  readonly turnId: string;
  readonly messages: readonly ConversationMessage[];
  readonly appContext?: AssistantAppContext;
  readonly signal: AbortSignal;
}

export interface LlmTextDelta {
  readonly sessionId: string;
  readonly turnId: string;
  readonly sequence: number;
  readonly text: string;
}

export interface LlmProvider {
  readonly id: string;
  stream(request: LlmStreamRequest): AsyncIterable<LlmTextDelta>;
}

export interface ConversationSnapshot {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly state: ConversationState;
  readonly userTranscript: string;
  readonly assistantText: string;
  readonly interruptible: boolean;
  readonly error?: string;
}

export interface ConversationAudioOutput {
  speak(request: SpeechRequest, signal: AbortSignal): Promise<void>;
  stopPlayback(): void;
  cancelTts(): void;
}

export interface ConversationOrchestratorOptions {
  readonly provider: LlmProvider;
  readonly audioOutput: ConversationAudioOutput;
  readonly getAppContext?: () =>
    | AssistantAppContext
    | undefined
    | Promise<AssistantAppContext | undefined>;
  readonly onChange?: (snapshot: ConversationSnapshot) => void;
  readonly onUtterance?: (
    utterance: AssistantUtterance,
    signal: AbortSignal,
  ) => void;
  readonly createSessionId?: () => string;
  readonly createTurnId?: () => string;
  readonly historyMessageLimit?: number;
}

const MAX_RESPONSE_LENGTH = 12_000;
const MAX_HISTORY_MESSAGES = 12;
let fallbackIdSequence = 0;

function createId(prefix: string): string {
  fallbackIdSequence += 1;
  const unique =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
  return `${prefix}:${unique}`;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class ConversationOrchestrator {
  readonly sessionId: string;

  private readonly provider: LlmProvider;
  private readonly audioOutput: ConversationAudioOutput;
  private readonly getAppContext:
    | ConversationOrchestratorOptions["getAppContext"]
    | undefined;
  private readonly onChange:
    | ConversationOrchestratorOptions["onChange"]
    | undefined;
  private readonly onUtterance:
    | ConversationOrchestratorOptions["onUtterance"]
    | undefined;
  private readonly createTurnId: () => string;
  private readonly historyMessageLimit: number;
  private history: ConversationMessage[] = [];
  private activeTurn:
    | {
        readonly id: string;
        readonly abortController: AbortController;
      }
    | undefined;
  private snapshot: ConversationSnapshot;

  constructor(options: ConversationOrchestratorOptions) {
    this.provider = options.provider;
    this.audioOutput = options.audioOutput;
    this.getAppContext = options.getAppContext;
    this.onChange = options.onChange;
    this.onUtterance = options.onUtterance;
    this.sessionId = (options.createSessionId ?? (() => createId("session")))();
    this.createTurnId = options.createTurnId ?? (() => createId("turn"));
    this.historyMessageLimit = options.historyMessageLimit ?? 12;
    if (
      !Number.isInteger(this.historyMessageLimit) ||
      this.historyMessageLimit < 2 ||
      this.historyMessageLimit > MAX_HISTORY_MESSAGES
    ) {
      throw new RangeError(
        `Conversation history limit must be between two and ${MAX_HISTORY_MESSAGES}.`,
      );
    }
    this.snapshot = {
      sessionId: this.sessionId,
      state: "idle",
      userTranscript: "",
      assistantText: "",
      interruptible: true,
    };
  }

  get state(): ConversationSnapshot {
    return this.snapshot;
  }

  setListening(listening: boolean): void {
    if (this.activeTurn) return;
    if (listening) this.update({ state: "listening", error: undefined });
    else if (this.snapshot.state === "listening") {
      this.update({ state: "idle", error: undefined });
    }
  }

  setTranscribing(): void {
    if (!this.activeTurn) {
      this.update({
        state: "transcribing",
        userTranscript: "",
        assistantText: "",
        interruptible: true,
        error: undefined,
      });
    }
  }

  reportError(error: unknown): void {
    const turn = this.activeTurn;
    if (turn) {
      this.activeTurn = undefined;
      turn.abortController.abort(normalizeError(error));
      this.audioOutput.stopPlayback();
      this.audioOutput.cancelTts();
    }
    this.update({ state: "error", error: normalizeError(error).message });
  }

  reportInputError(error: unknown): void {
    if (this.activeTurn) return;
    this.update({
      state: "error",
      error: normalizeError(error).message,
    });
  }

  setInterrupted(): void {
    const turn = this.activeTurn;
    if (turn) {
      this.activeTurn = undefined;
      turn.abortController.abort(
        new DOMException("Conversation turn interrupted.", "AbortError"),
      );
      this.audioOutput.stopPlayback();
      this.audioOutput.cancelTts();
    }
    this.update({ state: "interrupted", error: undefined });
  }

  async submitUserMessage(text: string): Promise<void> {
    const userText = text.trim();
    if (!userText) return;
    if (userText.length > MAX_RESPONSE_LENGTH) {
      this.update({
        state: "error",
        userTranscript: userText.slice(0, MAX_RESPONSE_LENGTH),
        assistantText: "",
        error: `Messages must be no longer than ${MAX_RESPONSE_LENGTH} characters.`,
      });
      return;
    }

    if (this.activeTurn) this.cancelTurn();
    const turn = {
      id: this.createTurnId(),
      abortController: new AbortController(),
    };
    this.activeTurn = turn;
    this.update({
      turnId: turn.id,
      state: "thinking",
      userTranscript: userText,
      assistantText: "",
      interruptible: true,
      error: undefined,
    });

    try {
      const appContext = await this.getAppContext?.();
      turn.abortController.signal.throwIfAborted();
      if (this.activeTurn !== turn) return;
      let generatedResponse = "";
      let expectedSequence = 0;
      const messages: ConversationMessage[] = [
        ...this.history,
        { role: "user" as const, content: userText },
      ];
      for await (const delta of this.provider.stream({
        sessionId: this.sessionId,
        turnId: turn.id,
        messages,
        ...(appContext ? { appContext } : {}),
        signal: turn.abortController.signal,
      })) {
        turn.abortController.signal.throwIfAborted();
        if (this.activeTurn !== turn) return;
        if (
          delta.sessionId !== this.sessionId ||
          delta.turnId !== turn.id ||
          delta.sequence !== expectedSequence ||
          typeof delta.text !== "string" ||
          !delta.text
        ) {
          throw new Error("Assistant returned a stale or invalid text chunk.");
        }
        expectedSequence += 1;
        generatedResponse += delta.text;
        if (generatedResponse.length > MAX_RESPONSE_LENGTH) {
          throw new Error("Assistant response exceeded the length limit.");
        }
        this.update({
          assistantText: extractAssistantUtteranceTextPrefix(generatedResponse),
        });
      }

      turn.abortController.signal.throwIfAborted();
      if (this.activeTurn !== turn) return;
      if (!generatedResponse.trim()) {
        throw new Error("Assistant returned an empty response.");
      }
      const utterance = parseAssistantUtterance(generatedResponse);
      const assistantText = utterance.text;
      this.update({ assistantText, interruptible: utterance.interruptible });
      this.onUtterance?.(utterance, turn.abortController.signal);
      const completedConversation: ConversationMessage[] = [
        ...this.history,
        { role: "user", content: userText },
        { role: "assistant", content: assistantText },
      ];
      this.history = completedConversation.slice(-this.historyMessageLimit);
      await this.audioOutput.speak(
        {
          sessionId: this.sessionId,
          speechId: turn.id,
          text: assistantText,
          language: "nl-NL",
        },
        turn.abortController.signal,
      );
      if (this.activeTurn === turn) {
        this.activeTurn = undefined;
        this.update({ state: "idle" });
      }
    } catch (error) {
      if (this.activeTurn !== turn || turn.abortController.signal.aborted) {
        return;
      }
      this.activeTurn = undefined;
      const normalized = normalizeError(error);
      this.update({ state: "error", error: normalized.message });
    }
  }

  cancelTurn(): void {
    const turn = this.activeTurn;
    if (!turn) return;
    this.activeTurn = undefined;
    turn.abortController.abort(
      new DOMException("Conversation turn cancelled.", "AbortError"),
    );
    this.audioOutput.stopPlayback();
    this.audioOutput.cancelTts();
    this.update({ state: "interrupted", error: undefined });
  }

  notifyPlaybackState(turnId: string, speaking: boolean): void {
    if (this.activeTurn?.id !== turnId) return;
    if (speaking) {
      this.update({ state: "speaking", error: undefined });
    } else if (this.snapshot.state === "speaking") {
      this.update({ state: "thinking" });
    }
  }

  private update(
    patch: Partial<Omit<ConversationSnapshot, "sessionId">>,
  ): void {
    this.snapshot = { ...this.snapshot, ...patch, sessionId: this.sessionId };
    this.onChange?.(this.snapshot);
  }
}

export {
  ServerLlmProvider,
  type ServerLlmProviderOptions,
  type LlmProviderLatency,
} from "./ServerLlmProvider.js";
