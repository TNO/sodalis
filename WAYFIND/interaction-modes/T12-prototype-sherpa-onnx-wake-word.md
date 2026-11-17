---
title: Prototype sherpa-onnx keyword spotting for "Hey Sodalis"
label: wayfinder:prototype
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

How does sherpa-onnx open-vocabulary keyword spotting (WASM build) behave for
"Hey Sodalis" in Dutch, where the pretrained models cover English and Chinese
only and the keyword is given as a phonetic token sequence? Build a throwaway
prototype in the laptop browser with a visible and audible listening state on
detection, then run the rubric's short hands-on check and record false
activations, first-try successes, activation latency (chunk latency is 160 or
320 ms), and CPU. Branch: `prototype/wake-word-sherpa` (pushed, never
merged). Link the prototype as an asset.

## Prototype built (awaiting hands-on check)

- Asset: branch `prototype/wake-word-sherpa` (pushed, never merged), `prototypes/wake-word-sherpa/`.
- Model: sherpa-onnx Zipformer zh-en 3M (Apache-2.0), runtime Apache-2.0. Keyword tokens `HH EY1 S OW0 D AA1 L IH0 S @HEY_SODALIS`, derived with `text2token --tokens-type phone+ppinyin`; the `SODALIS` entry is an approximate custom lexicon entry.
- Run: `./setup.sh && ./fetch-assets.sh && ./serve.sh` in the prototype directory, then open `http://127.0.0.1:4173`.
- Verified by the agent: WASM and model initialisation, token derivation, asset fetches. Not verified: microphone and acoustic detection; Dutch accuracy is unmeasured (the model is English and Chinese).
- Still to do: the user's hands-on check, then record the results here and close.

## Resolution

Evidence level: the user's own hands-on trial on the laptop browser (own voice, microphone), several keyword variants on the same pretrained zh-en streaming model, in the prototype's page. Counts are the user's report, not an exported log. Debugging found no error: the audio path and detector run, the model simply does not detect the keyword reliably. No false-activation playback test was run and latency was not measured.

| Keyword tried | First-try result | Rubric |
|---|---|---|
| "Hey Sodalis" (Dutch and English pronunciation) | 0 activations in over 40 attempts | gate: at least 80% first-try |
| "Hey" | about 5 of 20 (about 25%) | gate: at least 80% |
| "Hello", lowest sensitivity setting | 14 of 20 (70%) | gate: at least 80% |

### Decision

sherpa-onnx open-vocabulary keyword spotting with the pretrained zh-en model fails the missed-activation gate in this form and is dropped as a candidate for "Hey Sodalis". Even a common English word only reaches 70% first-try, and the target phrase never fires. Likely contributors, not isolated by this run: the model is English and Chinese only; "Sodalis" was an approximate phone-token entry; keyword boost and threshold were hand-tuned only. The prototype does not show whether a model trained on the actual keyword would work, so this is a verdict on this model and token approach, not on keyword spotting in general. Eagerness (false activations) and activation latency were not measured. The branch `prototype/wake-word-sherpa` stays as the record.
