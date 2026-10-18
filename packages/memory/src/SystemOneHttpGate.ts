import type { RoleStats } from "./ChatClient.js";
import type { DecisionGate, SystemOneAnswer, SystemOneRequest, SystemOneResponse } from "./DecisionGate.js";

export interface SystemOneHttpGateOptions {
  /** Server root, for example `http://localhost:8899` (vLLM Semantic Router). */
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A gate backed by a dedicated decision model behind a System One HTTP API
 * (`POST /v1/systemone`), such as vLLM Semantic Router serving Vela or
 * Decision 3.0. All questions go in one request.
 */
export class SystemOneHttpGate implements DecisionGate {
  readonly id: string;
  readonly stats: RoleStats = { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, totalMs: 0 };
  private readonly endpoint: string;
  private readonly options: SystemOneHttpGateOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: SystemOneHttpGateOptions) {
    if (!options.baseUrl.trim() || !options.model.trim()) throw new Error("System One base URL and model are required.");
    this.id = `systemone:${options.model}`;
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/systemone`;
    this.options = options;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async decide(request: SystemOneRequest, signal?: AbortSignal): Promise<SystemOneResponse> {
    const started = performance.now();
    this.stats.calls += 1;
    try {
      const response = await this.post(request, signal);
      if (record(response.usage) && typeof response.usage.input_tokens === "number") {
        this.stats.promptTokens += response.usage.input_tokens;
      }
      const answers = record(response.answers) ? response.answers : {};
      return { answers: request.questions.map((question) => this.answer(question.key, question.type, answers[question.key])) };
    } catch (error) {
      this.stats.failures += 1;
      throw error;
    } finally {
      this.stats.totalMs += performance.now() - started;
    }
  }

  private async post(request: SystemOneRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const questions = Object.fromEntries(
      request.questions.map((question) => [
        question.key,
        question.type === "noul"
          ? { type: "noul", instructions: question.question }
          : {
              type: "choice",
              instructions: question.question,
              criteria: Object.fromEntries(question.choices.map((choice) => [choice, question.descriptions?.[choice] ?? null])),
            },
      ]),
    );
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: "Bearer " + this.options.apiKey } : {}),
      },
      body: JSON.stringify({ model: this.options.model, state: request.state, questions }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) throw new Error(`System One request failed with status ${response.status}.`);
    const body: unknown = await response.json();
    if (!record(body)) throw new Error("System One response is not an object.");
    return body;
  }

  private answer(key: string, type: "noul" | "choice", value: unknown): SystemOneAnswer {
    if (type === "noul" && record(value) && typeof value.noul === "number") return { key, type, noul: value.noul };
    if (type === "choice" && record(value) && typeof value.choice === "string" && record(value.probabilities)) {
      const probabilities = Object.fromEntries(
        Object.entries(value.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
      );
      return { key, type, choice: value.choice, probabilities };
    }
    throw new Error(`System One response has no valid answer for "${key}".`);
  }
}
