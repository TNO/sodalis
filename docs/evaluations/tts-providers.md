# Dutch TTS provider evaluation (task 0036)

Status: complete, 2026-10-16. Measurements were taken from 2026-10-05 to
2026-10-16. Commands to reproduce them are in
[development-stack.md](../development-stack.md#evaluate-alternative-speech-synthesis).

## Summary and recommendation

- **Local default: Piper `nl_NL-ronnie-medium`.** It replaces
  `nl_BE-nathalie-medium` as the Sodalis default.
  - **Why Ronnie:** it is the only local voice that the listener found
    natural and correct enough. It was rated 5/10 and "a bit robotic, but
    very good for local TTS"; every other Piper voice got 4/10.
  - **Gates:** it passes both automatic gates (0.48 s median synthesis on a
    laptop CPU, 5.6% Parakeet word error rate).
  - **Live checks:** it streams through Sodalis and supports cancellation
    while synthesis is still running.
- **Best quality: Azure AI Speech, through a Microsoft Foundry resource.**
  - `nl-NL-Sander:MAI-Voice-2.1-Flash` was rated 8.5/10: very natural, with
    good intonation and emotion. Its audio starts after about 0.5 s.
  - The multilingual HD voice `en-US-Adam:DragonHDLatestNeural` was rated
    8/10: expressive, but not a Dutch-first voice.
  - Every other Azure voice tried (Fenna, Colette, Harper) scored 6 or below
    and sounded harsh.
  - Azure stays an explicit, server-side **opt-in, never a fallback**. Sander
    runs on a model that is still in preview. Azure was judged on one
    sentence per voice only, and its cost and cancellation behaviour were
    not measured.
- **No other local engine is usable for conversation.**
  - Chatterbox Multilingual V3 sounded good, correct, and emotional, but
    takes about 39 s per short reply on a laptop CPU.
  - Parler-TTS (about 152 s per reply) and MMS-TTS (4.2 s, 15.7% word error
    rate) are also too slow.
  - Fish Speech 1.5 could not be cancelled. F5-TTS has no Dutch model.
  - Voxtral (Apple Silicon only) is near the speed gate but has
    non-commercial (CC BY-NC) weights.
- **A crash was found and fixed.** Interrupting the assistant while audio
  was still streaming crashed the Sodalis speech service. Both the Piper HTTP
  and the Azure adapters had the cause, and both are fixed and tested.
- **Long replies wait for full synthesis with Piper.** Sodalis sends each
  assistant reply as one request, and Piper HTTP returns audio only after
  synthesizing the whole reply. With Ronnie, a 1,000-character reply starts
  after about 4 s.

## Scope

The task asked for Chatterbox, Azure AI Speech, Fish Speech, and F5-TTS to
be evaluated against the Sodalis TTS contract. With the user's approval the
evaluation was extended to:

- all nine Dutch Piper voices;
- MMS-TTS and Parler-TTS;
- the Apple Silicon `tts-mlx` engines, Voxtral and KugelAudio;
- Azure voices from a Microsoft Foundry resource.

The contract covers:

- Dutch voice quality, streaming audio, cancellation, latency, licensing,
  and Windows/Linux/macOS deployment;
- no browser access to engines, and no silent cloud fallback.

No voice cloning was used; every engine ran with a built-in or preset voice.
Model weights and generated audio stay in the ignored `models/` folder.

## Method and hardware

- **Corpus:** 50 fixed synthetic Dutch avatar replies
  (`scripts/tts-sentences.json`, 414 words).
  - Covers greetings, confirmations, clarifications, dates, times, numbers,
    amounts, addresses, spelling, e-mail and calendar summaries, and errors.
- **Synthesis benchmark:** `scripts/tts-compare.py` writes one WAV per
  sentence and engine, after an excluded warm-up utterance that includes
  model loading. It records:
  - synthesis time;
  - audio duration;
  - real-time factor (RTF: synthesis time ÷ audio duration; lower is faster);
  - CPU time and peak process RSS;
  - on Apple Silicon, the MLX Metal peak.

  Engines ran one at a time on otherwise idle hardware.
- **Intelligibility:** `scripts/tts-intelligibility.ts` transcribes each
  clip with Parakeet TDT through the local Sodalis STT API. It then computes
  the word error rate (WER) against the input sentence, ignoring case and
  punctuation.
  - It measures what a recognizer understands. Recognizer mistakes and
    formatting differences, such as digits versus words, count as errors.
- **Automatic gates:** median synthesis ≤ 1.5 s **and** corpus WER ≤ 10%
  over all 50 clips. Engines stopped after five clips for being too slow
  cannot pass.
- **Live Sodalis path:** `scripts/tts-live-check.ts` drives the public
  `/api/speech/tts` route through the gateway.
  - It times the first PCM chunk and the end of the stream, for the short,
    medium, and longest corpus replies (18, 46, and 74 characters), three
    times each.
  - It then cancels three copies of a 1,007-character reply, one more than
    the API's concurrent TTS capacity, 500 ms into each request. A new reply
    must start within 3 s.
- **Azure probe:** one request per voice and setting for "Goedemorgen, uw
  afspraak is morgen om half tien." (49 characters). It recorded time to
  first audio, total time, and Parakeet word errors. In total it used about
  400 billed characters plus the unbilled voice list.
- **Listening review:** one listener (the project owner) gave an overall
  grade out of 10 per voice. Piper voices were judged on the ten
  review-page sentences, the Azure voices on their probe clips, and
  Chatterbox on its five clips.
- **Hardware:**
  - **Laptop:** Intel i7-1355U, 12 logical CPUs, no GPU, WSL2 Ubuntu 24.04
    with about 7.6 GB RAM. CPU only.
  - **Apple Silicon:** M4 Max with 128 GB unified memory, macOS, using
    native, Metal, MLX, and MPS backends.

  Timings from the two machines are not comparable.

## Results

### Local engines on a laptop CPU

| Engine / voice | Clips | Warm-up (excluded) | Median synthesis | Median RTF | Peak RSS | Sample rate | Parakeet WER | Gates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Piper `nl_NL-pim-medium` | 50 | 0.35 s | 0.52 s | 0.12 | 0.31 GiB | 22,050 Hz | 3.9% | pass |
| Piper `nl_BE-nathalie-medium` (former default) | 50 | 0.40 s | 0.36 s | 0.13 | 0.26 GiB | 22,050 Hz | 5.3% | pass |
| **Piper `nl_NL-ronnie-medium` (default)** | 50 | 0.58 s | 0.48 s | 0.12 | 0.30 GiB | 22,050 Hz | 5.6% | pass |
| Piper `nl_BE-nathalie-x_low` | 50 | 0.43 s | 0.24 s | 0.09 | 0.19 GiB | 16,000 Hz | 7.0% | pass |
| Piper `nl_BE-rdh-medium` | 50 | 0.74 s | 0.72 s | 0.30 | 0.27 GiB | 22,050 Hz | 8.7% | pass |
| Piper `nl_BE-rdh-x_low` | 50 | 0.45 s | 0.32 s | 0.13 | 0.18 GiB | 16,000 Hz | 11.1% | fails WER |
| Piper `nl_NL-mls_5809-low` | 50 | 0.28 s | 0.41 s | 0.10 | 0.28 GiB | 16,000 Hz | 39.4% | fails WER |
| Piper `nl_NL-mls-medium` | 50 | 0.49 s | 0.61 s | 0.12 | 0.32 GiB | 22,050 Hz | 55.6% | fails WER |
| Piper `nl_NL-mls_7432-low` | 50 | 0.39 s | 0.33 s | 0.13 | 0.22 GiB | 16,000 Hz | 68.4% | fails WER |
| MMS-TTS `facebook/mms-tts-nld` | 50 | 9.15 s | 4.21 s | 1.01 | 0.92 GiB | 16,000 Hz | 15.7% | fails both |
| Chatterbox Multilingual V3, built-in voice | 5 | 42–70 s | 38.69 s | 15.6 | 6.10 GiB | 24,000 Hz | 2.8% | fails speed |
| Parler-TTS Mini Multilingual v1.1, "Mark" | 5 | 175 s | 152.4 s | 49.5 | 4.49 GiB | 44,100 Hz | 0% | fails speed |

Chatterbox and Parler were stopped after five clips, because each clip took
14–60 times longer than its audio. A first Chatterbox attempt crashed the WSL
VM while its ~3 GB of weights were downloading.

### Local engines on Apple Silicon (M4 Max)

| Engine / voice | Acceleration | Warm-up (excluded) | Median / total, 50 clips | Median RTF | Peak RSS | Peak MLX Metal |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Piper `nl_BE-nathalie-medium` | CPU | 0.46 s | 0.044 s / 2.23 s | 0.017 | 0.28 GiB | n/a |
| Voxtral 4B 6-bit, `nl_female` | Metal/MLX | 6.37 s | 1.32 s / 68.6 s | 0.43 | 3.84 GiB | 4.28 GiB |
| Fish Speech 1.5, unconditioned | PyTorch MPS | 9.08 s (request only) | 11.72 s / 684.9 s | 2.79 | 6.64 GiB (server) | not measured |
| KugelAudio-0-Open, `warm` | Metal/MLX | 33.97 s | 20.06 s / 1067.6 s | 5.78 | 16.58 GiB | 19.26 GiB |

No word error rate was measured on this machine.

- **Fish 1.5 on MPS:** its server RSS grew across the batch, from 1.75 GiB
  after clip 1 to 6.64 GiB after clip 50. Some outputs ran 12–14 s for a
  short sentence, which suggests hallucinated audio.
- **Fish 1.5 on CPU:** in a container it produced no audio within 160 s.

### Live Sodalis TTS path (Piper HTTP, laptop)

| Voice | First audio, short / medium / long (median) | Uncancelled 1,007-character reply | Cancellation (3 × in flight, at 500 ms) | Speech after cancellation |
| --- | --- | --- | --- | --- |
| `nl_NL-ronnie-medium` | 127 / 283 / 269 ms | first audio 4.02 s, end 4.04 s, 85.0 s of audio | passed | audio after 439 ms |
| `nl_BE-nathalie-medium` | 72 / 127 / 173 ms | first audio 2.58 s, end 2.65 s, 53.5 s of audio | passed | audio after 200 ms |

### Azure AI Speech probe (Foundry resource, France Central)

| Voice | Output | First audio / total | Audio | Parakeet word errors |
| --- | --- | ---: | ---: | ---: |
| `nl-NL-Sander:MAI-Voice-2.1-Flash` | 22,050 Hz | 462 / 603 ms | 3.04 s | 0/8 |
| `nl-NL-Sander:MAI-Voice-2.1-Flash` | 24,000 Hz | 546 / 685 ms | 3.21 s | 0/8 |
| `en-US-Adam:DragonHDLatestNeural`, English SSML language | 22,050 Hz | 420 / 1,700 ms | 4.05 s | 0/8 |
| `en-US-Adam:DragonHDLatestNeural`, `<lang xml:lang="nl-NL">` | 22,050 Hz | 454 / 1,857 ms | 3.20 s | 0/8 |
| `en-US-Adam:DragonHDLatestNeural`, `<lang xml:lang="nl-NL">` | 24,000 Hz | 393 / 1,889 ms | 4.00 s | 0/8 |
| `nl-NL-Harper:MAI-Voice-2.1-Flash` | 22,050 Hz | 457 / 607 ms | 3.12 s | 0/8 |
| `nl-NL-FennaNeural` | 22,050 Hz | 359 / 493 ms | 4.36 s | 0/8 |
| `nl-NL-ColetteNeural` | 22,050 Hz | 536 / 741 ms | 4.21 s | 0/8 |

First-audio times include a fresh TLS connection from the laptop.

### Listening review

| Voice | Grade (out of 10) | Listener's judgement |
| --- | ---: | --- |
| Azure `nl-NL-Sander:MAI-Voice-2.1-Flash` | 8.5 | Very natural, good intonation and emotion, not robotic |
| Azure `en-US-Adam:DragonHDLatestNeural` | 8 | Conveys intonation and emotion well, but is not a Dutch-first voice |
| Azure `nl-NL-FennaNeural`, `nl-NL-ColetteNeural`, `nl-NL-Harper:MAI-Voice-2.1-Flash` | ≤ 6 | Harsh, not natural, still somewhat robotic |
| Piper `nl_NL-ronnie-medium` | 5 | Natural and correct enough, a bit robotic; very good for local TTS |
| Other Piper voices | 4 | — |
| Chatterbox Multilingual V3 | not graded | Good, correct, and with emotion, but far too slow |

## Analysis

### Quality

- **Azure's best voices clearly beat every local voice.** Both Sander and
  Adam scored 8 or higher; the best local voice, Ronnie, scored 5.
- **The model family does not decide quality.** Harper runs on the same
  MAI-Voice-2.1-Flash model as Sander but scored 6 or below, like the
  standard voices Fenna and Colette. The voice must be chosen by listening,
  not by model family.
- **Adam speaks Dutch, but is English-based.** He spoke clear Dutch even
  without the language tag, and Parakeet heard every word. Sodalis now marks
  replies as Dutch for voices from other locales anyway.
- **Among local voices, quality and accuracy disagree.** Pim has the lowest
  word error rate (3.9%) and Nathalie was the previous default, but the
  listener preferred Ronnie. Word error rate measures clarity, not
  naturalness.
- **Chatterbox shows what better local quality would cost.** Its speech was
  judged good and emotional, but it needs 6 GiB of RAM and runs about 16
  times slower than real time on a laptop CPU.

### Speed and responsiveness

- **Piper is fast on a laptop CPU.** Every Piper voice synthesizes a
  corpus reply in well under a second (RTF ≤ 0.3).
- **Ronnie produces more audio for the same text.** Over the corpus it
  produced 210 s of audio, against 136 s for Nathalie, so it speaks more
  slowly. At the same real-time factor its synthesis therefore takes
  proportionally longer: 0.48 s median against 0.36 s.
- **Long replies are slow to start with Piper.** Piper HTTP synthesizes the
  whole reply before returning any audio, and Sodalis sends each reply as one
  request. First audio therefore grows with reply length: 0.13–0.28 s for
  corpus sentences, but 4.0 s for a 1,000-character reply with Ronnie.
  Splitting replies into sentences before synthesis would bring this back to
  sentence level (open item).
- **Azure starts quickly, independent of local hardware.**
  - Audio began after 0.36–0.55 s for every voice.
  - Native Dutch standard and MAI-Flash voices finished in 0.5–0.75 s.
  - Adam's HD synthesis took 1.7–1.9 s.
  - Azure streams audio as it is generated, so first audio should not grow
    with reply length the way Piper's does. This was not measured.
- **The other neural engines are far too slow on available hardware.**
  - MMS takes about as long as the audio lasts.
  - Chatterbox, Parler, Fish, and KugelAudio run 3–50 times slower than
    real time.
  - Voxtral on Metal is the only one near the 1.5 s median gate.

### Intelligibility

- **Piper voices fall into two groups.** Voices trained on single-speaker
  datasets (Nathalie, rdh, Pim, Ronnie) reach 3.9–11.1% word error rate.
  The three voices trained on Multilingual LibriSpeech audiobooks (`mls`,
  `mls_5809`, `mls_7432`) reach 39–68% and are largely unintelligible to
  the recognizer.
- **For the same speaker, the lower-quality `x_low` voices (16 kHz) do
  worse than `medium`:** Nathalie 7.0% against 5.3%, rdh 11.1% against 8.7%.
- **Word error rate overstates errors on numbers.** The hardest sentences
  are phone numbers, spelled names, amounts, addresses, and postcodes, with
  22–37% mean error rate across the passing voices.
  - Most of these are formatting differences: Parakeet writes digits where
    the reference has words.
  - Real mispronunciations do occur. Pim read "42 78" as "twee viertig
    achtenzeventig", and several voices said "Keizerschacht" for
    "Keizersgracht".
- **Fully correct clips out of 50:** Pim 40, Nathalie 37, Ronnie 36,
  Nathalie `x_low` 29, rdh 26.
- **Neural and Azure voices were highly intelligible on easy sentences.**
  Chatterbox made 1 error in 36 words, Parler 0, and every Azure voice 0 on
  the probe sentence. None of these was tested on the number and spelling
  sentences.

### Contract compatibility

| Candidate | Dutch voice | Streaming / cancellation | Licence (code / weights) | Platforms | Decision |
| --- | --- | --- | --- | --- | --- |
| Piper | Nine v1.0.0 voices; five pass both gates; Ronnie preferred by the listener | Piper HTTP returns a WAV that Sodalis converts to PCM; audio only after full synthesis; cancellation while still synthesizing verified live | Engine `piper-tts` (piper1-gpl) GPL-3.0-or-later, run as a separate service; Nathalie, rdh, Pim, and Ronnie datasets CC0; MLS datasets CC BY 4.0 | CPU through Compose on macOS, Windows, and Linux | **Default: `nl_NL-ronnie-medium`** |
| Azure AI Speech | 5 standard and 4 preview MAI native Dutch voices, plus multilingual HD voices; Sander and Adam rated best overall | Server-side adapter streams raw 22,050 Hz PCM, accepted by standard, HD, and MAI voices; aborts the upstream request on cancel | Hosted service; account, key, network, billing, and sending reply text to Azure; MAI models are preview | All platforms, through the Sodalis API | **Explicit opt-in; recommended voice `nl-NL-Sander:MAI-Voice-2.1-Flash`**; never a fallback |
| Chatterbox Multilingual V3 | Dutch built-in voice; good, emotional speech | `generate` returns complete audio; no incremental streaming or in-flight cancellation | MIT code and weights; PyPI 0.1.7 lacks V3, so a pinned source install is required | CPU, MPS, CUDA; 6.1 GiB RSS on CPU | Rejected on laptop CPU; GPU/MPS latency unmeasured |
| Parler-TTS Mini Multilingual v1.1 | Dutch speakers listed; "Mark" very intelligible | Token streaming exists in the library but was not evaluated | Apache-2.0 | PyTorch CPU and CUDA | Rejected on CPU; GPU latency unmeasured |
| MMS-TTS `nld` | Single voice | Complete waveform per call | CC BY-NC 4.0 weights; evaluation only | PyTorch CPU | Rejected: fails speed, WER, and licence |
| Fish Speech 1.5 | Dutch in model card; long or hallucinated outputs | Streams WAV, but client disconnect did not stop inference | Apache-2.0 source, but package metadata and weights are CC BY-NC-SA 4.0 | CPU too slow; MPS tested on macOS only | Evaluation-only Compose profile; not selectable |
| F5-TTS | No Dutch checkpoint | Not evaluated | MIT code, CC BY-NC weights | PyTorch CPU, MPS, CUDA | Ruled out: no Dutch model |
| Voxtral 4B (MLX) | `nl_female` / `nl_male` presets | Existing `voxtral-api` returns a complete file; no in-flight cancellation | [Original Mistral weights](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) and the MLX conversion are both CC BY-NC 4.0 | Apple Silicon only | Likely out of scope: non-commercial licence, MLX-only, no cancellation |
| KugelAudio-0-Open (MLX) | Dutch listed, uneven quality | Unverified | MIT | Apple Silicon example only | Rejected: 20 s median on M4 Max |
| VibeVoice 1.5B | English and Chinese only | — | MIT | MLX | Not a Dutch candidate |
| XTTS-v2, Kokoro | Not evaluated | — | XTTS: non-commercial CPML, vendor closed; Kokoro: no verified Dutch | — | Not evaluated |

Contract findings beyond the table:

- **The barge-in crash.** A client disconnecting during streaming made the
  Piper HTTP and Azure adapters leave a rejected `reader.cancel()`
  unhandled, which terminated the speech service. After that, every request
  returned HTTP 502 until it restarted.
  - Both adapters now handle the rejection.
  - Engine tests reproduce real `fetch` behaviour.
  - The live check passes for Nathalie and Ronnie.
- **Cancellation with Piper.** Because Piper HTTP returns audio only after
  synthesis, cancelling once the first audio has arrived comes too late to
  save any work. A user can interrupt Piper *synthesis* only before the
  reply starts playing. Playback itself always stops immediately.
- **Azure through Microsoft Foundry.** Foundry's "Azure Speech – Text to
  speech" is the same Speech REST API. It is reached on the *resource*
  endpoint:
  - synthesis: `https://<resource>.cognitiveservices.azure.com/tts/cognitiveservices/v1`;
  - voice list: `…/tts/cognitiveservices/voices/list`.

  The Foundry *project* endpoint (`*.services.ai.azure.com/api/projects/…`)
  has no speech route. The resource key works.

  The adapter now:
  - accepts the bare resource URL;
  - rejects project endpoints with an explanation;
  - accepts any Azure voice name, including model suffixes such as
    `:DragonHDLatestNeural`;
  - marks replies as Dutch with SSML `<lang>` for voices from other locales.
- **Azure voice availability.** The France Central resource lists 917
  voices.
  - Native Dutch: Colette, Fenna, Maarten, Dena, and Arnaud (standard);
    Fleur, Grant, Harper, and Sander (MAI, preview).
  - 302 voices from other locales list Dutch as a secondary language.
  - There is no native Dutch Dragon HD voice.

### Resource use

- **Piper** stays below 0.35 GiB RSS for every voice.
- **The local neural engines** need from 0.9 GiB (MMS) to 6–17 GiB
  (Chatterbox, Fish, KugelAudio). That rules them out next to the rest of
  the Sodalis stack on an 8 GB laptop.
- **Azure** uses no local model memory.

## Limitations

- **One listener, overall grades.** The review is one person's overall
  judgement per voice, not a scored per-clip panel.
- **Azure was judged on one sentence per voice.** It had no corpus run, so
  its timing, intelligibility on numbers and spelling, live cancellation
  through Sodalis, quota behaviour, and cost were not measured. The user
  decided against further Azure runs for this evaluation.
- **Word error rate depends on Parakeet.** Number and spelling sentences are
  penalised for formatting.
- **Chatterbox and Parler were measured on five easy sentences only.**
- **No GPU or CUDA measurements.** Chatterbox, Parler, and Fish may be fast
  enough on a discrete GPU, which is not a target desktop platform.
- **Laptop timings come from WSL2 on `/mnt/c`.** Native Windows and native
  Linux were not measured separately.
- **The live Sodalis path was measured on the laptop only.** It covered
  Piper (Ronnie and Nathalie). For the other local engines only file-level
  synthesis time exists. Fish was the only one tested for interruption, and
  interruption failed.

## Open items

1. **Piper licence.** The Piper engine (`piper-tts`, piper1-gpl) is
   GPL-3.0-or-later. It runs as a separate HTTP service; whether that is
   acceptable for a distributed build needs legal review.
2. **Non-commercial weights.** Decide whether non-commercial (NC) model
   weights are excluded from any deployment. That would formally rule out
   Voxtral, MMS, Fish 1.5, and F5-TTS.
3. **Sentence-by-sentence synthesis.** Splitting replies into sentences
   before synthesis would keep Piper's first audio short for long replies.
4. **Before any production use of Azure:**
   - a corpus run and live cancellation check through Sodalis;
   - quota and cost measurement;
   - waiting until the MAI voice models leave preview.
5. **Optional: GPU timing.** Measure Chatterbox and Parler on a GPU, if a
   GPU deployment target is ever considered.
