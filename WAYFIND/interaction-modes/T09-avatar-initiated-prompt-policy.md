---
title: Policy for avatar-initiated prompts
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: [T04-sensor-signals-for-intent-to-talk.md, T05-privacy-and-consent-always-listening.md, T07-evaluation-rubric.md]
---

## Question

> Historical policy, not approved rollout requirements. Automatic prompts and
> their listening windows are deferred with the entire hands-free rollout.
> See [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

When may Sodalis speak first and open the mic afterwards? Decide which
triggers qualify (sensor events, reminders, time of day, other household
events), how often and in which situations it must stay silent, how the user
dismisses or turns it off, how the open-mic window after a prompt is bounded,
and how this interacts with Home safety and confirmation rules.

Rubric note (T07): an unwanted avatar-initiated prompt counts as a false activation against the eagerness gate (at most 0.25 per waking hour).

## Resolution

Decided with the user in three rounds, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the research ([T04](T04-sensor-signals-for-intent-to-talk.md), [T05](T05-privacy-and-consent-always-listening.md)). All numbers are nominal and provisional, like the rubric's. Desk decision only: nothing was built or measured.

**Scope.** This ticket fixes how *any* Sodalis-initiated prompt starts, opens the mic, is dismissed and is counted. Which alerts exist (CO2, stove, smoke, fall), their thresholds, who else is told, safety-critical alerts, and which inferred signals qualify are **out of scope** here and belong in a separate Wayfind map (see the map's Out of scope).

**Triggers.** Three kinds, each with its own opt-in: (a) reminders and agenda items, (b) named household events and alert rules switched on by the user or a helper, (c) inferred intent to talk (an inferred signal starts a prompt such as "Can I help with anything?"). Sodalis never starts greetings, check-ins or suggestions on its own. Doorbell-style events and threshold alerts are explicit rules, not inferred intent.

**Consent and evidence.** Every kind is off by default and switched on per kind, in plain Dutch, by the user or a helper, and is revocable at any time. Kind (c) also stays off by default until a soak with a real signal shows at most 0.25 false activations per waking hour (the T07 gate); until then it is rated on desk research only. No live presence signal exists in the repo today (T04).

**Silence (one tier, no urgent override).** A prompt is held and delivered as a silent on-screen card when: a conversation or listening window is active, a confirmation is pending, the mic is muted, it is quiet hours (default 22:00-08:00, adjustable), or "Not now" was used in the last 30 minutes. Quiet-hours reminders wait silently. This also holds alerts at night; the user accepted that deliberately and the alerts effort must revisit it because it affects safety.

**Delivery and repeats.** Chime, large visible card and captions, then spoken once. Not spoken again; the card stays until marked done or dismissed (no assumption of completion). No daily cap on reminders. If the browser blocks audible playback without a prior user gesture (T03), the prompt shows as a visible card only and kiosk autoplay is a follow-up.

**Listening window.** The mic opens only if the prompt asks the user something; an announcement opens nothing. The window starts when the prompt finishes speaking. The user has 10 s to start speaking, otherwise it closes. After speech starts there is no fixed cut-off: end-of-speech detection ends the turn, with a 60 s total ceiling as a runaway guard against noise (the user does not want sentences cut off). It never reopens or extends itself, shows the standard visible listening state with the one-touch mute, and non-reply audio is discarded at once.

**Dismissal and off.** One touch or a spoken "niet nu" snoozes for 30 minutes and closes any window. "Stop these" switches that trigger off until re-enabled in settings. After 3 dismissals in a row of the same trigger, a silent on-screen note (no speech, no mic) asks whether to keep it.

**Inferred-intent limits (kind c).** Chime, visible cue and a short spoken invitation, then the standard window. At most 3 a day (worst case about 0.19 false activations per waking hour, inside the 0.25 gate, above the 0.06 target), a 2 h cooldown after any dismissal or no reply, and auto-pause after 2 misses in a row with the same silent note.

**Counting.** A dismissed or "not now" prompt counts as a false activation (T07). For kind (c) a window that closes with no reply also counts. For reminders and rule-based alerts, no reply does not count.

**Home safety.** A prompt may inform or offer an action but never executes or pre-confirms one. Home actions with an external effect keep the existing exact-action confirmation (`confirmationPhrase`), unchanged; a bare "ja" in the window is not a confirmation. Safe controls are not started by a prompt alone.

**Follow-ups for the document's task list:** a server-to-browser push channel for events (T13), a prompt scheduler with the silence and dismissal rules, an autoplay policy for the tablet, and a real presence signal plus soak before kind (c) is enabled.
