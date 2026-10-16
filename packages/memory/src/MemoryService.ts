import type { ConsolidationReport, Consolidator } from "./Consolidator.js";
import { redactCredentials } from "./credentials.js";
import type { DecisionGate } from "./DecisionGate.js";
import type { Extractor } from "./Extractor.js";
import { JobQueue, type JobQueueOptions } from "./JobQueue.js";
import type { Memory } from "./Memory.js";
import type { Reconciler } from "./Reconciler.js";
import { recallMemory, type RecallRequest, type RecallResult } from "./Recall.js";
import { retrieveMemories, type RetrievalOptions, type RetrievalResult } from "./Retriever.js";
import type { Turn } from "./types.js";
import { WritePipeline, type WriteTrace } from "./WritePipeline.js";

export interface MemoryServiceOptions {
  readonly memory: Memory;
  readonly gate: DecisionGate;
  readonly extractor: Extractor;
  readonly reconciler: Reconciler;
  readonly gateThreshold?: number;
  /** When true (default), nothing is stored or retrieved without memory consent. */
  readonly requireConsent?: boolean;
  readonly retrieval?: RetrievalOptions;
  readonly queue?: JobQueueOptions;
  readonly onTrace?: (trace: WriteTrace) => void;
  /** System 2 (task 0050); runs as a queued job when the write path is idle. */
  readonly consolidator?: Consolidator;
  /** Minimum time between consolidation runs (default 20 hours). */
  readonly consolidationIntervalMs?: number;
  readonly onConsolidation?: (report: ConsolidationReport) => void;
}

export interface TurnInput {
  readonly sessionId: string;
  readonly turnId: string;
  readonly text: string;
  readonly createdAt?: string;
}

export interface ObservationInput {
  /** Origin of the event, such as `home` or `app:calendar`. */
  readonly source: string;
  readonly text: string;
  readonly sessionId?: string;
  readonly eventId?: string;
  readonly createdAt?: string;
}

const DUTCH = /\b(de|het|een|ik|je|jij|niet|wel|ook|mijn|morgen|vandaag|graag|dochter|zoon)\b/giu;
const ENGLISH = /\b(the|a|an|i|you|not|also|my|tomorrow|today|please|daughter|son)\b/giu;

/** A tiny nl/en guess for the L1 `language` column; undefined when unclear. */
export function guessLanguage(text: string): "nl" | "en" | undefined {
  const dutch = text.match(DUTCH)?.length ?? 0;
  const english = text.match(ENGLISH)?.length ?? 0;
  if (dutch === english) return undefined;
  return dutch > english ? "nl" : "en";
}

/**
 * The long-term memory service: stores turns (L1), runs the asynchronous write
 * path in a durable queue, and retrieves a memory block for each turn.
 */
export class MemoryService {
  readonly memory: Memory;
  readonly queue: JobQueue;
  private readonly options: MemoryServiceOptions;
  private maintenanceTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: MemoryServiceOptions) {
    this.options = options;
    this.memory = options.memory;
    this.queue = new JobQueue(options.memory.store, options.queue);
    const pipeline = new WritePipeline({
      memory: options.memory,
      gate: options.gate,
      extractor: options.extractor,
      reconciler: options.reconciler,
      ...(options.gateThreshold === undefined ? {} : { gateThreshold: options.gateThreshold }),
      ...(options.onTrace ? { onTrace: options.onTrace } : {}),
      isActive: () => this.active(),
    });
    // Jobs queued before consent was revoked finish without being processed.
    this.queue.register("turn", async (job, finish, signal) => {
      if (this.active()) await pipeline.process(job, finish, signal);
    });
    const consolidator = options.consolidator;
    if (consolidator) {
      this.queue.register("consolidate", async (_job, finish, signal) => {
        if (!this.active()) return;
        const report = await consolidator.run(signal, finish);
        options.onConsolidation?.(report);
      });
    }
  }

  get store() {
    return this.memory.store;
  }

  /** Whether turns may be stored and memories used. */
  active(): boolean {
    return this.options.requireConsent === false || this.store.hasConsent("memory");
  }

  /** Recovers interrupted jobs, purges expired transcripts, and resumes the queue. */
  start(maintenanceIntervalMs = 3_600_000): void {
    this.queue.recover();
    this.maintenance();
    this.queue.kick();
    this.maintenanceTimer = setInterval(() => this.maintenance(), maintenanceIntervalMs);
    this.maintenanceTimer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    await this.queue.stop();
  }

  maintenance(): void {
    this.store.purgeExpiredTurns();
    this.store.database.db
      .prepare("DELETE FROM jobs WHERE status = 'done' AND updated_at < ?")
      .run(new Date(Date.parse(this.store.now()) - 7 * 86_400_000).toISOString());
    if (this.consolidationDue()) this.consolidate();
  }

  /** True when System 2 has not run recently and no turns wait for the write path. */
  consolidationDue(): boolean {
    const consolidator = this.options.consolidator;
    if (!consolidator || !this.active() || this.queue.pendingCount() > 0) return false;
    const lastRun = consolidator.lastRun();
    const interval = this.options.consolidationIntervalMs ?? 20 * 3_600_000;
    return !lastRun || Date.parse(this.store.now()) - Date.parse(lastRun) >= interval;
  }

  /** Queues a consolidation run unless one is already queued. Returns false without System 2. */
  consolidate(): boolean {
    if (!this.options.consolidator || !this.active()) return false;
    const queued = this.store.database.db
      .prepare("SELECT 1 FROM jobs WHERE kind = 'consolidate' AND status IN ('pending', 'running') LIMIT 1")
      .get();
    if (!queued) this.queue.enqueue("consolidate", {});
    this.queue.kick();
    return true;
  }

  /**
   * Stores a user turn as L1 (credentials removed) and queues the write path.
   * Call `flush()` after the reply so extraction never competes with it.
   */
  recordUserTurn(input: TurnInput): Turn | undefined {
    if (!this.active()) return undefined;
    const existing = this.store.findTurn(input.sessionId, input.turnId, "user");
    if (existing) return existing;
    const { text, found } = redactCredentials(input.text);
    return this.store.database.transaction(() => {
      const language = guessLanguage(text);
      const turn = this.store.appendTurn({
        sessionId: input.sessionId,
        turnId: input.turnId,
        role: "user",
        text,
        ...(language ? { language } : {}),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      });
      if (found) this.store.audit("turn.credential-removed", undefined, { turnId: turn.id });
      this.queue.enqueue("turn", {}, turn.id);
      return turn;
    });
  }

  /** Stores an assistant turn as L1. Assistant text is context only, never a fact source. */
  recordAssistantTurn(input: TurnInput): Turn | undefined {
    if (!this.active()) return undefined;
    const existing = this.store.findTurn(input.sessionId, input.turnId, "assistant");
    if (existing) return existing;
    const { text } = redactCredentials(input.text);
    const language = guessLanguage(text);
    return this.store.appendTurn({
      sessionId: input.sessionId,
      turnId: input.turnId,
      role: "assistant",
      text,
      ...(language ? { language } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
  }

  /** Stores an app or home event as an observation and queues extraction. */
  recordObservation(input: ObservationInput): Turn | undefined {
    if (!this.active()) return undefined;
    if (!/^[a-z][a-z0-9._:-]{0,63}$/.test(input.source)) {
      throw new RangeError("Observation source must be a short lowercase identifier.");
    }
    const sessionId = input.sessionId ?? `observations:${input.source}`;
    const turnId = input.eventId ?? `${input.source}:${this.store.now()}`;
    const existing = this.store.findTurn(sessionId, turnId, "observation");
    if (existing) return existing;
    const { text } = redactCredentials(input.text);
    return this.store.database.transaction(() => {
      const turn = this.store.appendTurn({
        sessionId,
        turnId,
        role: "observation",
        text,
        source: input.source,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      });
      this.queue.enqueue("turn", {}, turn.id);
      return turn;
    });
  }

  /** Starts the write path for queued turns in the background. */
  flush(): void {
    this.queue.kick();
  }

  /** Processes all queued work and resolves when idle (tests, evaluation). */
  drain(): Promise<void> {
    return this.queue.drain();
  }

  async retrieve(userTurn: string, previousAssistantTurn?: string, signal?: AbortSignal): Promise<RetrievalResult> {
    if (!this.active()) return { block: "", items: [], estimatedTokens: 0 };
    return retrieveMemories(
      this.memory,
      {
        userTurn,
        ...(previousAssistantTurn ? { previousAssistantTurn } : {}),
        now: new Date(this.store.now()),
        ...(signal ? { signal } : {}),
      },
      { ...this.options.retrieval, includeHealth: this.store.hasConsent("health") },
    );
  }

  async recall(request: RecallRequest): Promise<RecallResult> {
    if (!this.active()) return { excerpts: [] };
    return recallMemory(this.memory, request, { includeHealth: this.store.hasConsent("health") });
  }
}
