# 0047 Injecting memory into conversations and adding user controls

Status: done
Priority: high
Subsystem: assistant
Depends on: 0045, 0046

## Context

[ADR 0005](../docs/adr/0005-long-term-memory.md) defines a read path without an
LLM. Relevant memories are retrieved for each turn and injected as a compact,
dated block. Users must be able to inspect, correct, and delete what Sodalis
remembers.

## Acceptance Criteria

- Wire `@sodalis/memory` into the Sodalis AI service:
  - Before each turn, retrieve and inject.
  - After each turn, enqueue the write path.
  - Memory can be switched off through configuration.
- Retrieval:
  - Embed the user turn plus the previous assistant turn once.
  - Run a hybrid search over active L2, L3, and L4 items with configurable
    quotas and a relevance threshold.
  - Follow supersedes chains up to 3 steps back.
  - Pin L0, L4, and L2 items whose `event_at` falls in the next 14 days.
- Inject a "Memory" block of at most about 800 tokens (configurable). Show the
  date and the stated, inferred, or observed provenance for each item, and add
  "was ..., now ..." text for superseded chains.
- When a remote LLM is selected, send only the current turn and the injected
  block, never transcripts.
- Add a `/memory` API to list and search items, ask what Sodalis knows about a
  person or topic (with provenance), correct an item (which creates a
  revision), delete an item, delete transcripts, set retention, and record
  consent (top-level and health).
- Add tests for retrieval ranking, chain expansion, pinned dates, the budget
  limit, remote-context minimization, and the API's correct, delete, and
  consent flows.

## Implementation Notes

- A plain-language consent and memory explanation in the desktop UI is part of
  0039's acceptance criteria. Add it here only if no UI task picks it up first.

## Agent Notes

- 2026-10-16 Copilot: Wired memory into the AI service behind `MEMORY_ENABLED`
  (off by default) and consent: retrieval before each turn (one embedding of
  the user and previous assistant turn, hybrid search with per-layer quotas and
  `MEMORY_MIN_SIMILARITY`, chains up to 3 back, pinned L0/L4 and upcoming L2
  dates, an 800-token block with date and provenance), and the write path after
  each turn. Added the `/api/memory/*` routes (status, consent, retention,
  items with correct and delete, search, about, transcripts, observations), the
  Compose volume and environment, and gateway routes. Documented in
  `apps/server/README.md` and `docs/development-stack.md`.
- User decision: Azure is treated exactly like a local model, so there is no
  separate remote-context policy or setting. The memory block and recall
  excerpts are the only memory content sent to any model; the L1 transcript
  archive is never sent. The existing 12-message conversation history is
  unchanged.
