# 0075 Decide harness memory, recall, and context ownership

Status: open
Priority: medium
Subsystem: assistant
Depends on: none

## Context

The workflow currently has only temporary in-memory context, while the
existing memory system has consent, recall, deletion, provenance, and retention
contracts. Pi working context and developer audit traces are not durable
assistant memory.

## Acceptance Criteria

- Map the current memory behavior and relevant work in
  [0039](0039-sodalis-long-term-memory.md), [0045](0045-memory-store-and-index.md),
  [0046](0046-memory-write-path.md), [0047](0047-memory-read-path-and-controls.md),
  [0048](0048-memory-evaluation.md), [0049](0049-memory-recall-tool.md),
  [0050](0050-memory-system-two.md), [0051](0051-memory-zvec-index.md),
  [0052](0052-memory-observations.md), and
  [0053](0053-memory-conversational-forget.md).
- Decide how the harness may use existing consent-governed memory and recall,
  who owns context and compaction, and how working context, transcripts,
  durable memory, and developer audit logs remain distinct.
- Preserve existing consent, deletion, provenance, and recall semantics; do
  not authorize memory through a harness setting alone.
- Record the decision in the architecture and an ADR if it changes
  architectural policy. Refine task [0076](0076-preserve-memory-in-harness.md)
  with concrete behavior and tests before implementation.
- Do not implement memory integration in this decision task.

## Implementation Notes

The existing memory system is the source to reuse; this task does not request
a second memory store or a rewrite of completed memory work.
