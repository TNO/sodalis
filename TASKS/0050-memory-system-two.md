# 0050 Adding System 2 memory consolidation (L5–L7)

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0048

## Context

DCPM's asynchronous System 2 builds knowledge (L5), schemas and routines (L6),
and intentions (L7) from accumulated facts. Its main gains are on implicit
preference inference, measured by PersonaMem-v2
([ADR 0005](../docs/adr/0005-long-term-memory.md)).

## Acceptance Criteria

- Run a scheduled consolidation job at idle times or nightly:
  - triage and cluster unconsolidated facts without an LLM
  - induce schemas and intentions with an LLM, with evidence links to L2
  - optionally sweep across domains
- Store L5–L7 items with provenance `inferred`. Use them without per-item
  confirmation, and keep them inspectable and deletable. Deleting an evidence
  item updates or removes the items that depend on it.
- Let retrieval use L6 and L7 items within the existing budget. L7 intentions
  can feed future proactive behaviour but do not trigger it in this task.
- Extend the evaluation with PersonaMem-v2 and generated routine and intention
  cases, and compare with and without System 2.

## Agent Notes
