import type { MemoryDatabase } from "./database.js";
import type { EmbedderDescriptor } from "./Embedder.js";
import type { ItemLayer } from "./types.js";

export interface IndexEntry {
  readonly itemId: number;
  readonly layer: ItemLayer;
  readonly subjectKey: string;
  readonly text: string;
  readonly embedding: Float32Array;
}

export interface IndexQuery {
  readonly embedding: Float32Array;
  /** Free text for the keyword (FTS) side; omit for vector-only search. */
  readonly text?: string;
  readonly layers?: readonly ItemLayer[];
  readonly subjectKey?: string;
  readonly limit: number;
}

export interface IndexHit {
  readonly itemId: number;
  /** Reciprocal-rank-fusion score. */
  readonly score: number;
  /** Cosine similarity of the vector match, when the item was a vector hit. */
  readonly similarity?: number;
  readonly vectorRank?: number;
  readonly textRank?: number;
}

/**
 * Derived, rebuildable search index over active memory items. Methods are
 * synchronous so an index in the same SQLite file joins the caller's
 * transaction; SQLite stays the source of truth.
 */
export interface MemoryIndex {
  /** Embedding model and dimensions the index was built with, if any. */
  readonly descriptor: EmbedderDescriptor | undefined;
  /** Drops all entries and (re)creates the index for `descriptor`. */
  reset(descriptor: EmbedderDescriptor): void;
  upsert(entry: IndexEntry): void;
  remove(itemId: number): void;
  search(query: IndexQuery): IndexHit[];
  count(): number;
}

export const RRF_K = 60;

/** Merges ranked lists with reciprocal rank fusion (k = 60). */
export function reciprocalRankFusion(
  lists: readonly (readonly number[])[],
  k = RRF_K,
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return scores;
}

const STOPWORDS = new Set(
  (
    "de het een en van in op te dat die is ik je jij u we wij ze zij hij mijn mij me " +
    "met voor aan er maar om ook als bij nog wel niet geen naar dan was heb heeft hebben " +
    "zijn wat wie hoe waar wanneer dit deze dus of al zo kan wil moet gaat " +
    "the a an and of in on to that is i you we they he she my me with for at it " +
    "but also as by not no was have has be what who how where when this so can will do"
  ).split(" "),
);

/** An FTS5 OR-query of the distinctive words in `text`, or undefined. */
export function ftsQuery(text: string): string | undefined {
  const words = new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (word) => word.length >= 3 && !STOPWORDS.has(word),
    ),
  );
  if (words.size === 0) return undefined;
  return [...words].slice(0, 32).map((word) => `"${word}"`).join(" OR ");
}

/** sqlite-vec (cosine) plus FTS5 in the memory database file. */
export class SqliteVecMemoryIndex implements MemoryIndex {
  private readonly database: MemoryDatabase;
  private current: EmbedderDescriptor | undefined;

  constructor(database: MemoryDatabase) {
    this.database = database;
    const rows = database.db.prepare("SELECT key, value FROM index_meta").all() as {
      key: string;
      value: string;
    }[];
    const meta = new Map(rows.map((row) => [row.key, row.value]));
    const model = meta.get("model");
    const dimensions = Number(meta.get("dimensions"));
    this.current = model && Number.isInteger(dimensions) ? { model, dimensions } : undefined;
  }

  get descriptor(): EmbedderDescriptor | undefined {
    return this.current;
  }

  reset(descriptor: EmbedderDescriptor): void {
    if (!Number.isInteger(descriptor.dimensions) || descriptor.dimensions < 1) {
      throw new RangeError("Index dimensions must be a positive integer.");
    }
    const { db } = this.database;
    this.database.transaction(() => {
      db.exec("DROP TABLE IF EXISTS item_vec; DROP TABLE IF EXISTS item_fts;");
      db.exec(
        `CREATE VIRTUAL TABLE item_vec USING vec0 (
          item_id INTEGER PRIMARY KEY,
          layer TEXT,
          subject_key TEXT,
          embedding FLOAT[${descriptor.dimensions}] distance_metric=cosine
        )`,
      );
      db.exec(
        "CREATE VIRTUAL TABLE item_fts USING fts5 (text, layer UNINDEXED, subject_key UNINDEXED, " +
          "tokenize = 'unicode61 remove_diacritics 2')",
      );
      db.exec("DELETE FROM index_meta");
      const insert = db.prepare("INSERT INTO index_meta (key, value) VALUES (?, ?)");
      insert.run("model", descriptor.model);
      insert.run("dimensions", String(descriptor.dimensions));
    });
    this.current = { ...descriptor };
  }

  private requireDescriptor(): EmbedderDescriptor {
    if (!this.current) throw new Error("Memory index has not been initialised.");
    return this.current;
  }

  upsert(entry: IndexEntry): void {
    const descriptor = this.requireDescriptor();
    if (entry.embedding.length !== descriptor.dimensions) {
      throw new RangeError(
        `Embedding has ${entry.embedding.length} dimensions; the index expects ${descriptor.dimensions}.`,
      );
    }
    const { db } = this.database;
    this.database.transaction(() => {
      this.remove(entry.itemId);
      db.prepare(
        "INSERT INTO item_vec (item_id, layer, subject_key, embedding) VALUES (?, ?, ?, ?)",
      ).run(BigInt(entry.itemId), entry.layer, entry.subjectKey, entry.embedding);
      db.prepare("INSERT INTO item_fts (rowid, text, layer, subject_key) VALUES (?, ?, ?, ?)").run(
        entry.itemId,
        entry.text,
        entry.layer,
        entry.subjectKey,
      );
    });
  }

  remove(itemId: number): void {
    this.requireDescriptor();
    const { db } = this.database;
    db.prepare("DELETE FROM item_vec WHERE item_id = ?").run(BigInt(itemId));
    db.prepare("DELETE FROM item_fts WHERE rowid = ?").run(itemId);
  }

  count(): number {
    if (!this.current) return 0;
    const row = this.database.db.prepare("SELECT count(*) AS count FROM item_vec").get() as {
      count: number;
    };
    return row.count;
  }

  search(query: IndexQuery): IndexHit[] {
    const descriptor = this.requireDescriptor();
    if (query.embedding.length !== descriptor.dimensions) {
      throw new RangeError("Query embedding does not match the index dimensions.");
    }
    const { db } = this.database;
    const candidates = Math.max(query.limit * 4, 20);
    const filters: string[] = [];
    const parameters: (string | number)[] = [];
    if (query.layers?.length) {
      filters.push(`layer IN (${query.layers.map(() => "?").join(", ")})`);
      parameters.push(...query.layers);
    }
    if (query.subjectKey !== undefined) {
      filters.push("subject_key = ?");
      parameters.push(query.subjectKey);
    }
    const where = filters.map((filter) => ` AND ${filter}`).join("");
    const vectorRows = db
      .prepare(
        `SELECT item_id, distance FROM item_vec WHERE embedding MATCH ? AND k = ?${where} ORDER BY distance`,
      )
      .all(query.embedding, candidates, ...parameters) as { item_id: number; distance: number }[];

    const match = query.text ? ftsQuery(query.text) : undefined;
    const textRows = match
      ? (db
          .prepare(
            `SELECT rowid AS item_id FROM item_fts WHERE item_fts MATCH ?${where} ORDER BY bm25(item_fts) LIMIT ?`,
          )
          .all(match, ...parameters, candidates) as { item_id: number }[])
      : [];

    const vectorIds = vectorRows.map((row) => Number(row.item_id));
    const textIds = textRows.map((row) => Number(row.item_id));
    const scores = reciprocalRankFusion([vectorIds, textIds]);
    const similarity = new Map(vectorRows.map((row) => [Number(row.item_id), 1 - row.distance]));
    return [...scores.entries()]
      .map(([itemId, score]): IndexHit => {
        const vectorRank = vectorIds.indexOf(itemId);
        const textRank = textIds.indexOf(itemId);
        const itemSimilarity = similarity.get(itemId);
        return {
          itemId,
          score,
          ...(itemSimilarity === undefined ? {} : { similarity: itemSimilarity }),
          ...(vectorRank >= 0 ? { vectorRank } : {}),
          ...(textRank >= 0 ? { textRank } : {}),
        };
      })
      .sort((left, right) => right.score - left.score || left.itemId - right.itemId)
      .slice(0, query.limit);
  }
}
