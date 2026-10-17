import { normalise, type Embedder, type EmbedderDescriptor } from "../src/Embedder.js";

export type FeatureExtract = (texts: readonly string[]) => Promise<number[][]>;

export interface TransformersEmbedderOptions {
  /** Hugging Face model id under `localModelPath`. */
  readonly model: string;
  /** Matryoshka truncation; the vector is renormalised afterwards. */
  readonly dimensions: number;
  /** Directory with downloaded models; remote downloads stay disabled. */
  readonly localModelPath?: string;
  readonly pooling?: "cls" | "mean";
  /** Injected for tests; defaults to a local transformers.js ONNX pipeline. */
  readonly extract?: FeatureExtract;
}

/**
 * Eval-only embedder for models Ollama does not serve, such as
 * granite-embedding-311m-multilingual-r2 (task 0048). Runs ONNX in-process.
 */
export class TransformersEmbedder implements Embedder {
  readonly descriptor: EmbedderDescriptor;
  #extract: Promise<FeatureExtract> | undefined;

  constructor(private readonly options: TransformersEmbedderOptions) {
    this.descriptor = { model: options.model, dimensions: options.dimensions };
    if (options.extract) this.#extract = Promise.resolve(options.extract);
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
    signal?.throwIfAborted();
    const extract = await (this.#extract ??= this.#load());
    const vectors = await extract(texts);
    return vectors.map((vector) => normalise(Float32Array.from(vector.slice(0, this.options.dimensions))));
  }

  async #load(): Promise<FeatureExtract> {
    const { env, pipeline } = await import("@huggingface/transformers");
    if (this.options.localModelPath) env.localModelPath = this.options.localModelPath;
    env.allowRemoteModels = false;
    const extractor = await pipeline("feature-extraction", this.options.model, { dtype: "fp32" });
    return async (texts) =>
      (await extractor([...texts], { pooling: this.options.pooling ?? "cls", normalize: false })).tolist() as number[][];
  }
}
