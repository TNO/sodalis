---
title: Prototype sample-based wake word for "Hey Sodalis"
label: wayfinder:prototype
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

> Historical prototype, not a feature to merge. Wake-word work is out of scope
> under [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

How does a sample-based browser wake-word engine (rustpotter or
EfficientWord-Net, whichever runs in the browser with least effort) behave for
"Hey Sodalis" in Dutch, recorded from the user's own voice? Build a throwaway
prototype in the laptop browser that shows a visible and audible listening
state on detection, then run the rubric's short hands-on check (about 10
minutes of mixed TV, radio and conversation playback, about 20 intended Dutch
attempts, felt-intrusiveness rating) and record false activations, first-try
successes, activation latency, and CPU. Branch: `prototype/wake-word-samples`
(pushed, never merged). Link the prototype as an asset.

## Prototype built (awaiting hands-on check)

- Asset: branch `prototype/wake-word-samples` (`ac1cc34`, pushed, never merged), `prototypes/wake-word-samples/`.
- Engine: Rustpotter (browser WASM and worklet, Apache-2.0), keyword built from the user's own 3-10 samples, no pretrained weights.
- Run: `npm install && npm run dev` in the prototype directory. The README holds the hands-on protocol.
- Verified by the agent: build, local page and assets, WASM reference generation with synthetic samples. Not verified: microphone, Dutch accuracy, CPU, tablet; latency is approximate.
- Still to do: the user's hands-on check, then record the results here and close.

## Resolution

Evidence level: user's own run on the laptop browser, own voice, 10 samples, Rustpotter, two listening sessions (15:13-15:18 and 15:22-15:24 UTC, exported 15:24). Session log kept by the user.

| Measure | Result | Rubric |
|---|---|---|
| Intended attempts | 21 | about 20 |
| First-try success | 16 of 21 (76%) | gate: at least 80% |
| Success within one retry | 18 of 21 (86%); attempts 3, 4 and 17 were marked missed with no retry logged | target: 95% within one retry |
| Red flag (5 or more of 20 first tries failing) | 5 of the first 20 attempts failed | fails the gate unless explained |
| False activations | 0 logged, but no background playback was run, so no rate | at most 0.25 per waking hour |
| Felt intrusiveness | fine (best point of the scale) | 3-point scale |
| Activation latency | 2.27-2.88 s (median about 2.67 s), estimated from the end of the last voice energy, so an upper bound that includes the user's trailing silence; not a direct measure | ranked only |
| CPU | not read; main-thread timer delay averaged 0.62-0.73 ms | reported only |

Caveats: in the first session 8 detections (numbers 5-8 and 10-13) carry no attempt label and were not marked false; they are excluded from the rates above. The 10-minute mixed TV, radio and conversation playback was not run, so the eagerness gate is unmeasured for this mode. Dutch only: the keyword was recorded in the user's own voice; accents and other speakers are untested.

### Decision

Raw numbers stay as logged. On the user's explanation, the first-try gate counts as met, not failed: 4 of the 5 failed first tries were deliberate limit tests (the user varied tone on purpose) and only 1 was a genuine miss; excluding the 4, first-try success is 16 of 17 (94%). The explanation is the user's recollection; the log does not mark which attempts were limit tests, and with 21 attempts a single miss swings the rate by about 5 points, so this is directional, not a measured rate. Eagerness is not measured (no playback run), so this mode has no false-activation rate yet; the soak follow-up on the map covers it. Latency of about 2.7 s is an upper bound from the log's estimate and needs a direct measurement before it counts. Rustpotter with the user's own 10 samples is viable on first-try success and felt intrusiveness (fine) on the laptop; its Dutch generalisation to other speakers is untested.
