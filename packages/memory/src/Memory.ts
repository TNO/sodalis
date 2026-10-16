import { openMemoryDatabase, type MemoryDatabase } from "./database.js";
import type { Embedder } from "./Embedder.js";
import { SqliteVecMemoryIndex, type IndexHit, type MemoryIndex } from "./MemoryIndex.js";
import { MemoryStore, subjectKey, type ItemPatch } from "./MemoryStore.js";
import type { Clock, ItemLayer, MemoryItem, NewMemoryItem } from "./types.js";

export interface MemoryOptions {
  /** SQLite file path, or `:memory:`. */
  readonly path: string;
  readonly embedder: Embedder;
  readonly clock?: Clock;
  /** Index factory; defaults to sqlite-vec plus FTS5 in the same file. */
  readonly createIndex?: (database: MemoryDatabase) => MemoryIndex;
}

export interface SearchOptions {
  readonly layers?: readonly ItemLayer[];
  readonly subject?: string;
  readonly limit?: number;
  /** Search with this embedding instead of embedding `text` again. */
  readonly embedding?: Float32Array;
}

export interface SearchResult {
  readonly item: MemoryItem;
  readonly hit: IndexHit;
}

/** Text that is embedded and indexed for an item. */
export function itemIndexText(item: Pick<MemoryItem, "subject" | "text">): string {
  return `${item.subject}: ${item.text}`;
}

/**
 * The memory store with its embedder and derived index. Opening checks that
 * the index matches the embedder's model and dimensions and rebuilds it from
 * SQLite otherwise.
 */
export class Memory {
  readonly store: MemoryStore;
  readonly embedder: Embedder;
  readonly database: MemoryDatabase;

  private constructor(database: MemoryDatabase, store: MemoryStore, embedder: Embedder) {
    this.database = database;
    this.store = store;
    this.embedder = embedder;
  }

  static async open(options: MemoryOptions): Promise<Memory> {
    const database = openMemoryDatabase(options.path);
    try {
      const index = options.createIndex?.(database) ?? new SqliteVecMemoryIndex(database);
      const store = new MemoryStore(database, index, options.clock);
      const memory = new Memory(database, store, options.embedder);
      const current = index.descriptor;
      const wanted = options.embedder.descriptor;
      const complete = store.getSetting("index.complete") === `${wanted.model}:${wanted.dimensions}`;
      if (!complete || !current || current.model !== wanted.model || current.dimensions !== wanted.dimensions) {
        await memory.rebuildIndex();
      }
      return memory;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  get index(): MemoryIndex {
    return this.store.index;
  }

  async embed(text: string, signal?: AbortSignal): Promise<Float32Array> {
    const [embedding] = await this.embedder.embed([text], signal);
    if (!embedding) throw new Error("Embedder returned no vector.");
    return embedding;
  }

  async addItem(item: NewMemoryItem, signal?: AbortSignal): Promise<MemoryItem> {
    return this.store.addItem(item, await this.embed(itemIndexText(item), signal));
  }

  async updateItem(id: number, patch: ItemPatch, signal?: AbortSignal): Promise<MemoryItem> {
    const existing = this.store.getItem(id);
    if (!existing) throw new Error(`Memory item ${id} does not exist.`);
    const changed = patch.text !== undefined && patch.text.trim() !== existing.text;
    const embedding = changed
      ? await this.embed(itemIndexText({ subject: existing.subject, text: patch.text! }), signal)
      : undefined;
    return this.store.updateItem(id, patch, embedding);
  }

  async supersede(oldId: number, replacement: NewMemoryItem, signal?: AbortSignal): Promise<MemoryItem> {
    return this.store.supersede(oldId, replacement, await this.embed(itemIndexText(replacement), signal));
  }

  deleteItem(id: number, reason?: string): boolean {
    return this.store.deleteItem(id, reason);
  }

  async search(text: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const embedding = options.embedding ?? (await this.embed(text));
    const hits = this.index.search({
      embedding,
      text,
      limit: options.limit ?? 10,
      ...(options.layers ? { layers: options.layers } : {}),
      ...(options.subject !== undefined ? { subjectKey: subjectKey(options.subject) } : {}),
    });
    const items = new Map(this.store.getItems(hits.map((hit) => hit.itemId)).map((item) => [item.id, item]));
    return hits.flatMap((hit) => {
      const item = items.get(hit.itemId);
      return item && item.status === "active" ? [{ item, hit }] : [];
    });
  }

  /** Recreates the index for the current embedder and re-embeds all active items. */
  async rebuildIndex(batchSize = 64): Promise<number> {
    const { model, dimensions } = this.embedder.descriptor;
    this.database.transaction(() => {
      this.store.setSetting("index.complete", "");
      this.index.reset(this.embedder.descriptor);
    });
    let afterId = 0;
    let count = 0;
    while (true) {
      const items = this.store.activeItemsForIndex(afterId, batchSize);
      if (items.length === 0) break;
      const embeddings = await this.embedder.embed(items.map(itemIndexText));
      this.database.transaction(() => {
        items.forEach((item, position) => this.store.reindexItem(item, embeddings[position]!));
      });
      count += items.length;
      afterId = items.at(-1)!.id;
    }
    this.store.setSetting("index.complete", `${model}:${dimensions}`);
    this.store.audit("index.rebuild", undefined, { ...this.embedder.descriptor, count });
    return count;
  }

  close(): void {
    this.database.close();
  }
}
