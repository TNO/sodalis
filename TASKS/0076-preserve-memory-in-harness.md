# 0076 Preserve consent-governed memory and recall in the harness

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0075

## Context

Integrate the harness with the existing memory system only after the policy
and ownership decisions in [0075](0075-decide-harness-memory-and-context.md).
Refine this ticket from that decision before implementation begins.

## Acceptance Criteria

- Reuse existing memory storage, recall, and controls; do not create a parallel
  memory system.
- Preserve consent, deletion, provenance, and existing recall behavior through
  the harness path, with behavior tests at the public interfaces.
- Define and test how harness working context and compaction interact with
  memory ownership without turning transcripts, temporary Pi context, or
  developer audit traces into durable memory.
- Update architecture documentation and the applicable ADR only for an
  architectural decision or changed trade-off.

## Implementation Notes

Exact context ownership, compaction, and acceptance details depend on task
0075. This ticket is not agent-ready until that decision has refined it.
