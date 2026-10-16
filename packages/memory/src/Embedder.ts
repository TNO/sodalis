export interface EmbedderDescriptor {
  readonly model: string;
  readonly dimensions: number;
}

/** Turns texts into L2-normalised vectors of `descriptor.dimensions`. */
export interface Embedder {
  readonly descriptor: EmbedderDescriptor;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]>;
}

export function normalise(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  for (let index = 0; index < vector.length; index += 1) vector[index]! /= norm;
  return vector;
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function hash(text: string, seed: number): number {
  let value = 2166136261 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * Deterministic bag-of-words embedder for tests: texts that share words have a
 * positive cosine similarity, and identical texts have similarity 1.
 */
export class MockEmbedder implements Embedder {
  readonly descriptor: EmbedderDescriptor;

  constructor(dimensions = 64, model = "mock-bag-of-words") {
    this.descriptor = { model, dimensions };
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    return texts.map((text) => {
      const vector = new Float32Array(this.descriptor.dimensions);
      const words = text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .match(/[\p{L}\p{N}]+/gu) ?? [];
      for (const word of words) {
        vector[hash(word, 1) % this.descriptor.dimensions]! += 1;
        vector[hash(word, 2) % this.descriptor.dimensions]! += 0.5;
      }
      if (words.length === 0) vector[0] = 1;
      return normalise(vector);
    });
  }
}

export interface OpenAiCompatibleEmbedderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
  readonly apiKey?: string;
  readonly apiKeyHeader?: "authorization" | "api-key";
  /** Send the `dimensions` request field (Matryoshka truncation server-side). */
  readonly sendDimensions?: boolean;
  readonly batchSize?: number;
  readonly fetch?: typeof fetch;
}

/**
 * `/v1/embeddings` client. Longer vectors are truncated to `dimensions` and
 * re-normalised (Matryoshka-style), so servers that ignore `dimensions` work.
 */
export class OpenAiCompatibleEmbedder implements Embedder {
  readonly descriptor: EmbedderDescriptor;
  private readonly endpoint: string;
  private readonly options: OpenAiCompatibleEmbedderOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiCompatibleEmbedderOptions) {
    if (!options.baseUrl.trim() || !options.model.trim()) {
      throw new Error("Embedding base URL and model are required.");
    }
    if (!Number.isInteger(options.dimensions) || options.dimensions < 8 || options.dimensions > 8192) {
      throw new RangeError("Embedding dimensions must be an integer between 8 and 8192.");
    }
    this.descriptor = { model: options.model, dimensions: options.dimensions };
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/embeddings`;
    this.options = options;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const batchSize = this.options.batchSize ?? 32;
    const result: Float32Array[] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      result.push(...(await this.embedBatch(texts.slice(start, start + batchSize), signal)));
    }
    return result;
  }

  private async embedBatch(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey) {
      if (this.options.apiKeyHeader === "api-key") headers["api-key"] = this.options.apiKey;
      else headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.options.model,
        input: texts,
        encoding_format: "float",
        ...(this.options.sendDimensions === false ? {} : { dimensions: this.options.dimensions }),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new Error(`Embedding provider returned HTTP ${response.status}.`);
    }
    const payload: unknown = await response.json();
    const data =
      typeof payload === "object" && payload !== null && "data" in payload && Array.isArray(payload.data)
        ? (payload.data as unknown[])
        : undefined;
    if (!data || data.length !== texts.length) {
      throw new Error("Embedding provider returned an unexpected response.");
    }
    const ordered = [...data].sort((left, right) => indexOf(left) - indexOf(right));
    return ordered.map((entry) => {
      const embedding =
        typeof entry === "object" && entry !== null && "embedding" in entry && Array.isArray(entry.embedding)
          ? (entry.embedding as unknown[])
          : undefined;
      if (
        !embedding ||
        embedding.length < this.options.dimensions ||
        !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
      ) {
        throw new Error(
          `Embedding provider returned a vector shorter than ${this.options.dimensions} dimensions.`,
        );
      }
      return normalise(Float32Array.from((embedding as number[]).slice(0, this.options.dimensions)));
    });
  }
}

function indexOf(entry: unknown): number {
  return typeof entry === "object" && entry !== null && "index" in entry && typeof entry.index === "number"
    ? entry.index
    : 0;
}
