# 0047 Injecting memory into conversations and adding user controls

Status: open
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
