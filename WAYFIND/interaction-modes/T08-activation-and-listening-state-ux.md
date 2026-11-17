---
title: Activation and listening-state UX on the tablet
label: wayfinder:prototype
status: closed
assignee: tristan-albers_tno
blocked-by: [T07-evaluation-rubric.md]
---

## Question

How should Sodalis show that it is armed, activated, listening, and has stopped
(or muted) when activation is hands-free? Make a rough clickable prototype in
the avatar conversation card and overlay for the candidate flows, so we can
react to what an older adult sees and hears across the room (large indicator,
chime, avatar attention, mute control) and judge how much feedback is enough
without becoming irritating. Link the prototype as an asset.

Rubric note (T07): the tester rates felt intrusiveness (fine / uneasy / unacceptable); the listening state must always be visible with a one-touch mute (privacy tier 1).

## Prototype

- Clickable activation and listening-state variants: `apps/desktop/src/avatar/ActivationListeningStatePrototype.ts` on branch `prototype/activation-listening-state` (commit `b80014e`)
- Run `pnpm dev` and open `http://127.0.0.1:5173/?prototype=activation-listening&variant=A`.
- Switch among A (conversation card), B (avatar attention), and C (room-level banner). Simulating activation plays the default-on chime and opens straight to listening; simulate a spoken turn to see dictation, Sodalis's text response, and the card's automatic dismissal. The stopped state lasts four seconds before the card hides. Text input is a local fallback. The demo never opens the microphone.

## Resolution

The user chose variant A (conversation card), rated its feedback fine, and found
the chime helpful. Keep the chime for now; a spoken activation phrase can be
considered later.

- While armed, keep the full conversation card hidden and show only a small
  readiness indicator. On activation, play the chime and immediately show the
  card in the listening state, positioned beside the avatar.
- Keep listening-state feedback visible with a one-touch mute. Show the user's
  dictated words and Sodalis's spoken reply as text; keep typed input as a
  backup.
- After the response, show "Listening stopped" for four seconds, then hide the
  card automatically. The user confirmed this timing.
- Evidence is one user's hands-on reaction, not a usability study. The
  prototype component remains on the throwaway branch
  `prototype/activation-listening-state` (commit `b80014e`).
