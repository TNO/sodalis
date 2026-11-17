# 0090 Review privacy before hands-free listening reaches real users

Status: open
Priority: high
Subsystem: privacy
Depends on: 0086

## Context

Hands-free listening on a tablet for older adults raises privacy and consent
questions that the [evaluation](../docs/evaluations/interaction-modes.md)
records as open ([T05](../WAYFIND/interaction-modes/T05-privacy-and-consent-always-listening.md);
research branch `research/privacy`). This is a checklist for a human reviewer, not
legal advice, and it blocks switching the wake word on for real users, not
building it (0086).

## Acceptance Criteria

- A human reviewer completes this checklist and records the outcome here:
  - Decide whether a DPIA is required (the EDPB names older adults; it is "very
    likely") and, if so, who owns it.
  - Confirm in code that the wake-word buffer is never stored or sent, and that
    audio from a false activation is discarded at once.
  - Decide consent and deletion for enrolment recordings (voice data): who
    consents, how it is revoked, and when recordings are deleted. Check whether
    UAVG art. 5(2) requires the legal representative to consent for a user under
    curatele, bewind or mentorschap.
  - Confirm the listening state is always visible with a one-touch mute, and
    that the OS microphone indicator is accepted.
  - Confirm no voice identification, which would be biometric and need explicit
    consent plus an alternative.
- Until this is done, ship the wake word off for real users.
- Sodalis's code adds no cloud provider call for activation. Any cloud run needs
  explicit per-run consent per `AGENTS.md`.
