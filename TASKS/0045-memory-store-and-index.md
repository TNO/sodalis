# 0045 Building the memory store and index

Status: done
Priority: high
Subsystem: assistant
Depends on: 0031, 0034

## Context

[ADR 0005](../docs/adr/0005-long-term-memory.md) makes SQLite the source of
truth for memory, with a derived, rebuildable vector and full-text index. This
task creates the `@sodalis/memory` package and its storage foundation. It does
not call any models.

## Acceptance Criteria

- Add the `packages/memory` workspace package (`@sodalis/memory`, TypeScript
  strict). It has no dependency on the desktop or the browser.
- Store the following in SQLite, with migrations:
  - L1 turns: role, text, session, timestamps, language
  - memory items for L0, L2, L3, and L4: subject, text, layer, sensitivity,
    provenance, status, confidence, `event_at`, `valid_from`, and `valid_to`
  - item revisions and `supersedes`/`superseded_by` links
  - provenance links from items to L1 turns
  - consent records, including the policy version
  - an audit log
- Define a `MemoryIndex` port. Implement it with sqlite-vec plus FTS5 in the
  same database file, with hybrid search merged by reciprocal rank fusion.
- Define an `Embedder` port with an OpenAI-compatible `/v1/embeddings` adapter
  (`MEMORY_EMBED_BASE_URL`, `MEMORY_EMBED_MODEL`, `MEMORY_EMBED_DIMS`, default
  512) and a deterministic mock.
- Record the embedding model and its dimensions with the index, and rebuild
  the index from SQLite when they change or on request.
- Apply transcript retention (`off`, `7d`, `30d`, `90d`, or `forever`; default
  `90d`) as a purge. The purge removes L1 rows and cuts their provenance links;
  derived items remain.
- Hard-delete an item, its revisions, and its index entries in one
  transaction. Superseded items stay traversable until they are deleted.
- Test the following at the package's public interface: storage, supersedes
  traversal, retention, deletion, index rebuild, and hybrid search. Use the
  mock embedder in tests.

## Implementation Notes

- Confirm that sqlite-vec loads in the Node runtime that the AI service uses,
  and on macOS, Linux, and Windows. Document any native build requirement.
- Keep the schema free of Zvec-specific assumptions; a Zvec adapter is task
  0051.

## Agent Notes

- 2026-10-16 Copilot: Added `@sodalis/memory` (`packages/memory`): SQLite
  through `node:sqlite` with migrations for L1 turns, L0/L2–L4 items,
  revisions, supersedes links, provenance, consent (with policy version),
  settings, a job table, and an audit log; a synchronous `MemoryIndex` with
  sqlite-vec plus FTS5, merged by reciprocal rank fusion;
  `OpenAiCompatibleEmbedder` and `MockEmbedder`; index rebuild when the
  embedding model or dimensions change; retention purge (default `90d`); and
  transactional hard deletes. Tests use the mock embedder at the package
  interface.
