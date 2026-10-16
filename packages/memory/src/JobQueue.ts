import type { MemoryStore } from "./MemoryStore.js";

export interface Job {
  readonly id: number;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly turnId?: number;
  readonly attempts: number;
}

/**
 * A job handler. Call `finish()` inside the transaction that applies the
 * result, so a crash cannot apply a job twice; otherwise the queue marks the
 * job done after the handler returns.
 */
export type JobHandler = (job: Job, finish: () => void, signal: AbortSignal) => Promise<void>;

export interface JobQueueOptions {
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly onError?: (job: Job, error: unknown) => void;
}

interface JobRow {
  id: number;
  kind: string;
  payload: string;
  turn_id: number | null;
  attempts: number;
}

/**
 * A durable, single-worker job queue in the memory database. Jobs survive a
 * restart: `recover()` returns interrupted jobs to the queue.
 */
export class JobQueue {
  private readonly store: MemoryStore;
  private readonly handlers = new Map<string, JobHandler>();
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly onError: ((job: Job, error: unknown) => void) | undefined;
  private running: Promise<void> | undefined;
  private rerun = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private abortController = new AbortController();
  private stopped = false;

  constructor(store: MemoryStore, options: JobQueueOptions = {}) {
    this.store = store;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5_000;
    this.onError = options.onError;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  private get db() {
    return this.store.database.db;
  }

  /** Adds a job; call inside the transaction that stores its input. */
  enqueue(kind: string, payload: Readonly<Record<string, unknown>>, turnId?: number): number {
    const now = this.store.now();
    const result = this.db
      .prepare(
        "INSERT INTO jobs (kind, payload, turn_id, status, attempts, run_after, created_at, updated_at) " +
          "VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)",
      )
      .run(kind, JSON.stringify(payload), turnId ?? null, now, now, now);
    return Number(result.lastInsertRowid);
  }

  /** Returns jobs interrupted by a crash or restart to the queue. */
  recover(): number {
    const result = this.db
      .prepare("UPDATE jobs SET status = 'pending', updated_at = ? WHERE status = 'running'")
      .run(this.store.now());
    return Number(result.changes);
  }

  pendingCount(): number {
    return (
      this.db.prepare("SELECT count(*) AS count FROM jobs WHERE status IN ('pending', 'running')").get() as {
        count: number;
      }
    ).count;
  }

  failedJobs(): { id: number; kind: string; lastError: string | null }[] {
    return (
      this.db.prepare("SELECT id, kind, last_error FROM jobs WHERE status = 'failed' ORDER BY id").all() as {
        id: number;
        kind: string;
        last_error: string | null;
      }[]
    ).map((row) => ({ id: Number(row.id), kind: row.kind, lastError: row.last_error }));
  }

  /** Starts processing in the background; returns immediately. */
  kick(): void {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = this.processAll().finally(() => {
      this.running = undefined;
      if (this.rerun) {
        this.rerun = false;
        this.kick();
      }
    });
  }

  /** Processes until no job is due; resolves when idle. */
  async drain(): Promise<void> {
    this.kick();
    while (this.running) await this.running;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.abortController.abort(new DOMException("Memory queue stopped.", "AbortError"));
    while (this.running) await this.running.catch(() => undefined);
  }

  private next(): JobRow | undefined {
    return this.db
      .prepare(
        "SELECT id, kind, payload, turn_id, attempts FROM jobs WHERE status = 'pending' AND run_after <= ? " +
          "ORDER BY id LIMIT 1",
      )
      .get(this.store.now()) as JobRow | undefined;
  }

  private async processAll(): Promise<void> {
    while (!this.stopped) {
      const row = this.next();
      if (!row) break;
      const job: Job = {
        id: Number(row.id),
        kind: row.kind,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        ...(row.turn_id === null ? {} : { turnId: Number(row.turn_id) }),
        attempts: row.attempts + 1,
      };
      this.db
        .prepare("UPDATE jobs SET status = 'running', attempts = ?, updated_at = ? WHERE id = ?")
        .run(job.attempts, this.store.now(), job.id);
      let finished = false;
      const finish = () => {
        this.db.prepare("UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?").run(this.store.now(), job.id);
        finished = true;
      };
      try {
        const handler = this.handlers.get(job.kind);
        if (!handler) throw new Error(`No handler for memory job "${job.kind}".`);
        await handler(job, finish, this.abortController.signal);
        if (!finished) finish();
      } catch (error) {
        if (this.stopped) {
          this.db.prepare("UPDATE jobs SET status = 'pending', updated_at = ? WHERE id = ?").run(this.store.now(), job.id);
          break;
        }
        this.onError?.(job, error);
        const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
        if (job.attempts >= this.maxAttempts) {
          this.db
            .prepare("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
            .run(message, this.store.now(), job.id);
        } else {
          const delay = this.retryDelayMs * 2 ** (job.attempts - 1);
          const runAfter = new Date(Date.parse(this.store.now()) + delay).toISOString();
          this.db
            .prepare("UPDATE jobs SET status = 'pending', last_error = ?, run_after = ?, updated_at = ? WHERE id = ?")
            .run(message, runAfter, this.store.now(), job.id);
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => this.kick(), delay);
          this.retryTimer.unref?.();
        }
      }
    }
  }
}
