# 0053 Forgetting memories on request in conversation

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0047

## Context

Users ask in conversation to forget something ("Wil je vergeten dat ik
workshops pottenbakken geef?"). The PersonaMem-v2 run in 0048 showed the
extractor storing such requests as new memories, which repeated the very fact
the user wanted gone. The extractor now ignores forget requests, but nothing
acts on them yet; deletion is only possible through the memory controls
([ADR 0005](../docs/adr/0005-long-term-memory.md)).

## Acceptance Criteria

- Detect a forget request in the write path (gate kind or a dedicated check)
  and find the matching memories by retrieval.
- Delete them with the existing hard-delete semantics, including dependent
  inferred items, or ask for confirmation when the match is ambiguous.
- Never store the content of the request itself.
- Add tests and forget cases to the 0048 evaluation (the fact must no longer
  be retrievable or answered).
