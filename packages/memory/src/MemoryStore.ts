import type { SQLInputValue } from "node:sqlite";
import type { MemoryDatabase } from "./database.js";
import type { MemoryIndex } from "./MemoryIndex.js";
import {
  CONSENT_KINDS,
  RETENTIONS,
  type AuditEntry,
  type Clock,
  type ConsentKind,
  type ConsentRecord,
  type ItemLayer,
  type ItemRevision,
  type ItemStatus,
  type MemoryItem,
  type NewMemoryItem,
  type NewTurn,
  type Provenance,
  type Retention,
  type Sensitivity,
  type Turn,
  type TurnRole,
} from "./types.js";

/**
 * Excludes turns (aliased `t`) whose exchange is classified as health or is
 * not yet classified: a user turn and its assistant reply share a turn ID.
 */
const HEALTH_FREE_TURN = `NOT EXISTS (
  SELECT 1 FROM turns h WHERE h.session_id = t.session_id AND h.turn_id = t.turn_id
    AND (h.health = 1 OR EXISTS (SELECT 1 FROM jobs j WHERE j.turn_id = h.id AND j.status <> 'done'))
)`;

interface TurnRow {
  id: number;
  session_id: string;
  turn_id: string;
  role: TurnRole;
  text: string;
  language: string | null;
  source: string | null;
  created_at: string;
}

interface ItemRow {
  id: number;
  layer: ItemLayer;
  subject: string;
  text: string;
  sensitivity: Sensitivity;
  provenance: Provenance;
  status: ItemStatus;
  confidence: number;
  event_at: string | null;
  valid_from: string;
  valid_to: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

function toTurn(row: TurnRow): Turn {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    turnId: row.turn_id,
    role: row.role,
    text: row.text,
    ...(row.language ? { language: row.language } : {}),
    ...(row.source ? { source: row.source } : {}),
    createdAt: row.created_at,
  };
}

function toItem(row: ItemRow): MemoryItem {
  return {
    id: Number(row.id),
    layer: row.layer,
    subject: row.subject,
    text: row.text,
    sensitivity: row.sensitivity,
    provenance: row.provenance,
    status: row.status,
    confidence: row.confidence,
    ...(row.event_at ? { eventAt: row.event_at } : {}),
    validFrom: row.valid_from,
    ...(row.valid_to ? { validTo: row.valid_to } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Case- and accent-insensitive subject key, so "Anna" and "anna" match. */
export function subjectKey(subject: string): string {
  return subject
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const RETENTION_DAYS: Readonly<Record<Retention, number | undefined>> = {
  off: 0,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  forever: undefined,
};

export const DEFAULT_RETENTION: Retention = "90d";

export interface ItemFilter {
  readonly layers?: readonly ItemLayer[];
  readonly statuses?: readonly ItemStatus[];
  readonly subject?: string;
  readonly sensitivity?: Sensitivity;
  readonly eventFrom?: string;
  readonly eventTo?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ItemPatch {
  readonly text?: string;
  readonly eventAt?: string | null;
  readonly confidence?: number;
  readonly reason: string;
}

/**
 * Source-of-truth operations on the memory database. Item writes take the
 * item's embedding so the derived index changes in the same transaction.
 */
export class MemoryStore {
  readonly database: MemoryDatabase;
  readonly index: MemoryIndex;
  private readonly clock: Clock;

  constructor(database: MemoryDatabase, index: MemoryIndex, clock: Clock = () => new Date()) {
    this.database = database;
    this.index = index;
    this.clock = clock;
  }

  now(): string {
    return this.clock().toISOString();
  }

  private get db() {
    return this.database.db;
  }

  // L1 turns ---------------------------------------------------------------

  appendTurn(turn: NewTurn): Turn {
    const createdAt = turn.createdAt ?? this.now();
    const result = this.db
      .prepare(
        "INSERT INTO turns (session_id, turn_id, role, text, language, source, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        turn.sessionId,
        turn.turnId,
        turn.role,
        turn.text,
        turn.language ?? null,
        turn.source ?? null,
        createdAt,
      );
    return this.getTurn(Number(result.lastInsertRowid))!;
  }

  findTurn(sessionId: string, turnId: string, role: TurnRole): Turn | undefined {
    const row = this.db
      .prepare("SELECT * FROM turns WHERE session_id = ? AND turn_id = ? AND role = ? ORDER BY id DESC LIMIT 1")
      .get(sessionId, turnId, role) as TurnRow | undefined;
    return row ? toTurn(row) : undefined;
  }

  getTurn(id: number): Turn | undefined {
    const row = this.db.prepare("SELECT * FROM turns WHERE id = ?").get(id) as TurnRow | undefined;
    return row ? toTurn(row) : undefined;
  }

  /** The latest turn before `beforeId` in the same session, optionally of `role`. */
  previousTurn(sessionId: string, beforeId: number, role?: TurnRole): Turn | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM turns WHERE session_id = ? AND id < ?${role ? " AND role = ?" : ""} ` +
          "ORDER BY id DESC LIMIT 1",
      )
      .get(sessionId, beforeId, ...(role ? [role] : [])) as TurnRow | undefined;
    return row ? toTurn(row) : undefined;
  }

  listTurns(options: { sessionId?: string; limit?: number } = {}): Turn[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM turns${options.sessionId ? " WHERE session_id = ?" : ""} ORDER BY id DESC LIMIT ?`,
      )
      .all(...(options.sessionId ? [options.sessionId] : []), options.limit ?? 100) as unknown as TurnRow[];
    return rows.map(toTurn).reverse();
  }

  countTurns(): number {
    return (this.db.prepare("SELECT count(*) AS count FROM turns").get() as { count: number }).count;
  }

  /** Keyword search over L1 turns (within retention), newest first. */
  searchTurns(
    match: string,
    options: { from?: string; to?: string; limit?: number; roles?: readonly TurnRole[]; excludeHealth?: boolean } = {},
  ): Turn[] {
    const filters: string[] = options.excludeHealth ? [HEALTH_FREE_TURN] : [];
    const parameters: SQLInputValue[] = [match];
    if (options.from) {
      filters.push("t.created_at >= ?");
      parameters.push(options.from);
    }
    if (options.to) {
      filters.push("t.created_at <= ?");
      parameters.push(options.to);
    }
    if (options.roles?.length) {
      filters.push(`t.role IN (${options.roles.map(() => "?").join(", ")})`);
      parameters.push(...options.roles);
    }
    parameters.push(options.limit ?? 10);
    const rows = this.db
      .prepare(
        "SELECT t.* FROM turn_fts JOIN turns t ON t.id = turn_fts.rowid WHERE turn_fts MATCH ?" +
          filters.map((filter) => ` AND ${filter}`).join("") +
          " ORDER BY bm25(turn_fts), t.id DESC LIMIT ?",
      )
      .all(...parameters) as unknown as TurnRow[];
    return rows.map(toTurn);
  }

  /** Turns in a time range, oldest first. */
  turnsBetween(from: string, to: string, limit = 50, options: { excludeHealth?: boolean } = {}): Turn[] {
    const rows = this.db
      .prepare(
        "SELECT t.* FROM turns t WHERE t.created_at >= ? AND t.created_at <= ?" +
          (options.excludeHealth ? ` AND ${HEALTH_FREE_TURN}` : "") +
          " ORDER BY t.id LIMIT ?",
      )
      .all(from, to, limit) as unknown as TurnRow[];
    return rows.map(toTurn);
  }

  /** Marks a turn the write path classified as health. */
  markTurnHealth(id: number): void {
    this.db.prepare("UPDATE turns SET health = 1 WHERE id = ?").run(id);
  }

  /** Deletes transcripts (optionally of one session); derived items remain. */
  deleteTranscripts(options: { sessionId?: string } = {}): number {
    return this.database.transaction(() => {
      const result = options.sessionId
        ? this.db.prepare("DELETE FROM turns WHERE session_id = ?").run(options.sessionId)
        : this.db.prepare("DELETE FROM turns").run();
      const count = Number(result.changes);
      this.audit("transcripts.delete", undefined, {
        count,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      });
      return count;
    });
  }

  // Retention --------------------------------------------------------------

  getRetention(): Retention {
    const value = this.getSetting("retention");
    return (RETENTIONS as readonly string[]).includes(value ?? "") ? (value as Retention) : DEFAULT_RETENTION;
  }

  setRetention(retention: Retention): void {
    if (!(RETENTIONS as readonly string[]).includes(retention)) {
      throw new RangeError(`Retention must be one of ${RETENTIONS.join(", ")}.`);
    }
    this.database.transaction(() => {
      this.setSetting("retention", retention);
      this.audit("retention.set", undefined, { retention });
    });
  }

  /**
   * Removes L1 turns older than the retention period, cutting their provenance
   * links. Turns that pending write-path jobs still need are kept.
   */
  purgeExpiredTurns(): number {
    const days = RETENTION_DAYS[this.getRetention()];
    if (days === undefined) return 0;
    const cutoff = new Date(this.clock().getTime() - days * 86_400_000).toISOString();
    return this.database.transaction(() => {
      const result = this.db
        .prepare(
          "DELETE FROM turns WHERE created_at <= ? AND id NOT IN " +
            "(SELECT turn_id FROM jobs WHERE turn_id IS NOT NULL AND status IN ('pending', 'running'))",
        )
        .run(cutoff);
      const count = Number(result.changes);
      if (count > 0) this.audit("transcripts.purge", undefined, { count, cutoff });
      return count;
    });
  }

  // Items -----------------------------------------------------------------

  addItem(item: NewMemoryItem, embedding: Float32Array): MemoryItem {
    if (!item.text.trim() || !item.subject.trim()) {
      throw new Error("Memory items need a subject and text.");
    }
    const now = this.now();
    return this.database.transaction(() => {
      const result = this.db
        .prepare(
          "INSERT INTO items (layer, subject, subject_key, text, sensitivity, provenance, status, confidence, " +
            "event_at, valid_from, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 1, ?, ?)",
        )
        .run(
          item.layer,
          item.subject.trim(),
          subjectKey(item.subject),
          item.text.trim(),
          item.sensitivity ?? "general",
          item.provenance ?? "stated",
          item.confidence ?? 1,
          item.eventAt ?? null,
          item.validFrom ?? now,
          now,
          now,
        );
      const id = Number(result.lastInsertRowid);
      this.db
        .prepare("INSERT INTO item_revisions (item_id, revision, text, reason, created_at) VALUES (?, 1, ?, 'created', ?)")
        .run(id, item.text.trim(), now);
      for (const turnId of new Set(item.sourceTurnIds ?? [])) {
        this.db.prepare("INSERT OR IGNORE INTO item_sources (item_id, turn_id) SELECT ?, id FROM turns WHERE id = ?").run(id, turnId);
      }
      for (const evidenceId of new Set(item.evidenceItemIds ?? [])) {
        this.db
          .prepare("INSERT OR IGNORE INTO item_links (from_id, to_id, kind, created_at) VALUES (?, ?, 'evidence', ?)")
          .run(id, evidenceId, now);
      }
      const stored = this.getItem(id)!;
      this.indexItem(stored, embedding);
      this.audit("item.add", id, { layer: stored.layer, provenance: stored.provenance });
      return stored;
    });
  }

  private indexItem(item: MemoryItem, embedding: Float32Array): void {
    this.index.upsert({
      itemId: item.id,
      layer: item.layer,
      subjectKey: subjectKey(item.subject),
      text: `${item.subject}: ${item.text}`,
      embedding,
    });
  }

  getItem(id: number): MemoryItem | undefined {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
    return row ? toItem(row) : undefined;
  }

  getItems(ids: readonly number[]): MemoryItem[] {
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT * FROM items WHERE id IN (${ids.map(() => "?").join(", ")})`)
      .all(...ids) as unknown as ItemRow[];
    const byId = new Map(rows.map((row) => [Number(row.id), toItem(row)]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  listItems(filter: ItemFilter = {}): MemoryItem[] {
    const filters: string[] = [];
    const parameters: SQLInputValue[] = [];
    if (filter.layers?.length) {
      filters.push(`layer IN (${filter.layers.map(() => "?").join(", ")})`);
      parameters.push(...filter.layers);
    }
    if (filter.statuses?.length) {
      filters.push(`status IN (${filter.statuses.map(() => "?").join(", ")})`);
      parameters.push(...filter.statuses);
    }
    if (filter.subject !== undefined) {
      filters.push("subject_key = ?");
      parameters.push(subjectKey(filter.subject));
    }
    if (filter.sensitivity) {
      filters.push("sensitivity = ?");
      parameters.push(filter.sensitivity);
    }
    if (filter.eventFrom) {
      filters.push("event_at >= ?");
      parameters.push(filter.eventFrom);
    }
    if (filter.eventTo) {
      filters.push("event_at <= ?");
      parameters.push(filter.eventTo);
    }
    parameters.push(filter.limit ?? 100, filter.offset ?? 0);
    const rows = this.db
      .prepare(
        `SELECT * FROM items${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""} ` +
          "ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(...parameters) as unknown as ItemRow[];
    return rows.map(toItem);
  }

  /** Changes an item in place and keeps the previous text as a revision. */
  updateItem(id: number, patch: ItemPatch, embedding?: Float32Array): MemoryItem {
    const now = this.now();
    return this.database.transaction(() => {
      const existing = this.getItem(id);
      if (!existing) throw new Error(`Memory item ${id} does not exist.`);
      const text = patch.text?.trim() || existing.text;
      if (text !== existing.text && !embedding) {
        throw new Error("Changing an item's text requires a new embedding.");
      }
      const revision = existing.revision + 1;
      this.db
        .prepare(
          "UPDATE items SET text = ?, event_at = ?, confidence = ?, revision = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          text,
          patch.eventAt === undefined ? existing.eventAt ?? null : patch.eventAt,
          patch.confidence ?? existing.confidence,
          revision,
          now,
          id,
        );
      this.db
        .prepare("INSERT INTO item_revisions (item_id, revision, text, reason, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, revision, text, patch.reason, now);
      const updated = this.getItem(id)!;
      if (embedding && updated.status === "active") this.indexItem(updated, embedding);
      this.audit("item.update", id, { reason: patch.reason, revision });
      return updated;
    });
  }

  /** Links `sourceTurnIds` as additional evidence for an existing item. */
  addSources(itemId: number, sourceTurnIds: readonly number[]): void {
    for (const turnId of sourceTurnIds) {
      this.db
        .prepare("INSERT OR IGNORE INTO item_sources (item_id, turn_id) SELECT ?, id FROM turns WHERE id = ?")
        .run(itemId, turnId);
    }
  }

  /**
   * Adds `replacement` and marks `oldId` superseded: its `valid_to` is set, it
   * leaves the index, and it stays traversable through the supersedes link.
   */
  supersede(oldId: number, replacement: NewMemoryItem, embedding: Float32Array): MemoryItem {
    return this.database.transaction(() => {
      const old = this.getItem(oldId);
      if (!old) throw new Error(`Memory item ${oldId} does not exist.`);
      if (old.status !== "active") throw new Error(`Memory item ${oldId} is already superseded.`);
      const added = this.addItem(replacement, embedding);
      const now = this.now();
      this.db
        .prepare("UPDATE items SET status = 'superseded', valid_to = ?, updated_at = ? WHERE id = ?")
        .run(replacement.validFrom ?? now, now, oldId);
      this.db
        .prepare("INSERT INTO item_links (from_id, to_id, kind, created_at) VALUES (?, ?, 'supersedes', ?)")
        .run(added.id, oldId, now);
      this.index.remove(oldId);
      this.audit("item.supersede", oldId, { supersededBy: added.id });
      return added;
    });
  }

  /** Items `id` superseded, newest first, up to `depth` steps back. */
  supersededChain(id: number, depth = 3): MemoryItem[] {
    const chain: MemoryItem[] = [];
    const seen = new Set([id]);
    let current = id;
    for (let step = 0; step < depth; step += 1) {
      const row = this.db
        .prepare("SELECT to_id FROM item_links WHERE from_id = ? AND kind = 'supersedes' ORDER BY created_at DESC LIMIT 1")
        .get(current) as { to_id: number } | undefined;
      if (!row || seen.has(Number(row.to_id))) break;
      current = Number(row.to_id);
      seen.add(current);
      const item = this.getItem(current);
      if (!item) break;
      chain.push(item);
    }
    return chain;
  }

  /** The item that superseded `id`, if any. */
  supersededBy(id: number): MemoryItem | undefined {
    const row = this.db
      .prepare("SELECT from_id FROM item_links WHERE to_id = ? AND kind = 'supersedes' LIMIT 1")
      .get(id) as { from_id: number } | undefined;
    return row ? this.getItem(Number(row.from_id)) : undefined;
  }

  revisions(id: number): ItemRevision[] {
    const rows = this.db
      .prepare("SELECT item_id, revision, text, reason, created_at FROM item_revisions WHERE item_id = ? ORDER BY revision")
      .all(id) as { item_id: number; revision: number; text: string; reason: string; created_at: string }[];
    return rows.map((row) => ({
      itemId: Number(row.item_id),
      revision: row.revision,
      text: row.text,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  sourceTurns(id: number): Turn[] {
    const rows = this.db
      .prepare("SELECT t.* FROM item_sources s JOIN turns t ON t.id = s.turn_id WHERE s.item_id = ? ORDER BY t.id")
      .all(id) as unknown as TurnRow[];
    return rows.map(toTurn);
  }

  /** IDs of items that were induced from `id` (evidence links). */
  dependentItemIds(id: number): number[] {
    const rows = this.db
      .prepare("SELECT from_id FROM item_links WHERE to_id = ? AND kind = 'evidence'")
      .all(id) as { from_id: number }[];
    return rows.map((row) => Number(row.from_id));
  }

  evidenceItemIds(id: number): number[] {
    const rows = this.db
      .prepare("SELECT to_id FROM item_links WHERE from_id = ? AND kind = 'evidence'")
      .all(id) as { to_id: number }[];
    return rows.map((row) => Number(row.to_id));
  }

  /**
   * Hard-deletes an item with its revisions, links, and index entries in one
   * transaction. Returns false when the item does not exist.
   */
  deleteItem(id: number, reason = "user"): boolean {
    return this.database.transaction(() => {
      const existing = this.getItem(id);
      if (!existing) return false;
      const dependants = this.dependentItemIds(id);
      this.index.remove(id);
      this.db.prepare("DELETE FROM items WHERE id = ?").run(id);
      this.audit("item.delete", id, { layer: existing.layer, reason });
      // Induced items lose this evidence: drop those left with fewer than two
      // supporting facts, and lower the confidence of the rest.
      for (const dependantId of dependants) {
        const dependant = this.getItem(dependantId);
        if (!dependant) continue;
        const remaining = this.evidenceItemIds(dependantId).length;
        if (remaining < 2) {
          this.deleteItem(dependantId, "evidence-deleted");
        } else {
          this.updateItem(dependantId, {
            confidence: (dependant.confidence * remaining) / (remaining + 1),
            reason: "evidence-deleted",
          });
        }
      }
      return true;
    });
  }

  /** Re-indexes active items; `embed` supplies embeddings in batches. */
  activeItemsForIndex(afterId: number, limit: number): MemoryItem[] {
    const rows = this.db
      .prepare("SELECT * FROM items WHERE status = 'active' AND id > ? ORDER BY id LIMIT ?")
      .all(afterId, limit) as unknown as ItemRow[];
    return rows.map(toItem);
  }

  reindexItem(item: MemoryItem, embedding: Float32Array): void {
    this.indexItem(item, embedding);
  }

  // Consent ----------------------------------------------------------------

  recordConsent(kind: ConsentKind, granted: boolean, policyVersion: string): ConsentRecord {
    if (!(CONSENT_KINDS as readonly string[]).includes(kind)) {
      throw new RangeError(`Consent kind must be one of ${CONSENT_KINDS.join(", ")}.`);
    }
    if (!policyVersion.trim()) throw new Error("A consent policy version is required.");
    const recordedAt = this.now();
    this.database.transaction(() => {
      this.db
        .prepare("INSERT INTO consent (kind, granted, policy_version, recorded_at) VALUES (?, ?, ?, ?)")
        .run(kind, granted ? 1 : 0, policyVersion.trim(), recordedAt);
      this.audit("consent.record", undefined, { kind, granted, policyVersion: policyVersion.trim() });
    });
    return { kind, granted, policyVersion: policyVersion.trim(), recordedAt };
  }

  consent(kind: ConsentKind): ConsentRecord | undefined {
    const row = this.db
      .prepare("SELECT kind, granted, policy_version, recorded_at FROM consent WHERE kind = ? ORDER BY id DESC LIMIT 1")
      .get(kind) as { kind: ConsentKind; granted: number; policy_version: string; recorded_at: string } | undefined;
    return row
      ? { kind: row.kind, granted: row.granted === 1, policyVersion: row.policy_version, recordedAt: row.recorded_at }
      : undefined;
  }

  hasConsent(kind: ConsentKind): boolean {
    return this.consent(kind)?.granted === true;
  }

  // Settings and audit ------------------------------------------------------

  getSetting(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  /** Records an action without memory content (IDs and metadata only). */
  audit(action: string, itemId?: number, detail?: Readonly<Record<string, unknown>>): void {
    this.db
      .prepare("INSERT INTO audit (at, action, item_id, detail) VALUES (?, ?, ?, ?)")
      .run(this.now(), action, itemId ?? null, detail ? JSON.stringify(detail) : null);
  }

  listAudit(limit = 100): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT id, at, action, item_id, detail FROM audit ORDER BY id DESC LIMIT ?")
      .all(limit) as { id: number; at: string; action: string; item_id: number | null; detail: string | null }[];
    return rows.map((row) => ({
      id: Number(row.id),
      at: row.at,
      action: row.action,
      ...(row.item_id === null ? {} : { itemId: Number(row.item_id) }),
      ...(row.detail ? { detail: JSON.parse(row.detail) as Record<string, unknown> } : {}),
    }));
  }
}
