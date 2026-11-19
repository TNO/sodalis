---
title: Shortlist of activation modes to prototype and measure
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: [T07-evaluation-rubric.md]
---

## Question

> Historical shortlist. Do not resume wake-word prototyping or the deferred
> rollout from this ticket. Keep the current UI unchanged. See
> [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

Given the research (no published Dutch wake-word accuracy, proprietary or
non-commercial licences on the browser-ready engines, no push path from the
server to an idle browser, unproven barge-in over the tablet's own speaker,
privacy and consent constraints), which activation modes and which engine
candidates are worth a prototype and a measurement, and which can already be
ruled out or deferred? Decide the shortlist and what each prototype must
measure against the rubric.

Rubric note (T07): each prototype's short hands-on check is about 10 minutes of playback plus about 20 intended Dutch attempts; report evidence level per cell. Gates and thresholds are in the T07 resolution.

## Resolution

Decided with the user in two rounds, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the research tickets.

**Prototype (each with the rubric's short hands-on check, run by the user in the browser on the laptop):**
- Wake word, sample-based engine (rustpotter or EfficientWord-Net): the user records 3-10 samples of "Hey Sodalis". Fully local, no Dutch training data needed.
- Wake word, sherpa-onnx open-vocabulary keyword spotting (WASM, no training).
- External trigger: only the missing piece, a server-to-browser push channel driven by the simulator's demo button event (HA demo `event` entity, class `button`), with an on-screen stand-in for the physical button. Real hardware is a follow-up.
- The phrase stays "Hey Sodalis".

**Reserve list:** microWakeWord (Apache-2.0 code and weights, English-trained, no browser port); used only if both prototypes fail.

**Desk research only (no prototype):** sensor-reasoned activation and avatar-initiated prompts. They are not modes with their own trigger; they decide when to arm or open another mode, and are settled in [T09](T09-avatar-initiated-prompt-policy.md) and the mode-combination fog.

**Ruled out:**
- Standing open mic with VAD: the user does not want a mic that is always on and treating any speech as a possible turn. A bounded listening window after an activation or an avatar prompt is not ruled out (decided in T09).
- openWakeWord: its pretrained weights are non-commercial, so it is not used even for testing.
- Porcupine (proprietary, no Dutch, cloud training, internet checks), Vosk, Snowboy, Precise, Whisper, and the Web Speech API.
- Voice satellites (audio goes to Home Assistant, not Sodalis) and Web Bluetooth as the primary route (Chromium-only).

**Test platform:** browser on the user's laptop, "as we have always done". Tablet-only unknowns (barge-in over the tablet speaker, tablet power and thermals, microphone permission persistence, sleep and background rules from [T02](T02-open-mic-tablet-browser-limits.md)) stay unmeasured here and are recorded as such in the comparison, so every affected cell states its evidence level as "laptop" or "not measured".

**Prototype home:** one throwaway `prototype/<name>` branch per prototype, pushed, never merged.
