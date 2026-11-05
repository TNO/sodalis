# 0073 Decide authorized read-only calendar access

Status: open
Priority: medium
Subsystem: assistant
Depends on: none

## Context

Calendar references can be present in graph metadata without providing an
authorized calendar connector. Choose the access and verification contract
before adding a read-only calendar journey.

## Acceptance Criteria

- Decide and document the provider/connector, user authorization and
  permissions, configuration requirements, and deterministic test-data
  strategy for read-only access.
- Define a concrete appointment question over a bounded period, including
  timezone interpretation and source attribution.
- Explicitly exclude creating, editing, or deleting calendar events and
  cross-source synthesis.
- Refine task [0074](0074-complete-read-only-calendar-journey.md) with the
  selected contract, setup, acceptance cases, and verification constraints
  before it is treated as ready for implementation.
- Record the decision in the architecture; use an ADR only if it resolves an
  architectural trade-off.

## Implementation Notes

No calendar provider or authorization mechanism is selected by this task.
Endpoint metadata alone is not account authorization.
