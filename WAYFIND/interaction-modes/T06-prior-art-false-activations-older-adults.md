---
title: Prior art on false activations and activation effort for older adults
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

What does published research and industry evidence say about how older adults
activate voice assistants and where it goes wrong: rates and causes of false
activations and missed activations, how users react to over-eager devices
(irritation, switching off), how wake-word phrase choice, speech
characteristics, and hearing or speech changes affect activation, and which
metrics and test methods studies use (false accepts per hour, false-reject
rate, steps to activate, time to first response). Surface facts and usable
metrics only; the decision comes later.

## Resolution

Findings: branch `research/prior-art`, file `research/prior-art.md` (never merged). Numbers in the file are tagged as verified in source, computed, or secondary.

- Older-adult activation data are thin. The best source is Mahmood 2024: a month in 15 older adults' homes, 2,552 turns, 24.8% with an error; activation-related errors were wrong wake word 1.9%, "not listened" 2.7%, partial listening 1.1%, mis-trigger 0.6%.
- Device misactivation rates come from lab studies with TV and news playback, not older adults: about 0.03 to 0.63 per hour across commercial speakers (computed from Schönherr 2020), up to 0.95 per hour (Dubois 2020). Causes: similar-sounding words, rare names, foreign speech.
- Mis-triggers drew a user reaction 40% of the time, against 14.3% for other errors; privacy unease is reported. No verified data on users muting or switching devices off.
- Standard metrics: false accepts per hour and false-reject rate at a fixed threshold, plus trade-off curves. The file has a metrics table and test methods.
- Gaps: no false-accept or false-reject rates by age group, no Dutch wake-word evidence, no standard definition of "steps to activate" or "time to first response", no data on open-mic or external-trigger activation in older adults.
