---
title: Which wake-word route to recommend
label: wayfinder:grilling
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

> Superseded recommendation. No wake-word route is selected or in scope,
> including the sample-based approach recommended below. See
> [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

The sample-based wake word met the first-try bar on the laptop (directional, n=17 to 21) and the sherpa-onnx prototype with the pretrained zh-en model did not. Which route does the decision document recommend for a Dutch "Hey Sodalis" wake word: sample-based only, the reserve option (microWakeWord, a model trained on the actual keyword, English-trained today, no browser port), or something else? Weigh it against the rubric ([T07](T07-evaluation-rubric.md)): privacy tier 1, eagerness, missed activations, effort, latency.

Inputs: [T01](T01-browser-wake-word-options.md), [T11](T11-prototype-sample-based-wake-word.md), [T12](T12-prototype-sherpa-onnx-wake-word.md). Known gaps to state plainly in the answer: no playback false-activation rate, latency only estimated (about 2.7 s), Dutch generalisation to other speakers and older voices untested, no tablet measurements. Decide also whether the follow-up work should include a soak or a trained-model experiment before any product implementation.

## Resolution

Decided with the user in one grilling round, judged against the rubric ([T07](T07-evaluation-rubric.md)) and the evidence in [T01](T01-browser-wake-word-options.md), [T11](T11-prototype-sample-based-wake-word.md) and [T12](T12-prototype-sherpa-onnx-wake-word.md). Desk decision: nothing new was built or measured.

**Recommendation.** The decision document recommends a sample-based wake word (Rustpotter, Apache-2.0, on-device in the browser, keyword built from the user's own recordings of "Hey Sodalis") as the wake-word route. It is the only candidate that worked: 16 of 17 first tries after the user's limit-test exclusion, directional (76% raw), felt intrusiveness fine. The recommendation is unconditional; the user's reason is that a playback false-activation test cannot be run within this wayfind effort.

**Ruled out as routes.** sherpa-onnx with the pretrained zh-en model (failed, T12), openWakeWord (non-commercial weights), Porcupine (proprietary, no Dutch). The reserve option (microWakeWord, a model trained on the keyword) is dropped and not mentioned as a fallback: it is English-trained and Sodalis is Dutch.

**Enrolment.** The keyword needs about 10 samples recorded in the voice of each user. Enrolment is a one-time step when the application starts. The design should let further household members enrol their own 10 samples later and call Sodalis. The one-time recording is an activation-effort cost to list in the decision document. Whether it works across household members and changing voices is an evidence gap.

**Latency.** Ranked only, not a blocker (rubric). The measured figure is an estimate of about 2.7 s, an upper bound.

**Evidence gaps, to be listed in the decision document as known gaps, not as follow-up tasks (the user's choice):** the playback false-activation rate (eagerness gate unmeasured), Dutch from other and older speakers, a direct latency measurement, CPU and power, and anything on the tablet. The recommendation therefore rests on one user's short hands-on check on a laptop.
