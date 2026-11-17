---
title: Browser wake-word options for a custom Dutch "Hey Sodalis"
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

Which on-device, browser-capable wake-word engines (for example openWakeWord,
Porcupine, microWakeWord, TensorFlow.js or ONNX/WASM models) can detect a
custom phrase such as "Hey Sodalis" with a Dutch speaker, running in a tablet
browser? For each: licence and cost (the repo is MIT and public), how a custom
keyword is trained, reported false-accept and false-reject rates, CPU and
battery cost when running continuously, model size, and latency from phrase
end to event. Surface facts only; the decision comes later.

## Resolution

Findings: branch `research/wake-word`, file `research/wake-word.md` (never merged). The agent's report was read, but the file itself was not re-checked.

- No engine publishes a false-accept or false-reject rate for Dutch, nor browser CPU, battery, or phrase-end latency on Android Chrome or iPadOS Safari.
- Porcupine is the only official browser (WASM) SDK, but Dutch is not among its 9 languages, custom phrases train in Picovoice's cloud, it needs an AccessKey with intermittent internet checks, its Terms are proprietary, and no personal or non-commercial plan exists.
- openWakeWord code is Apache-2.0, but the shipped pretrained weights are CC BY-NC-SA, the official trainer is English-only (Dutch Piper voice wiring, issue #170, is open), and there is no official browser port.
- microWakeWord (Apache-2.0, 52-60 KB models) and hey-buddy (Apache-2.0 trainer and browser runtime) train on English voices; microWakeWord has no browser port.
- sherpa-onnx KWS is open-vocabulary with a WASM build and 160/320 ms chunk latency, but pretrained models cover English and Chinese only.
- Vosk has a Dutch small model (39 MB, Apache-2.0) but is speech recognition with a phrase grammar. EfficientWord-Net and rustpotter need 3-10 recorded samples and have browser front ends, but publish no error rates.
- Gaps: Dutch accuracy and browser power must be measured by us; this feeds the prototype and measurement fog in the map.
