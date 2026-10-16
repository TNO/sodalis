import type { Memory } from "./Memory.js";
import type { ItemLayer, MemoryItem } from "./types.js";

export interface RetrievalOptions {
  /** Maximum relevant items per layer. */
  readonly quotas?: Partial<Record<ItemLayer, number>>;
  /** Minimum cosine similarity for a vector-only hit. */
  readonly minSimilarity?: number;
  /** Approximate token budget of the memory block. */
  readonly tokenBudget?: number;
  /** Pin L2 items whose `event_at` falls within this many days. */
  readonly pinnedDays?: number;
  readonly chainDepth?: number;
  readonly pinnedIdentityLimit?: number;
  /** Include health items (requires health consent). */
  readonly includeHealth?: boolean;
}

export type RetrievalReason = "profile" | "upcoming" | "identity" | "relevant";

export interface RetrievedMemory {
  readonly item: MemoryItem;
  /** Older versions this item superseded, newest first. */
  readonly chain: readonly MemoryItem[];
  readonly reason: RetrievalReason;
  readonly score?: number;
}

export interface RetrievalResult {
  readonly block: string;
  readonly items: readonly RetrievedMemory[];
  readonly estimatedTokens: number;
}

export interface RetrievalRequest {
  readonly userTurn: string;
  readonly previousAssistantTurn?: string;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

export const DEFAULT_QUOTAS: Readonly<Partial<Record<ItemLayer, number>>> = {
  L2: 6,
  L3: 2,
  L4: 4,
  L5: 2,
  L6: 2,
  L7: 2,
};

/** Roughly 3.5 characters per token for Dutch and English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const day = (iso: string) => iso.slice(0, 10);

/** One block line: date, provenance, and a "was ..., now ..." chain. */
export function formatMemoryLine(entry: RetrievedMemory): string {
  const { item } = entry;
  const subject = item.subject.toLowerCase() === "user" ? "" : `${item.subject}: `;
  const event = item.eventAt ? ` (date: ${day(item.eventAt)})` : "";
  const meta = `[${day(item.validFrom)}, ${item.provenance}${item.layer === "L3" ? ", temporary" : ""}]`;
  if (entry.chain.length === 0) return `- ${meta} ${subject}${item.text}${event}`;
  const history = entry.chain
    .map((old) => `was "${old.text}" until ${day(old.validTo ?? item.validFrom)}`)
    .join("; ");
  return `- ${meta} ${subject}now "${item.text}"${event}; ${history}`;
}

export const MEMORY_BLOCK_HEADER =
  "Memory: what you know about the user from earlier conversations. Use it naturally when relevant; " +
  "do not recite it. Dates are YYYY-MM-DD when it was recorded; 'inferred' items were not stated explicitly, " +
  "'observed' items come from app or home events.";

/** LLM-free retrieval for one turn (ADR 0005, decision 8). */
export async function retrieveMemories(
  memory: Memory,
  request: RetrievalRequest,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const now = request.now ?? new Date();
  const quotas = { ...DEFAULT_QUOTAS, ...options.quotas };
  const minSimilarity = options.minSimilarity ?? 0.35;
  const budget = options.tokenBudget ?? 800;
  const chainDepth = options.chainDepth ?? 3;
  const store = memory.store;
  const allowed = (item: MemoryItem) =>
    item.status === "active" && (options.includeHealth || item.sensitivity !== "health");

  const query = [request.previousAssistantTurn, request.userTurn].filter(Boolean).join("\n");
  const embedding = await memory.embed(query, request.signal);
  const searchLayers = (Object.keys(quotas) as ItemLayer[]).filter(
    (layer) => (quotas[layer] ?? 0) > 0 && layer !== "L0",
  );
  const hits = memory.index.search({ embedding, text: request.userTurn, layers: searchLayers, limit: 40 });
  const hitItems = new Map(store.getItems(hits.map((hit) => hit.itemId)).map((item) => [item.id, item]));

  const selected = new Map<number, RetrievedMemory>();
  const add = (item: MemoryItem, reason: RetrievalReason, score?: number) => {
    if (selected.has(item.id) || !allowed(item)) return;
    selected.set(item.id, {
      item,
      chain: store
        .supersededChain(item.id, chainDepth)
        .filter((entry) => options.includeHealth || entry.sensitivity !== "health"),
      reason,
      ...(score === undefined ? {} : { score }),
    });
  };

  for (const item of store.listItems({ layers: ["L0"], statuses: ["active"], limit: 10 })) add(item, "profile");
  const until = new Date(now.getTime() + (options.pinnedDays ?? 14) * 86_400_000).toISOString();
  const upcoming = store
    .listItems({ layers: ["L2"], statuses: ["active"], eventFrom: day(now.toISOString()), eventTo: until, limit: 20 })
    .sort((left, right) => (left.eventAt ?? "").localeCompare(right.eventAt ?? ""));
  for (const item of upcoming) add(item, "upcoming");
  for (const item of store.listItems({ layers: ["L4"], statuses: ["active"], limit: options.pinnedIdentityLimit ?? 8 })) {
    add(item, "identity");
  }

  const used: Partial<Record<ItemLayer, number>> = {};
  for (const hit of hits) {
    const item = hitItems.get(hit.itemId);
    if (!item || selected.has(item.id) || !allowed(item)) continue;
    const relevant = (hit.similarity ?? 0) >= minSimilarity || hit.textRank !== undefined;
    if (!relevant) continue;
    if ((used[item.layer] ?? 0) >= (quotas[item.layer] ?? 0)) continue;
    used[item.layer] = (used[item.layer] ?? 0) + 1;
    add(item, "relevant", hit.score);
  }

  const lines: string[] = [];
  const items: RetrievedMemory[] = [];
  const header = `${MEMORY_BLOCK_HEADER}\nToday: ${day(now.toISOString())}`;
  let tokens = estimateTokens(header);
  for (const entry of selected.values()) {
    const line = formatMemoryLine(entry);
    const cost = estimateTokens(line) + 1;
    if (tokens + cost > budget) continue;
    tokens += cost;
    lines.push(line);
    items.push(entry);
  }
  return {
    block: items.length ? `${header}\n${lines.join("\n")}` : "",
    items,
    estimatedTokens: items.length ? tokens : 0,
  };
}
