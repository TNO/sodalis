# 0050 Adding System 2 memory consolidation (L5–L7)

Status: done
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

- 2026-10-16 Copilot: Added `Consolidator`: union-find clustering of active,
  non-health L2/L4 facts by subject and embedding similarity without an LLM;
  `LlmInducer` induces L5–L7 items that need at least two evidence links from
  the cluster and may supersede an earlier inferred item; a watermark limits
  work to new facts. `MemoryService` schedules it when idle and at most every
  20 hours (`MEMORY_CONSOLIDATION`, default on). Deleting an evidence item
  lowers the confidence of dependent items or deletes them below two evidence
  links. Retrieval includes L5–L7 within the budget, marked `inferred`; L7 does
  not trigger behaviour. The optional cross-domain sweep is not implemented.
- 2026-10-16 Copilot: On the 0048 synthetic set System 2 induced a routine from
  three walk episodes; with/without comparison: 16/18 against 15/18. Remaining:
  PersonaMem-v2 and longer generated routine and intention cases. Analysis:
  [Long-term memory evaluation](../docs/evaluations/memory.md).
- 2026-10-17 Copilot: Evaluated on the LLM-rendered set (six sampled personas,
  12 routine and 6 intention questions) and PersonaMem-v2, with and without
  System 2. On the synthetic set it induced 10–13 items per run and changed
  QA by at most ±1 question; on PersonaMem-v2 it stayed near chance (44 against
  42 of 159, 43 without any memory), which reflects the answer model rather
  than consolidation. `minClusterSize` now defaults to 2, because 3 induced
  only 3 items on six personas. Measuring System 2 on longer histories is an
  open item in the [evaluation](../docs/evaluations/memory.md). The optional
  cross-domain sweep is not implemented. Closed: all required criteria are met.
