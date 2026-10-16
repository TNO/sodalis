# 0051 Adding a Zvec memory index adapter

Status: open
Priority: low
Subsystem: assistant
Depends on: 0048

## Context

ADR 0005 starts with sqlite-vec and FTS5. Zvec (`@zvec/zvec`, Apache-2.0)
offers faster ANN search and built-in hybrid ranking, and Procyon already uses
it. Add it only if the 0048 results show that the index limits latency or
quality.

## Acceptance Criteria

- Implement `MemoryIndex` with Zvec as a derived index. SQLite stays the source
  of truth, with a transactional outbox, replay on startup, and a full rebuild.
- Deleting from SQLite always removes the matching entries from Zvec.
- Benchmark Zvec against sqlite-vec on the 0048 sets and record the results in
  `docs/evaluations/memory.md`.

## Agent Notes

- 2026-10-16 Copilot: Benchmarked the sqlite-vec index (`pnpm eval
  bench-index`): at 10,000 items, vector search p50 4.1 ms, hybrid 6.4 ms,
  filtered 1.3 ms. That is far below the turn budget for any realistic personal
  history, so the Zvec adapter is deferred; revisit only if item counts grow by
  orders of magnitude. See the [evaluation](../docs/evaluations/memory.md).
