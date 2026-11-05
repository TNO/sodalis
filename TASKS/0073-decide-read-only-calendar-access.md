# 0073 Decide authorized read-only calendar access

Status: done
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

## Decision

The user selected a provider-neutral read-only calendar interface, with both
Microsoft Graph and Google Calendar adapters in the initial implementation.
The [architecture contract](../docs/architecture/companion-harness.md#approved-read-only-calendar-contract-planned)
records the shared normalized outcomes, delegated OAuth grants and secure
credential requirements, single-source appointment/timezone contract,
deterministic fixtures, and live-verification limits. It specializes ADR 0007
without requiring a new ADR. Endpoint metadata alone is not account authorization.

Task [0074](0074-complete-read-only-calendar-journey.md) is refined for both
adapters and remains open. This task implements no provider, authorization
flow, or runtime behavior and makes no live requests. Verification is a
documentation consistency/link review and `git diff --check`; no code tests
are invented for this documentation-only decision.
