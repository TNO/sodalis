import { cosineSimilarity } from "./Embedder.js";
import { parseJsonObject, type ChatClient } from "./ChatClient.js";
import { itemIndexText, type Memory } from "./Memory.js";
import { subjectKey } from "./MemoryStore.js";
import type { MemoryItem } from "./types.js";

export const INDUCED_LAYERS = ["L5", "L6", "L7"] as const;
export type InducedLayer = (typeof INDUCED_LAYERS)[number];

export interface InducedItem {
  readonly layer: InducedLayer;
  readonly subject: string;
  readonly text: string;
  /** IDs of the cluster items that support this item (at least two). */
  readonly evidence: readonly number[];
  /** An existing L5–L7 item this one replaces. */
  readonly replaces?: number;
}

export interface Inducer {
  readonly id: string;
  induce(cluster: readonly MemoryItem[], existing: readonly MemoryItem[], signal?: AbortSignal): Promise<InducedItem[]>;
}

export interface ConsolidationReport {
  readonly newItems: number;
  readonly clusters: number;
  readonly added: number;
  readonly replaced: number;
}

export interface ConsolidatorOptions {
  readonly memory: Memory;
  readonly inducer: Inducer;
  /** Skip a run until this many facts are unconsolidated. */
  readonly minNewItems?: number;
  readonly minClusterSize?: number;
  /** Cosine similarity that links two facts into one cluster. */
  readonly similarity?: number;
  /** Most recent facts considered per run. */
  readonly window?: number;
}

const WATERMARK = "consolidation.watermark";
const LAST_RUN = "consolidation.lastRun";

/**
 * Greedy, LLM-free clustering: two facts link when they share a non-user
 * subject or their embeddings are similar; clusters are connected components.
 */
export function clusterItems(
  items: readonly MemoryItem[],
  embeddings: readonly Float32Array[],
  similarity: number,
): MemoryItem[][] {
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const leftSubject = subjectKey(items[left]!.subject);
      const sameEntity = leftSubject !== "user" && leftSubject === subjectKey(items[right]!.subject);
      if (sameEntity || cosineSimilarity(embeddings[left]!, embeddings[right]!) >= similarity) {
        parent[find(left)] = find(right);
      }
    }
  }
  const groups = new Map<number, MemoryItem[]>();
  items.forEach((item, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  });
  return [...groups.values()];
}

/** Nightly System 2 (task 0050): induces L5–L7 items from clusters of facts. */
export class Consolidator {
  private readonly options: ConsolidatorOptions;

  constructor(options: ConsolidatorOptions) {
    this.options = options;
  }

  lastRun(): string | undefined {
    return this.options.memory.store.getSetting(LAST_RUN);
  }

  pendingItems(): number {
    const watermark = Number(this.options.memory.store.getSetting(WATERMARK) ?? 0);
    return this.facts().filter((item) => item.id > watermark).length;
  }

  /** Health facts are never used for induction (ADR 0005). */
  private facts(): MemoryItem[] {
    return this.options.memory.store
      .listItems({ layers: ["L2", "L4"], statuses: ["active"], sensitivity: "general", limit: 100_000 })
      .filter((item) => item.sensitivity !== "health");
  }

  async run(signal?: AbortSignal, finish?: () => void): Promise<ConsolidationReport> {
    const { memory, inducer } = this.options;
    const store = memory.store;
    const watermark = Number(store.getSetting(WATERMARK) ?? 0);
    const facts = this.facts()
      .sort((left, right) => right.id - left.id)
      .slice(0, this.options.window ?? 300);
    const fresh = facts.filter((item) => item.id > watermark);
    const highest = Math.max(watermark, ...facts.map((item) => item.id));
    const markDone = (report: ConsolidationReport) => {
      memory.database.transaction(() => {
        store.setSetting(WATERMARK, String(highest));
        store.setSetting(LAST_RUN, store.now());
        finish?.();
      });
      return report;
    };
    if (fresh.length < (this.options.minNewItems ?? 5)) {
      if (fresh.length === 0) return markDone({ newItems: 0, clusters: 0, added: 0, replaced: 0 });
      finish?.();
      return { newItems: fresh.length, clusters: 0, added: 0, replaced: 0 };
    }

    const embeddings = await memory.embedder.embed(facts.map(itemIndexText), signal);
    const freshIds = new Set(fresh.map((item) => item.id));
    const clusters = clusterItems(facts, embeddings, this.options.similarity ?? 0.6).filter(
      (cluster) =>
        cluster.length >= (this.options.minClusterSize ?? 3) && cluster.some((item) => freshIds.has(item.id)),
    );
    const induced: { item: InducedItem; embedding?: Float32Array }[] = [];
    for (const cluster of clusters) {
      signal?.throwIfAborted();
      const clusterIds = new Set(cluster.map((item) => item.id));
      const existing = store
        .listItems({ layers: [...INDUCED_LAYERS], statuses: ["active"], limit: 1_000 })
        .filter((item) => store.evidenceItemIds(item.id).some((id) => clusterIds.has(id)));
      const existingIds = new Set(existing.map((item) => item.id));
      for (const item of await inducer.induce(cluster, existing, signal)) {
        const evidence = [...new Set(item.evidence)].filter((id) => clusterIds.has(id));
        if (evidence.length < 2) continue;
        induced.push({
          item: {
            ...item,
            evidence,
            ...(item.replaces !== undefined && existingIds.has(item.replaces) ? { replaces: item.replaces } : {}),
          },
        });
      }
    }
    if (induced.length) {
      const vectors = await memory.embedder.embed(induced.map(({ item }) => itemIndexText(item)), signal);
      induced.forEach((entry, index) => (entry.embedding = vectors[index]));
    }
    signal?.throwIfAborted();
    let added = 0;
    let replaced = 0;
    const replacedIds = new Set<number>();
    memory.database.transaction(() => {
      for (const { item, embedding } of induced) {
        const newItem = {
          layer: item.layer,
          subject: item.subject,
          text: item.text,
          provenance: "inferred" as const,
          evidenceItemIds: item.evidence,
        };
        const target = item.replaces;
        if (target !== undefined && !replacedIds.has(target) && store.getItem(target)?.status === "active") {
          replacedIds.add(target);
          store.supersede(target, newItem, embedding!);
          replaced += 1;
        } else {
          store.addItem(newItem, embedding!);
          added += 1;
        }
      }
      // The watermark and job completion commit with the items (a nested savepoint).
      markDone({ newItems: fresh.length, clusters: clusters.length, added, replaced });
    });
    return { newItems: fresh.length, clusters: clusters.length, added, replaced };
  }
}

export const INDUCTION_SYSTEM_PROMPT = `You consolidate the long-term memory of a personal assistant.
You get a cluster of related facts about the user (with ids) and any existing
higher-level memories built from them. Derive only well-supported, useful
higher-level memories:

- L5 knowledge: a stable relation or profile of a person, place, or thing
  ("Anna is the user's daughter; she lives in Ghent and is a nurse").
- L6 schema or routine: a recurring pattern or habit ("walks the dog every
  morning around 8", "visits the market on Saturdays").
- L7 intention: an ongoing goal or plan the user is working towards
  ("wants to lose weight before the summer").

Rules:
- Each memory needs at least two supporting fact ids from the cluster as evidence.
- Do not restate a single fact; summarise across facts.
- Never diagnose or infer health conditions that were not stated.
- If an existing memory is outdated, give its id in "replaces".
- Do not repeat an existing memory that is still correct.
- Keep the language of the facts. Return at most 3 memories, or none.
- Return exactly one JSON object:
  {"items": [{"layer": "L5"|"L6"|"L7", "subject": string, "text": string, "evidence": [number], "replaces": number|null}]}`;

export const INDUCTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["layer", "subject", "text", "evidence", "replaces"],
        properties: {
          layer: { type: "string", enum: [...INDUCED_LAYERS] },
          subject: { type: "string" },
          text: { type: "string" },
          evidence: { type: "array", items: { type: "integer" } },
          replaces: { type: ["integer", "null"] },
        },
      },
    },
  },
} as const;

export function parseInducedItems(payload: unknown): InducedItem[] {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { items?: unknown }).items)) {
    return [];
  }
  const items: InducedItem[] = [];
  for (const entry of (payload as { items: unknown[] }).items.slice(0, 3)) {
    if (typeof entry !== "object" || entry === null) continue;
    const value = entry as Record<string, unknown>;
    const layer = (INDUCED_LAYERS as readonly unknown[]).includes(value.layer) ? (value.layer as InducedLayer) : undefined;
    const subject = typeof value.subject === "string" ? value.subject.trim().slice(0, 120) : "";
    const text = typeof value.text === "string" ? value.text.trim().slice(0, 600) : "";
    const evidence = Array.isArray(value.evidence)
      ? value.evidence.filter((id): id is number => Number.isInteger(id))
      : [];
    if (!layer || !subject || !text) continue;
    items.push({
      layer,
      subject,
      text,
      evidence,
      ...(Number.isInteger(value.replaces) ? { replaces: value.replaces as number } : {}),
    });
  }
  return items;
}

export class LlmInducer implements Inducer {
  readonly id: string;
  private readonly client: ChatClient;

  constructor(client: ChatClient) {
    this.client = client;
    this.id = `llm-inducer:${client.id}`;
  }

  async induce(cluster: readonly MemoryItem[], existing: readonly MemoryItem[], signal?: AbortSignal): Promise<InducedItem[]> {
    const line = (item: MemoryItem) =>
      `id=${item.id} [${item.layer}, subject: ${item.subject}, since ${item.validFrom.slice(0, 10)}${
        item.eventAt ? `, date: ${item.eventAt}` : ""
      }]: ${item.text}`;
    const completion = await this.client.complete({
      messages: [
        { role: "system", content: INDUCTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "FACTS:",
            ...cluster.map(line),
            "",
            "EXISTING HIGHER-LEVEL MEMORIES:",
            ...(existing.length ? existing.map(line) : ["(none)"]),
          ].join("\n"),
        },
      ],
      responseFormat: { type: "json_schema", name: "memory_induction", schema: INDUCTION_SCHEMA },
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    const payload = parseJsonObject(completion.content);
    if (!payload) throw new Error("Inducer returned invalid JSON.");
    return parseInducedItems(payload);
  }
}
