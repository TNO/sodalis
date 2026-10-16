export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export type ResponseFormat =
  | { readonly type: "json_object" }
  | { readonly type: "json_schema"; readonly name: string; readonly schema: Readonly<Record<string, unknown>> };

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface TokenLogprob {
  readonly token: string;
  readonly logprob: number;
}

export interface ChatCompletionRequest {
  readonly messages: readonly ChatMessage[];
  readonly responseFormat?: ResponseFormat;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Ask for the top-N log-probabilities of the first generated token. */
  readonly topLogprobs?: number;
  readonly signal?: AbortSignal;
}

export interface ChatCompletion {
  readonly content: string;
  /** Top log-probabilities of the first generated token, when requested. */
  readonly firstTokenLogprobs?: readonly TokenLogprob[];
  readonly usage?: ChatUsage;
}

/** Non-streaming chat completion used by the memory roles. */
export interface ChatClient {
  readonly id: string;
  complete(request: ChatCompletionRequest): Promise<ChatCompletion>;
}

export interface OpenAiCompatibleChatClientOptions {
  readonly id?: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly apiKeyHeader?: "authorization" | "api-key";
  /** Provider-specific fields, for example `{"think": false}` for Ollama. */
  readonly extraBody?: Readonly<Record<string, unknown>>;
  /** `json_object` for servers without JSON-schema support. */
  readonly responseFormatSupport?: "json_schema" | "json_object" | "none";
  /** Reasoning-model servers reject `temperature`; leave it out when false. */
  readonly sendTemperature?: boolean;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes `<think>...</think>` blocks that some local reasoning models emit. */
export function stripReasoning(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Parses a JSON object from model output, tolerating code fences and prose. */
export function parseJsonObject(content: string): Record<string, unknown> | undefined {
  const text = stripReasoning(content).replace(/^```(?:json)?\s*|\s*```$/g, "");
  const candidates = [text];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (record(value)) return value;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

export class OpenAiCompatibleChatClient implements ChatClient {
  readonly id: string;
  private readonly endpoint: string;
  private readonly options: OpenAiCompatibleChatClientOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiCompatibleChatClientOptions) {
    if (!options.baseUrl.trim() || !options.model.trim()) {
      throw new Error("Chat base URL and model are required.");
    }
    this.id = options.id ?? `openai-compatible:${options.model}`;
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.options = options;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletion> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey) {
      if (this.options.apiKeyHeader === "api-key") headers["api-key"] = this.options.apiKey;
      else headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    const support = this.options.responseFormatSupport ?? "json_schema";
    let responseFormat: unknown;
    if (request.responseFormat && support !== "none") {
      responseFormat =
        request.responseFormat.type === "json_schema" && support === "json_schema"
          ? {
              type: "json_schema",
              json_schema: { name: request.responseFormat.name, schema: request.responseFormat.schema, strict: true },
            }
          : { type: "json_object" };
    }
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 120_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...this.options.extraBody,
        model: this.options.model,
        stream: false,
        messages: request.messages,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined && this.options.sendTemperature !== false
          ? { temperature: request.temperature }
          : {}),
        ...(request.topLogprobs ? { logprobs: true, top_logprobs: request.topLogprobs } : {}),
      }),
      signal,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const payload: unknown = await response.json();
        if (record(payload) && record(payload.error) && typeof payload.error.message === "string") {
          detail = `: ${payload.error.message}`;
        }
      } catch {
        // Keep the status-only message.
      }
      throw new Error(`Chat provider ${this.id} returned HTTP ${response.status}${detail}`);
    }
    const payload: unknown = await response.json();
    const choice = record(payload) && Array.isArray(payload.choices) ? payload.choices[0] : undefined;
    const message = record(choice) && record(choice.message) ? choice.message : undefined;
    if (!message || typeof message.content !== "string") {
      throw new Error(`Chat provider ${this.id} returned no message content.`);
    }
    const usage = record(payload) && record(payload.usage) ? payload.usage : undefined;
    const content = record(choice) && record(choice.logprobs) && Array.isArray(choice.logprobs.content)
      ? choice.logprobs.content[0]
      : undefined;
    const top = record(content) && Array.isArray(content.top_logprobs) ? content.top_logprobs : undefined;
    const firstTokenLogprobs = top
      ?.filter(
        (entry): entry is { token: string; logprob: number } =>
          record(entry) && typeof entry.token === "string" && typeof entry.logprob === "number",
      )
      .map((entry) => ({ token: entry.token, logprob: entry.logprob }));
    return {
      content: message.content,
      ...(firstTokenLogprobs?.length ? { firstTokenLogprobs } : {}),
      ...(usage && typeof usage.prompt_tokens === "number" && typeof usage.completion_tokens === "number"
        ? { usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens } }
        : {}),
    };
  }
}

export interface RoleStats {
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalMs: number;
}

/** Wraps a client to count calls, tokens, and latency (for evaluation). */
export class InstrumentedChatClient implements ChatClient {
  readonly id: string;
  readonly stats: RoleStats = { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, totalMs: 0 };
  private readonly inner: ChatClient;

  constructor(inner: ChatClient) {
    this.inner = inner;
    this.id = inner.id;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletion> {
    const started = performance.now();
    this.stats.calls += 1;
    try {
      const result = await this.inner.complete(request);
      this.stats.promptTokens += result.usage?.promptTokens ?? 0;
      this.stats.completionTokens += result.usage?.completionTokens ?? 0;
      return result;
    } catch (error) {
      this.stats.failures += 1;
      throw error;
    } finally {
      this.stats.totalMs += performance.now() - started;
    }
  }
}
