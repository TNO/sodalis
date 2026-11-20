# 0091 Spec: hands-free activation on the tablet

Status: superseded (2026-11-19)
Type: spec
Triage: archived; do not implement
Priority: high
Subsystem: avatar, speech, server
Slices: 0085, 0086, 0087, 0088, 0089 (agent work), 0090 (human review)

Source: the [interaction-modes evaluation](../docs/evaluations/interaction-modes.md)
and the decision trail in
[`WAYFIND/interaction-modes/`](../WAYFIND/interaction-modes/map.md) (map, T01–T17).
Terms are defined in [`GLOSSARY.md`](../GLOSSARY.md) and used as written there.

## Current decision (2026-11-19)

[ADR 0010](../docs/adr/0010-button-activation-without-wake-word.md) supersedes
this spec and all of its slices. Keep the current UI, hold-to-talk, typing,
and active-turn speech behavior unchanged. Wake-word detection and enrolment
are out of scope; do not ship them, even disabled.
The entire hands-free rollout is deferred, including new listening-state UI,
automatic prompts and spoken acknowledgments.

The future direction is physical-button activation. Before implementation,
decide the hardware, connection/transport, press/hold semantics, listening
duration and stop/cancel behavior, feedback, failure handling, microphone
placement and privacy requirements. A microphone on an embedded device is
only a future option. Neither Home Assistant nor the old push-channel design
is selected. Task [0087](0087-external-trigger-push-channel.md) is deferred
pending that re-scoping, not ready for implementation.

The [evaluation](../docs/evaluations/interaction-modes.md)
records the decision rationale and historical research evidence.
The original spec below is retained solely as historical rationale; its user
stories, implementation decisions, acceptance criteria and slice ordering are
not current requirements.

## Historical spec (superseded)

## Problem Statement

An older adult using Sodalis on a fixed tablet in a home room can only start a
conversation by holding a button. That asks for a deliberate physical action
every time, and it is hard for people who have trouble reaching or pressing the
screen, who are across the room, or who have their hands full. Sodalis also
cannot start a conversation itself, for example to read out a reminder, and
nothing outside the tablet (a hardware button, Home Assistant) can wake it.

The obvious fix, a microphone that is always on and treats any speech as a
turn, is unacceptable: it costs too much privacy, it will irritate the user
with false activations, and the product owner has ruled it out. The solution
has to be hands-free **and** keep **pre-activation audio** on the device, keep
**eagerness** low, keep **ease of activation** high, and always show whether
Sodalis is listening.

## Solution

Sodalis offers several **activation modes** that all feed one activation
controller, so the user always sees and hears the same thing when Sodalis starts
listening:

- **Hold-to-talk and typing** stay exactly as they are and are always on.
- A **sample-based wake word** ("Hey Sodalis"), recognised on the device from
  about ten recordings the user makes once, is on after that **enrolment**.
- An optional **external trigger** (for example a physical button wired through
  Home Assistant) is off until the **administrator** sets it up.
- Optional **avatar-initiated prompts** (reminders and agenda items, named
  household events and alert rules) are off until switched on, and open the
  microphone only after a question, in a short **listening window**.
- An optional **spoken acknowledgment** can replace the chime.

The tablet shows a small readiness indicator while armed, a chime and a
listening card on activation, one-touch mute, and a plain-Dutch banner when the
microphone is blocked. One "Activation" section in the companion settings,
open to anyone at the tablet, holds the ordinary switches; server-side trigger
setup is for the administrator. A human privacy review gates switching the wake
word on for real users.

## User Stories

Using the tablet (the user):

1. As an older adult, I want to say "Hey Sodalis" from across the room, so that I can start a conversation without touching the tablet.
2. As an older adult, I want hold-to-talk to keep working exactly as before, so that I always have a way to talk that I already know.
3. As an older adult, I want to be able to type to Sodalis at any time, so that I can still use it when speaking is hard or the room is noisy.
4. As an older adult, I want a clear chime when Sodalis starts listening, so that I know it heard me without looking.
5. As an older adult, I want a card beside the avatar to say it is listening, so that I can see the state at a glance.
6. As an older adult, I want to see my own words and Sodalis's reply as text, so that I can check I was understood.
7. As an older adult, I want the card to say "Listening stopped" for a few seconds and then go away, so that I know the turn ended and the screen stays calm.
8. As an older adult, I want the full card hidden while Sodalis only waits for the wake word, with just a small readiness indicator, so that the screen does not distract me.
9. As an older adult, I want one big touch to mute all hands-free listening, so that I can make Sodalis stop listening whenever I want.
10. As an older adult, I want a large "Microfoon uit, tik om aan te zetten" while muted, so that I never wonder whether it is listening.
11. As an older adult, I want mute to stay on after the tablet restarts, so that a power cut does not silently turn listening back on.
12. As an older adult, I want hold-to-talk to still work while muted, so that muting does not lock me out of Sodalis.
13. As an older adult, I want a plain-Dutch banner "Ik kan je niet horen: de microfoon staat uit" when the microphone is blocked, so that I understand why nothing happens.
14. As an older adult, I want a one-touch button on that banner to ask for the microphone again, so that I can fix it myself without a settings maze.
15. As an older adult, I want typing to stay available while the microphone is blocked, so that I am never stuck.
16. As an older adult, I want Sodalis not to keep retrying a blocked microphone in a loop, so that I am not nagged or confused.
17. As an older adult, I want to talk over Sodalis's reply to stop it, so that I can interrupt a long answer (barge-in).
18. As an older adult, I want a touch on the tablet to stop Sodalis speaking and start listening, so that I can interrupt without raising my voice.
19. As an older adult, I want Sodalis to ignore a wake word while it is already talking to me or waiting on my answer, so that a stray activation never disturbs a conversation.
20. As an older adult, I want a wake word spoken during a pending confirmation to be ignored, so that I cannot confirm a Home action by accident.
21. As an older adult, I want Sodalis to start listening only after I make the wake word, so that it does not react to the TV or to other people talking.
22. As an older adult, I want audio from a mistaken activation thrown away at once, so that nothing I said by accident is kept.
23. As an older adult, I want to skip the wake-word enrolment, so that I can use Sodalis without recording my voice.
24. As an older adult, I want the wake word to stay off until I have recorded my samples, so that enrolling is my choice to switch it on.
25. As an older adult, I want a guided, plain-Dutch enrolment of about ten recordings, so that I can finish it without help.
26. As an older adult, I want an "Opnieuw inspreken" option, so that I can re-record if my voice changes or recognition is poor.
27. As an older adult, I want to delete my recordings and keyword, so that I stay in control of my voice data.
28. As an older adult, I want no sensitivity slider, so that the settings stay simple.
29. As an older adult, I want one "Activation" section with plain-Dutch switches, so that I can find everything about talking to Sodalis in one place.
30. As an older adult, I want the settings on the tablet to be stored on the tablet, so that they stay as I left them.
31. As an older adult, I want a reminder to appear with a chime, a large card and captions, then be spoken once, so that I notice it and can read it.
32. As an older adult, I want a reminder card to stay until I mark it done or dismiss it, so that I cannot miss it by looking away.
33. As an older adult, I want Sodalis to open the microphone only when a prompt asks me a question, so that it does not listen when it only informs me.
34. As an older adult, I want ten seconds to start answering a prompt, so that I am not rushed.
35. As an older adult, I want the listening window to close when I stop speaking, and never to be extended or reopened, so that Sodalis does not hang on listening.
36. As an older adult, I want to say "niet nu" or touch "Not now" so that Sodalis comes back in 30 minutes, so that I can postpone a prompt without losing it.
37. As an older adult, I want a "Stop these" choice, so that I can switch off a kind of prompt that annoys me.
38. As an older adult, I want Sodalis to ask, after I dismiss three prompts in a row, whether to keep them, so that unwanted prompts stop without me hunting for a setting.
39. As an older adult, I want prompts held back as a silent card while I am talking, confirming something, muted, or in quiet hours, so that Sodalis never speaks over me or wakes the house at night.
40. As an older adult, I want a prompt never to carry out a Home action for me, so that I stay in charge of my home.
41. As an older adult, I want the existing exact-action confirmation to stay unchanged, so that I keep the safeguard I already know.
42. As an older adult, I want an optional spoken "Hallo, waarbij kan ik helpen?" instead of the chime, so that I get a friendly spoken sign that Sodalis is listening.
43. As an older adult, I want Sodalis to start listening only after that sentence ends, so that it does not hear its own voice.
44. As an older adult, I want the visible card to still show if sound cannot play, so that I always get some sign.

Helper, family member or household member:

45. As a family member in the same home, I want to enrol my own samples later, so that the wake word works for me too.
46. As a helper at the tablet, I want to switch the ordinary activation options on or off, so that I can adjust Sodalis without the administrator.
47. As a helper, I want to switch the spoken acknowledgment on or off, so that I can try it for the user.
48. As a household member, I want to see when the microphone is muted from anywhere in the room, so that I know whether Sodalis can hear us.

Administrator:

49. As an administrator, I want the external trigger to be off until I set it up, so that nothing listens for a button I never connected.
50. As an administrator, I want to connect a Home Assistant button to Sodalis using an admin-capable token kept only on the server, so that the token never reaches the tablet.
51. As an administrator, I want the trigger channel to require authentication and check the origin, so that no other site or device can wake the tablet.
52. As an administrator, I want to see the trigger connection status outside the tablet screen, so that I can fix a broken button without bothering the user.
53. As an administrator, I want the browser to reconnect on its own after an outage, so that I do not have to restart the tablet.
54. As an administrator, I want events missed during an outage not to be replayed, so that a button pressed an hour ago does not suddenly start a listening state.
55. As an administrator, I want a trigger never to execute a Home action, so that a wake signal cannot control the house.
56. As an administrator, I want the assistant's Home entity allowlist to stay unchanged, so that adding a trigger does not widen what the assistant can touch.
57. As an administrator, I want the user to see nothing when the trigger channel is down, so that a technical fault does not confuse them.
58. As an administrator, I want a documented autoplay policy for the tablet kiosk, so that chimes and spoken prompts can play without a touch.

Developer and product owner:

59. As a developer, I want every mode to start and stop listening through one activation controller, so that overlap rules, mute and visible states are enforced in one place.
60. As a developer, I want the controller to expose its state (armed, listening, replying, stopped, muted, microphone blocked), so that the UI and tests rely on one source of truth.
61. As a developer, I want the wake-word detector, microphone, push source, clock, storage and playback to be injectable, so that behaviour is testable without audio or a network.
62. As a developer, I want hands-free modes armed only when no turn is active, so that two modes can never start a turn at once.
63. As the product owner, I want no pre-activation audio written to disk or sent off the device, so that privacy tier 1 holds.
64. As the product owner, I want a repeatable playback false-activation check against the 0.25-per-waking-hour gate, so that eagerness is measured, not assumed.
65. As the product owner, I want a dismissed or "not now" prompt counted as a false activation, so that unwanted prompts are held to the same gate as unwanted wake words.
66. As the product owner, I want the wake word switched on for real users only after a human privacy review, so that consent, deletion and the DPIA question are settled first.
67. As the product owner, I want tablet deployment to wait for the "Future research on a tablet" measurements, so that no tablet behaviour is claimed without being measured.
68. As the product owner, I want measured results recorded in the evaluation, so that the decision document stays the single analysis.

## Implementation Decisions

Decisions below come from the evaluation and tickets T08, T09, T13–T16.

**Activation controller (0085).** A single browser module owns the activation
state machine. Every activation mode (hold-to-talk, wake word, external
trigger, avatar prompt) requests start and stop through it. Visible states:
armed, listening, replying, stopped, muted, microphone blocked. Hands-free
modes are armed only when no turn is active. An activation arriving during a
pending confirmation is ignored. The existing voice barge-in is kept
unchanged for replies marked interruptible; a touch or an external trigger also
stops speech and opens listening. The existing speech input controller and
voice activity detection stay as they are; the activation controller drives
them. Hold-to-talk and typing behave as today.

**Listening-state UX (0085, T08 variant A).** While armed, the full
conversation card stays hidden and only a small readiness indicator shows. On
activation: chime, then the card in the listening state beside the avatar,
user words and reply as text, typed input retained. After the turn the card
shows "Listening stopped" for four seconds, then hides.

**Mute and blocked microphone (0085, T16).** One-touch mute stops all
hands-free listening and every listening window, persists across restarts,
and always shows a large "Microfoon uit, tik om aan te zetten". Hold-to-talk
still works while muted. A blocked or denied microphone shows a persistent
plain-Dutch banner with a one-touch re-ask button; typing stays available; no
retry loop.

**Wake word (0086, T15).** A sample-based detector (Rustpotter, Apache-2.0)
runs on the device in the browser against a keyword built from about ten
recordings per user. Enrolment happens once at application start; skipping it
leaves the wake word off. Further household members can enrol later;
"Opnieuw inspreken" re-enrols. The detector is armed only when idle, starts the
listening state through the activation controller, has no sensitivity slider
and no automatic missed-wake-word detection. Recordings and keywords are stored
on the tablet and deletable by the user. The detector sits behind an
interface so it can be replaced by a fake in tests and by another engine later.
Ruled out: sherpa-onnx with the pretrained zh-en model, openWakeWord,
Porcupine, microWakeWord as a reserve (English-trained).

**Activation settings (0086, T16).** One plain-Dutch "Activation" section is
added to the existing companion settings, stored on the tablet and open to
anyone at the tablet. It starts with the wake-word switch and re-enrolment;
later slices add their own switches (prompt kinds, spoken acknowledgment).

**External trigger push channel (0087, T13).** A new authenticated
server-to-browser push channel with origin protection. The server subscribes to
Home Assistant events using an admin-capable token held only on the server; the
assistant's entity allowlist is unchanged. A pushed trigger event starts the
listening state through the activation controller. The channel is off until the
administrator sets it up; setup and connection status are administrator-only and
outside the tablet screen; missed events are not replayed; the browser
reconnects on its own; the user sees nothing when the channel is down. A trigger
never executes a Home action. The push source is injectable in the browser.
Web Bluetooth and voice satellites are not the route.

**Avatar-initiated prompts (0088, T09).** A scheduler supports two opt-in kinds,
each off by default and switched on per kind in the Activation section:
reminders and agenda items, and named household events or alert rules.
Inferred-intent prompts are not built. A prompt is held as a silent on-screen
card during a conversation or listening window, a pending confirmation, mute,
quiet hours (default 22:00–08:00, adjustable) and for 30 minutes after "Not
now". Delivery: chime, large card with captions, then speech once; the card
stays until marked done or dismissed; no daily cap on reminders. The
microphone opens only if the prompt asks a question: 10 s to start speaking,
ended by end-of-speech, 60 s ceiling, never reopened or extended; non-reply
audio is discarded. "Not now" or a spoken "niet nu" snoozes 30 minutes and
closes any window; "Stop these" switches that kind off; three dismissals in a
row show a silent note asking whether to keep the kind. If audible playback is
blocked without a prior gesture, show the card only and document the tablet
autoplay policy. A prompt informs or offers an action but never executes or
pre-confirms one; the existing exact-action confirmation is unchanged. The
scheduler's clock and the prompt source are injectable. The quiet-hours hold
on night-time alerts is flagged as a safety item for the separate alerts effort.

**Spoken acknowledgment (0089, T14).** An off-by-default setting in the
Activation section, switchable by anyone at the tablet. When on, the fixed Dutch
sentence "Hallo, waarbij kan ik helpen?" replaces the chime for the wake word
and the external trigger only. The card shows at once and the microphone opens
after the sentence ends. If sound cannot play, only the visible card shows; no
retry and no fallback sound.

**Privacy review (0090, T05).** A human checklist, not agent work and not legal
advice: whether a DPIA is required and who owns it; confirmation in code that
the wake-word buffer is never stored or sent and false-activation audio is
discarded at once; consent, revocation and deletion for enrolment recordings,
including the UAVG art. 5(2) question for users under curatele, bewind or
mentorschap; confirmation that the listening state is always visible with a
one-touch mute; and confirmation that there is no voice identification. It
blocks switching the wake word on for real users, not building it.

**How modes combine (T16).** Hold-to-talk and typing always on; wake word on
after enrolment; external trigger, avatar prompts and spoken acknowledgment off
until switched on; no cloud provider call is added for activation.

**Architecture and constraints.** Keep third-party desktop integration behind
the desktop-host package, preserve Aster's iframe sandbox boundary, and expose
nothing from Aster to the assistant. Only explicit host capabilities cross the
adapter. No pre-activation audio is written to disk and none leaves the device.
No cloud provider command is run without the user's explicit consent for that
run. Implementation is verified on a laptop only; tablet behaviour is not
claimed (see Out of Scope).

**Slice order.** 0085 first. 0086 and 0087 can then proceed in parallel. 0088
builds on 0085 and the Activation section from 0086. 0089 builds on 0086. 0090
is a human review that gates enabling 0086 for real users. 0087 is built and
tested against the Home Assistant simulator; the real adapter (0038) is needed
only to enable it against a real home.

## Testing Decisions

A good test exercises external behaviour through a public interface and would
survive a refactor: it asserts what the user sees and hears, what the server
returns, and what is stored or discarded, not how the controller, detector or
scheduler are structured internally.

**Seam 1, browser overlay (the single main seam).** Drive the desktop avatar
overlay in jsdom the way its current tests do, with injected fakes for the
microphone capture, the wake-word detector, the push-event source, the clock,
storage and audio playback. This seam covers: activation states and the
listening-state card; the four-second "Listening stopped"; one-touch mute and its
persistence; the blocked-microphone banner and single re-ask; barge-in and
touch interruption; overlap rules (no activation during an active turn or a
pending confirmation); hold-to-talk and typing unchanged; Activation settings
and their defaults; wake-word enrolment, arming rules, off-until-enrolled and
deletion; prompt hold/silence rules, dismissal rules, window timing and Home
safety; and the spoken-acknowledgment setting, sequencing and no-sound path.
Where a time rule (quiet hours, the 10 s/60 s window) is clumsy to reach through
the overlay, a small test of the scheduler's public interface with a fake clock
is acceptable, but prefer the overlay.

**Seam 2, server push endpoint.** Test the new push channel through the server
app's public HTTP interface, as the existing server app tests do, with a fake
Home Assistant event source: authentication required, origin checks, off by
default, administrator-only status, events delivered to a connected browser, no
replay of events missed during an outage, and no Home action executed by a
trigger.

**Not tested automatically:** the real wake-word engine's accuracy, real Home
Assistant, real audio hardware and the tablet. Evaluation and benchmark scripts
need no tests (ADR 0006). Live cloud tests do not apply, since activation adds
no cloud call.

**Test tiers (ADR 0006).** Privacy, security, Home safety, consent and deletion,
and public server APIs need behaviour tests; avatar and desktop UX changes need
tests for their behaviour.

**Prior art.** The overlay tests for the conversation card and presentation, the
companion settings and preferences tests, the speech input controller tests with
a fake capture and the server app tests under the assistant, home and speech
folders.

**Gates.** Run `pnpm test`, `pnpm typecheck` and `pnpm build` for workspace
changes, and keep `ci-ok` green.

## Out of Scope

- A standing open microphone that treats any speech as a turn. Bounded
  listening windows after an activation or a prompt are in scope.
- Changing hold-to-talk or typing.
- Inferred-intent (sensor-reasoned) prompts and any presence or door signal.
  They need a real presence signal and a **trial period** at or below 0.25 false
  activations per waking hour first, and have no task.
- The alert and notification catalogue (which alerts exist, thresholds,
  urgency, escalation, who else is told) and which inferred signals qualify. A
  separate effort.
- Camera-based presence or gaze attention.
- A formal user study with older adults.
- Voice identification (biometric).
- Porcupine, openWakeWord, sherpa-onnx keyword spotting, voice satellites and
  Web Bluetooth as the primary trigger route.
- Deploying on a tablet and claiming tablet behaviour. It requires the
  evaluation's "Future research on a tablet" measurements first: barge-in over
  the tablet speaker, wake word on the tablet, CPU/power/thermals, microphone
  permission persistence, sleep and background behaviour, audio autoplay, and
  the push channel while visible, hidden, asleep and after a network drop.
- Legal advice. 0090 is a checklist for a human reviewer.
- Real Home Assistant integration itself (0038).

## Further Notes

- Prototype evidence is on throwaway branches, cited by commit: the
  listening-state component (`prototype/activation-listening-state`, `b80014e`),
  the wake word (`prototype/wake-word-samples`, `ac1cc34`) and the push channel
  (`prototype/external-trigger`, `4a2f3d8`). Reuse the ideas, not the files.
- The wake-word recommendation is unconditional but rests on one speaker on a
  laptop with an unmeasured false-activation rate. 0086 adds the repeatable
  playback check and records its result in the evaluation; it is not a
  precondition for development.
- Results measured while implementing (wake-word playback rate, pushed-event
  latency on one clock, spoken-acknowledgment delay) are recorded in
  `docs/evaluations/interaction-modes.md`, not in `TASKS/`.
- Delete the evaluation's throwaway branches once the slices are done.
