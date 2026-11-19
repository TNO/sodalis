# 0086 Add the sample-based wake word, enrolment and Activation settings

Status: cancelled (2026-11-19; wake word out of scope)
Triage: archived; do not implement
Priority: high
Subsystem: speech
Spec: [0091](0091-hands-free-activation-spec.md)
Historical dependency: 0085

## Current disposition

[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md) cancels
this task. Always-listening wake-word detection remains intrusive even when
local, false detections can send subsequent speech/text to configured
providers, and missed or delayed triggers undermine reliability. Do not add
the detector, enrolment data, dependencies or Activation settings, including
as disabled features. Keep the existing UI button and typing unchanged.
The original task below is historical, not an implementation backlog.

## Context

The [interaction-modes evaluation](../docs/evaluations/interaction-modes.md)
recommends a sample-based wake word: Rustpotter (Apache-2.0) in the browser, with
a keyword built from about 10 recordings of "Hey Sodalis" made by each user. In a
laptop check it reached 16 of 21 first tries as logged (94% of 17 after the user
excluded four deliberate limit tests, directional). Its playback false-activation
rate, other and older speakers, and tablet behaviour are unmeasured.

## Acceptance Criteria

- Run the wake-word detector on-device in the browser. Audio never leaves the
  device before activation; no pre-activation audio is written to disk.
- Build the keyword from about 10 recordings per user, as a one-time enrolment at
  application start. Skipping enrolment leaves the wake word off. Further
  household members can enrol their own samples later, and "Opnieuw inspreken"
  re-enrols.
- Arm the detector only when no turn is active (0085). Activation starts the
  listening state through the activation controller. Do not auto-detect missed
  wake words and do not add a sensitivity slider.
- Add one plain-Dutch "Activation" section to the existing companion settings,
  stored on the tablet and open to anyone at the tablet, with the wake-word
  switch and re-enrolment. Later tasks add their own switches there.
- Store enrolment recordings and keywords so they can be deleted by the user;
  coordinate the consent text with 0090.
- Add behaviour tests for enrolment, arming rules, the off-until-enrolled default
  and deletion (ADR 0006, privacy). Evaluation scripts need no tests.
- Include a repeatable playback false-activation check (10 minutes of mixed TV,
  radio and conversation, then about 20 intended Dutch attempts) with the target
  of at most 0.25 false activations per waking hour, and record the result in
  the evaluation. It is not a precondition for development.
- Verify on a laptop. Deploying on a tablet requires the evaluation's "Future
  research on a tablet" measurements first. Enabling it for real users needs 0090.

## Implementation Notes

Decisions: [T15](../WAYFIND/interaction-modes/T15-wake-word-route.md) and
[T16](../WAYFIND/interaction-modes/T16-how-activation-modes-combine.md).
Prototype evidence: branch `prototype/wake-word-samples` (commit `ac1cc34`).
Ruled out: sherpa-onnx with the pretrained zh-en model, openWakeWord,
Porcupine. Keep third-party desktop integration behind `packages/desktop-host`.
