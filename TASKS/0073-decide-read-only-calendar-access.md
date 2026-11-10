# 0073 Decide future read-only calendar access

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
  selected contract, setup, acceptance cases, and verification constraints.
- Record the decision in the architecture; use an ADR only if it resolves an
  architectural trade-off.

## Decision

The user selected a provider-neutral read-only calendar interface and recorded
Microsoft Graph and Google Calendar as possible future adapter designs. This
is a design decision, not a delivered or supported capability. The
[architecture](../docs/architecture/companion-harness.md#read-only-calendar-design-deferred-no-runtime)
retains the normalized outcomes, single-source appointment/timezone contract,
provider setup and deterministic test-data design as deferred. It specializes
ADR 0007 without authorizing account access; endpoint metadata alone is not
account authorization.

Task [0074](0074-complete-read-only-calendar-journey.md) remains open with a
mock-only scope. It will not implement Graph/Google adapters, authorization, or
calendar account connections. [Task 0084](0084-gating-future-real-provider-access.md)
records future real-account readiness gates without authorizing code or access.
This completed decision is not reopened. Verification is a documentation
consistency/link review and `git diff --check`; no runtime or live requests
were part of this task.
