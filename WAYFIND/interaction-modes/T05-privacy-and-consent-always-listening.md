---
title: Privacy and consent for always-listening in a home for older adults
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

> Historical privacy research, not legal approval. Local processing does not
> settle perceived intrusion or disclosure after a false detection. Wake-word
> work is now out of scope under
> [ADR 0010](../../docs/adr/0010-button-activation-without-wake-word.md).

What do GDPR and EU guidance, and established practice (for example how Home
Assistant voice, Apple, Google, and Amazon handle wake-word listening), say
about always-listening devices in a home: what counts as processing before
activation, whether on-device wake-word or VAD buffering avoids personal-data
processing, consent for household members and visitors, requirements for a
visible listening indicator and a hardware or software mute, retention of
pre-activation audio, and added care for older adults or people with reduced
capacity. Surface facts only; this is not legal advice and the decision comes
later.

## Resolution

Findings: branch `research/privacy`, file `research/privacy.md` (never merged). Facts only, not legal advice. The agent's summary was read; the file and its citations were not re-checked.

- Pre-activation: EDPB Guidelines 02/2021 describe local wake-word detection with a few-second buffer but never say whether that buffer counts as GDPR "processing". No EDPB, AP, or CJEU text does.
- ePrivacy: EDPB Guidelines 2/2023 say microphone use that stays entirely inside the device is not "gaining access" under Art 5(3), provided nothing derived from it leaves the device.
- Household exemption does not cover those who provide the means (CJEU reads it narrowly).
- Consent: voice identification is biometric (Art 9) and needs explicit consent plus an alternative method; speaker recognition also processes housemates' and visitors' voices; an accidental activation is "highly unlikely" to count as consent.
- Indicator and mute: the EDPB only recommends visible state signals; no binding indicator or mute rule was found in the GDPR, ePrivacy, Telecommunicatiewet, or Radio Equipment Directive. The W3C Media Capture spec requires the browser to indicate mic capture.
- Retention: recordings from a mistaken activation should be "immediately deleted". Home Assistant's debug recording keeps everything heard while waiting, with no deletion.
- Older adults: EDPB names elderly people and says a DPIA is "very likely" needed; UAVG art. 5(2) moves consent to the legal representative under curatele, bewind, or mentorschap; AI Act Art 5(1)(b) bans exploiting age-based vulnerabilities.
- Gaps and disagreements: Alexa, Apple, and Google hardware-mute claims are unverified; EDPB says wake-word detection is "exclusively local" but Home Assistant's default streams audio to the server before detection; no text addresses open-source software run on the user's own device.
