# 0071 Decide authorized read-only email access

Status: open
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

## Implementation Notes

No email provider or access mechanism is selected by this task. Do not infer
authorization from a graph reference or the presence of fixture actions.
