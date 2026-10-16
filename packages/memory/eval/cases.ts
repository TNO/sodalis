import type { ItemLayer, Sensitivity } from "../src/types.js";
import type { ReconcileAction } from "../src/Reconciler.js";

/** What the write path should store for one planted event. */
export interface ExpectedItem {
  readonly layer: ItemLayer;
  readonly subject: string;
  /** Words that must all occur in a matching stored item (accents and case ignored). */
  readonly keywords: readonly string[];
  readonly sensitivity: Sensitivity;
  readonly transient: boolean;
  readonly eventAt?: string;
}

/** Labels derived from the event graph, never from an LLM. */
export interface PlantedEvent {
  readonly id: string;
  readonly kind: EventKind;
  /** Canonical user utterance; renderers may paraphrase but keep the facts. */
  readonly say: string;
  readonly worthy: boolean;
  readonly expected?: ExpectedItem;
  /** Acceptable reconciliation actions for the main extracted item. */
  readonly actions?: readonly ReconcileAction[];
  /** The earlier event this one updates, corrects, or restates. */
  readonly target?: string;
}

export type EventKind =
  | "family"
  | "pet"
  | "hobby"
  | "preference"
  | "preference-change"
  | "correction"
  | "restatement"
  | "appointment"
  | "birthday"
  | "health"
  | "transient"
  | "routine"
  | "distractor";

export interface EvalTurn {
  readonly role: "user" | "assistant";
  readonly text: string;
  /** Planted events stated in this user turn (synthetic sets only). */
  readonly events?: readonly string[];
}

export interface EvalSession {
  readonly id: string;
  /** ISO timestamp of the session start. */
  readonly date: string;
  readonly turns: readonly EvalTurn[];
}

export type QuestionType =
  | "single-session"
  | "knowledge-update"
  | "temporal"
  | "multi-session"
  | "health"
  | "routine"
  | "abstention"
  | (string & {});

export interface EvalQuestion {
  readonly id: string;
  readonly type: QuestionType;
  readonly question: string;
  readonly answer: string;
  /** Words that a correct answer contains (keyword scoring without a judge). */
  readonly keywords?: readonly string[];
  readonly askedAt: string;
  readonly abstain?: boolean;
}

export interface EvalCase {
  readonly id: string;
  readonly source: string;
  readonly language: "nl" | "en";
  readonly sessions: readonly EvalSession[];
  readonly questions: readonly EvalQuestion[];
  /** Ground-truth events by id (synthetic sets only). */
  readonly events?: Readonly<Record<string, PlantedEvent>>;
}

/** Lowercases and strips accents and punctuation for keyword matching. */
export function normaliseText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function containsKeywords(text: string, keywords: readonly string[]): boolean {
  const haystack = ` ${normaliseText(text)} `;
  return keywords.every((keyword) => haystack.includes(` ${normaliseText(keyword)} `));
}
