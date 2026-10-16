import type { DecisionGate, GateVerdict } from "./DecisionGate.js";
import { MEMORY_GATE_QUESTIONS, memoryGateState, memoryGateVerdict } from "./DecisionGate.js";
import type { ExtractedItem, Extractor } from "./Extractor.js";
import type { Job } from "./JobQueue.js";
import { itemIndexText, type Memory } from "./Memory.js";
import { subjectKey } from "./MemoryStore.js";
import { sanitiseDecisions, type ReconcileAction, type ReconcileCandidate, type ReconcileDecision, type Reconciler } from "./Reconciler.js";
import type { ItemLayer, NewMemoryItem, Turn } from "./types.js";

export interface AppliedDecision {
  readonly action: ReconcileAction;
  readonly itemId?: number;
  readonly targetId?: number;
  readonly layer: ItemLayer;
}

/** What the write path did with one turn (for tests, logs, and evaluation). */
export interface WriteTrace {
  readonly turnId: number;
  readonly role: Turn["role"];
  readonly gate?: GateVerdict;
  readonly extracted: readonly ExtractedItem[];
  readonly droppedHealth: number;
  readonly droppedObservationHealth: number;
  readonly decisions: readonly AppliedDecision[];
  readonly gateMs?: number;
  readonly extractMs?: number;
  readonly reconcileMs?: number;
}

export interface WritePipelineOptions {
  readonly memory: Memory;
  readonly gate: DecisionGate;
  readonly extractor: Extractor;
  readonly reconciler: Reconciler;
  /** memory_worthy probability needed to extract; low values favour recall. */
  readonly gateThreshold?: number;
  readonly neighbours?: number;
  readonly onTrace?: (trace: WriteTrace) => void;
  /** Rechecked before writing; false (memory consent revoked) discards the results. */
  readonly isActive?: () => boolean;
}

const RECONCILED_LAYERS: readonly ItemLayer[] = ["L0", "L2", "L4"];

/** The asynchronous write path for one stored L1 turn. */
export class WritePipeline {
  private readonly options: WritePipelineOptions;

  constructor(options: WritePipelineOptions) {
    this.options = options;
  }

  private get memory() {
    return this.options.memory;
  }

  async process(job: Job, finish: () => void, signal: AbortSignal): Promise<void> {
    const turn = job.turnId === undefined ? undefined : this.memory.store.getTurn(job.turnId);
    if (!turn || turn.role === "assistant") return;
    const store = this.memory.store;
    const observation = turn.role === "observation";
    const previous = observation ? undefined : store.previousTurn(turn.sessionId, turn.id);
    const previousAssistant = previous?.role === "assistant" ? previous.text : undefined;

    let gate: GateVerdict | undefined;
    let gateMs: number | undefined;
    if (!observation) {
      const started = performance.now();
      const response = await this.options.gate.decide(
        { state: memoryGateState(turn.text, previousAssistant), questions: MEMORY_GATE_QUESTIONS },
        signal,
      );
      gateMs = performance.now() - started;
      gate = memoryGateVerdict(response, this.options.gateThreshold ?? 0.3);
      if (gate.kind === "health") store.markTurnHealth(turn.id);
      if (!gate.worthy) {
        this.trace({ turnId: turn.id, role: turn.role, gate, extracted: [], droppedHealth: 0, droppedObservationHealth: 0, decisions: [], gateMs });
        return;
      }
    }

    const extractStarted = performance.now();
    const extracted = await this.options.extractor.extract({
      userTurn: observation ? `Observed event from ${turn.source ?? "unknown source"}: ${turn.text}` : turn.text,
      ...(previousAssistant ? { previousAssistantTurn: previousAssistant } : {}),
      turnTime: turn.createdAt,
      ...(gate ? { kindHint: gate.kind, isCorrection: gate.isCorrection } : {}),
      signal,
    });
    const extractMs = performance.now() - extractStarted;

    if (extracted.some((item) => item.sensitivity === "health")) store.markTurnHealth(turn.id);
    const healthConsent = store.hasConsent("health");
    let droppedHealth = 0;
    let droppedObservationHealth = 0;
    const kept: ExtractedItem[] = [];
    for (const item of extracted) {
      if (item.sensitivity === "health" && observation) {
        droppedObservationHealth += 1;
      } else if (item.sensitivity === "health" && !healthConsent) {
        droppedHealth += 1;
      } else {
        kept.push(item.transient ? { ...item, layer: "L3" } : item);
      }
    }

    const embeddings = await this.memory.embedder.embed(kept.map(itemIndexText), signal);
    const reconcileStarted = performance.now();
    const candidates: ReconcileCandidate[] = kept.map((item, index) => {
      if (!RECONCILED_LAYERS.includes(item.layer)) return { item, neighbours: [] };
      const hits = this.memory.index.search({
        embedding: embeddings[index]!,
        text: item.text,
        layers: RECONCILED_LAYERS,
        // A correction may rename the subject itself ("not Elke but Ruben").
        ...(gate?.isCorrection ? {} : { subjectKey: subjectKey(item.subject) }),
        limit: this.options.neighbours ?? 5,
      });
      const neighbours = store.getItems(hits.map((hit) => hit.itemId)).filter((entry) => entry.status === "active");
      return { item, neighbours };
    });
    const reconciled: readonly ReconcileDecision[] = candidates.some((candidate) => candidate.neighbours.length > 0)
      ? sanitiseDecisions(candidates, await this.options.reconciler.reconcile(candidates, signal))
      : candidates.map((_, index) => ({ index, action: "ADD" as const }));
    const occurrenceDay = (entry: { eventAt?: string | null; recordedAt: string }) =>
      (entry.eventAt ?? entry.recordedAt).slice(0, 10);
    const decisions = reconciled.map((decision): ReconcileDecision => {
      const { item, neighbours } = candidates[decision.index]!;
      // An episode on another day is a new occurrence, even when told in the
      // same words; the repetition is what System 2 needs to induce a routine.
      const day = occurrenceDay({ eventAt: item.eventAt, recordedAt: turn.createdAt });
      const repeatedEpisode =
        decision.action === "NOOP" &&
        item.layer === "L2" &&
        !neighbours.some(
          (neighbour) => occurrenceDay({ eventAt: neighbour.eventAt, recordedAt: neighbour.validFrom }) === day,
        );
      return repeatedEpisode ? { index: decision.index, action: "ADD" } : decision;
    });
    const reconcileMs = performance.now() - reconcileStarted;

    const merged = new Map<number, Float32Array>();
    const mergedTexts = decisions.flatMap((decision) => {
      const item = kept[decision.index]!;
      return (decision.action === "UPDATE" || decision.action === "SUPERSEDE") && decision.text && decision.text !== item.text
        ? [{ index: decision.index, text: itemIndexText({ subject: item.subject, text: decision.text }) }]
        : [];
    });
    if (mergedTexts.length) {
      const vectors = await this.memory.embedder.embed(mergedTexts.map((entry) => entry.text), signal);
      mergedTexts.forEach((entry, position) => merged.set(entry.index, vectors[position]!));
    }

    signal.throwIfAborted();
    const applied: AppliedDecision[] = [];
    this.memory.database.transaction(() => {
      // Consent may have changed while the models ran.
      const active = this.options.isActive?.() ?? true;
      const healthAllowed = store.hasConsent("health");
      for (const decision of decisions) {
        const item = kept[decision.index]!;
        if (!active || (item.sensitivity === "health" && !healthAllowed)) {
          applied.push({ action: "NOOP", layer: item.layer });
          continue;
        }
        const embedding = merged.get(decision.index) ?? embeddings[decision.index]!;
        const newItem: NewMemoryItem = {
          layer: item.layer,
          subject: item.subject,
          text: decision.text ?? item.text,
          sensitivity: item.sensitivity,
          provenance: observation ? "observed" : item.provenance,
          ...(item.eventAt ? { eventAt: item.eventAt } : {}),
          validFrom: turn.createdAt,
          sourceTurnIds: [turn.id],
        };
        switch (decision.action) {
          case "ADD": {
            const added = store.addItem(newItem, embedding);
            applied.push({ action: "ADD", itemId: added.id, layer: added.layer });
            break;
          }
          case "UPDATE": {
            const target = decision.targetId!;
            const updated = store.updateItem(
              target,
              { text: newItem.text, reason: "reconcile", ...(item.eventAt ? { eventAt: item.eventAt } : {}) },
              embedding,
            );
            store.addSources(target, [turn.id]);
            applied.push({ action: "UPDATE", itemId: updated.id, targetId: target, layer: updated.layer });
            break;
          }
          case "SUPERSEDE": {
            const target = decision.targetId!;
            const added = store.supersede(target, newItem, embedding);
            applied.push({ action: "SUPERSEDE", itemId: added.id, targetId: target, layer: added.layer });
            break;
          }
          case "NOOP":
            applied.push({ action: "NOOP", layer: item.layer });
            break;
        }
      }
      finish();
    });
    this.trace({
      turnId: turn.id,
      role: turn.role,
      ...(gate ? { gate } : {}),
      extracted,
      droppedHealth,
      droppedObservationHealth,
      decisions: applied,
      ...(gateMs === undefined ? {} : { gateMs }),
      extractMs,
      reconcileMs,
    });
  }

  private trace(trace: WriteTrace): void {
    this.options.onTrace?.(trace);
  }
}
