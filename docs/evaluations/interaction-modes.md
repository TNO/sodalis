# Hands-free interaction modes for the Sodalis tablet

Status: recommendation superseded on 2026-11-19 by
[ADR 0010](../adr/0010-button-activation-without-wake-word.md).
The original desk and laptop evaluation concluded on 2026-11-17. Its evidence
is retained below, but its wake-word recommendation and rollout plan are no
longer current. No tablet was available and no cloud provider command was run
in that evaluation.

## Summary

Keep Sodalis's current UI unchanged: the existing hold-to-talk control starts
listening and typing remains available. Wake-word detection and enrolment are
out of scope, not features to ship disabled. Defer the entire hands-free
rollout, including the shared activation controller/listening UI, automatic
avatar prompts and spoken acknowledgments.

The future direction is **physical-button activation**. The device,
connection, press/hold semantics, listening duration, feedback and microphone
placement remain undecided. An embedded-device microphone could extend
Sodalis beyond the tablet, but is only an option for future design. The old
Home Assistant push channel is not a selected implementation.

### Why the decision changed

- Always-listening hardware can feel intrusive in the home even when
  pre-activation audio stays in local, temporary buffers. Local processing
  alone does not resolve perceived privacy.
- A false wake detection can start ordinary speech capture and send subsequent
  audio to configured STT and text onward to an LLM. Keeping the *detector's*
  audio local is not a guarantee against that disclosure.
- Missed or delayed wake words make activation uncertain and frustrating.
  The original one-speaker laptop results and unmeasured false-activation
  rate do not establish reliable use in the home.
- A deliberate physical action is the preferred direction; there is no need
  to change the already-working tablet UI while its implementation is decided.

## Historical summary (superseded)

Everything from here through the historical research sections records the
2026-11-17 evaluation, not the current recommendation. The original follow-up
tasks are [0085-0091](../../TASKS/README.md#hands-free-activation), now cancelled,
deferred or superseded. The decision trail is in
[`WAYFIND/interaction-modes/`](../../WAYFIND/interaction-modes/map.md).

Sodalis is used on a fixed tablet by an older adult, so the criteria are, in
order: privacy; false and missed activations (including **eagerness**);
accessibility, where **ease of activation** matters most; latency. Terms are
in [`GLOSSARY.md`](../../GLOSSARY.md).

- **Recommend a sample-based wake word** (Rustpotter, Apache-2.0, in the
  browser, keyword built from about 10 recordings of "Hey Sodalis" made by each
  user). It is the only candidate that worked: 16 of 21 first tries as logged,
  16 of 17 after the tester excluded four deliberate limit tests (directional),
  felt intrusiveness "fine". The recommendation is unconditional, but it rests
  on one speaker on a laptop and its false-activation rate is unmeasured.
- **Offer an external trigger as an optional mode.** A server-to-browser push
  channel starts the listening state at once; the tester rated it fine and a
  nice option. It needs a server-side Home Assistant subscription with an
  admin token and an authenticated push path.
- **Keep hold-to-talk and typing always on** as fallbacks.
- **Avatar-initiated prompts** are allowed in three opt-in kinds (reminders,
  named events and alert rules, inferred intent), all off by default, with one
  silence list and a bounded listening window after a question.
- **Do not build a standing open microphone**, and do not adopt sherpa-onnx
  keyword spotting, openWakeWord, Porcupine, voice satellites or camera-based
  presence. Reasons are under [Historical analysis](#historical-analysis).
- **Sensor-reasoned activation is desk research only.** It has no task; see
  [Historical open items](#historical-open-items).

The ordered follow-up tasks are listed under
[Follow-up tasks](#follow-up-tasks).

## Historical scope

In: which activation modes Sodalis should offer on a tablet in a home room,
how they combine, and the listening-state UX. Out: implementing any mode,
changing hold-to-talk or typing, a formal user study, camera-based presence,
a standing open mic, and the alert catalogue (which alerts exist, thresholds,
urgency, who else is told). The alert catalogue belongs in a separate effort;
this evaluation fixes only the activation rules it must follow, and flags that
holding night-time alerts under quiet hours affects safety and must be revisited
there.

## Historical method and hardware

- **Target device:** a fixed tablet on a stand or wall, built-in microphone
  and speaker, sometimes handheld, Home Assistant sensors available. **No
  tablet was used.** All hands-on checks ran in a browser on the tester's
  laptop.
- **Evidence levels:** every claim is one of *desk research*, *hands-on on a
  laptop*, or *not measured*. There is one tester (the product owner), no trials
  and no sample-size targets. All thresholds are nominal.
- **Rubric ([T07](../../WAYFIND/interaction-modes/T07-evaluation-rubric.md)):**
  hard gates first, then ranking in criteria order, no weights.

  | Criterion | Gate | Target |
  | --- | --- | --- |
  | Privacy, tier 1 (never consentable) | no pre-activation audio written to disk; false-activation audio discarded at once; no covert listening; listening state always visible with a one-touch mute | n/a |
  | Privacy, tier 2 (consentable) | only with opt-in, plain-Dutch, revocable consent and a working alternative | none |
  | Eagerness | at most 0.25 false activations per waking hour (16 h, about 4 a day) | at most 0.06 per hour |
  | Missed activations | at least 80% of intended attempts succeed on the first try | at least 95% within one retry |

  Ranked only: privacy burden and felt intrusiveness, activation effort,
  activation latency (median 300 ms is a marker, not a gate), and power
  (reported only).
- **Hands-on check per prototype:** about 10 minutes of mixed TV, radio and
  conversation playback, about 20 intended Dutch attempts, then a 3-point felt
  intrusiveness rating. Prototypes live on throwaway branches (see
  [Artefacts](#artefacts)).
- **Research:** six desk-research tickets on throwaway branches, covering
  wake-word engines, open-mic limits on tablets, external triggers, sensor
  signals, privacy and consent, and prior art on false activations.

## Historical results

### Candidate modes

| Mode | Evidence | Result |
| --- | --- | --- |
| Wake word, sample-based (Rustpotter, own 10 samples) | hands-on on a laptop | 16 of 21 first tries as logged (76%), 16 of 17 after excluding 4 deliberate limit tests (94%, directional); 18 of 21 within one retry; 0 false activations logged but **no playback run**, so no rate; felt intrusiveness fine; latency about 2.7 s (upper-bound estimate, not a direct measure); CPU not read. |
| Wake word, sherpa-onnx keyword spotting (pretrained zh-en model) | hands-on on a laptop | "Hey Sodalis" never activated in over 40 tries; "Hey" about 5 of 20; "Hello" 14 of 20 at lowest sensitivity. Fails the first-try gate. A verdict on that model and token approach, not on keyword spotting in general. Eagerness and latency not measured. |
| External trigger over a server-to-browser push channel | hands-on on a laptop, mock Home Assistant source plus an on-screen stand-in | 2 of 2 first tries (far too few to rate the gate); 0 false activations; felt intrusiveness fine; stand-in 9–14 ms to the DOM; pushed-event latency not reliably measured (clock drift; an earlier automated run measured a median of 94 ms, single clock); no event arrived while the tab was hidden, no reconnect exercised. |
| Avatar-initiated prompts | desk research | Policy decided; not built or measured. |
| Sensor-reasoned intent | desk research | No live presence or door signal reaches the assistant today; prior art reaches about 70–80% accuracy; no study covers older adults. |
| Standing open mic with VAD | desk research | Ruled out by the product owner (see [Historical analysis](#historical-analysis)). |

### Listening-state UX

A prototype component with a chime, a card beside the avatar and a one-touch
mute was reviewed by the tester ([T08](../../WAYFIND/interaction-modes/T08-activation-and-listening-state-ux.md)).
The tester chose variant A, rated its feedback fine and found the chime helpful.
This is one person's hands-on reaction, not a usability study.

### Research findings used

- **Wake-word engines:** no engine publishes Dutch accuracy or browser power
  figures. Porcupine is browser-ready but proprietary and lacks Dutch.
  openWakeWord weights are non-commercial. microWakeWord, sherpa-onnx and
  hey-buddy are English-trained.
- **Open mic on a tablet:** the current speech code sets no echo constraints
  and has no wake lock. Wake locks drop when the page is hidden, Android 9+
  blocks background microphone access, the spec does not promise cancelling
  local playback, and OS microphone indicators are mandatory.
- **External triggers:** the repo has no inbound push path and the Home
  Assistant token is non-admin. Web Bluetooth is Chromium-only. Voice
  satellites send audio to Home Assistant, not Sodalis.
- **Privacy:** no text says whether a pre-activation buffer is GDPR
  "processing". Microphone use entirely inside the device is outside ePrivacy
  Art. 5(3) if nothing derived leaves it. Voice identification is biometric
  and needs explicit consent. Mistaken-activation audio should be deleted at
  once. A DPIA is "very likely" for older adults. No binding indicator or mute
  rule was found. This is not legal advice.
- **Prior art:** older-adult data are thin (one home study: 24.8% of turns
  had an error, 0.6% mis-triggers). Lab false-accept rates are about 0.03–0.95
  per hour. Mis-triggers draw a user reaction far more often than other errors.

## Historical analysis

- **Wake word wins** because it is the only mode that passed hands-on, keeps
  audio on the device before activation (tier 1), and needs 0 touches. Its cost
  is a one-time enrolment of about 10 recordings per user (an activation-effort
  cost, and a privacy item, since the recordings are voice data) and a
  latency of about 2.7 s, ranked only. Other household members enrol their own
  samples later. The reserve option microWakeWord is not mentioned as a
  fallback: it is English-trained and Sodalis is Dutch.
- **Why the rest are out.** A standing open mic is ruled out because the
  product owner does not want a microphone that treats any speech as a turn;
  bounded listening windows after an activation or a question remain. Porcupine
  is proprietary without Dutch, openWakeWord weights are non-commercial, and the
  pretrained sherpa-onnx model failed. Voice satellites route audio elsewhere,
  Web Bluetooth is Chromium-only, and camera presence costs more privacy than
  it gives.
- **External trigger is an option, not a default.** It is off until the
  administrator sets it up. It needs infrastructure the repo lacks, and real
  hardware, real Home Assistant events and a sleeping tablet were not tried.
- **How the modes combine
  ([T16](../../WAYFIND/interaction-modes/T16-how-activation-modes-combine.md)).**
  Hold-to-talk and typing always on. The wake word is on after enrolment (the
  enrolment is the opt-in). The external trigger, avatar prompts and the spoken
  acknowledgment stay off until switched on. One plain-Dutch "Activation"
  section in the companion settings, stored on the tablet, is open to anyone at
  the tablet; trigger setup and its status belong to the administrator.
  One touch mutes all hands-free listening until touched again, even across a
  restart, with a large "Microfoon uit, tik om aan te zetten". A blocked
  microphone shows a persistent banner and keeps typing available. There is no
  automatic detection of missed wake words. The existing voice barge-in is kept
  and the wake word is armed only when no turn is active. Activations during a
  pending confirmation are ignored.
- **Listening-state UX.** Hidden card while armed with a small readiness
  indicator; a chime and the card beside the avatar on activation; speech and
  reply as text with the one-touch mute; "Listening stopped" for four seconds,
  then the card hides.
- **Spoken acknowledgment
  ([T14](../../WAYFIND/interaction-modes/T14-spoken-activation-acknowledgment.md)).**
  The chime stays the default. An optional, off-by-default setting replaces it
  with the fixed Dutch sentence "Hallo, waarbij kan ik helpen?" for the wake
  word and external trigger only; the microphone opens after the sentence. If
  sound cannot play, only the visible card shows.
- **Avatar-initiated prompts
  ([T09](../../WAYFIND/interaction-modes/T09-avatar-initiated-prompt-policy.md)).**
  - Three opt-in kinds, all off by default: reminders and agenda items, named
    events and alert rules, and inferred intent to talk. Sodalis never starts
    greetings or check-ins on its own.
  - One silence list holds a prompt as a silent on-screen card during a
    conversation, a pending confirmation, mute, quiet hours (default
    22:00–08:00) and for 30 minutes after "Not now".
  - Chime, large card with captions, then spoken once. The microphone opens
    only after a question: 10 s to start, ended by end-of-speech, 60 s ceiling.
  - "Not now" or "niet nu" snoozes for 30 minutes; "Stop these" switches that
    kind off; three dismissals in a row trigger a silent note asking whether to
    keep it.
  - Inferred intent is capped at 3 a day, has a 2 h cooldown after a dismissal
    or no reply, auto-pauses after 2 misses, and stays off until a trial period
    with a real signal shows at most 0.25 false activations per waking hour.
  - A prompt never executes or pre-confirms a Home action; the existing
    exact-action confirmation is unchanged.

## Historical limitations

- **One tester, one laptop, one voice.** Other and older Dutch speakers,
  accents and changing voices are untested. The 94% figure is user-adjusted
  (raw 76%) and directional: with 21 attempts one miss moves the rate by about
  5 points, and the log does not mark which attempts were limit tests.
- **Eagerness is unmeasured for every mode.** No playback test was run for the
  wake word, so the 0.25 per hour gate is unverified. The recommendation is
  unconditional at the time because the product owner judged that a playback test cannot be
  run within this effort.
- **The external trigger result is thin:** two intended attempts, unreliable
  pushed-event latency, no real hardware, no sleeping or backgrounded tablet.
- **Rubric numbers are nominal.** There is no Dutch or older-adult data to
  anchor them.
- **The spoken acknowledgment was never heard**, not even in the UX prototype.
- **Prior-art numbers** come from lab and office studies; the research agents'
  summaries were read but their citations were not re-checked.
- **Privacy is not legal advice.** Whether the pre-activation buffer is GDPR
  processing is unsettled in the sources read.

## Historical open items

These are limitations of the abandoned evaluation, not a request to resume
wake-word trials or the deferred rollout. Future button work needs a new scope.

### Evidence gaps

- Playback false-activation rate of the wake word (the eagerness gate).
- Dutch from other and older speakers, other household members' enrolments,
  and drift of a changing voice.
- Direct wake-word latency on one clock; CPU, power and temperature.
- The pushed-event latency on one trustworthy clock, real hardware button and
  real Home Assistant event, behaviour while the tablet sleeps, is backgrounded
  or reconnects, and replay of events missed in an outage.
- How older adults cope with the settings screen and the enrolment step.
- Whether the spoken acknowledgment is acceptable, and its added delay on top
  of the wake-word latency.
- **Sensor-reasoned activation and inferred-intent prompts:** desk research
  only. No live presence or door signal reaches the assistant (the Home API filters
  out presence, `person` and `event`; the real adapter, 0038, is open), prior
  art reaches only about 70–80% accuracy, and nothing covers older adults.
  Future work, with no task now: a real presence signal, then a trial period
  (a stretch of real use long enough to count false activations per waking
  hour) that must stay at or below 0.25 false activations per waking hour
  before inferred-intent prompts may be switched on.
- Alert and notification catalogue: out of scope here, for a separate effort.

### Future research on a tablet

No tablet was available. When one is, measure the following on it, with the
tablet running in its real stand or wall position and the chosen browser or
kiosk, and record the figures here:

1. **Barge-in over the tablet speaker:** whether the microphone hears Sodalis's
   own voice at normal volumes, with and without the acknowledgment sentence,
   and whether talking over a reply stops it. Report the fraction of replies
   falsely interrupted by Sodalis's own speech and the time from speech start
   to visible interruption.
2. **Wake word on the tablet:** about 20 intended Dutch "Hey Sodalis" attempts
   at two distances and two noise levels (speaker silent and playing), plus
   10 minutes of mixed TV, radio and conversation playback; report first-try
   success, false activations per waking hour and activation latency on one
   clock.
3. **CPU, power and thermals** while armed for a full day on mains power:
   CPU %, temperature after one hour, and battery drain per hour when handheld.
4. **Microphone permission persistence** across page reload, app restart,
   reboot and kiosk or PWA launch, and whether a kiosk or MDM can hide the OS
   microphone indicator.
5. **Sleep and background behaviour:** screen off, tab hidden and lock-screen
   behaviour, whether a wake lock keeps the wake word armed, and how long it
   takes to recover.
6. **Audio autoplay:** whether a chime or spoken prompt plays without a prior
   touch in the chosen kiosk mode, and what the user sees if it does not.
7. **Push channel on the tablet:** an event delivered while the page is
   visible, hidden and asleep, and after a network drop.

Each follow-up task says that deploying the mode on a tablet requires these
measurements first; they are not separate tasks.

## Follow-up tasks

**Historical ordering only.** None of these tasks is ready for implementation.
See [ADR 0010](../adr/0010-button-activation-without-wake-word.md) and each task's
current disposition.

In order, each with behaviour tests under ADR 0006 and verified on a laptop:

1. [0085](../../TASKS/0085-activation-controller-and-listening-state.md)
   Activation controller and listening state.
2. [0086](../../TASKS/0086-wake-word-enrolment-and-activation-settings.md)
   Sample-based wake word, enrolment and the Activation settings section
   (needs 0085).
3. [0087](../../TASKS/0087-external-trigger-push-channel.md) Server-to-browser
   push channel and the administrator's trigger setup (needs 0085).
4. [0088](../../TASKS/0088-avatar-prompt-scheduler.md) Avatar-initiated prompt
   scheduler (needs 0085, 0086).
5. [0089](../../TASKS/0089-spoken-activation-acknowledgment.md) Optional spoken
   acknowledgment (needs 0086).
6. [0090](../../TASKS/0090-privacy-review-before-hands-free-rollout.md) Privacy
   review before hands-free listening is switched on for real users (blocks the
   real-user rollout of 0086).

Tasks 0086 and 0087 can run in parallel after 0085. The parent spec is
[0091](../../TASKS/0091-hands-free-activation-spec.md).

## Artefacts

Historical research/prototype inventory. Paths below describe the original
research artifacts, not supported product features. Cite by commit.

| Branch | Commit | Content |
| --- | --- | --- |
| `research/wake-word` | `c3da6b1` | `research/wake-word.md` |
| `research/open-mic` | `139935f` | `research/open-mic.md` |
| `research/external-triggers` | `451a6eb` | `research/external-triggers.md` |
| `research/sensor-intent` | `50b20ea` | `research/sensor-intent.md` |
| `research/privacy` | `467a163` | `research/privacy.md` |
| `research/prior-art` | `5ed25a9` | `research/prior-art.md` |
| `prototype/wake-word-samples` | `ac1cc34` | Rustpotter prototype and session log |
| `prototype/wake-word-sherpa` | `00c7fb5` | sherpa-onnx prototype |
| `prototype/external-trigger` | `4a2f3d8` | push-channel prototype |
| `prototype/activation-listening-state` | `b80014e` | listening-state UX prototype component |
