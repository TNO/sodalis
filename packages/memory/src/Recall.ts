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
