import type { RoleStats } from "../src/ChatClient.js";
import type { ExtractedItem } from "../src/Extractor.js";
import { containsKeywords, type ExpectedItem, type PlantedEvent } from "./cases.js";
import type { CaseResult } from "./harness.js";

export interface Ratio {
  readonly correct: number;
  readonly total: number;
  readonly rate: number;
}

export interface ComponentMetrics {
  readonly gate: { precision: number; recall: number; f1: number; truePositive: number; falsePositive: number; falseNegative: number };
  readonly extraction: { precision: number; recall: number; f1: number; extracted: number; expected: number };
  readonly healthLabel: Ratio;
  readonly transientLabel: Ratio;
  readonly reconciliation: Ratio & { readonly byAction: Readonly<Record<string, Ratio>> };
}

export interface QaMetrics {
  readonly overall: Ratio;
  readonly byType: Readonly<Record<string, Ratio>>;
  readonly memoryTokens: number;
  readonly retrieveMs: number;
}

function ratio(correct: number, total: number): Ratio {
  return { correct, total, rate: total ? correct / total : 0 };
}

function f1(precision: number, recall: number): number {
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

export function itemMatches(item: ExtractedItem, expected: ExpectedItem): boolean {
  return containsKeywords(`${item.subject} ${item.text} ${item.eventAt ?? ""}`, expected.keywords);
}

/**
 * Gate, extraction, label, and reconciliation metrics against the event graph.
 * Extraction is end to end: a worthy turn the gate skipped counts as missed.
 */
export function componentMetrics(
  results: readonly CaseResult[],
  events: (caseId: string) => Readonly<Record<string, PlantedEvent>> | undefined,
): ComponentMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let extracted = 0;
  let matchedExtracted = 0;
  let expectedCount = 0;
  let matchedExpected = 0;
  let healthCorrect = 0;
  let healthTotal = 0;
  let transientCorrect = 0;
  let transientTotal = 0;
  const actions: Record<string, { correct: number; total: number }> = {};
  for (const result of results) {
    const graph = events(result.caseId);
    if (!graph) continue;
    for (const { turn, trace } of result.turns) {
      if (turn.role !== "user") continue;
      const planted = (turn.events ?? []).map((id) => graph[id]).filter((event): event is PlantedEvent => !!event);
      const worthy = planted.some((event) => event.worthy);
      const predicted = trace?.gate?.worthy ?? (trace ? trace.extracted.length > 0 : false);
      if (worthy && predicted) tp += 1;
      else if (!worthy && predicted) fp += 1;
      else if (worthy && !predicted) fn += 1;

      const items = trace?.extracted ?? [];
      extracted += items.length;
      const used = new Set<number>();
      for (const event of planted) {
        if (!event.expected) continue;
        expectedCount += 1;
        const index = items.findIndex((item, position) => !used.has(position) && itemMatches(item, event.expected!));
        if (index >= 0) {
          used.add(index);
          matchedExpected += 1;
          const item = items[index]!;
          if (event.expected.sensitivity === "health" || item.sensitivity === "health") {
            healthTotal += 1;
            if (item.sensitivity === event.expected.sensitivity) healthCorrect += 1;
          }
          if (event.expected.transient) {
            transientTotal += 1;
            if (item.transient) transientCorrect += 1;
          }
        }
        if (event.actions?.length) {
          const key = event.actions.join("|");
          const bucket = (actions[key] ??= { correct: 0, total: 0 });
          bucket.total += 1;
          if (index >= 0 && trace?.decisions.some((decision) => event.actions!.includes(decision.action))) {
            bucket.correct += 1;
          }
        }
      }
      matchedExtracted += used.size;
    }
  }
  const gatePrecision = tp + fp ? tp / (tp + fp) : 0;
  const gateRecall = tp + fn ? tp / (tp + fn) : 0;
  const precision = extracted ? matchedExtracted / extracted : 0;
  const recall = expectedCount ? matchedExpected / expectedCount : 0;
  const reconcileCorrect = Object.values(actions).reduce((sum, bucket) => sum + bucket.correct, 0);
  const reconcileTotal = Object.values(actions).reduce((sum, bucket) => sum + bucket.total, 0);
  return {
    gate: { precision: gatePrecision, recall: gateRecall, f1: f1(gatePrecision, gateRecall), truePositive: tp, falsePositive: fp, falseNegative: fn },
    extraction: { precision, recall, f1: f1(precision, recall), extracted, expected: expectedCount },
    healthLabel: ratio(healthCorrect, healthTotal),
    transientLabel: ratio(transientCorrect, transientTotal),
    reconciliation: {
      ...ratio(reconcileCorrect, reconcileTotal),
      byAction: Object.fromEntries(Object.entries(actions).map(([key, bucket]) => [key, ratio(bucket.correct, bucket.total)])),
    },
  };
}

export function qaMetrics(results: readonly CaseResult[]): QaMetrics {
  const byType: Record<string, { correct: number; total: number }> = {};
  let correct = 0;
  let total = 0;
  let memoryTokens = 0;
  let retrieveMs = 0;
  for (const question of results.flatMap((result) => result.questions)) {
    total += 1;
    memoryTokens += question.memoryTokens;
    retrieveMs += question.retrieveMs;
    const bucket = (byType[question.question.type] ??= { correct: 0, total: 0 });
    bucket.total += 1;
    if (question.correct) {
      correct += 1;
      bucket.correct += 1;
    }
  }
  return {
    overall: ratio(correct, total),
    byType: Object.fromEntries(Object.entries(byType).map(([key, bucket]) => [key, ratio(bucket.correct, bucket.total)])),
    memoryTokens: total ? memoryTokens / total : 0,
    retrieveMs: total ? retrieveMs / total : 0,
  };
}

/** Per-role averages for the report. */
export function roleSummary(stats: Readonly<Record<string, RoleStats>>) {
  return Object.fromEntries(
    Object.entries(stats).map(([role, value]) => [
      role,
      {
        calls: value.calls,
        failures: value.failures,
        meanMs: value.calls ? value.totalMs / value.calls : 0,
        promptTokens: value.promptTokens,
        completionTokens: value.completionTokens,
      },
    ]),
  );
}
