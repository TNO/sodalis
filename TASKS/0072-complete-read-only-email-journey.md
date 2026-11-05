# 0072 Complete a read-only email journey

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0071

## Context

This implementation follows the provider, authorization, configuration, and
test-data decision in [0071](0071-decide-read-only-email-access.md). Refine
this task from that decision before implementation begins.

## Acceptance Criteria

- Provide the approved read-only journey for finding relevant recent email
  and summarizing messages with sender, date, and source.
- Enforce the selected connector's real authorization boundary; graph metadata
  alone is not authority to read an account.
- Distinguish unauthorized, empty, unavailable, and stale results where
  applicable; do not imply a lookup succeeded when it did not.
- Add deterministic behavior tests for authorization, selection, summary
  evidence, and applicable failure states. Keep live external verification
  separate; obtain explicit user consent for each live external check. Cloud
  provider commands also follow the repository's provider-selection checks.
- Do not send, draft, or modify email, and do not add hidden cross-source
  synthesis.
- Update architecture documentation with implemented behavior and verification
  limits.

## Implementation Notes

Implementation details and exact acceptance fixtures depend on the unresolved
decision in task 0071; this ticket is not agent-ready until refined.
