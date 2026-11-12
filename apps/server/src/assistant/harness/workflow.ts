import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ConversationMessage } from "@sodalis/assistant";
import type { ToolBudget } from "./tools.js";
import type { CompanionModelRequestObservation } from "./companionSession.js";
import type { CompanionAuditEvent, CompanionAuditSink } from "./audit.js";

/**
 * One foreground companion workflow per resident conversation: start, steer
 * and cancel a temporary Pi session, and publish exactly one terminal outcome.
 * Only a settled, tool-free assistant message covering the latest accepted
 * resident input is published as an answer.
 */

export type WorkflowFailureCode = "model_error" | "empty" | "limit" | "timeout" | "internal";

export type WorkflowEvent =
  | { readonly type: "started"; readonly workflowId: string; readonly sequence: number }
  | { readonly type: "answer"; readonly workflowId: string; readonly sequence: number; readonly inputId: string; readonly text: string }
  | {
      readonly type: "failed";
      readonly workflowId: string;
      readonly sequence: number;
      readonly code: WorkflowFailureCode;
      readonly residentMessage: string;
    }
  | { readonly type: "cancelled"; readonly workflowId: string; readonly sequence: number };

export type TerminalWorkflowEvent = Exclude<WorkflowEvent, { type: "started" }>;

export const WORKFLOW_LIMITS = {
  /** Model responses per workflow, including the final answer. */
  maxModelTurns: 8,
  maxToolCalls: 16,
  maxSteeringInputs: 8,
  timeoutMs: 60_000,
} as const;

export type WorkflowLimits = { readonly [K in keyof typeof WORKFLOW_LIMITS]: number };

/** Short host-authored messages; no model call is needed to produce them. */
const RESIDENT_MESSAGES: Record<WorkflowFailureCode, string> = {
  limit: "Het lukte me niet om dit helemaal na te gaan.",
  timeout: "Het lukte me niet om dit op tijd na te gaan.",
  model_error: "Er ging iets mis. Ik kan je vraag nu niet beantwoorden.",
  empty: "Er ging iets mis. Ik kan je vraag nu niet beantwoorden.",
  internal: "Er ging iets mis. Ik kan je vraag nu niet beantwoorden.",
};

export interface WorkflowStartInput {
  readonly sessionId: string;
  readonly workflowId: string;
  /** Identifies the resident input that is the last message. */
  readonly inputId: string;
  /** Bounded resident conversation, oldest first; the last message is the question. */
  readonly messages: readonly ConversationMessage[];
}

export type WorkflowStartResult =
  | { readonly status: "started"; readonly done: Promise<TerminalWorkflowEvent> }
  | { readonly status: "conflict" | "capacity" };

export type SteerResult = "accepted" | "duplicate" | "not_running" | "conflict";
export type CancelResult = "cancelled" | "not_running";

export interface CompanionWorkflowsOptions {
  /** Creates the session for one workflow, with tools bound to `budget`. */
  readonly createSession: (input: {
    readonly history: readonly ConversationMessage[];
    readonly budget: ToolBudget;
    readonly observeModelRequest?: (observation: CompanionModelRequestObservation) => void;
  }) => Promise<AgentSession>;
  readonly limits?: Partial<WorkflowLimits>;
  readonly maxConcurrentWorkflows?: number;
  /** Local developer diagnostics; omitted by default and never sent to residents. */
  readonly audit?: CompanionAuditSink;
}

export interface WorkflowStartOptions {
  /** Aborting (for example on stream disconnect) stops server work without an event. */
  readonly signal?: AbortSignal;
  readonly onEvent: (event: WorkflowEvent) => void;
}

interface AnswerCandidate {
  readonly text: string;
  readonly inputId: string;
}

function assistantText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

function auditText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"),
    )
    .map((part) => part.text)
    .join("");
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const PRIVATE_MODEL_CONTENT = new Set(["thinking", "reasoning", "redactedThinking", "signature"]);

function projectModelMessages(input: unknown): { messages: Record<string, unknown>[]; omittedPrivateContent: number } {
  if (!Array.isArray(input)) return { messages: [], omittedPrivateContent: 0 };
  let omittedPrivateContent = 0;
  const messages = input.flatMap((entry): Record<string, unknown>[] => {
    const message = recordOf(entry);
    if (typeof message.role !== "string") return [];
    const projected: Record<string, unknown> = { role: message.role };
    for (const key of ["name", "toolCallId", "toolName", "isError"] as const) {
      if (message[key] !== undefined) projected[key] = message[key];
    }
    if (typeof message.content === "string") {
      projected.content = message.content;
    } else if (Array.isArray(message.content)) {
      projected.content = message.content.flatMap((part): Record<string, unknown>[] => {
        const content = recordOf(part);
        if (typeof content.type !== "string") return [];
        if (PRIVATE_MODEL_CONTENT.has(content.type)) {
          omittedPrivateContent += 1;
          return [];
        }
        if (content.type === "text" && typeof content.text === "string") {
          return [{ type: "text", text: content.text }];
        }
        if (content.type === "toolCall") {
          return [{
            type: "toolCall",
            ...(content.id === undefined ? {} : { id: content.id }),
            ...(content.name === undefined ? {} : { name: content.name }),
            ...(content.arguments === undefined ? {} : { arguments: content.arguments }),
          }];
        }
        if (content.type === "toolResult") {
          const result = Array.isArray(content.content)
            ? content.content.flatMap((resultPart): Record<string, unknown>[] => {
                const textPart = recordOf(resultPart);
                return textPart.type === "text" && typeof textPart.text === "string"
                  ? [{ type: "text", text: textPart.text }]
                  : [];
              })
            : [];
          return [{
            type: "toolResult",
            ...(content.toolCallId === undefined ? {} : { toolCallId: content.toolCallId }),
            content: result,
            ...(content.isError === undefined ? {} : { isError: content.isError }),
          }];
        }
        omittedPrivateContent += 1;
        return [];
      });
    } else if (message.content !== undefined) {
      omittedPrivateContent += 1;
    }
    return [projected];
  });
  return { messages, omittedPrivateContent };
}

function projectProviderTools(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry): Record<string, unknown>[] => {
    const tool = recordOf(entry);
    const fn = recordOf(tool.function);
    const name = typeof fn.name === "string" ? fn.name : typeof tool.name === "string" ? tool.name : undefined;
    if (!name) return [];
    return [{
      name,
      ...(typeof fn.description === "string" ? { description: fn.description } : {}),
      ...(fn.parameters === undefined ? {} : { parameters: fn.parameters }),
    }];
  });
}

function providerUsage(value: unknown): Record<string, unknown> {
  const usage = recordOf(value);
  const fields = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const;
  const counts = Object.fromEntries(
    fields.flatMap((field) => {
      const count = usage[field];
      return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
        ? [[field, count]]
        : [];
    }),
  );
  if (!Object.values(counts).some((count) => typeof count === "number" && count > 0)) {
    return {
      usageSource: "unavailable",
      usageUnavailableReason: "Pi usage was absent or zero-only, so provider counts cannot be distinguished from synthetic history.",
    };
  }
  return { usageSource: "provider_reported", usage: counts };
}

class WorkflowRun {
  readonly sessionId: string;
  readonly workflowId: string;
  private state: "running" | "done" = "running";
  private session: AgentSession | undefined;
  private unsubscribe: (() => void) | undefined;
  private sequence = 0;
  private readonly accepted = new Set<string>();
  private readonly inputTexts = new Map<string, string>();
  private latestAcceptedInputId: string;
  private latestDeliveredInputId: string | undefined;
  /** Resident inputs submitted to Pi, in order, each covered by one future user message. */
  private expectedUserMessages: string[][] = [];
  private candidate: AnswerCandidate | undefined;
  private modelError = false;
  /** Provider error text of the latest failed model response, for developer logs only. */
  private modelErrorMessage: string | undefined;
  private limitCode: "limit" | "timeout" | undefined;
  private modelTurns = 0;
  private modelRequestSequence = 0;
  private modelTurn = 0;
  private currentModelRequestId: string | undefined;
  private toolCalls = 0;
  private steeringInputs = 0;
  private readonly timer: ReturnType<typeof setTimeout>;
  private resolveDone!: (event: TerminalWorkflowEvent) => void;
  private readonly startedAt = Date.now();
  private readonly turnStartedAt: number[] = [];
  readonly done = new Promise<TerminalWorkflowEvent>((resolve) => {
    this.resolveDone = resolve;
  });

  constructor(
    private readonly input: WorkflowStartInput,
    private readonly limits: WorkflowLimits,
    private readonly onEvent: (event: WorkflowEvent) => void,
    private readonly onFinished: () => void,
    private readonly audit: CompanionAuditSink | undefined,
  ) {
    this.sessionId = input.sessionId;
    this.workflowId = input.workflowId;
    this.latestAcceptedInputId = input.inputId;
    this.accepted.add(input.inputId);
    this.timer = setTimeout(() => this.stopAtLimit("timeout"), limits.timeoutMs);
  }

  get running(): boolean {
    return this.state === "running";
  }

  async start(createSession: CompanionWorkflowsOptions["createSession"]): Promise<void> {
    this.recordAudit("workflow.started", { inputId: this.input.inputId });
    for (const [historyIndex, message] of this.input.messages.slice(0, -1).entries()) {
      this.recordAudit(`${message.role}.message`, {
        text: message.content,
        source: "conversation_history",
        historyIndex,
      });
    }
    this.emit({ type: "started", workflowId: this.workflowId, sequence: this.sequence++ });
    const question = this.input.messages.at(-1)!.content;
    let session: AgentSession;
    try {
      session = await createSession({
        history: this.input.messages.slice(0, -1),
        budget: { onUnproductive: () => this.stopAtLimit("limit") },
        ...(this.audit ? { observeModelRequest: (observation) => this.recordModelRequest(observation) } : {}),
      });
    } catch (error) {
      console.error(`Companion workflow "${this.workflowId}" could not start:`, error);
      this.finishFailed("internal");
      return;
    }
    if (this.state === "done") {
      session.dispose();
      return;
    }
    this.session = session;
    this.unsubscribe = session.subscribe((event) => this.handle(event));
    if (this.limitCode) {
      this.finishFailed(this.limitCode);
      return;
    }
    // Steering accepted before the session existed is folded into the question.
    const pending = this.expectedUserMessages.flat();
    this.expectedUserMessages = [[this.input.inputId, ...pending]];
    this.submit([question, ...pending.map((id) => this.inputTexts.get(id)!)].join("\n"));
  }

  steer(inputId: string, text: string): SteerResult {
    if (this.accepted.has(inputId)) return "duplicate";
    if (this.state !== "running") return "not_running";
    if (this.steeringInputs >= this.limits.maxSteeringInputs) return "conflict";
    this.steeringInputs += 1;
    this.accepted.add(inputId);
    this.inputTexts.set(inputId, text);
    this.latestAcceptedInputId = inputId;
    this.candidate = undefined;
    this.recordAudit("workflow.input.accepted", { inputId, text });
    if (!this.session) return "accepted";
    this.expectedUserMessages.push([inputId]);
    // A failed or unconsumed steer is resubmitted when the run settles.
    this.session.steer(text).catch((error: unknown) => {
      console.error(`Steering workflow "${this.workflowId}" failed:`, error);
    });
    return "accepted";
  }

  cancel(): CancelResult {
    if (this.state !== "running") return "not_running";
    this.finish({ type: "cancelled", workflowId: this.workflowId, sequence: this.sequence++ });
    return "cancelled";
  }

  /** Stops server work after the client went away; no event can be delivered. */
  disconnect(): void {
    if (this.state !== "running") return;
    this.recordAudit("workflow.terminal", { outcome: "disconnected", durationMs: Date.now() - this.startedAt });
    this.state = "done";
    this.release();
  }

  private handle(event: AgentSessionEvent): void {
    if (this.state !== "running") return;
    this.auditSessionEvent(event);
    switch (event.type) {
      case "message_end": {
        const message = event.message;
        if (message.role === "user") {
          this.recordAudit("user.message", { text: auditText(message.content) });
          const covered = this.expectedUserMessages.shift();
          if (covered?.length) this.latestDeliveredInputId = covered.at(-1);
          this.candidate = undefined;
        } else if (message.role === "assistant") {
          this.recordAudit("assistant.message", {
            text: auditText(message.content),
            source: "model",
            provider: message.provider,
            model: message.model,
            api: message.api,
            stopReason: message.stopReason,
            ...(message.errorMessage ? { errorMessage: message.errorMessage } : {}),
            modelTurn: this.modelTurn,
            modelRequestId: this.currentModelRequestId,
            ...providerUsage(message.usage),
          }, this.currentModelRequestId ?? this.workflowId);
          for (const part of message.content) {
            if (part.type !== "toolCall") continue;
            this.recordAudit("tool.selected", {
              toolCallId: part.id,
              toolName: part.name,
              arguments: part.arguments,
              modelTurn: this.modelTurn,
              modelRequestId: this.currentModelRequestId,
            }, part.id);
          }
          this.modelTurns += 1;
          this.modelError = message.stopReason === "error";
          this.modelErrorMessage = this.modelError ? message.errorMessage ?? "no error message" : undefined;
          const hasToolCall = message.content.some((part) => part.type === "toolCall");
          const text = assistantText(message.content);
          this.candidate =
            !hasToolCall && !this.modelError && message.stopReason !== "aborted" && text && this.latestDeliveredInputId
              ? { text, inputId: this.latestDeliveredInputId }
              : undefined;
          if (hasToolCall && this.modelTurns >= this.limits.maxModelTurns) this.stopAtLimit("limit");
        }
        return;
      }
      case "tool_execution_start":
        this.toolCalls += 1;
        if (this.toolCalls > this.limits.maxToolCalls) this.stopAtLimit("limit");
        return;
      case "agent_settled":
        this.settle(event.aborted);
        return;
      default:
        return;
    }
  }

  private auditSessionEvent(event: AgentSessionEvent): void {
    const raw = event as unknown as Record<string, unknown>;
    if (event.type === "agent_start") {
      this.recordAudit("model.run.started");
    } else if (event.type === "agent_end") {
      this.recordAudit("model.run.ended", { willRetry: raw.willRetry });
    } else if (event.type === "agent_settled") {
      this.recordAudit("model.run.settled", { aborted: raw.aborted });
    } else if (event.type === "turn_start") {
      this.turnStartedAt.push(Date.now());
      this.modelTurn += 1;
      this.currentModelRequestId = undefined;
      this.recordAudit("model.turn.started", { turn: this.modelTurn });
    } else if (event.type === "turn_end") {
      const startedAt = this.turnStartedAt.shift();
      this.recordAudit("model.turn.completed", {
        turn: this.modelTurn,
        durationMs: startedAt === undefined ? undefined : Date.now() - startedAt,
        stopReason: recordOf(raw.message).stopReason,
        modelRequestId: this.currentModelRequestId,
      }, this.currentModelRequestId ?? this.workflowId);
    } else if (event.type === "tool_execution_start") {
      const toolCallId = String(raw.toolCallId ?? "");
      this.recordAudit("tool.dispatched", {
        toolCallId,
        toolName: raw.toolName,
        arguments: raw.args,
        modelTurn: this.modelTurn,
        modelRequestId: this.currentModelRequestId,
      }, toolCallId || this.workflowId);
      this.recordAudit("host.tool.decision", {
        toolCallId,
        toolName: raw.toolName,
        decision: "execute",
        reason: "registered host-owned tool",
        source: "host",
        modelTurn: this.modelTurn,
        modelRequestId: this.currentModelRequestId,
      }, toolCallId || this.workflowId);
    } else if (event.type === "tool_execution_end") {
      const toolCallId = String(raw.toolCallId ?? "");
      const result = recordOf(raw.result);
      this.recordAudit("tool.result", {
        toolCallId,
        toolName: raw.toolName,
        result,
        isError: raw.isError,
        durationMs: raw.durationMs,
        validationDecision: this.toolDecision(result),
        modelTurn: this.modelTurn,
        modelRequestId: this.currentModelRequestId,
      }, toolCallId || this.workflowId);
    }
  }

  private toolDecision(result: Record<string, unknown>): string | undefined {
    const direct = typeof result.status === "string" ? result.status : undefined;
    if (direct) return direct;
    const content = auditText(result.content);
    try {
      const payload: unknown = JSON.parse(content);
      const status = recordOf(payload).status;
      return typeof status === "string" ? status : undefined;
    } catch {
      return undefined;
    }
  }

  private settle(aborted: boolean): void {
    if (this.limitCode) {
      this.finishFailed(this.limitCode);
      return;
    }
    if (aborted) {
      this.finishFailed("internal");
      return;
    }
    const undelivered = this.expectedUserMessages.flat();
    if (undelivered.length) {
      // Accepted steering that Pi did not consume must be answered before publishing.
      this.session!.clearQueue();
      this.expectedUserMessages = [undelivered];
      this.submit(undelivered.map((id) => this.inputTexts.get(id)!).join("\n"));
      return;
    }
    if (this.candidate && this.candidate.inputId === this.latestAcceptedInputId) {
      this.finish({
        type: "answer",
        workflowId: this.workflowId,
        sequence: this.sequence++,
        inputId: this.candidate.inputId,
        text: this.candidate.text,
      });
    } else {
      if (this.modelError) {
        console.error(`Companion workflow "${this.workflowId}": the model request failed: ${this.modelErrorMessage}`);
        this.finishFailed("model_error");
      } else {
        console.error(`Companion workflow "${this.workflowId}": the model returned no answer text.`);
        this.finishFailed("empty");
      }
    }
  }

  private submit(text: string): void {
    this.session!.prompt(text, { expandPromptTemplates: false }).catch((error: unknown) => {
      if (this.state !== "running") return;
      console.error(`Companion workflow "${this.workflowId}" failed:`, error);
      this.finishFailed(this.limitCode ?? "model_error");
    });
  }

  private stopAtLimit(code: "limit" | "timeout"): void {
    if (this.state !== "running" || this.limitCode) return;
    this.limitCode = code;
    this.recordAudit("host.workflow.decision", {
      decision: "stop",
      reason: code,
      source: "host",
      modelTurn: this.modelTurn,
      modelRequestId: this.currentModelRequestId,
    }, this.currentModelRequestId ?? this.workflowId);
    if (!this.session) return;
    const session = this.session;
    void session.abort().finally(() => {
      if (this.state === "running") this.finishFailed(code);
    });
  }

  private finishFailed(code: WorkflowFailureCode): void {
    this.finish({
      type: "failed",
      workflowId: this.workflowId,
      sequence: this.sequence++,
      code,
      residentMessage: RESIDENT_MESSAGES[code],
    });
  }

  private finish(event: TerminalWorkflowEvent): void {
    if (this.state !== "running") return;
    this.state = "done";
    this.recordAudit("workflow.terminal", {
      outcome: event.type,
      terminalCode: event.type === "failed" ? event.code : undefined,
      ...(event.type === "answer" ? { residentAnswer: event.text, residentAnswerSource: "host-delivered model response" } : {}),
      ...(event.type === "failed" ? { residentMessage: event.residentMessage } : {}),
      durationMs: Date.now() - this.startedAt,
    });
    this.emit(event);
    this.release();
    this.resolveDone(event);
  }

  private release(): void {
    clearTimeout(this.timer);
    this.unsubscribe?.();
    const session = this.session;
    if (session) {
      void session
        .abort()
        .catch((error: unknown) => console.error(`Aborting workflow "${this.workflowId}" failed:`, error))
        .finally(() => session.dispose());
    }
    this.onFinished();
  }

  private emit(event: WorkflowEvent): void {
    try {
      this.onEvent(event);
    } catch (error) {
      console.error(`Delivering workflow event for "${this.workflowId}" failed:`, error);
    }
  }

  private recordAudit(
    event: string,
    details: Record<string, unknown> = {},
    correlationId = this.workflowId,
  ): void {
    if (!this.audit) return;
    const record = {
      ...details,
      event,
      workflowId: this.workflowId,
      sessionId: this.sessionId,
      correlationId,
      timestamp: new Date().toISOString(),
    } as CompanionAuditEvent;
    try {
      const write = this.audit.write(record);
      if (write && typeof write.then === "function") {
        void write.catch((error: unknown) => console.error("Developer audit write failed:", error));
      }
    } catch (error) {
      console.error("Developer audit write failed:", error);
    }
  }

  private recordModelRequest(observation: CompanionModelRequestObservation): void {
    if (!this.running) return;
    if (observation.boundary === "context_with_system") {
      const requestNumber = ++this.modelRequestSequence;
      const requestId = `${this.workflowId}:request:${requestNumber}`;
      this.currentModelRequestId = requestId;
      const context = projectModelMessages(observation.messages);
      this.recordAudit("model.request.context", {
        captureBoundary: "Pi SDK context_with_system",
        modelTurn: this.modelTurn || requestNumber,
        modelRequestId: requestId,
        model: {
          provider: this.session?.agent.state.model.provider,
          id: this.session?.agent.state.model.id,
          api: this.session?.agent.state.model.api,
          reasoning: this.session?.agent.state.model.reasoning,
        },
        reasoningSettings: {
          thinkingLevel: this.session?.agent.state.thinkingLevel,
        },
        reasoningSummary: {
          status: "unavailable",
          source: "Pi SDK",
          reason: "Pi SDK 1.5.0 exposes no supported summary distinct from opaque thinking or private reasoning.",
        },
        effectiveSystemPrompt: observation.effectiveSystemPrompt ?? "[unavailable from SDK session]",
        messages: context.messages,
        omittedPrivateContent: context.omittedPrivateContent,
        offeredTools: this.session?.getAllTools()
          .filter((tool) => this.session?.getActiveToolNames().includes(tool.name))
          .map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          })) ?? [],
        providerPayloadCapture: "pending or unavailable; see provider request context when emitted",
      }, requestId);
      return;
    }

    const requestId = this.currentModelRequestId ?? `${this.workflowId}:request:unmatched`;
    const payload = recordOf(observation.payload);
    const messages = projectModelMessages(payload.messages);
    this.recordAudit("model.request.provider_context", {
      modelTurn: this.modelTurn,
      modelRequestId: requestId,
      captureBoundary: "Pi SDK before_provider_request payload; SDK-converted, not provider-wire capture",
      model: typeof payload.model === "string" ? payload.model : undefined,
      messages: messages.messages,
      omittedPrivateContent: messages.omittedPrivateContent,
      offeredTools: projectProviderTools(payload.tools),
      reasoningSettings: {
        ...(typeof payload.reasoning_effort === "string" ? { reasoningEffort: payload.reasoning_effort } : {}),
        ...(typeof payload.thinking === "string" ? { thinking: payload.thinking } : {}),
      },
    }, requestId);
  }
}

export class CompanionWorkflows {
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly limits: WorkflowLimits;
  private readonly maxConcurrentWorkflows: number;

  constructor(private readonly options: CompanionWorkflowsOptions) {
    this.limits = { ...WORKFLOW_LIMITS, ...options.limits };
    this.maxConcurrentWorkflows = options.maxConcurrentWorkflows ?? 4;
  }

  start(input: WorkflowStartInput, options: WorkflowStartOptions): WorkflowStartResult {
    if (input.messages.at(-1)?.role !== "user") throw new RangeError("The last message must be the resident's input.");
    for (const run of this.runs.values()) {
      if (run.workflowId === input.workflowId || run.sessionId === input.sessionId) return { status: "conflict" };
    }
    if (this.runs.size >= this.maxConcurrentWorkflows) return { status: "capacity" };
    const run = new WorkflowRun(input, this.limits, options.onEvent, () => {
      if (this.runs.get(input.workflowId) === run) this.runs.delete(input.workflowId);
      options.signal?.removeEventListener("abort", onAbort);
    }, this.options.audit);
    const onAbort = () => run.disconnect();
    this.runs.set(input.workflowId, run);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) run.disconnect();
    else void run.start(this.options.createSession);
    return { status: "started", done: run.done };
  }

  steer(workflowId: string, inputId: string, text: string): SteerResult {
    return this.runs.get(workflowId)?.steer(inputId, text) ?? "not_running";
  }

  cancel(workflowId: string): CancelResult {
    return this.runs.get(workflowId)?.cancel() ?? "not_running";
  }

  get activeCount(): number {
    return this.runs.size;
  }
}
