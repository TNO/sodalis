# Dutch TTS provider evaluation (task 0036)

Status: analysis of all measurements up to 2026-10-16. The human listening
review is **not** part of this analysis; conclusions rest on measured speed,
memory, automatic intelligibility, licensing, and contract checks only.
Commands to reproduce every run are in
[development-stack.md](../development-stack.md#evaluate-alternative-speech-synthesis).

## Summary

- **Piper remains the only engine that meets the Sodalis TTS contract on
  local hardware.** It is the only candidate that is fast enough on both
  machines tested (0.04 s median on an M4 Max, 0.24–0.72 s on a laptop CPU).
- Five of nine Dutch Piper voices pass both automatic gates (median
  synthesis ≤ 1.5 s, Parakeet word error rate ≤ 10%). The current default,
  `nl_BE-nathalie-medium`, is one of them (5.3% WER, 0.36 s median).
  `nl_NL-pim-medium` has the lowest WER (3.9%) but misreads some numbers.
- Every neural alternative fails interactive latency on laptop CPU by one
  to two orders of magnitude (Chatterbox ~39 s, Parler ~152 s, MMS 4.2 s per
  short reply). Chatterbox and Parler are highly intelligible, so they may
  be worth re-measuring on a GPU; MMS also fails the WER gate.
- On Apple Silicon, Voxtral (MLX, 1.32 s median) is the only non-Piper
  engine near the speed gate. Its weights, both Mistral's original and the
  MLX conversion, are **CC BY-NC 4.0**. The non-commercial clause probably
  puts it out of scope for an organisational or commercial Sodalis
  deployment, just like MMS, Fish 1.5, and F5. It is also MLX-only, and its
  HTTP API returns complete files without in-flight cancellation.
- Azure AI Speech, reached through a Microsoft Foundry resource, was
  probed live with one sentence per voice. Every probed voice was fully
  intelligible to Parakeet, including the English HD voice Adam, and all
  accept the Sodalis 22,050 Hz format. The 50-sentence benchmark and
  listening review are still to do. Fish Speech 1.5 failed cancellation;
  F5-TTS has no Dutch checkpoint.
- **Recommendation:** keep Piper `nl_BE-nathalie-medium` as the default; no
  provider change is justified by this evidence. The voice choice among the
  five passing Piper voices awaits the listening review.

## Scope and contract

Task 0036 evaluates Chatterbox, Azure AI Speech, Fish Speech, and F5-TTS
against the Sodalis TTS contract: Dutch voice quality, streaming audio,
cancellation, latency, licensing, and Windows/Linux/macOS deployment, with
no browser access to engines and no silent cloud fallback. With the user's
approval the evaluation was extended to all nine Dutch Piper voices,
MMS-TTS, Parler-TTS, the Apple Silicon `tts-mlx` engines (Voxtral,
KugelAudio), and an automatic intelligibility gate.

No voice cloning was used: every engine ran with a built-in or preset voice.
Model weights and generated audio stay in the ignored `models/` folder.

## Method

- **Corpus:** 50 fixed synthetic Dutch avatar replies
  (`scripts/tts-sentences.json`, 414 words): greetings, confirmations,
  clarifications, dates, times, numbers, amounts, addresses, spelling,
  e-mail and calendar summaries, and errors.
- **Synthesis:** `scripts/tts-compare.py` generates one WAV per sentence per
  engine/voice, after a separate excluded warm-up utterance (which includes
  model loading). It records synthesis time through file creation, audio
  duration, real-time factor (RTF = compute / audio seconds; lower is
  faster), CPU time, and peak process RSS (plus MLX Metal peak on Apple
  Silicon). Engines run one at a time on otherwise idle hardware.
- **Intelligibility:** `scripts/tts-intelligibility.ts` sends each clip to
  the local Sodalis STT API using Parakeet TDT and computes word error rate
  (WER) against the input sentence, after lowercasing and stripping
  punctuation. This measures what a recognizer understands, so recognizer
  mistakes and formatting differences (digits vs words) count as errors. It
  is a proxy, not a quality score.
- **Gates:** median synthesis ≤ 1.5 s **and** corpus WER ≤ 10% over all 50
  clips. Engines stopped after five clips because of speed cannot pass.
- **Live Sodalis path:** `scripts/tts-live-check.ts` drives the public
  `/api/speech/tts` route through the gateway, with the provider configured
  as in production.
  - **Latency:** time to the first PCM chunk and to the end of the stream,
    for the short, medium, and longest corpus replies (18, 46, and 74
    characters), three times each.
  - **Cancellation:** it cancels three copies of a 1,007-character reply,
    one more than the API's concurrent TTS capacity. It then requires a new
    reply to start within 3 s. A cancel counts only if it came before half
    the uncancelled reply's duration.
- **Hardware:**
  - **M4 Max**, 128 GB unified memory, macOS (2026-10-05). Native, Metal,
    MLX, and MPS backends.
  - **Laptop:** Intel i7-1355U, 12 logical CPUs, no GPU, WSL2 Ubuntu 24.04
    with about 7.6 GB RAM (2026-10-08 and 2026-10-15). CPU only; timings are
    not comparable with the M4 Max.

## Results

### Laptop CPU (Linux/WSL2)

| Engine / voice | Clips | Warm-up (excluded) | Median synthesis | Median RTF | Peak RSS | Sample rate | Parakeet WER | Gates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Piper `nl_NL-pim-medium` | 50 | 0.35 s | 0.52 s | 0.12 | 0.31 GiB | 22,050 Hz | 3.9% | pass |
| Piper `nl_BE-nathalie-medium` (default) | 50 | 0.40 s | 0.36 s | 0.13 | 0.26 GiB | 22,050 Hz | 5.3% | pass |
| Piper `nl_NL-ronnie-medium` | 50 | 0.58 s | 0.48 s | 0.12 | 0.30 GiB | 22,050 Hz | 5.6% | pass |
| Piper `nl_BE-nathalie-x_low` | 50 | 0.43 s | 0.24 s | 0.09 | 0.19 GiB | 16,000 Hz | 7.0% | pass |
| Piper `nl_BE-rdh-medium` | 50 | 0.74 s | 0.72 s | 0.30 | 0.27 GiB | 22,050 Hz | 8.7% | pass |
| Piper `nl_BE-rdh-x_low` | 50 | 0.45 s | 0.32 s | 0.13 | 0.18 GiB | 16,000 Hz | 11.1% | fails WER |
| Piper `nl_NL-mls_5809-low` | 50 | 0.28 s | 0.41 s | 0.10 | 0.28 GiB | 16,000 Hz | 39.4% | fails WER |
| Piper `nl_NL-mls-medium` | 50 | 0.49 s | 0.61 s | 0.12 | 0.32 GiB | 22,050 Hz | 55.6% | fails WER |
| Piper `nl_NL-mls_7432-low` | 50 | 0.39 s | 0.33 s | 0.13 | 0.22 GiB | 16,000 Hz | 68.4% | fails WER |
| MMS-TTS `facebook/mms-tts-nld` | 50 | 9.15 s | 4.21 s | 1.01 | 0.92 GiB | 16,000 Hz | 15.7% | fails both |
| Chatterbox Multilingual V3, built-in voice | 5 | 42–70 s | 38.69 s | 15.6 | 6.10 GiB | 24,000 Hz | 2.8% | fails speed |
| Parler-TTS Mini Multilingual v1.1, "Mark" | 5 | 175 s | 152.4 s | 49.5 | 4.49 GiB | 44,100 Hz | 0% | fails speed |
| Azure AI Speech | — | — | — | — | — | — | — | not run (no key) |

Chatterbox and Parler were stopped after five clips: each clip took 14–60
times longer than its audio. A first Chatterbox attempt crashed the WSL VM
while its ~3 GB of weights were downloading.

### Live Sodalis TTS path (laptop, 2026-10-16)

| Provider | First audio, short / medium / long (median) | Uncancelled 1,007-character reply | Cancellation (3 × in flight) | Speech after cancellation |
| --- | --- | --- | --- | --- |
| Piper `nl_BE-nathalie-medium` via Piper HTTP | 72 / 127 / 173 ms | first audio 2.58 s, end 2.65 s, 53.5 s of audio | Passed when cancelled 500 ms after the request | Audio after 200 ms |
| Azure AI Speech | — | — | — | not run (no key) |

Piper HTTP returns audio only after the whole reply has been synthesized:
first audio is within a few milliseconds of the end of the stream. A user
can therefore interrupt Piper synthesis only **before** any audio plays.
Cancelling just after first audio, the moment of a typical barge-in, came too
late to interrupt synthesis and is reported as such.

### Azure AI Speech through Microsoft Foundry (probe, 2026-10-16)

**Setup.** "Azure Speech – Text to speech" in Microsoft Foundry is the same
Speech REST API that the Sodalis adapter calls.

- **Endpoint.** The resource endpoint
  `https://<resource>.cognitiveservices.azure.com/` serves synthesis at
  `/tts/cognitiveservices/v1` and voices at `/tts/cognitiveservices/voices/list`;
  without the `/tts` prefix both return 404. The Foundry *project* endpoint
  (`*.services.ai.azure.com/api/projects/…`) has no speech route.
- **Key.** The resource key works through `Ocp-Apim-Subscription-Key`.
- **Region.** The evaluation resource is in France Central, which supports
  standard neural, HD, and MAI voices.

**Dutch-capable voices.** The resource lists 917 voices:

- **Native Dutch, standard:** Colette, Fenna, and Maarten (nl-NL); Dena and
  Arnaud (nl-BE).
- **Native Dutch, MAI (preview, 24 kHz):** Fleur, Grant, Harper, and Sander,
  on `MAI-Voice-2.1-Flash` (low latency) and `MAI-Voice-2.1` (HD).
- **No native Dutch Dragon HD voice.**
- **Multilingual voices from other locales:** 302 list Dutch as a secondary
  language, among them `en-US-Adam:DragonHDLatestNeural`.

**Probe results.** One request per voice and setting, for "Goedemorgen, uw
afspraak is morgen om half tien." (49 characters), from the WSL laptop.
First audio includes a fresh TLS connection.

| Voice | Output | First audio / total | Audio | Parakeet word errors |
| --- | --- | ---: | ---: | ---: |
| `en-US-Adam:DragonHDLatestNeural`, English SSML language | 22,050 Hz | 420 / 1,700 ms | 4.05 s | 0/8 |
| `en-US-Adam:DragonHDLatestNeural`, `<lang xml:lang="nl-NL">` | 22,050 Hz | 454 / 1,857 ms | 3.20 s | 0/8 |
| `en-US-Adam:DragonHDLatestNeural`, `<lang xml:lang="nl-NL">` | 24,000 Hz | 393 / 1,889 ms | 4.00 s | 0/8 |
| `nl-NL-Sander:MAI-Voice-2.1-Flash` | 22,050 Hz | 462 / 603 ms | 3.04 s | 0/8 |
| `nl-NL-Sander:MAI-Voice-2.1-Flash` | 24,000 Hz | 546 / 685 ms | 3.21 s | 0/8 |
| `nl-NL-Harper:MAI-Voice-2.1-Flash` | 22,050 Hz | 457 / 607 ms | 3.12 s | 0/8 |
| `nl-NL-FennaNeural` | 22,050 Hz | 359 / 493 ms | 4.36 s | 0/8 |
| `nl-NL-ColetteNeural` | 22,050 Hz | 536 / 741 ms | 4.21 s | 0/8 |

**What the probe shows:**

- **Format.** Every voice, HD and MAI included, returned the
  `raw-22050hz-16bit-mono-pcm` format that the Sodalis browser contract
  expects. No resampling in Sodalis is needed.
- **Adam's Dutch.** Adam spoke Dutch even without the language tag
  (automatic language detection).
- **Adapter change.** The adapter now accepts any Azure voice name and marks
  the reply as Dutch only for voices from other locales. Before, a voice like
  Adam was rejected at startup and every Dutch request was refused.
- **Duration.** Adam's audio length varied by up to 25% between identical
  requests, consistent with the HD voices' deliberate prosody variation.
- **Latency.** Adam's HD synthesis took about three times as long as the
  standard and MAI-Flash voices.

Accent and naturalness, especially Adam's, need the listening review. One
sentence per voice is not a latency or quality measurement.

The first live run exposed a crash. Both the Piper HTTP and the Azure
adapters let a client disconnect during streaming become an unhandled
promise rejection, which **terminated the speech service** (every later
request returned HTTP 502). Both adapters now handle it; engine tests
reproduce real `fetch` behaviour, and the live check above passed after the
fix.

### Apple Silicon (M4 Max)

| Engine / voice | Acceleration | Warm-up (excluded) | Median / total, 50 clips | Median RTF | Peak RSS | Peak MLX Metal |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Piper `nl_BE-nathalie-medium` | CPU | 0.46 s | 0.044 s / 2.23 s | 0.017 | 0.28 GiB | n/a |
| Voxtral 4B 6-bit, `nl_female` | Metal/MLX | 6.37 s | 1.32 s / 68.6 s | 0.43 | 3.84 GiB | 4.28 GiB |
| Fish Speech 1.5, unconditioned | PyTorch MPS | 9.08 s (request only) | 11.72 s / 684.9 s | 2.79 | 6.64 GiB (server) | not measured |
| KugelAudio-0-Open, `warm` | Metal/MLX | 33.97 s | 20.06 s / 1067.6 s | 5.78 | 16.58 GiB | 19.26 GiB |

No WER was measured for this run. Fish's server RSS grew across the batch
(1.75 GiB after clip 1, 6.64 GiB after clip 50), and some Fish outputs were
far too long for their input (12–14 s for a short sentence), which suggests
hallucinated audio. Fish 1.5 on a CPU container produced no audio within
160 s.

## Analysis

### Speed

Only Piper is comfortably interactive on both machines. On the laptop CPU,
every Piper voice synthesizes a reply in well under a second (RTF ≤ 0.3).
Even the fastest neural alternative, MMS (a small VITS model), takes about
as long to synthesize as the audio lasts, so a short reply would come
seconds late. The large autoregressive models (Chatterbox, Parler, Fish,
KugelAudio) are 3–50 times slower than real time on available hardware.
Voxtral on Metal is the only non-Piper engine near the 1.5 s median gate,
but its CC BY-NC 4.0 licence likely rules it out regardless of speed.

### Intelligibility

- **Piper voices split into two groups.** The voices trained on dedicated
  single-speaker datasets (nathalie, rdh, pim, ronnie) reach 3.9–11.1% WER.
  The three voices trained on Multilingual LibriSpeech audiobook data
  (`mls`, `mls_5809`, `mls_7432`) reach 39–68% and are largely
  unintelligible to the recognizer.
- **For the same speaker, quality level matters.** `x_low` voices (16 kHz)
  score worse than their `medium` counterparts: nathalie 7.0% vs 5.3%, rdh
  11.1% vs 8.7%.
- **WER overstates errors on numbers.** The hardest sentences for the five
  passing voices are phone numbers, spelled names, amounts, addresses, and
  postcodes (22–37% mean WER). Most of these errors are formatting
  differences rather than mispronunciations: the speech was correct but
  Parakeet wrote digits ("12", "4278") where the reference has words or
  different grouping. Real mispronunciations do occur. Examples:
  - `pim-medium` read "42 78" as "twee viertig achtenzeventig" and garbled
    "€ 1.245,67";
  - `rdh-medium` produced "del" for "telt";
  - several voices produced "Keizerschacht" for "Keizersgracht".
- **Perfect clips (0 word errors) out of 50:** pim 40, nathalie-medium 37,
  ronnie 36, nathalie-x_low 29, rdh-medium 26.
- **The slow neural engines are highly intelligible.** Chatterbox made 1
  error and Parler 0 errors in 36 words, but on five easy conversational
  sentences only, without numbers.
- **MMS fails on intelligibility as well as speed** (15.7% WER).

### Contract compatibility

| Candidate | Dutch voice | Streaming / cancellation | Licence (code / weights) | Platforms | Decision |
| --- | --- | --- | --- | --- | --- |
| Piper | Nine v1.0.0 voices; five pass both gates | HTTP WAV converted to Sodalis PCM; audio starts only after full synthesis (72–173 ms for corpus replies); in-flight cancellation verified live | Engine `piper-tts` (piper1-gpl) GPL-3.0-or-later, run as a separate service; nathalie, rdh, pim, and ronnie datasets CC0; MLS datasets CC BY 4.0 | CPU via Compose on macOS, Windows, and Linux | **Default; retained** |
| Azure AI Speech (Foundry resource) | Five standard and four preview MAI native Dutch voices; multilingual HD voices such as Adam; all probed voices fully intelligible on one sentence | Server-side adapter streams raw 22,050 Hz PCM (accepted live by standard, HD, and MAI voices) and aborts on cancel; client-disconnect crash fixed | Hosted service; account, key, network, and billing required; MAI voices are preview | Through the Sodalis API on all platforms | Explicit opt-in adapter; 50-sentence benchmark, live cancellation, and listening review pending |
| Chatterbox Multilingual V3 | Dutch built-in voice, very intelligible | `generate` returns complete audio; no incremental streaming or in-flight cancellation | MIT code and weights; PyPI 0.1.7 lacks V3, so a pinned source install is required | CPU, MPS, CUDA; 6.1 GiB RSS on CPU | Rejected on laptop CPU; GPU/MPS latency unmeasured |
| Parler-TTS Mini Multilingual v1.1 | Dutch speakers listed; "Mark" very intelligible | Token streaming exists in the library but was not evaluated | Apache-2.0 | PyTorch CPU and CUDA | Rejected on CPU; GPU latency unmeasured |
| MMS-TTS `nld` | Single voice | Complete waveform per call | CC BY-NC 4.0 weights; evaluation only | PyTorch CPU | Rejected: fails speed, WER, and licence |
| Fish Speech 1.5 | Dutch in model card; long or hallucinated outputs | Streams WAV, but client disconnect did not stop inference | Apache-2.0 source, but package metadata and weights are CC BY-NC-SA 4.0 | CPU too slow; MPS tested on macOS only | Standalone evaluation-only Compose profile; not selectable |
| F5-TTS | No Dutch checkpoint | Not evaluated | MIT code, CC BY-NC weights | PyTorch CPU, MPS, CUDA | Ruled out: no Dutch model |
| Voxtral 4B (MLX) | `nl_female`/`nl_male` presets | Existing `voxtral-api` returns a complete file; no in-flight cancellation | [Original Mistral weights](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) and the MLX conversion are both CC BY-NC 4.0 | Apple Silicon only | Likely out of scope: non-commercial licence; also MLX-only and no cancellation |
| KugelAudio-0-Open (MLX) | Dutch listed, uneven quality | Unverified | MIT | Apple Silicon example only | Rejected: 20 s median on M4 Max |
| VibeVoice 1.5B | English and Chinese only | — | MIT | MLX | Not a Dutch candidate |
| XTTS-v2, Kokoro | Not evaluated | — | XTTS: non-commercial CPML, vendor closed; Kokoro: no verified Dutch | — | Not evaluated |

### Resource use

Piper stays below 0.35 GiB RSS for every voice. The neural engines need
0.9 GiB (MMS) to 6–17 GiB (Chatterbox, Fish, KugelAudio). This makes them
unsuitable for running next to the rest of the Sodalis stack on an 8 GB
laptop.

## Limitations

- **No human listening judgement is included.** Naturalness, prosody, and
  accent quality of the passing Piper voices are therefore unrated, and WER
  cannot distinguish a natural voice from a robotic but clear one.
- **WER depends on Parakeet.** Number and spelling sentences are penalised
  for formatting, which inflates every voice's WER roughly equally.
- **Chatterbox and Parler WER covers only five easy sentences.**
- **No GPU or CUDA measurements were made.** Chatterbox, Parler, and Fish may
  be fast enough on a discrete GPU, but that hardware is not part of the
  target desktop platforms.
- **Laptop timings are WSL2 on `/mnt/c`.** Native Windows and native Linux
  timings were not measured separately.
- **The live Sodalis path was measured for Piper only.** For other local
  engines only file-level synthesis time exists; Fish was the only one tested
  for interruption, and interruption failed. The Piper live check uses the
  default voice and the laptop only.
- **Azure was probed with one sentence per voice only.** No corpus timing,
  live cancellation, quota behaviour, or cost was measured.

## Open items

1. Listening review of the five passing Piper voices; this decides whether
   to change the default voice (pim or ronnie are the alternatives with
   lower or equal WER).
2. The 50-sentence Azure run and live check for `en-US-Adam:DragonHDLatestNeural`
   and `nl-NL-FennaNeural` (chosen by the user), covering first-audio latency,
   cancellation, quotas, and cost. This needs the user's approval before any
   Azure call. See
   [development-stack.md](../development-stack.md#run-the-live-azure-evaluation).
3. Optional: GPU or Apple Silicon timing for Chatterbox and Parler, if a GPU
   deployment target is ever considered.
4. The Piper engine is GPL-3.0-or-later. It runs as a separate HTTP service,
   but confirm this is acceptable for any distributed build.
5. Confirm that non-commercial (NC) weights are excluded from deployment.
   This would formally rule out Voxtral, MMS, Fish 1.5, and F5-TTS
   regardless of their speed or quality.
