# 0071 Decide future read-only email access

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

Completed 2026-11-05 as a **design decision**: the future target considered
Microsoft Graph (Outlook) and Gmail API behind a provider-neutral Sodalis
interface. This did not deliver or authorize account access. The
[architecture](../docs/architecture/companion-harness.md#read-only-email-access-decision-0071)
retains the provider table, scopes, bounded question/evidence contract,
exclusions and synthetic fixtures as deferred design. Shared authorization
and secret-storage trade-offs remain in
[ADR 0008](../docs/adr/0008-delegated-personal-account-access.md), also future
direction only.

The current [0072](0072-complete-read-only-email-journey.md) implementation is
narrowed to the provider-neutral contract and explicitly selected mock
fixtures. Real Graph/Gmail readers, OAuth and connection UI are deferred until
further notice. [Task 0084](0084-gating-future-real-provider-access.md) records
concrete prerequisites and does not authorize restoring those capabilities.

Verification: documentation-only design reviewed against its acceptance
criteria and official provider references. No runtime connector is delivered
by this decision. No live provider/cloud checks or code tests were run.
