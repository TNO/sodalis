import type {
  AvailableAppAction,
  AssistantAppContext,
  ConversationMessage,
} from "@sodalis/assistant";

export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens?: number;
  readonly totalTokens: number;
}

export interface LlmGenerationRequest {
  readonly messages: readonly ConversationMessage[];
  readonly appContext?: AssistantAppContext;
  readonly availableActions?: readonly AvailableAppAction[];
  readonly signal: AbortSignal;
  /** Evaluation hook; when set, the provider is asked to report token usage. */
  readonly onUsage?: (usage: LlmUsage) => void;
}

export interface LlmTextGenerationProvider {
  readonly id: string;
  generate(request: LlmGenerationRequest): AsyncIterable<string>;
}

export interface OpenAiCompatibleLlmProviderOptions {
  readonly id?: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  /** `authorization` sends `Bearer <key>`; `api-key` sends the key as Azure expects. */
  readonly apiKeyHeader?: "authorization" | "api-key";
  /** Provider-specific request fields, such as `reasoning_effort`. */
  readonly extraBody?: Readonly<Record<string, unknown>>;
  readonly fetch?: typeof fetch;
}

/** The provider's content filter blocked the prompt or the response. */
export class LlmContentFilterError extends Error {
  constructor() {
    super("LLM provider blocked the response with its content filter.");
    this.name = "LlmContentFilterError";
  }
}

function serverError(response: Response): Promise<Error> {
  return response
    .json()
    .then((payload: unknown) => {
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "object" &&
        payload.error !== null &&
        "code" in payload.error &&
        payload.error.code === "content_filter"
      ) {
        return new LlmContentFilterError();
      }
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
      ) {
        return new Error(payload.error.message);
      }
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        return new Error(payload.error);
      }
      return new Error(`LLM provider returned HTTP ${response.status}.`);
    })
    .catch((error: unknown) => {
      if (error instanceof Error) return error;
      return new Error(`LLM provider returned HTTP ${response.status}.`);
    });
}

function readTextDelta(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (
    "choices" in payload &&
    Array.isArray(payload.choices) &&
    payload.choices.length > 0
  ) {
    const choice: unknown = payload.choices[0];
    if (
      typeof choice === "object" &&
      choice !== null &&
      "finish_reason" in choice &&
      choice.finish_reason === "content_filter"
    ) {
      throw new LlmContentFilterError();
    }
    if (
      typeof choice === "object" &&
      choice !== null &&
      "delta" in choice &&
      typeof choice.delta === "object" &&
      choice.delta !== null &&
      "content" in choice.delta &&
      typeof choice.delta.content === "string"
    ) {
      return choice.delta.content;
    }
  }
  return undefined;
}

function readUsage(payload: unknown): LlmUsage | undefined {
  if (typeof payload !== "object" || payload === null || !("usage" in payload)) {
    return undefined;
  }
  const usage = payload.usage;
  if (
    typeof usage !== "object" ||
    usage === null ||
    !("prompt_tokens" in usage) ||
    typeof usage.prompt_tokens !== "number" ||
    !("completion_tokens" in usage) ||
    typeof usage.completion_tokens !== "number" ||
    !("total_tokens" in usage) ||
    typeof usage.total_tokens !== "number"
  ) {
    return undefined;
  }
  const details =
    "completion_tokens_details" in usage &&
    typeof usage.completion_tokens_details === "object" &&
    usage.completion_tokens_details !== null
      ? usage.completion_tokens_details
      : undefined;
  const reasoningTokens =
    details && "reasoning_tokens" in details && typeof details.reasoning_tokens === "number"
      ? details.reasoning_tokens
      : undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    totalTokens: usage.total_tokens,
  };
}

function parseEventData(frame: string): string | undefined {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n") || undefined;
}

export class OpenAiCompatibleLlmProvider
  implements LlmTextGenerationProvider
{
  readonly id: string;

  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly apiKeyHeader: "authorization" | "api-key";
  private readonly extraBody: Readonly<Record<string, unknown>>;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiCompatibleLlmProviderOptions) {
    if (!options.baseUrl.trim() || !options.model.trim()) {
      throw new Error("LLM base URL and model are required.");
    }
    this.id = options.id ?? "openai-compatible-chat-completions";
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.apiKeyHeader = options.apiKeyHeader ?? "authorization";
    this.extraBody = options.extraBody ?? {};
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *generate(
    request: LlmGenerationRequest,
  ): AsyncIterable<string> {
    request.signal.throwIfAborted();
    const appDescription = request.appContext
      ? `Current trusted Sodalis app: ${request.appContext.appName} (${request.appContext.appId})${
          request.appContext.category
            ? `, category ${request.appContext.category}`
            : ""
        }.`
      : "No trusted application context is currently available.";
    const systemPrompt = [
      "You are Sodalis, a concise personal desktop assistant.",
      "Respond in the user's language using exactly one JSON object and no Markdown.",
      'The object schema is {"text":string,"affect":{"expression":"neutral"|"warm"|"happy"|"concerned"|"sad"|"surprised"|"reassuring","valence":number,"arousal":number,"intensity":number},"gesture"?: "nod"|"shake-head"|"acknowledge"|"none","interruptible":boolean,"action"?: {"id":string,"arguments":object}}.',
      "Keep affect restrained and use low arousal and intensity for normal conversation; use a gesture only when it adds clear value.",
      "The text field is the exact user-facing caption and spoken response.",
      "Use at most one action per response and only an action ID from the available action list. Do not claim that an action succeeded before the application reports its result, and never claim user confirmation.",
      `Available semantic actions: ${JSON.stringify(request.availableActions ?? [])}.`,
      appDescription,
    ].join(" ");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "text/event-stream",
    };
    if (this.apiKey) {
      if (this.apiKeyHeader === "api-key") headers["api-key"] = this.apiKey;
      else headers.authorization = `Bearer ${this.apiKey}`;
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...this.extraBody,
        model: this.model,
        stream: true,
        ...(request.onUsage ? { stream_options: { include_usage: true } } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...request.messages,
        ],
      }),
      signal: request.signal,
    });
    request.signal.throwIfAborted();
    if (!response.ok) throw await serverError(response);
    if (
      !(response.headers.get("content-type") ?? "")
        .toLowerCase()
        .startsWith("text/event-stream")
    ) {
      throw new Error("LLM provider returned an unsupported response format.");
    }
    if (!response.body) {
      throw new Error("LLM provider returned no response stream.");
    }

    const handle = (data: string): string | undefined => {
      const payload: unknown = JSON.parse(data);
      if (request.onUsage) {
        const usage = readUsage(payload);
        if (usage) request.onUsage(usage);
      }
      return readTextDelta(payload);
    };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let complete = false;
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
          const data = parseEventData(frame);
          if (data === "[DONE]") {
            complete = true;
            return;
          }
          if (data) {
            const delta = handle(data);
            if (delta) yield delta;
          }
          delimiter = buffer.search(/\r?\n\r?\n/);
        }
        if (result.done) {
          const data = parseEventData(buffer);
          if (data && data !== "[DONE]") {
            const delta = handle(data);
            if (delta) yield delta;
          }
          complete = true;
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
