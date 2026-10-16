import { parseJsonObject, type ChatClient } from "./ChatClient.js";
import type { ExtractedItem } from "./Extractor.js";
import type { MemoryItem } from "./types.js";

export const RECONCILE_ACTIONS = ["ADD", "UPDATE", "SUPERSEDE", "NOOP"] as const;
export type ReconcileAction = (typeof RECONCILE_ACTIONS)[number];

export interface ReconcileCandidate {
  readonly item: ExtractedItem;
  /** Up to 5 nearest active items on the same subject (any subject for a correction). */
  readonly neighbours: readonly MemoryItem[];
}

export interface ReconcileDecision {
  /** Position of the candidate in the request. */
  readonly index: number;
  readonly action: ReconcileAction;
  readonly targetId?: number;
  /** Merged text for UPDATE; the new state for SUPERSEDE. */
  readonly text?: string;
}

export interface Reconciler {
  readonly id: string;
  reconcile(candidates: readonly ReconcileCandidate[], signal?: AbortSignal): Promise<ReconcileDecision[]>;
}

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Makes decisions safe: targets must be one of the candidate's neighbours,
 * no existing item is touched twice, and missing or invalid decisions ADD.
 */
export function sanitiseDecisions(
  candidates: readonly ReconcileCandidate[],
  decisions: readonly ReconcileDecision[],
): ReconcileDecision[] {
  const used = new Set<number>();
  return candidates.map((candidate, index) => {
    const decision = decisions.find((entry) => entry.index === index);
    if (!decision || decision.action === "ADD") return { index, action: "ADD" };
    if (decision.action === "NOOP") return { index, action: "NOOP" };
    const target = candidate.neighbours.find((neighbour) => neighbour.id === decision.targetId);
    if (!target || used.has(target.id)) return { index, action: "ADD" };
    used.add(target.id);
    const text = decision.text?.trim() || candidate.item.text;
    return { index, action: decision.action, targetId: target.id, text };
  });
}

/** Exact duplicates are NOOPs without a model call. */
function exactDuplicate(candidate: ReconcileCandidate): boolean {
  const text = normaliseText(candidate.item.text);
  return candidate.neighbours.some((neighbour) => normaliseText(neighbour.text) === text);
}

/*
 * Adapted from Hy-Memory's RECONCILE_PROMPT (hy_memory/agent/reconciler.py;
 * Tencent-Hunyuan/Hy-Memory, Apache-2.0), reduced to ADD / UPDATE /
 * SUPERSEDE / NOOP with one decision per new memory.
 */
export const RECONCILE_SYSTEM_PROMPT = `You maintain the long-term memory of a personal assistant.
For each NEW memory, decide how it relates to the EXISTING memories listed with it.

ADD: the information is new.
UPDATE: the new memory describes the same fact or the same occurrence and adds
compatible detail. Give "text": one merged statement that loses nothing.
SUPERSEDE: the new memory contradicts an existing one; both cannot be true now
(moved house, changed preference, appointment moved, corrected name). Give
"text" with ONLY the new state; history is kept automatically.
NOOP: the new memory is already fully covered by an existing memory.

Rules:
- Only target an existing memory listed with that new memory, by its id.
- Never UPDATE or SUPERSEDE across different subjects, except when the user
  corrects a mistaken name ("not Elke but Ruben"): SUPERSEDE the item under
  the wrong name.
- Separate dated occurrences (two different appointments) are separate ADDs.
- A recurring L2 episode told again ("walked in the park again this morning")
  is a new occurrence: ADD, not NOOP.
- Compatible preferences ("likes tea" and "likes coffee") are ADD, not SUPERSEDE.
- Keep the language of the memories.
- Return exactly one JSON object:
  {"decisions": [{"index": 0, "action": "ADD"|"UPDATE"|"SUPERSEDE"|"NOOP", "target_id": number|null, "text": string|null}]}`;

export const RECONCILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "action", "target_id", "text"],
        properties: {
          index: { type: "integer" },
          action: { type: "string", enum: [...RECONCILE_ACTIONS] },
          target_id: { type: ["integer", "null"] },
          text: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export function reconcileUserPrompt(candidates: readonly ReconcileCandidate[]): string {
  return candidates
    .map((candidate, index) =>
      [
        `NEW ${index} [${candidate.item.layer}, subject: ${candidate.item.subject}${
          candidate.item.eventAt ? `, date: ${candidate.item.eventAt}` : ""
        }]: ${candidate.item.text}`,
        candidate.neighbours.length
          ? candidate.neighbours
              .map(
                (neighbour) =>
                  `  EXISTING id=${neighbour.id} [${neighbour.layer}, subject: ${neighbour.subject}${
                    neighbour.eventAt ? `, date: ${neighbour.eventAt}` : ""
                  }, since ${neighbour.validFrom.slice(0, 10)}]: ${neighbour.text}`,
              )
              .join("\n")
          : "  (no existing memories)",
      ].join("\n"),
    )
    .join("\n\n");
}

export class LlmReconciler implements Reconciler {
  readonly id: string;
  private readonly client: ChatClient;

  constructor(client: ChatClient) {
    this.client = client;
    this.id = `llm-reconciler:${client.id}`;
  }

  async reconcile(candidates: readonly ReconcileCandidate[], signal?: AbortSignal): Promise<ReconcileDecision[]> {
    const decided = new Map<number, ReconcileDecision>();
    const ask: number[] = [];
    candidates.forEach((candidate, index) => {
      if (candidate.neighbours.length === 0) decided.set(index, { index, action: "ADD" });
      else if (exactDuplicate(candidate)) decided.set(index, { index, action: "NOOP" });
      else ask.push(index);
    });
    if (ask.length > 0) {
      const subset = ask.map((index) => candidates[index]!);
      const completion = await this.client.complete({
        messages: [
          { role: "system", content: RECONCILE_SYSTEM_PROMPT },
          { role: "user", content: reconcileUserPrompt(subset) },
        ],
        responseFormat: { type: "json_schema", name: "memory_reconciliation", schema: RECONCILE_SCHEMA },
        temperature: 0,
        ...(signal ? { signal } : {}),
      });
      const payload = parseJsonObject(completion.content);
      if (!payload) throw new Error("Reconciler returned invalid JSON.");
      const raw = Array.isArray(payload.decisions) ? payload.decisions : [];
      for (const entry of raw) {
        if (typeof entry !== "object" || entry === null) continue;
        const value = entry as Record<string, unknown>;
        const position = typeof value.index === "number" ? value.index : -1;
        const index = ask[position];
        if (index === undefined || decided.has(index)) continue;
        const action = (RECONCILE_ACTIONS as readonly unknown[]).includes(value.action)
          ? (value.action as ReconcileAction)
          : "ADD";
        decided.set(index, {
          index,
          action,
          ...(typeof value.target_id === "number" ? { targetId: value.target_id } : {}),
          ...(typeof value.text === "string" ? { text: value.text } : {}),
        });
      }
    }
    return sanitiseDecisions(candidates, [...decided.values()]);
  }
}
