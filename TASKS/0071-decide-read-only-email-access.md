# 0071 Decide authorized read-only email access

Status: done
Priority: medium
Subsystem: assistant
Depends on: none

## Context

The existing fixture Mail app is not a real email connector. A concrete
read-only email journey needs a provider and authorization decision before
implementation; graph endpoint metadata does not grant account access.

## Acceptance Criteria

- Decide and document the provider/connector, user authorization and
  permissions, configuration requirements, and a suitable deterministic test
  data strategy for read-only access.
- Define a concrete user question and bounded recent-message selection, with
  summaries that retain sender, date, and source.
- Explicitly exclude sending, drafting, modifying, and cross-source synthesis.
- Refine task [0072](0072-complete-read-only-email-journey.md) with the selected
  contract, setup, acceptance cases, and verification constraints before it is
  treated as ready for implementation.
- Record the decision in the architecture; use an ADR only if it resolves an
  architectural trade-off.

## Decision and completion evidence

Completed 2026-11-05, following the user's choice to support **both Microsoft
Graph (Outlook) and Gmail API behind a provider-neutral Sodalis interface**.
The [read-only email access decision](../docs/architecture/companion-harness.md#read-only-email-access-decision-0071)
is the source of truth for the provider table and scopes, configuration,
approved question, bounded selection and coverage, evidence, outcomes,
exclusions and deterministic fixtures. Connection, session binding, ID-token
validation, disconnect and secret storage follow the shared
[delegated account authorization](../docs/architecture/companion-harness.md#delegated-account-authorization)
protocol. [ADR 0008](../docs/adr/0008-delegated-personal-account-access.md)
records the trade-offs. These are separate client registrations per
capability, email tokens held only in memory, a new host session, and
disclosed processing by the configured (possibly cloud) model.

Task [0072](0072-complete-read-only-email-journey.md) is refined with the
contract, setup, acceptance cases and verification constraints, and is ready
for implementation.

Verification: documentation-only changes reviewed against the acceptance
criteria and the official provider references linked from the architecture.
No runtime connector is implemented by this ticket. No live provider/cloud
checks or code tests were run.
