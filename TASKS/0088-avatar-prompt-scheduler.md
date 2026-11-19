# 0088 Add the avatar-initiated prompt scheduler

Status: deferred (2026-11-19)
Triage: requires re-scoping; do not implement
Priority: medium
Subsystem: avatar
Spec: [0091](0091-hands-free-activation-spec.md)
Historical dependencies: 0085, 0086 (Activation settings section)

## Current disposition

[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md) defers
automatic avatar prompts along with the entire hands-free rollout. Do not
add the proposed scheduler or automatic listening windows. The
cancelled wake-word task is no longer a dependency to implement. Any future
prompt effort needs its own scope and privacy/safety review. The original
task below is historical, not authorization to change the current UI.

## Context

The [interaction-modes evaluation](../docs/evaluations/interaction-modes.md) and
[T09](../WAYFIND/interaction-modes/T09-avatar-initiated-prompt-policy.md) fix how
any Sodalis-initiated prompt starts, opens the microphone, is dismissed and is
counted. Which alerts exist, their thresholds and urgency belong to a separate
effort.

## Acceptance Criteria

- Support two kinds, each off by default and switched on per kind in the
  Activation settings (0086 section): reminders and agenda items, and named
  household events or alert rules. Inferred-intent prompts are not part of this
  task.
- Hold a prompt as a silent on-screen card during a conversation or listening
  window, a pending confirmation, mute, quiet hours (default 22:00–08:00,
  adjustable) and for 30 minutes after "Not now".
- Deliver with chime, a large card with captions, then speech once. The card
  stays until marked done or dismissed. No daily cap on reminders.
- Open the microphone only if the prompt asks a question: 10 s to start
  speaking, ended by end-of-speech, a 60 s ceiling, never reopened or extended,
  with the standard listening state and mute. Non-reply audio is discarded.
- "Not now" or a spoken "niet nu" snoozes for 30 minutes and closes any window.
  "Stop these" switches that kind off. After 3 dismissals in a row show a
  silent note asking whether to keep it.
- When the browser blocks audible playback without a prior gesture, show the
  card only, and add the tablet autoplay policy (kiosk mode).
- A prompt informs or offers an action but never executes or pre-confirms one;
  the existing `confirmationPhrase` confirmation is unchanged.
- A dismissed or "not now" prompt counts as a false activation for the rubric.
- Add behaviour tests for the silence rules, dismissal rules, the window timing
  and Home safety (ADR 0006).
- Flag that quiet hours hold night-time alerts, which affects safety and must be
  revisited by the alerts effort.
- Verify on a laptop; tablet deployment needs the evaluation's "Future research
  on a tablet" measurements first.

## Implementation Notes

Decision: T09. Inferred-intent prompts need a real presence signal and a trial
period at or below 0.25 false activations per waking hour first; they have no
task (see the evaluation's open items).
