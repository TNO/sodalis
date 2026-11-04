import type { ConversationMessage } from "./index.js";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Lifecycle events of one server-side companion workflow. */
export type CompanionWorkflowEvent =
  | { readonly type: "started"; readonly workflowId: string; readonly sequence: number }
  | { readonly type: "answer"; readonly workflowId: string; readonly sequence: number; readonly inputId: string; readonly text: string }
  | { readonly type: "failed"; readonly workflowId: string; readonly sequence: number; readonly code: string; readonly residentMessage: string }
  | { readonly type: "cancelled"; readonly workflowId: string; readonly sequence: number };

export interface CompanionWorkflowStartRequest {
  readonly sessionId: string;
  readonly workflowId: string;
  readonly inputId: string;
  readonly messages: readonly ConversationMessage[];
  readonly signal: AbortSignal;
}

export type CompanionSteerResult = "accepted" | "duplicate" | "not_running" | "conflict";

export interface CompanionWorkflowClient {
  start(request: CompanionWorkflowStartRequest): AsyncIterable<CompanionWorkflowEvent>;
  steer(request: { readonly workflowId: string; readonly inputId: string; readonly text: string }): Promise<CompanionSteerResult>;
  cancel(workflowId: string): Promise<void>;
}

export interface ServerWorkflowClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
}

const MAX_TEXT = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeEvent(json: string, workflowId: string, expectedSequence: number): CompanionWorkflowEvent {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.workflowId !== workflowId || value.sequence !== expectedSequence) {
    throw new Error("Assistant server returned a stale or invalid workflow event.");
  }
  const base = { workflowId, sequence: expectedSequence };
  if (value.type === "started") return { type: "started", ...base };
  if (value.type === "cancelled") return { type: "cancelled", ...base };
  if (
    value.type === "answer" &&
    typeof value.inputId === "string" &&
    typeof value.text === "string" &&
    value.text.trim() &&
    value.text.length <= MAX_TEXT
  ) {
    return { type: "answer", ...base, inputId: value.inputId, text: value.text };
  }
  if (
    value.type === "failed" &&
    typeof value.code === "string" &&
    typeof value.residentMessage === "string" &&
    value.residentMessage.length <= MAX_TEXT
  ) {
    return { type: "failed", ...base, code: value.code, residentMessage: value.residentMessage };
  }
  throw new Error("Assistant server returned an invalid workflow event.");
}

function frameData(frame: string): string | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  return data || undefined;
}

async function serverError(response: Response): Promise<Error> {
  const payload: unknown = await response.json().catch(() => undefined);
  return new Error(
    isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `Assistant server returned HTTP ${response.status}.`,
  );
}

/** Talks to the assistant server's `/assistant/workflows` routes. */
export class ServerWorkflowClient implements CompanionWorkflowClient {
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;

  constructor(options: ServerWorkflowClientOptions = {}) {
    this.endpoint = `${(options.baseUrl ?? "/api").replace(/\/+$/, "")}/assistant/workflows`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *start(request: CompanionWorkflowStartRequest): AsyncIterable<CompanionWorkflowEvent> {
    request.signal.throwIfAborted();
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: request.sessionId,
        workflowId: request.workflowId,
        inputId: request.inputId,
        messages: request.messages,
      }),
      signal: request.signal,
    });
    if (!response.ok) throw await serverError(response);
    if (response.headers.get("x-sodalis-workflow-id") !== request.workflowId) {
      throw new Error("Assistant server returned a mismatched workflow ID.");
    }
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/event-stream") || !response.body) {
      throw new Error("Assistant server returned an unsupported response format.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sequence = 0;
    const cancelReader = () => void reader.cancel(request.signal.reason).catch(() => {});
    request.signal.addEventListener("abort", cancelReader, { once: true });
    try {
      while (true) {
        const result = await reader.read();
        request.signal.throwIfAborted();
        buffer += decoder.decode(result.value, { stream: !result.done });
        if (result.done) buffer += "\n\n";
        let delimiter = buffer.search(/\r?\n\r?\n/);
        while (delimiter >= 0) {
          const data = frameData(buffer.slice(0, delimiter));
          buffer = buffer.slice(delimiter + (buffer[delimiter] === "\r" ? 4 : 2));
          if (data) {
            const event = decodeEvent(data, request.workflowId, sequence++);
            yield event;
            if (event.type !== "started") return;
          }
          delimiter = buffer.search(/\r?\n\r?\n/);
        }
        if (result.done) return;
      }
    } finally {
      request.signal.removeEventListener("abort", cancelReader);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async steer(request: { readonly workflowId: string; readonly inputId: string; readonly text: string }): Promise<CompanionSteerResult> {
    const response = await this.fetcher(`${this.endpoint}/${encodeURIComponent(request.workflowId)}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputId: request.inputId, text: request.text }),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    const status = isRecord(payload) ? payload.status : undefined;
    if (status === "accepted" || status === "duplicate" || status === "not_running" || status === "conflict") {
      return status;
    }
    throw response.ok ? new Error("Assistant server returned an invalid steering result.") : await serverError(response);
  }

  async cancel(workflowId: string): Promise<void> {
    const response = await this.fetcher(`${this.endpoint}/${encodeURIComponent(workflowId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok && response.status !== 409) throw await serverError(response);
  }
}
