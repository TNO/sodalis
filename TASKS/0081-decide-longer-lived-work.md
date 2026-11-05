# 0081 Decide longer-lived sessions, durable runs, and recurring-work scope

Status: open
Priority: low
Subsystem: assistant
Depends on: none

## Context

Current workflows are foreground, temporary, and bounded. Longer-lived
sessions, restart recovery, durable runs, and recurring work are deferred
questions, not implied by the harness or its developer audit.

## Acceptance Criteria

- Decide whether to pursue resumable/persistent sessions, durable run recovery,
  execution budgets over longer work, and/or recurring work; state scope and
  explicit non-goals.
- If any capability is approved, identify its ownership and privacy/consent
  boundaries and create distinct, bounded follow-up tickets before
  implementation.
- Keep the decision in the architecture, using an ADR only for an
  architectural trade-off.
- Do not implement durable runs, session persistence, or recurring execution
  in this task.

## Implementation Notes

This low-priority decision is not a blocker for one-path convergence or any
accepted foreground journey.
