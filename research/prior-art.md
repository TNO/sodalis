# Prior art: how older adults activate voice assistants, and where it goes wrong

Retrieved 2026-11-13. Facts only; no recommendations.
Legend: **[V]** number/claim read in the primary source text. **[C]** computed by me from [V] numbers. **[S]** secondary (reported by a source that cites another) or abstract-only. Anything not marked was not verified and is omitted.

## Summary

- Older-adult-specific activation data are thin: one in-home field study with audio capture (Mahmood 2024, 15 homes, 2,552 turns) and several small qualitative studies. Wake-word FAR/FRR broken down by age were not found.
- Device-level misactivation rates come from non-older-adult lab studies (TV/news playback): roughly 0.03–0.63 per hour across commercial speakers [C], up to 0.95/h in the worst case reported.
- Reported user reactions to unintended activation are privacy unease and surprise; verified "switched it off" figures were not found.
- Standard wake-word metrics are false accepts per hour (FAH) and false-reject rate (FRR) at a fixed operating threshold, plus DET/FRR-vs-FAR curves. Apple and Snips publish methodology; Google and Amazon do not (in what I could read).
- Aging-voice and Dutch evidence found concerns ASR, not wake-word detection.

## 1. False and missed activations: rates and causes

- **Commercial speakers, accidental triggers (Schönherr et al., 2020, "Unacceptable, where is my privacy? Exploring Accidental Triggers of Smart Speakers", https://arxiv.org/abs/2008.00508).**
  - 11 speakers, 8 manufacturers; each played 13 datasets of 24 h (TV shows, news, LibriSpeech, Common Voice, WSJ, CHiME) [V].
  - English counts over the 13 datasets: Alexa 99, Computer 77, Amazon 57, Echo 43, OK Google 16, HomePod/Hey Siri 8, Cortana 197 [V, prose]. The table's "Sum" row differs slightly (e.g. Google 23, Amazon 67, Alexa 100) [V]. Per hour ≈ 0.03 (HomePod) to 0.63 (Cortana) over 312 h [C].
  - Causes: similar-sounding words ("a lesson" → Alexa, "commuter" → Computer, "OK, cool" → OK Google, "a city" → Hey Siri), rare proper names, foreign/gibberish speech; 2 non-speech triggers (ringing phone, car horn) [V]. Noise dataset (MUSAN): zero triggers [V].
  - For Alexa the cloud verifier also misrecognises about half of local triggers; for Cortana only 8 of 197 passed cloud verification [V]. A rejected Echo trigger still uploads ≥1–2 s of audio; an accepted false trigger can upload ≥10 s [V].
  - About 75% of Amazon/Google triggers replayed 10× reproduced ≥4 times; Apple and Microsoft triggers were less reproducible [V].
  - No noticeable male/female difference [V]. German: "Computer" triggered less in German (1) than English (9) in the same episode; German "Am Sonntag" resembles "Amazon" [V].
- **Smart-speaker misactivations (Dubois et al., 2020, "When Speakers Are All Ears: Characterizing Misactivations of IoT Smart Speakers", PoPETs 2020(4), https://petsymposium.org/popets/2020/popets-2020-0072.pdf).**
  - 7 speakers, 12 TV shows, 134 h, US and UK, repeated (536 h total) [V].
  - Up to 0.95 misactivations/hour, or 1.43 per 10,000 words spoken [V].
  - Most misactivations are not repeatable (typically detected in <25% of runs); for the four most repeatable devices 13.5–20.7% are ≥75% repeatable [V].
  - Duration: median 5 s, P75 7 s, P90 8–10 s depending on device; some devices have 10% of misactivations ≥10 s [V].
- **Older adults at home (Mahmood, Wang & Huang, 2024, "Situated Understanding of Errors in Older Adults' Interactions with Voice Assistants: A Month-Long, In-Home Study", https://arxiv.org/abs/2403.02421).**
  - 15 Echo Dot deployments, 4 weeks, ages 66–94 in the rows read, audio recorder triggered by the LED ring; 2,552 query–response turns, 20 h 40 min [V]. Follow-up mode and adaptive listening were switched on [V].
  - 24.76% of turns had an error (632/2552); only 25.47% were resolved on the next attempt [V].
  - Activation-related counts [V] (share of turns [C]): wrong wake word 49 (1.9%); "not listened" 69 (2.7%); partially listened 29 (1.1%); mis-trigger (Alexa activated unintended) 15 (0.6%). Participants said "Alexis" for "Alexa" [V].
  - Next-try resolution rate: wrong wake word 30.6%, not listened 36.2%, mis-trigger 6.7% [V].
- **First-time older users (Kim, 2021, "Exploring How Older Adults Use a Smart Speaker–Based Voice Assistant in Their First Interactions", JMIR mHealth uHealth, https://pmc.ncbi.nlm.nih.gov/articles/PMC7840274/).**
  - 18 participants aged 74–91 (mean 79), Amazon Echo [V].
  - Non-activation reported when no pause followed the wake word or it was not clearly pronounced; long, rambling commands made the assistant fall back to idle mid-sentence while the user did not notice [V]. Quoted case: "Alaska" for "Alexa" [V].
- **Owner survey (Malkin et al., 2019, "Privacy Attitudes of Smart Speaker Users", PoPETs 2019(4), https://petsymposium.org/popets/2019/popets-2019-0068.pdf).**
  - 116 Amazon/Google owners. Of reviewed recordings: 1.72% TV/radio/music, 2.93% noise, 6.33% "not addressing the device"; over 10% unintentional [V]. Median age of sample 34 [V], so not older adults.
- **Apple (Siri Team, 2017, "Hey Siri: An On-device DNN-powered Voice Trigger", https://machinelearning.apple.com/research/hey-siri; and 2023 "Voice Trigger System for Siri", https://machinelearning.apple.com/research/voice-trigger).**
  - Unintended activations occur when the user says a similar phrase ("seriously"), others say the keyword, or others say a similar phrase [V].
  - Second-chance mechanism: a score between a lower and the normal threshold makes the detector more sensitive for a few seconds so a repeat succeeds [V].
  - Apple states FAR targets as low as one per week need thousands of hours of negative audio [V].

## 2. Reactions to over-eager devices

- Mahmood 2024 (above): mis-triggers elicited a verbal/behavioural reaction in 40% of cases, versus 14.3% for VA errors overall and 6.7% for human errors [V]. Across all errors: negations 27, interruptions 21, negative comments 10, laughter 14, thanks 6 [V].
- Malkin 2019: 28.3% of owners reported privacy concerns, "frequently caused by accidental activations", e.g. "the speaker would activate without me saying the wake word. This was a bit odd and it did leave me a bit uneasy" (P28) [V].
- Kim 2021: privacy/security was the biggest concern among older novices, including the always-listening ability and a misperception that personal data are stored [V]. Frustration arose when users spoke a long command and only then realised the device had not activated [V].
- Mills et al. (2026, Parkinson's disease voice-assistant co-design, https://pmc.ncbi.nlm.nih.gov/articles/PMC12917486/): reported frustration at repeating, devices timing out before speech finished, and privacy concerns about the "listening nature" [V, in background text].
- Not found: measured rates of users muting/unplugging after false activations, or annoyance scales for false wake-ups in older adults.

## 3. Wake-word phrase, speech characteristics, hearing and speech changes

- **Phrase choice.** Vendor guidance (not measured study): Picovoice advises ≥6 phonemes ("OK Google" 8, "Alexa" 6), diverse phonemes, and a prefix ("Hey"/"OK") on short words (https://picovoice.ai/docs/tips/choosing-a-wake-word/) [V, heuristic]. Schönherr 2020 shows single common words ("Computer", "Amazon") fire more on ordinary speech than "OK Google"/"Hey Siri" [V, counts above]. Apple models a short pause ("Hey, Siri") and language-specific phrases (French "Dis Siri") [V]. "Hey Snips" training data were recorded with no pause between words [V] (Coucke et al., 2018, https://arxiv.org/abs/1811.07684).
- **Aging voices.** Vipperla, Renals & Frankel (2010, "Ageing Voices: The Effect of Changes in Voice Parameters on ASR Performance", EURASIP JASMP, https://asmp-eurasipjournals.springeropen.com/articles/10.1155/2010/525783): ASR word error rate about 10% absolute higher for older than adult voices [V]. Older male F0 about 15 Hz (10%) lower; artificially added jitter/shimmer did not change ASR significantly; lowered F0 degrades ASR marginally, mitigated by VTLN [V]. Caveats: male US Supreme Court speech; "adult" group mean age 44.3 [V]. ASR, not wake-word.
- **Dutch older adults (van Dijk et al., 2025, "Out of the Box, into the Clinic? Evaluating State-of-the-Art ASR for Clinical Applications for Older Adults", https://arxiv.org/abs/2508.08684).** 10 Dutch adults ≥65, 199 segments (mean 3.4 s) from a geriatric chatbot: Whisper-large-v3 WER .12 (orthographic) and .06 (normalised); Common Voice .04/.03; a model fine-tuned on older Dutch speech scored worse (.40 orthographic, .14 normalised) [V]. ASR, not wake-word; small sample.
- **Speech impairment.** Tobin & Tomanek (Google, 2021, https://arxiv.org/abs/2110.04612): personalised ASR for 195 people with speech impairment; for a home-automation target WER, 79% reached it with 18–20 min of speech, 63% with 3–4 min [V, abstract]. ASR, not activation.
- **Parkinson's / tremor.** Mills 2026: participants felt voice interaction had advantages over smartphones "particularly for people with a tremor" [V]; the same paper notes Alexa "follow-up mode" avoids repeating the wake word [V].
- **Pauses and hesitation.** Kim 2021 and Mahmood 2024 above (partial capture 29 turns); Pradhan et al. (2025, https://pmc.ncbi.nlm.nih.gov/articles/PMC12188954/) summarise other work that pauses/hesitation break recognition and that remembering wake words is hard [S].
- **Hearing.** Kim 2021: hearing aids struggle with ambient noise and dialogue without context [V, framing]. Chen et al. (2023, "Screen or No Screen?", ASSETS, https://pmc.ncbi.nlm.nih.gov/articles/PMC11290471/): a participant said that without hearing aids at home Alexa is hard to understand beyond close range; the screen helped [V, quote, N=16, age 70–97]. No data found on presbycusis effects on perceiving wake-word acknowledgement tones.
- **Touch vs voice (tablet-relevant).** Chen 2023: Echo Show touchscreen cut setup time about 50% and touch response time about 20%, yet participants answered more often by speech [V]. Setup errors included pressing the mute button instead of the setup button [V]. Vaportzis et al. (2017, tablets, https://pmc.ncbi.nlm.nih.gov/articles/PMC5649151/): one participant with a fractured wrist/fingers doubted prolonged tablet use [V, anecdote].

## 4. Metrics and test methods

| Metric | Definition | Typical values found | Source |
|---|---|---|---|
| False accept rate (FAR / FAH) | False activations per hour of negative audio (or mean hours between) | Apple tunes down to ~1/week [V]; Snips operating point 0.5 FAH [V]; Picovoice reports miss rate at 1 FA per 10 h [V]; Schönherr counts per 24 h dataset [V]; Dubois up to 0.95/h and 1.43 per 10k words [V] | Apple Hey Siri; Coucke 2018; Picovoice wake-word-benchmark README (https://github.com/Picovoice/wake-word-benchmark); Schönherr 2020; Dubois 2020 |
| False reject rate (FRR) | Proportion of attempted activations that fail | Snips at 0.5 FAH: WaveNet 0.12% clean / 1.60% at 5 dB SNR; LSTM 2.09 / 11.21; CNN 2.51 / 13.18 [V] | Apple Hey Siri; Coucke 2018 |
| Trade-off curve | FRR vs FAR as the threshold moves (DET); Apple notes no equal error rate since units differ | Apple Fig. 6 and Snips Fig. 3 are curves only; numeric points above | Apple; Coucke 2018 |
| Impostor accept (IA) | Activation by a non-enrolled speaker | Reported as tracked; no number in post | Apple Personalized Hey Siri (https://machinelearning.apple.com/research/personalized-hey-siri) |
| False trigger mitigation | Share of false triggers suppressed at fixed true-positive rate / false suppression | 87% suppressed at 99% TPR, 1.69 s of audio before rejection [V, abstract]; 95% suppressed with +1 s post-trigger audio [V, abstract]; 38.34% relative FT reduction at 0.4% false suppression [V, abstract] | Dighe et al. 2020 (https://arxiv.org/abs/2010.10591); Garg et al. 2021 (https://arxiv.org/abs/2105.06598); Agarwal et al. 2020 (https://arxiv.org/abs/2008.08113) |
| Top-1 accuracy (keyword) | Correct class on pre-segmented utterances | MLPerf Tiny KWS: Speech Commands v2, 12 classes, 90% target; reference 91.6% [V] | Banbury et al. 2021 (https://arxiv.org/abs/2106.07597) |
| Streaming metrics | Matched / wrong / false-positive % of words in a continuous clip | Baseline: 49.0% matched, 46.0% correct, 3.0% wrong, 0.0% false positives on a 10-min clip [V] | Warden 2018 (https://arxiv.org/abs/1804.03209) |
| Misactivation repeatability, duration | Share of replays that re-trigger; seconds recorded | See Section 1 [V] | Schönherr 2020; Dubois 2020 |
| Per-turn error taxonomy | Wrong wake word, not listened, partial, mis-trigger; next-try resolution | See Section 1 [V] | Mahmood 2024 |
| Task time / steps | Setup or response time | Echo Show vs Dot: ~50% setup time reduction; touch ~20% faster [V] | Chen 2023 |

Test data/methods (all [V]):
- **Apple.** Positives recorded by native speakers in kitchen (near/far), car, bedroom, restaurant. Negatives: thousands of hours (podcasts, other speech). Weekly production sampling for false alarms/IA; FRR estimated from just-above and just-below-threshold events [V].
- **Snips.** About 11K positives and 86.5K negatives (~96 h), 2.2K speakers, MUSAN noise at 5 dB SNR [V].
- **Picovoice.** LibriSpeech test-clean background; >300 recordings of six keywords from >50 speakers; DEMAND noise at 10 dB SNR [V].
- **Schönherr / Dubois.** Audio playback near devices in a sound-proof room (Schönherr) or testbed (Dubois), with LED/network traffic as trigger detection.
- **Mahmood.** In-home recorder keyed to the LED ring, plus Alexa logs.

## 5. Gaps (not found or not verifiable)

- No study found reporting wake-word FAR/FRR by age group, or for older adults' actual wake-word attempts on commercial devices; Mahmood 2024 is the closest.
- No Dutch-language wake-word evaluation found; Dutch evidence is ASR-only and small (n=10). Apple's post does not name a Dutch trigger phrase.
- No published Google or Amazon wake-word evaluation methodology with numbers was retrieved. The Apple false-trigger-mitigation papers were read as abstracts only.
- ACM-hosted papers could not be retrieved (blocked): Lau et al. 2018 (CSCW), Trajkova & Martin-Hammond 2020 ("Alexa is a toy"), Pradhan et al. 2020 (TOCHI), Kowalski et al. 2019 (CHI), Brewer 2022, Blair & Abdullah 2019, Wacharamanotham 2011 (tremor). Their numbers are omitted. Bonilla & Martin-Hammond 2020 is only a poster abstract; Kocaballi and Chin papers on activation were not located (Quinn et al. 2021 PMC8969946 was too short to use).
- No data found on open-mic/continuous-listening or external-trigger activation in older adults, nor on tap-activation error rates with tremor.
- No standard definition found for "steps to activate" or "time to first response" for voice assistants; only Chen 2023 timings and Apple/Echo reject-latency figures (1–2 s [V], 1.69 s [V, abstract]).
- No verified user-behaviour data on switching devices off/muting after false activations, and none on presbycusis effects on activation feedback.
