# 0089 Add the optional spoken activation acknowledgment

Status: deferred (2026-11-19)
Triage: requires re-scoping; do not implement
Priority: low
Subsystem: speech
Spec: [0091](0091-hands-free-activation-spec.md)
Historical dependency: 0086

## Current disposition

[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md) defers
spoken activation acknowledgments with the entire hands-free rollout.
Keep current feedback unchanged; do not add the proposed acknowledgment
or implement the cancelled wake-word dependency. Feedback for a future
physical button remains undecided. The original task below is historical.

## Context

The chime stays the default sound for hands-free activations. The
[interaction-modes evaluation](../docs/evaluations/interaction-modes.md) records
an optional spoken acknowledgment
([T14](../WAYFIND/interaction-modes/T14-spoken-activation-acknowledgment.md)).
The spoken variant has never been heard, and its added delay and acceptance by
older adults are untested.

## Acceptance Criteria

- Add a setting in the Activation section, off by default, switched on or off by
  anyone at the tablet.
- When on, play the fixed Dutch sentence "Hallo, waarbij kan ik helpen?" instead
  of the chime, for the wake word and the external trigger only. Hold-to-talk
  and avatar prompts are unchanged.
- Show the listening card at once. Open the microphone only after the sentence
  ends.
- If sound cannot play (autoplay blocked, speaker muted), show the visible card
  only; no retry, no fallback sound.
- Add behaviour tests for the setting, the sequencing and the no-sound path
  (ADR 0006, avatar UX).
- Measure the added delay and record it in the evaluation. Verify on a laptop;
  tablet deployment needs the "Future research on a tablet" measurements first
  (echo of Sodalis's own voice included).
