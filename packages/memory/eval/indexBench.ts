import { normalise, MockEmbedder } from "../src/Embedder.js";
import { Memory } from "../src/Memory.js";
import type { ItemLayer } from "../src/types.js";
import { Random } from "./random.js";

export interface IndexBenchResult {
  readonly items: number;
  readonly dimensions: number;
  readonly insertPerItemMs: number;
  readonly vector: { readonly p50: number; readonly p95: number };
  readonly hybrid: { readonly p50: number; readonly p95: number };
  readonly filtered: { readonly p50: number; readonly p95: number };
}

const WORDS = ["dochter", "zoon", "afspraak", "tandarts", "koffie", "thee", "wandelen", "park", "verjaardag", "hond", "kat", "tuin", "markt", "bus", "trein", "Gent", "Leuven"];

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** Latency of the sqlite-vec + FTS5 index at a given size (task 0051). */
export async function benchmarkIndex(options: { items: number; dimensions?: number; queries?: number; seed?: number }): Promise<IndexBenchResult> {
  const dimensions = options.dimensions ?? 512;
  const random = new Random(options.seed ?? 1);
  const vector = () => normalise(Float32Array.from({ length: dimensions }, () => random.next() * 2 - 1));
  const memory = await Memory.open({ path: ":memory:", embedder: new MockEmbedder(dimensions, "bench") });
  try {
    const layers: ItemLayer[] = ["L2", "L3", "L4"];
    const started = performance.now();
    memory.database.transaction(() => {
      for (let index = 0; index < options.items; index += 1) {
        memory.store.addItem(
          {
            layer: random.pick(layers),
            subject: random.pick(["user", ...WORDS.slice(0, 6)]),
            text: Array.from({ length: 8 }, () => random.pick(WORDS)).join(" "),
          },
          vector(),
        );
      }
    });
    const insertPerItemMs = (performance.now() - started) / options.items;
    const time = (query: () => unknown) => {
      const samples: number[] = [];
      for (let index = 0; index < (options.queries ?? 200); index += 1) {
        const begin = performance.now();
        query();
        samples.push(performance.now() - begin);
      }
      return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
    };
    return {
      items: options.items,
      dimensions,
      insertPerItemMs,
      vector: time(() => memory.index.search({ embedding: vector(), limit: 20 })),
      hybrid: time(() => memory.index.search({ embedding: vector(), text: `${random.pick(WORDS)} ${random.pick(WORDS)}`, limit: 20 })),
      filtered: time(() => memory.index.search({ embedding: vector(), layers: ["L2", "L4"], subjectKey: "user", limit: 5 })),
    };
  } finally {
    memory.close();
  }
}
