---
title: Sodalis interaction modes beyond push-to-talk
label: wayfinder:map
---

## Destination

A decision document in `docs/evaluations/interaction-modes.md` (following that
folder's README) that recommends which hands-free activation modes Sodalis
should implement on a tablet, plus a short ordered list of follow-up
implementation tasks for `TASKS/`. The map plans and decides; it implements
nothing in the product.

## Notes

- Target device: a fixed tablet on a stand or wall in a home room, used by an
  older adult, running in a browser or kiosk with a built-in microphone and
  speaker, sometimes handheld. Smart-home setting (Home Assistant sensors
  exist in the harness and simulator).
- Today: hold-to-talk button in `AvatarConversationCard.ts`; browser VAD and
  barge-in exist in `packages/speech` (`SpeechInputController`,
  `voiceActivity`) but the mic only starts on the button. Hold-to-talk and
  typing stay as fallbacks.
- Candidate modes: wake word (for example "Hey Sodalis"), always-on open mic
  with VAD and barge-in (since ruled out, see Out of scope), proactive avatar-initiated prompts followed by an
  open-mic window, physical or external triggers (hardware button, smart
  speaker, remote), and sensor-reasoned intent to talk.
- Criteria, in order: privacy; false and missed activations (including
  **eagerness**: activating too often irritates); accessibility, where
  **ease of activation** matters most (few steps, few missed activations);
  latency. See `GLOSSARY.md`.
- Method: desk research, cheap prototypes, and a short hands-on check by the
  user alone. No formal user study and no trials. Scoring follows the rubric in
  [T07](T07-evaluation-rubric.md).
- Local-first: prefer on-device processing; audio must not leave the device
  before activation. Cloud runs need explicit consent per `AGENTS.md`.
- Consult `PRODUCT.md` (older adults, clear microphone/listening state) and
  the rule in `AGENTS.md` that final evaluation analysis goes in
  `docs/evaluations/`.
- Tracker: local markdown, see [WAYFIND/README.md](../README.md).

## Decisions so far

<!-- one line per closed ticket: [title](link): gist -->

- [Follow-up task list and how the open items appear in the decision document](T17-follow-up-task-list-and-open-items.md): six ordered tasks (activation controller and listening state; wake word with enrolment and settings; push channel and administrator trigger setup; prompt scheduler; optional spoken acknowledgment; privacy review before real-user rollout); sensor-reasoned activation has no task and is an evidence gap plus future work (presence signal, trial period); tablet unknowns are evidence gaps with a "Future research on a tablet" list; keep the nine branches cited by SHA, move the T08 prototype to its own branch, commit `WAYFIND/` and `GLOSSARY.md`.
- [How activation modes combine, default and fall back](T16-how-activation-modes-combine.md): hold-to-talk and typing always on; the wake word on after enrolment; the external trigger, avatar prompts and spoken acknowledgment off until switched on; one "Activation" settings section on the tablet for anyone there, trigger setup by the administrator; one-touch mute stops hands-free listening until touched again; a blocked microphone shows a banner and typing; no auto-detection of wake-word misses; the trigger-channel status is for the administrator only; the existing voice barge-in is kept and the wake word is armed only when idle.
- [Should hands-free activation include a spoken acknowledgment?](T14-spoken-activation-acknowledgment.md): the chime stays the default; a spoken sentence is an optional setting, off by default, switched on by the user or a helper; wake word and external trigger only; fixed Dutch "Hallo, waarbij kan ik helpen?" replaces the chime when on; the microphone opens after the sentence, and if sound cannot play only the visible card shows; the spoken variant is an untested evidence gap.
- [Which wake-word route to recommend](T15-wake-word-route.md): recommend the sample-based wake word (Rustpotter, keyword from the user's own 10 recordings, one-time enrolment at application start, later household members can enrol their own) unconditionally; no reserve option (microWakeWord is English-trained); latency ranked-only; the playback false-activation rate, other and older Dutch speakers, direct latency, power and tablet behaviour are listed as evidence gaps, not tasks.
- [Activation and listening-state UX on the tablet](T08-activation-and-listening-state-ux.md): variant A keeps the card hidden while armed, then chimes into listening beside the avatar, shows speech and reply text with one-touch mute, and auto-hides four seconds after stopping.
- [Policy for avatar-initiated prompts](T09-avatar-initiated-prompt-policy.md): three opt-in kinds (reminders, named events/alert rules, inferred intent), all off by default, one silence list, a window only after a question (10 s to start, ends on end-of-speech, 60 s ceiling), "Not now"/"Stop these"/auto-pause, inferred intent capped at 3 a day and off until a soak passes, Home confirmations unchanged; alert catalogue and signal choice moved out of scope.
- [Prototype an external trigger over a server-to-browser push channel](T13-prototype-external-trigger-push-channel.md): a pushed event or on-screen stand-in starts the visible and audible listening state immediately (stand-in 9-14 ms DOM), felt intrusiveness fine, no false activations; only 2 intended attempts, pushed-event latency not reliably measured (clock drift in the log); needs a server-side HA subscription with an admin token and a new authenticated push path; the user sees it as a nice option and expects a real button to feel smooth. Branch `prototype/external-trigger`.
- [Prototype sherpa-onnx keyword spotting for "Hey Sodalis"](T12-prototype-sherpa-onnx-wake-word.md): fails the first-try gate with the pretrained zh-en model: "Hey Sodalis" never activated in over 40 tries, "Hey" about 5 of 20, "Hello" 14 of 20 at lowest sensitivity; no error found, the model and approximate Dutch tokens are insufficient; eagerness and latency not measured. Branch `prototype/wake-word-sherpa`.
- [Prototype sample-based wake word for "Hey Sodalis"](T11-prototype-sample-based-wake-word.md): Rustpotter with the user's own 10 samples on the laptop: 16 of 21 first tries (94% of 17 after excluding 4 deliberate limit tests, directional only), felt intrusiveness fine, latency about 2.7 s (upper-bound estimate); eagerness not measured (no playback run). Branch `prototype/wake-word-samples`.
- [Shortlist of activation modes to prototype and measure](T10-shortlist-modes-to-prototype.md): prototype a sample-based wake word, sherpa-onnx keyword spotting, and a push-channel external trigger on the laptop browser; sensor-reasoned and avatar-initiated are desk research only; standing open mic, openWakeWord, Porcupine, voice satellites, and Web-Bluetooth-first are ruled out; tablet-only unknowns stay unmeasured.

- [Evaluation rubric, eagerness, missed activations, activation effort and privacy](T07-evaluation-rubric.md): hard gates (privacy tier 1, eagerness at most 0.25 false activations per waking hour, at least 80% first-try success), then ranking in criteria order; privacy tier 2 is consentable but penalised; effort and latency ranked only; evidence is the user's own short hands-on check, numbers nominal.
- [Sensor signals that hint the user wants to talk](T04-sensor-signals-for-intent-to-talk.md): no live presence/door signals reach the assistant today; Home Assistant could supply them, prior-art accuracy is only about 70-80%, and nothing covers older adults. Findings on `research/sensor-intent`.
- [External triggers in a smart home, buttons, satellites and Home Assistant events](T03-external-triggers-smart-home.md): the repo has no inbound push path to the browser and the HA token is non-admin; a button needs a new push channel, Web Bluetooth is Chromium-only, and voice satellites route audio to Home Assistant, not Sodalis. Findings on `research/external-triggers`.
- [Browser wake-word options for a custom Dutch "Hey Sodalis"](T01-browser-wake-word-options.md): no engine publishes Dutch accuracy or browser power figures; Porcupine is browser-ready but proprietary and lacks Dutch, openWakeWord weights are non-commercial, and open options (microWakeWord, sherpa-onnx, hey-buddy) are English-trained, so we must measure Dutch ourselves. Findings on `research/wake-word`.
- [Prior art on false activations and activation effort for older adults](T06-prior-art-false-activations-older-adults.md): older-adult data are thin (one home study: 24.8% of turns had an error, 0.6% mis-triggers); device false-accept rates are about 0.03-0.95 per hour in lab studies; mis-triggers draw reactions far more than other errors; no Dutch or age-split wake-word data. Findings on `research/prior-art`.
- [Always-on open mic on a tablet browser, echo, permissions and sleep limits](T02-open-mic-tablet-browser-limits.md): the current speech code has no echo constraints, worklet, or wake lock; wake locks drop when hidden, Android 9+ blocks background mic, the spec doesn't promise cancelling local playback so barge-in must be measured on the tablet, and OS mic indicators are mandatory. Findings on `research/open-mic`.
- [Privacy and consent for always-listening in a home for older adults](T05-privacy-and-consent-always-listening.md): no text says whether the pre-activation buffer is GDPR processing, purely on-device mic use is outside ePrivacy Art 5(3) if nothing leaves, voice identification needs explicit consent, mistaken-activation audio should be deleted at once, a DPIA is very likely needed for older adults, and no binding indicator/mute rule was found. Findings on `research/privacy`.

## Not yet specified

Nothing: the way is clear. The hand-off is written: the decision document
[`docs/evaluations/interaction-modes.md`](../../docs/evaluations/interaction-modes.md)
and the follow-up tasks 0085-0090 in `TASKS/`.

## Out of scope

- The alert and proactive-notification catalogue (CO2, stove, smoke, fall,
  medication, thresholds, urgency, escalation, who else is told) and which
  inferred signals qualify for an inferred-intent prompt: they concern what
  Sodalis tells the user, not how it is activated. Belongs in a separate
  Wayfind map; [T09](T09-avatar-initiated-prompt-policy.md) fixes only the
  activation rules that map must follow, and flags that night-time alerts
  held by quiet hours need revisiting there.

- Camera-based presence or gaze attention: privacy and consent cost for
  older adults outweigh the benefit for this effort.
- A formal user study with older adults.
- A standing open mic with VAD: the user does not want an always-on mic that
  treats any speech as a possible turn. Bounded listening windows after an
  activation or avatar prompt remain in scope.
- Implementing any chosen mode in the product.
- Changing hold-to-talk or typing, which remain the fallbacks.
