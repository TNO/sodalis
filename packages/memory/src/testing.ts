import type { InducedItem, Inducer } from "./Consolidator.js";
import type { DecisionGate, SystemOneRequest, SystemOneResponse } from "./DecisionGate.js";
import type { ExtractedItem, ExtractionRequest, Extractor } from "./Extractor.js";
import type { MemoryItem } from "./types.js";
import type { ReconcileCandidate, ReconcileDecision, Reconciler } from "./Reconciler.js";

/** A gate that scores a turn with a function of the user text. */
export class ScriptedGate implements DecisionGate {
  readonly id = "scripted-gate";
  readonly states: string[] = [];
  private readonly score: (state: string) => { worthy: number; correction?: number; kind?: string };

  constructor(score: (state: string) => { worthy: number; correction?: number; kind?: string }) {
    this.score = score;
  }

  async decide(request: SystemOneRequest): Promise<SystemOneResponse> {
    this.states.push(request.state);
    const { worthy, correction = 0, kind = "fact" } = this.score(request.state);
    return {
      answers: request.questions.map((question) =>
        question.type === "noul"
          ? { key: question.key, type: "noul", noul: question.key === "is_correction" ? correction : worthy }
          : { key: question.key, type: "choice", choice: kind, probabilities: { [kind]: 1 } },
      ),
    };
  }
}

/** An extractor that returns scripted items for a user turn. */
export class ScriptedExtractor implements Extractor {
  readonly id = "scripted-extractor";
  readonly requests: ExtractionRequest[] = [];
  private readonly script: (request: ExtractionRequest) => ExtractedItem[] | Promise<ExtractedItem[]>;

  constructor(script: (request: ExtractionRequest) => ExtractedItem[] | Promise<ExtractedItem[]>) {
    this.script = script;
  }

  async extract(request: ExtractionRequest): Promise<ExtractedItem[]> {
    this.requests.push(request);
    return this.script(request);
  }
}

/** A reconciler that decides with a function of each candidate. */
export class ScriptedReconciler implements Reconciler {
  readonly id = "scripted-reconciler";
  readonly calls: (readonly ReconcileCandidate[])[] = [];
  private readonly decide: (candidate: ReconcileCandidate, index: number) => Omit<ReconcileDecision, "index">;

  constructor(decide: (candidate: ReconcileCandidate, index: number) => Omit<ReconcileDecision, "index">) {
    this.decide = decide;
  }

  async reconcile(candidates: readonly ReconcileCandidate[]): Promise<ReconcileDecision[]> {
    this.calls.push(candidates);
    return candidates.map((candidate, index) => ({ index, ...this.decide(candidate, index) }));
  }
}

export function fact(text: string, overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    layer: "L2",
    subject: "user",
    text,
    sensitivity: "general",
    provenance: "stated",
    transient: false,
    ...overrides,
  };
}

/** An inducer that returns scripted L5–L7 items for a cluster. */
export class ScriptedInducer implements Inducer {
  readonly id = "scripted-inducer";
  readonly calls: { cluster: MemoryItem[]; existing: MemoryItem[] }[] = [];
  private readonly script: (cluster: readonly MemoryItem[], existing: readonly MemoryItem[]) => InducedItem[];

  constructor(script: (cluster: readonly MemoryItem[], existing: readonly MemoryItem[]) => InducedItem[]) {
    this.script = script;
  }

  async induce(cluster: readonly MemoryItem[], existing: readonly MemoryItem[]): Promise<InducedItem[]> {
    this.calls.push({ cluster: [...cluster], existing: [...existing] });
    return this.script(cluster, existing);
  }
}
