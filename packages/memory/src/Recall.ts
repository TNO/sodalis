import type { Memory } from "./Memory.js";
import { ftsQuery } from "./MemoryIndex.js";

export interface RecallRequest {
  readonly query: string;
  /** Inclusive ISO date or date-time bounds. */
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface RecallExcerpt {
  readonly source: "summary" | "transcript";
  /** YYYY-MM-DD of the summary or turn. */
  readonly date: string;
  /** `stated`/`inferred`/`observed` for summaries; the speaker for transcripts. */
  readonly provenance: string;
  readonly text: string;
}

export interface RecallResult {
  readonly excerpts: readonly RecallExcerpt[];
}

const MAX_EXCERPT = 300;

function excerpt(text: string): string {
  return text.length <= MAX_EXCERPT ? text : `${text.slice(0, MAX_EXCERPT - 1)}…`;
}

function inRange(iso: string, from?: string, to?: string): boolean {
  return (!from || iso >= from) && (!to || iso.slice(0, to.length) <= to);
}

/**
 * Explicit episodic recall (task 0049): searches L3 summaries and falls back
 * to L1 transcripts within retention. Only the matched excerpts are returned.
 */
export async function recallMemory(
  memory: Memory,
  request: RecallRequest,
  options: { includeHealth?: boolean; minSimilarity?: number } = {},
): Promise<RecallResult> {
  const limit = Math.min(Math.max(request.limit ?? 5, 1), 10);
  const excerpts: RecallExcerpt[] = [];
  const query = request.query.trim();
  if (query) {
    const results = await memory.search(query, { layers: ["L3"], limit: 20 });
    for (const { item, hit } of results) {
      if (excerpts.length >= limit) break;
      if (!options.includeHealth && item.sensitivity === "health") continue;
      if ((hit.similarity ?? 0) < (options.minSimilarity ?? 0.3) && hit.textRank === undefined) continue;
      if (!inRange(item.validFrom, request.from, request.to)) continue;
      excerpts.push({
        source: "summary",
        date: item.validFrom.slice(0, 10),
        provenance: item.provenance,
        text: excerpt(item.subject.toLowerCase() === "user" ? item.text : `${item.subject}: ${item.text}`),
      });
    }
  }
  if (excerpts.length < limit) {
    const match = ftsQuery(query);
    const turns = match
      ? memory.store.searchTurns(match, {
          ...(request.from ? { from: request.from } : {}),
          ...(request.to ? { to: request.to.length === 10 ? `${request.to}T23:59:59.999Z` : request.to } : {}),
          limit: limit - excerpts.length,
          excludeHealth: !options.includeHealth,
        })
      : request.from && request.to
        ? memory.store.turnsBetween(
            request.from,
            request.to.length === 10 ? `${request.to}T23:59:59.999Z` : request.to,
            limit - excerpts.length,
            { excludeHealth: !options.includeHealth },
          )
        : [];
    for (const turn of turns) {
      excerpts.push({
        source: "transcript",
        date: turn.createdAt.slice(0, 10),
        provenance: turn.role === "observation" ? `observation:${turn.source ?? "unknown"}` : turn.role,
        text: excerpt(turn.text),
      });
    }
  }
  return { excerpts };
}

export function formatRecallResult(result: RecallResult): string {
  if (result.excerpts.length === 0) return "No matching memories were found.";
  return result.excerpts
    .map((entry) => `- [${entry.date}, ${entry.source}, ${entry.provenance}] ${entry.text}`)
    .join("\n");
}

/**
 * The `recall_memory` protocol shared by the AI service and the evaluation:
 * the model answers with only this JSON object to search its memory first.
 */
export const RECALL_MEMORY_INSTRUCTION =
  'If answering needs details from an earlier conversation that the Memory section does not contain, respond with only {"recall_memory":{"query":string,"from"?:"YYYY-MM-DD","to"?:"YYYY-MM-DD"}} to search your memory first; use the query in the language of the conversation. Then the JSON is your entire reply, with no text before or after it; never announce a search or ask permission.';

export const RECALL_REPLY_PREFIX = '{"recall_memory"';

export interface RecallCall {
  readonly query: string;
  readonly from?: string;
  readonly to?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when a (possibly partial) reply is, or may still become, a recall request. */
export function mayBeRecallReply(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return RECALL_REPLY_PREFIX.startsWith(compact) || compact.startsWith(RECALL_REPLY_PREFIX);
}

export function isRecallReply(text: string): boolean {
  return text.replace(/\s+/g, "").startsWith(RECALL_REPLY_PREFIX);
}

/** Reads a complete recall request; undefined when it is malformed. */
export function parseRecallCall(text: string): RecallCall | undefined {
  try {
    const payload: unknown = JSON.parse(text);
    if (typeof payload !== "object" || payload === null) return undefined;
    const call: unknown = (payload as Record<string, unknown>).recall_memory;
    if (typeof call !== "object" || call === null) return undefined;
    const { query, from, to } = call as Record<string, unknown>;
    if (typeof query !== "string" || query.length > 500) return undefined;
    return {
      query,
      ...(typeof from === "string" && DATE_PATTERN.test(from) ? { from } : {}),
      ...(typeof to === "string" && DATE_PATTERN.test(to) ? { to } : {}),
    };
  } catch {
    return undefined;
  }
}

/** The prompt section with the excerpts of an earlier recall in this turn. */
export function recalledContextPrompt(query: string, excerpts: string): string {
  return `Recalled from earlier conversations for "${query}" (dated excerpts; answer from these and do not request another recall):\n${excerpts}`;
}
