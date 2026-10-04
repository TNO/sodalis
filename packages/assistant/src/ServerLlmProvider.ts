import type {
  AssistantAppContext,
  ConversationMessage,
  LlmProvider,
  LlmStreamRequest,
  LlmTextDelta,
} from "./index.js";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ServerLlmProviderOptions {
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly onLatency?: (metric: LlmProviderLatency) => void;
}

export interface LlmProviderLatency {
  readonly sessionId: string;
  readonly turnId: string;
  readonly type: "request-to-first-token";
  readonly latencyMs: number;
}

function parseSseEvent(frame: string): string | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  return data || undefined;
}

function decodeDelta(
  json: string,
  request: LlmStreamRequest,
  expectedSequence: number,
): LlmTextDelta {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("sessionId" in value) ||
    value.sessionId !== request.sessionId ||
    !("turnId" in value) ||
    value.turnId !== request.turnId ||
    !("sequence" in value) ||
    value.sequence !== expectedSequence ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !value.text
  ) {
    throw new Error("Assistant server returned an invalid text chunk.");
  }
  return {
    sessionId: request.sessionId,
    turnId: request.turnId,
    sequence: expectedSequence,
    text: value.text,
  };
}

export class ServerLlmProvider implements LlmProvider {
  readonly id = "server-openai-compatible";

  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private readonly onLatency: ServerLlmProviderOptions["onLatency"];

  constructor(options: ServerLlmProviderOptions = {}) {
    this.endpoint = `${(options.baseUrl ?? "/api").replace(/\/+$/, "")}/assistant/turns`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
    this.onLatency = options.onLatency;
  }

  async *stream(request: LlmStreamRequest): AsyncIterable<LlmTextDelta> {
    request.signal.throwIfAborted();
    const startedAt = this.now();
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: request.sessionId,
        turnId: request.turnId,
        messages: request.messages,
        ...(request.appContext ? { appContext: request.appContext } : {}),
      }),
      signal: request.signal,
    });
    request.signal.throwIfAborted();
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Assistant server returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    if (
      response.headers.get("x-sodalis-session-id") !== request.sessionId ||
      response.headers.get("x-sodalis-turn-id") !== request.turnId
    ) {
      throw new Error("Assistant server returned a mismatched turn ID.");
    }
    if (
      !(response.headers.get("content-type") ?? "")
        .toLowerCase()
        .startsWith("text/event-stream")
    ) {
      throw new Error("Assistant server returned an unsupported response format.");
    }
    if (!response.body) {
      throw new Error("Assistant server returned no response stream.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let complete = false;
    let sequence = 0;
    let firstToken = true;
    let readerCancellation: Promise<void> | undefined;
    const cancelReader = () => {
      readerCancellation ??= reader.cancel(request.signal.reason);
    };
    request.signal.addEventListener("abort", cancelReader, { once: true });
    if (request.signal.aborted) cancelReader();

    try {
      while (true) {
        request.signal.throwIfAborted();
        const result = await reader.read();
        request.signal.throwIfAborted();
        buffer += decoder.decode(result.value, { stream: !result.done });
        let delimiter = buffer.search(/\r?\n\r?\n/);
        while (delimiter >= 0) {
          const frame = buffer.slice(0, delimiter);
          const delimiterLength = buffer[delimiter] === "\r" ? 4 : 2;
          buffer = buffer.slice(delimiter + delimiterLength);
          const data = parseSseEvent(frame);
          if (data === "[DONE]") {
            complete = true;
            return;
          }
          if (data) {
            const delta = decodeDelta(data, request, sequence++);
            if (firstToken) {
              firstToken = false;
              this.onLatency?.({
                sessionId: request.sessionId,
                turnId: request.turnId,
                type: "request-to-first-token",
                latencyMs: Math.max(0, this.now() - startedAt),
              });
            }
            yield delta;
          }
          delimiter = buffer.search(/\r?\n\r?\n/);
        }
        if (result.done) {
          const data = parseSseEvent(buffer);
          if (data && data !== "[DONE]") {
            yield decodeDelta(data, request, sequence++);
          } else {
            complete = true;
          }
          return;
        }
      }
    } finally {
      request.signal.removeEventListener("abort", cancelReader);
      if (!complete && !readerCancellation) cancelReader();
      if (readerCancellation) await readerCancellation;
      reader.releaseLock();
    }
  }
}

export type {
  AssistantAppContext,
  ConversationMessage,
};
