import { DatabaseSync } from "node:sqlite";
import { getLoadablePath } from "sqlite-vec";

/**
 * Ordered schema migrations. SQLite is the source of truth; `item_fts` and
 * `item_vec` belong to the derived index and are managed by `SqliteVecMemoryIndex`.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE turns (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'observation')),
    text TEXT NOT NULL,
    language TEXT,
    source TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX turns_created ON turns (created_at);
  CREATE INDEX turns_session ON turns (session_id, id);
  CREATE INDEX turns_turn_id ON turns (session_id, turn_id, role);

  CREATE VIRTUAL TABLE turn_fts USING fts5 (
    text, tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER turns_fts_insert AFTER INSERT ON turns BEGIN
    INSERT INTO turn_fts (rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER turns_fts_delete AFTER DELETE ON turns BEGIN
    DELETE FROM turn_fts WHERE rowid = old.id;
  END;

  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    layer TEXT NOT NULL CHECK (layer IN ('L0', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7')),
    subject TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    text TEXT NOT NULL,
    sensitivity TEXT NOT NULL CHECK (sensitivity IN ('general', 'health')),
    provenance TEXT NOT NULL CHECK (provenance IN ('stated', 'inferred', 'observed')),
    status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
    confidence REAL NOT NULL,
    event_at TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX items_subject ON items (subject_key, status);
  CREATE INDEX items_layer ON items (layer, status);
  CREATE INDEX items_event ON items (event_at);

  CREATE TABLE item_revisions (
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    text TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (item_id, revision)
  );

  -- 'supersedes': from_id (newer) supersedes to_id (older).
  -- 'evidence': from_id (L5-L7) was induced from to_id.
  CREATE TABLE item_links (
    from_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('supersedes', 'evidence')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_id, to_id, kind)
  );
  CREATE INDEX item_links_to ON item_links (to_id, kind);

  CREATE TABLE item_sources (
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    turn_id INTEGER NOT NULL REFERENCES turns (id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, turn_id)
  );
  CREATE INDEX item_sources_turn ON item_sources (turn_id);

  CREATE TABLE consent (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('memory', 'health')),
    granted INTEGER NOT NULL,
    policy_version TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    item_id INTEGER,
    detail TEXT
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    turn_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    run_after TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX jobs_status ON jobs (status, run_after, id);
  `,
  // Turns the write path classified as health; recall hides them without health consent.
  `ALTER TABLE turns ADD COLUMN health INTEGER NOT NULL DEFAULT 0;`,
];

export interface MemoryDatabase {
  readonly db: DatabaseSync;
  /** Runs `work` in one transaction; nested calls use savepoints. */
  transaction<T>(work: () => T): T;
  close(): void;
}

/**
 * Opens (and migrates) a memory database. It uses Node's built-in `node:sqlite`
 * and loads the prebuilt sqlite-vec extension, so no native build is needed.
 */
export function openMemoryDatabase(path: string): MemoryDatabase {
  const db = new DatabaseSync(path, { allowExtension: true });
  db.loadExtension(getLoadablePath());
  db.enableLoadExtension(false);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");

  let depth = 0;
  const transaction = <T>(work: () => T): T => {
    const savepoint = `sp${depth}`;
    db.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    depth += 1;
    try {
      const result = work();
      depth -= 1;
      db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      depth -= 1;
      db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw error;
    }
  };

  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;
  let version = row?.version ?? 0;
  if (version > MIGRATIONS.length) {
    db.close();
    throw new Error(`Memory database schema ${version} is newer than this build supports.`);
  }
  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version]!;
    transaction(() => {
      db.exec(migration);
      db.exec("DELETE FROM schema_version");
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version + 1);
    });
    version += 1;
  }

  return { db, transaction, close: () => db.close() };
}
