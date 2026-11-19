# 0085 Add the activation controller and listening state

Status: deferred (2026-11-19)
Triage: requires re-scoping; do not implement
Priority: high
Subsystem: avatar
Spec: [0091](0091-hands-free-activation-spec.md)
Historical dependencies: 0020, 0023

## Current disposition

The entire hands-free rollout is deferred by
[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md).
Keep the current conversation UI and speech behavior unchanged. Do not add
the proposed controller or listening-state UI. Any controller needed for a
future physical button must follow a new, scoped design, not these criteria.
The original task below is historical and does not authorize implementation.

## Context

The [interaction-modes evaluation](../docs/evaluations/interaction-modes.md)
recommends hands-free activation on the tablet. Today the microphone only starts
on the hold-to-talk button in `AvatarConversationCard.ts`; the browser VAD and
barge-in in `packages/speech` (`SpeechInputController`, `voiceActivity`) are
unchanged. This task adds the shared piece every hands-free mode plugs into: one
activation state machine and the listening-state UX. It adds no wake word and no
external trigger.

## Acceptance Criteria

- Provide one activation controller that every mode (hold-to-talk, wake word,
  external trigger, avatar prompt) starts and stops through, with visible
  states: armed, listening, replying, stopped, muted, microphone blocked.
- While armed, keep the full conversation card hidden and show only a small
  readiness indicator. On activation, play the chime and show the card in the
  listening state beside the avatar. Show the user's words and Sodalis's reply
  as text, keep typed input, and after the response show "Listening stopped"
  for four seconds, then hide the card.
- Provide a one-touch mute that stops all hands-free listening and every
  listening window, persists across a restart, and always shows a large
  "Microfoon uit, tik om aan te zetten". Hold-to-talk still works while muted.
- When the microphone is blocked or denied, show a persistent plain-Dutch
  banner ("Ik kan je niet horen: de microfoon staat uit") with a one-touch
  re-ask button. Typing stays available. No retry loop.
- Keep the existing voice barge-in unchanged for replies marked interruptible.
  A touch or an external trigger also stops speech and opens listening.
  Ignore activations during a pending confirmation.
- Arm hands-free modes only when no turn is active.
- Tier-1 privacy (rubric): no pre-activation audio written to disk, audio from a
  false activation discarded at once, the listening state always visible.
- Add behaviour tests for the state machine, mute persistence, the blocked
  microphone, overlap rules and barge-in (ADR 0006, privacy and avatar UX).
- Verify on a laptop. Deploying on a tablet requires the measurements in the
  evaluation's "Future research on a tablet" first; do not claim tablet
  behaviour.

## Implementation Notes

Decisions: [T08](../WAYFIND/interaction-modes/T08-activation-and-listening-state-ux.md)
and [T16](../WAYFIND/interaction-modes/T16-how-activation-modes-combine.md). The
prototype component is on branch `prototype/activation-listening-state`
(commit `b80014e`); reuse its ideas, not the file.

Keep Aster's iframe sandbox boundary and expose nothing from Aster to the
assistant.
