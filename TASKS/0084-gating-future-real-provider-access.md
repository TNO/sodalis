# 0084 Gate future real-provider account access

Status: open
Priority: high
Subsystem: assistant
Depends on: none

## Context

Email and calendar currently have no real-provider implementation or
account-authorization support. Email's deterministic mock is synthetic and
calendar has no runtime. This task records readiness work for a future
consideration only. **It does not authorize restoring real-provider code,
connecting accounts, running live checks, or starting a pilot.** Any such work
requires a separate explicit future approval after these gates are reviewed.

The historical
[email security review](../docs/evaluations/email-journey-security-review.md)
records static findings on the removed implementation; its result does not
certify current or future code. This task is linked from the separate email
[0072](0072-complete-read-only-email-journey.md) and calendar
[0074](0074-complete-read-only-calendar-journey.md) capability tasks.

## Gates before any future staging account checks

- Review dependencies used by any newly proposed authorization or provider
  implementation.
- After separate explicit approval, perform dynamic staging checks of the
  connect and callback security boundary, including cookies, CSRF, origin
  handling, callback state/replay, account binding, failure paths, and leakage.
- Verify provider registration, consent, Google restricted-scope requirements
  where applicable, and organizational/tenant approval. A test-user allowlist
  or development tenant is not blanket pilot approval.

## Gates before any future real-resident pilot

- Complete a DPIA covering mailbox/calendar content, third parties represented
  in that content, hosting, and any model processing.
- Execute DPAs with the Sodalis hosting provider and each model processor,
  including enforceable no-retention and no-training terms for personal
  account data.
- Obtain documented privacy-officer and information-security approval.
- Confirm provider verification, organizational tenant/app approval, data
  residency, resident-facing disclosures, incident handling, and accountable
  owners for provider registrations and credentials.

## Exit evidence

Record approved scope, reviewed code revision, dependency review, staging test
results and limitations, provider/organizational verification, DPIA/DPAs, and
written privacy and information-security decisions. Keep credentials and
personal account data out of this task and the repository.

Completion of these gates is necessary but **not sufficient** to re-enable
real-provider support. A separate explicit approval and implementation task
must follow.
