# 0079 Retire turn mode and support one harness execution path

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0070, 0076, 0077, 0078

## Context

The current runtime has separate turn and workflow paths. The harness is
intended to become the only supported assistant execution path, but only after
the first sensor journey, consent-governed memory behavior, confirmed desktop
actions, and steering/interruption parity are verified.

## Acceptance Criteria

- After all listed prerequisites are complete, retire the turn/workflow
  selector and duplicate orchestration so the harness is the only supported
  assistant path.
- Migrate configuration, transport/API behavior, and desktop client selection
  coherently, with an explicit compatibility or migration note where needed.
- Preserve the accepted behavior and authority boundaries of the existing
  turn path, including confirmed actions, memory consent/deletion, and
  speech/playback/cancellation behavior.
- Add behavior tests for the unified public path and verify that no unsupported
  capability or access boundary is introduced.
- Update architecture documentation to distinguish the former current paths
  from the implemented unified target.

## Implementation Notes

This task has no dependency on umbrella task 0067, avoiding a cycle. Email and
calendar connectors, longer-lived/durable runs, recurring work, and
resident-visible evidence are not prerequisites for convergence.
