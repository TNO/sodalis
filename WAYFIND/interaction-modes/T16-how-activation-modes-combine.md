---
title: How activation modes combine, default and fall back
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: [T14-spoken-activation-acknowledgment.md, T15-wake-word-route.md]
---

## Question

Given the surviving modes (a wake word, an optional external trigger, bounded avatar-initiated prompts with a listening window, and hold-to-talk and typing as fallbacks), which are on by default, how does the user or a helper switch them, and what happens when one fails (for example the microphone is blocked, the wake word keeps missing, or the push channel is down)? Cover the always-visible listening state and one-touch mute from the rubric ([T07](T07-evaluation-rubric.md)), the UX from [T08](T08-activation-and-listening-state-ux.md), and the prompt policy from [T09](T09-avatar-initiated-prompt-policy.md).

## Resolution

Decided with the user in three grilling rounds, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the decisions in [T08](T08-activation-and-listening-state-ux.md), [T09](T09-avatar-initiated-prompt-policy.md), [T13](T13-prototype-external-trigger-push-channel.md), [T14](T14-spoken-activation-acknowledgment.md) and [T15](T15-wake-word-route.md). Desk decision only: nothing was built or measured.

**Defaults.** Hold-to-talk and typing are always on. The wake word turns on once enrolment is completed (the enrolment is the opt-in; skipping it leaves the wake word off). The external trigger is off until the administrator sets it up. Avatar-initiated prompts and the spoken acknowledgment stay off (T09, T14).

**Switches and roles.** One plain-Dutch "Activation" section in the existing companion settings, stored on the tablet, open to anyone at the tablet (the user, a family member or a caregiver). No PIN and no separate role. It holds the wake word switch, re-enrolment, the spoken acknowledgment (T14) and the three prompt kinds (T09). Setting up the external trigger (Home Assistant admin token, physical button) and viewing its connection status belong to the **administrator**, outside the tablet screen. Where T09 and T14 say "user or a helper", that means anyone at the tablet.

**Mute.** One touch stops all hands-free listening: the wake word and every listening window. It stays until touched again, also across a restart, so the microphone never reopens silently, and it always shows a large "Microfoon uit, tik om aan te zetten". Hold-to-talk still works, since it is a deliberate touch.

**Microphone blocked or denied.** A persistent plain-Dutch banner ("Ik kan je niet horen: de microfoon staat uit") with a one-touch re-ask button; typing stays available. The wake word is off until permission is granted and then returns by itself. The external trigger still opens the card with typing. No retry loop.

**Wake word keeps missing.** Sodalis cannot see a missed wake word, so there is no automatic detection, no sensitivity slider and no heuristics. Hold-to-talk stays visible, and re-enrolment ("Opnieuw inspreken") is in settings.

**External trigger channel down.** The user sees nothing; the other modes are unaffected. The connection status shows only in the administrator's view. Events missed in an outage are not replayed (T13: reconnect about 10 s); a missed press is pressed again.

**Overlapping activations.** The existing voice barge-in is kept unchanged: while Sodalis replies in an active turn, the user talking over it stops playback, TTS and generation and goes straight to listening, for replies marked interruptible; non-interruptible replies are not cut off by voice, and touch controls still work. The wake word is armed only when no turn is active, because during a turn barge-in already covers any speech, "Hey Sodalis" included. A touch or the external trigger also stops speech and opens listening. Activations during a pending confirmation are ignored. The microphone stays closed during the T14 acknowledgment sentence and during a T09 avatar question until they finish; barge-in covers replies only.

**Evidence gaps for the decision document (not tasks).** Whether barge-in hears Sodalis's own voice on the tablet speaker (existing behaviour, unmeasured, T02); tablet sleep and background behaviour; real hardware button and Home Assistant events; how older users cope with the settings screen; and that nothing here was built or tested.
