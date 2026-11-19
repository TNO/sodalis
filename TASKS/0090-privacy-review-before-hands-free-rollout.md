# 0090 Review privacy before hands-free listening reaches real users

Status: superseded (2026-11-19; wake-word rollout cancelled)
Triage: archived; no wake-word rollout authorized
Priority: high
Subsystem: privacy
Spec: [0091](0091-hands-free-activation-spec.md)
Historical dependency: 0086

## Current disposition

[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md) removes
the wake-word rollout, so this is no longer a gate for shipping that feature.
It is not a completed human privacy review or a waiver for existing speech,
LLM processing or future physical-button hardware.

Local pre-activation buffers do not prevent disclosure after activation:
a mistaken detection could still send subsequent audio to configured STT,
and cancellation cannot recall it. That is one reason the feature is out of
scope. See the
[decision rationale](../docs/evaluations/interaction-modes.md#why-the-decision-changed).
Reassess capture location, provider flows, consent and deletion in the scope
of any future button implementation. The original checklist below is retained
as historical research, not a current implementation or rollout plan.

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
