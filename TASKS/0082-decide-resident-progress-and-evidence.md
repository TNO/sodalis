# 0082 Decide resident-visible progress and evidence

Status: open
Priority: low
Subsystem: assistant
Depends on: none

## Context

Technical workflow activity is intentionally absent from resident-facing
transport. Decide whether residents need a separate, safe progress or evidence
experience; the sensitive developer audit in
[0068](0068-persistent-developer-audit.md) is not that experience.

## Acceptance Criteria

- Define a resident-safe contract, if one is needed, for progress and
  on-request evidence, including what information is useful and what must
  remain private or internal.
- Keep resident-visible output distinct from developer audit logs and from
  any future durable memory.
- If implementation is approved, create a separate bounded follow-up with
  applicable privacy and behavior tests.
- Record the decision and scope in the architecture.
- Do not implement a resident UI, public progress stream, or evidence surface
  in this task.

## Implementation Notes

This low-priority decision is not a prerequisite for harness convergence.
