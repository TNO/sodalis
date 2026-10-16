# Alternate STT provider evaluation (task 0035)

Status: complete as of 2026-10-16. Covers every Sodalis STT measurement up
to 2026-10-15. No live Azure measurement and no Parakeet Redux measurement
exist; see [Limitations](#limitations).
Setup and reproduction commands are in
[development-stack.md](../development-stack.md#try-local-whistle-or-parakeet-tdt-in-compose).

## Summary

- **Keep NVIDIA Parakeet TDT 0.6B v3 (sherpa-onnx, CPU) as the default.**
  It is the most accurate engine that stays within real time on a CPU-only
  host. Whisper Medium and the Large models are more accurate, but on CPU
  they are 2–5 times slower than real time.
  - **Six private Dutch clips (laptop CPU):** 8.6% WER at a real-time factor
    (RTF) of 0.12, and every clip finished well within real time. The errors
    that remain are reference typos, numbers written as words, and accepted
    spelling variants.
  - **Six-speaker MLS subset:** 17.2% WER, roughly half of Whistle's.
- **Whisper.cpp has no model that is both accurate and fast enough on a
  CPU-only host.**
  - Small (11.1% WER, RTF 0.69) exceeded real time on one clip.
  - Base is fast but has 30.9% WER.
  - Medium and larger models are slower than real time on every clip.

  Whisper stays available, mainly for languages outside Parakeet's 25
  European ones, or on a Mac with Metal.
- **Cactus Whistle is the fastest but least accurate.** It made 30.2% WER on
  the MLS subset and stays an opt-in profile.
- **Azure AI Speech now has an opt-in, final-transcript-only adapter**
  (`STT_PROVIDER=azure`).
  - It uses fast transcription and uploads each finished utterance once. It
    offers no interim captions, and there is no fallback to or from it.
  - It is verified only with contract tests: no audio has been sent to
    Azure, so its Dutch accuracy and latency are unmeasured.
- **No Parakeet Redux adapter.** Its weights are CC BY 4.0, but its Photon
  runtime depends on `kestrel-kernels`, which requires a separate written
  agreement. The broader Cactus engine is also not bundled, because of its
  license.
- **Live captions:** Parakeet re-transcription is fast enough for interim
  captions that trail speech by about 0.5 s. Nemotron 3.5 true streaming
  never rewrote earlier words but was less accurate. Shipping Sodalis uses
  Parakeet snapshots; Nemotron remains a follow-up
  ([task 0042](../../TASKS/0042-live-stt-captions.md)).

## Scope and contract

Task 0035 evaluates Cactus, Azure AI Speech, and Moondream Parakeet Redux as
alternate STT implementations against the Sodalis STT contract. The criteria
are:

- Dutch support and accuracy;
- interim (partial) behavior;
- cancellation;
- latency;
- licensing;
- Windows, Linux, and macOS deployment;
- no browser access to an engine or cloud service, and no silent cloud
  fallback.

During the work the comparison was extended to:

- original NVIDIA Parakeet TDT v3, which has been the default since
  2026-10-05;
- Whisper.cpp models from Base to Large-v3 Turbo;
- NVIDIA Nemotron 3.5 ASR streaming, in an isolated experiment only.

**The contract in brief.** The browser talks only to the Sodalis speech API:

1. `POST /api/speech/stt/sessions` with `nl-NL` or `en-US`;
2. audio chunks;
3. optionally `/partial`, for a replaceable interim transcript;
4. `/finish`;
5. `DELETE` to cancel.

Engines are selected only by server-side `STT_PROVIDER`. An engine may now
declare itself final-only. Session creation then returns
`partialResults: false`, the browser skips interim requests, and `/partial`
answers 501.

## Method

### Corpora

- **MLS Dutch test subset** (`scripts/stt-benchmark.ts`).
  - One 10–18 s clip from each of six test speakers, 215 reference words.
  - Sent through the public Sodalis STT API on loopback only.
  - Lowercased word comparison without Dutch spelling normalisation.
- **Private Dutch recordings.**
  - Six short M4A clips of 3.6–8.4 s with one reference transcript each,
    81 reference words.
  - Scored after case-folding and removing punctuation.
  - The recordings and raw results stay outside the repository.
- **Short probes.** A synthetic "Hoe oud bent u?" in WAV and WebM, 3 s of
  silence, and 44–46 s multi-passage recordings.

### Timing

- **Final transcript.** The whole clip is uploaded first. Only the `/finish`
  request is timed: audio conversion plus recognition, without recording
  time or model loading.
- **RTF** is finish latency divided by audio duration; the overall value is
  weighted by total audio. Below 1.0 means faster than real time.
- **Live captions.** Each clip is replayed as 200 ms chunks at real-time
  pace, with real decoding, against the engine port directly. Two
  strategies were compared:
  - *redecode:* re-transcribe all audio received so far whenever the engine
    is idle;
  - *stream:* push chunks into a streaming Nemotron session.

  Browser capture, encoding, and upload are simulated.

### Hardware

- **MLS subset (2026-10-05).** A Mac.
  - Compose Whisper Base ran in a container; Whisper Small and Medium ran
    natively with Metal.
  - Whistle and Parakeet ran as CPU containers in a Podman VM; Parakeet
    needed the 8 GB VM.
  - The exact machine and VM CPU allocation were not recorded.
- **Private clips (2026-10-09 and 2026-10-15).** A laptop with an Intel
  i7-1355U (12 logical CPUs, no GPU), WSL2 Ubuntu, and 7.6 GiB available to
  Docker. CPU only.
  - The main Sodalis Compose stack was running during the 2026-10-15
    measurements.
  - Parakeet and Nemotron used sherpa-onnx 1.13.8 with 4 threads and greedy
    decoding.
  - Those two ran in the benchmark's own sherpa-onnx server, which serves
    Whisper.cpp's `/inference` protocol through the Sodalis Whisper.cpp
    adapter. This is **not** the shipping `parakeet-tdt` service and
    adapter, which use the same model and sherpa-onnx version with 2
    threads. The shipping service was measured only on the MLS subset.
  - Whisper.cpp v1.9.4 used `--no-gpu` and `GGML_NATIVE=OFF`.
  - The harness and recordings are not committed, so these runs cannot be
    reproduced from the repository alone.

The two corpora are not comparable with each other: they differ in speakers,
length, recording conditions, and reference quality.

## Results

### MLS Dutch subset (215 words)

| Engine | Word errors | WER | Latency per clip | Notes |
| --- | ---: | ---: | --- | --- |
| Whisper.cpp Base (Compose CPU) | 77 | 35.8% | — | |
| Whisper.cpp Small (native, Metal) | 49 | 22.8% | — | |
| Whisper.cpp Medium (native, Metal) | 25 | 11.6% | — | "Hoe oud bent u?" became "Hoe uit bent u?" |
| Cactus Whistle/Needle (CPU container) | 65 | 30.2% | ~137–252 ms | Misheard the synthetic question; empty for silence |
| Parakeet TDT v3 (CPU container) | 37 | 17.2% | 394–700 ms | WAV question correct; WebM gave "Who oud bent u?"; empty for silence |

### Private Dutch clips, final transcript (81 words, laptop CPU)

| Engine | WER | Overall RTF | Clips at RTF ≤ 1.0 | Per-clip RTF | Model files |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whisper Base | 30.9% | 0.22 | 6 / 6 | 0.16–0.34 | 142 MB |
| Whisper Small | 11.1% | 0.69 | 5 / 6 | 0.54–1.08 | 466 MB |
| Whisper Medium | 6.2% | 2.24 | 0 / 6 | 1.70–3.65 | 1.5 GB |
| Whisper Medium Q5_0 | 7.4% | 2.46 | 0 / 6 | 2.02–3.57 | 515 MB |
| Whisper Large-v3 | 3.7% | 4.78 | 0 / 6 | 3.55–8.25 | 2.9 GB |
| Whisper Large-v3 Turbo | 2.5% | 3.82 | 0 / 6 | 2.71–6.50 | 1.6 GB |
| Whisper Large-v3 Turbo Q5_0 | 2.5% | 3.88 | 0 / 6 | 2.83–6.46 | 548 MB |
| **Parakeet v3 (sherpa-onnx 1.13.8)** | **8.6%** | **0.12** | **6 / 6** | 0.11–0.13 (0.23 cold) | 640 MB |
| Parakeet v3 (sherpa-onnx 1.12.40) | 11.1% | 0.08 | 6 / 6 | ≤ 0.11 (0.14 cold) | 640 MB |
| Nemotron 3.5, 560 ms, whole clip | 13.6% | 0.38 | 6 / 6 | 0.35–0.46 | 651 MB |

Each Whisper model was run once. Parakeet and Nemotron were run three times:
WER was identical across repeats, and overall RTF varied by at most 0.02.
"Cold" is the first request to a freshly started engine.

### Where the private-clip errors come from

| Engine | Errors (WER) | Reference typos | Numbers as words | Accepted variants | Remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whisper Large-v3 Turbo | 2 (2.5%) | 2 | 0 | 0 | 0 |
| Whisper Medium | 5 (6.2%) | 2 | 0 | 3 | 0 |
| Parakeet v3 (1.13.8) | 7 (8.6%) | 2 | 2 | 3 | 0 |
| Whisper Small | 9 (11.1%) | 2 | 0 | 0 | 7 |
| Nemotron 3.5, 560 ms | 11 (13.6%) | 2 | 2 | 2 | 5 |

- **Reference typos:** "herrineren" and "beantworden" in the references are
  charged as errors against engines that spell the words correctly.
- **Numbers as words:** Parakeet and Nemotron write "vijf voor twaalf" where
  the reference has "5 voor 12".
- **Accepted variants:** "me" for "mij", and "wegga" for "weg ga".
- **Nemotron's remaining errors** include German "mein Name" for "mijn naam",
  even with Dutch forced.

### Live captions (private clips, laptop CPU)

The values are means over six clips, with the worst case in brackets; ranges
cover two repeat runs.

| Engine / strategy | First caption | Caption lag | Final latency | Updates rewriting earlier words | Final WER |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whisper Small / redecode | 9.74 s | 5.18 s [5.53] | 8.29 s [9.29] | — (≤ 1 caption per clip) | 11.1% |
| Whisper Base / redecode | 1.61 s | 1.96 s [6.34] | 3.18 s [6.06] | 5 / 20 | 30.9% |
| **Parakeet v3 / redecode** | 1.54–1.59 s | 0.54 s [1.04] | 1.05 s [1.62] | 11–14 / 44 | **8.6%** |
| **Nemotron 3.5, 560 ms / stream** | 2.18–2.31 s | **0.18–0.24 s** [0.93] | **0.44–0.51 s** [0.72] | **0 / 38** | 13.6% |
| Nemotron 3.5, 1120 ms / stream | 2.65 s | 0.26 s [0.38] | 0.30 s [0.46] | 0 / 17 | 17.3% |

- **Caption lag** is processing delay after the audio a caption covers; it
  excludes model lookahead.
- **Final latency** is measured from the end of the clip.

### Contract compatibility and configuration matrix

| Candidate | Dutch accuracy | Interim | Cancellation | Latency | License | Windows / Linux / macOS | Sodalis integration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Parakeet TDT v3**, sherpa-onnx, CPU | Most accurate within real time on CPU: MLS 17.2%, private clips 8.6% | Sodalis snapshot interim | Aborts the request; inference already running continues | RTF 0.12 on laptop CPU | Weights CC BY 4.0 (attribution); runtime Apache-2.0; conversion repo terms to check before publishing an image | Compose on all three; tested on Linux/WSL2 and in a macOS Podman VM; needs more than 2 GB of VM memory | **Default.** `STT_PROVIDER=parakeet-tdt`, profile `parakeet-tdt`, or `PARAKEET_TDT_URL` |
| Whisper.cpp | Base 30.9–35.8%; Small 11.1–22.8%; Medium 6.2–11.6% | Sodalis snapshot interim; Small is too slow for live captions on CPU | Session cancellation | CPU: only Base is within real time; Metal makes Medium usable on a Mac | MIT runtime and models | Compose CPU on all three; native Metal on macOS | Opt-in. `whisper-cpp`, profile `whisper` (`WHISPER_MODEL`), or `WHISPER_CPP_URL` |
| Cactus Whistle/Needle | MLS 30.2% | Sodalis snapshot interim | Aborts the request; inference continues | ~137–252 ms per clip | Apache-2.0 model and runtime | Compose CPU | Opt-in. `whistle`, profile `whistle`, or `WHISTLE_URL` |
| Azure AI Speech (fast transcription) | Dutch supported by the service; **not measured** | None (final only, `partialResults: false`) | Aborts the upstream HTTP request | Not measured | Commercial cloud service; billing, data transfer | Any host with network access | Opt-in. `STT_PROVIDER=azure`, `AZURE_STT_URL`, `AZURE_STT_KEY`; no container |
| Nemotron 3.5 ASR streaming | Private clips 13.6% (560 ms); one phrase came out German | True incremental; no rewrites | Not integrated | Lag ~0.2 s; final ~0.5 s | Not reviewed | Linux/WSL2 CPU in an experiment | Not integrated; follow-up |
| Moondream Parakeet Redux / Photon | Dutch claimed; not measured | Photon documents live PCM snapshots; unverified | Unverified | Not measured | Weights CC BY 4.0; `kestrel-kernels` needs a written agreement | CPU, Apple silicon, CUDA per vendor | Not integrated; runtime not installed |
| Cactus engine (other models) | Not measured | Chunked `confirmed` / `pending` API | Unverified | Not measured | Restricts organizations above funding or revenue thresholds | Vendor-dependent | Not bundled |

Every integrated provider runs behind the Sodalis speech API. The browser
never receives engine URLs or keys. A missing or failing provider fails
explicitly and is never replaced by another one.

## Analysis

### Speed and accuracy

- **Whisper trades accuracy against speed on CPU.**
  - Base to Small cut WER by about 20 points but tripled RTF.
  - Medium and the Large models are more accurate, but run 2–5 times slower
    than real time.
- **Parakeet breaks that trade-off.** It is about 5.7 times faster than
  Small and 1.8 times faster than Base, and more accurate than Small. Without
  the reference effects above, its accuracy on the private clips matches
  Medium and Turbo.
- **Both corpora rank Parakeet ahead of Whistle and Whisper Base/Small.**
  Medium on Metal was more accurate on MLS (11.6% vs 17.2%), so a
  well-provisioned Mac can still prefer native Whisper Medium.
- **The sherpa-onnx version changes Parakeet's output and speed.** 1.13.8
  was more accurate but about 50% slower than 1.12.40. The shipping image
  pins 1.13.8; re-measure whenever it changes.
- **Thread count (2–8) barely mattered** for these short clips: fixed
  per-request costs dominate. The shipping service uses 2 threads, the
  benchmark 4.
- **Quantising Whisper shrank the models by about 66% without speeding them
  up.** A native CPU build (`GGML_NATIVE=ON`) changed RTF by −12% to +18%
  with no WER change. Keep the portable default.

### Interim captions and cancellation

- **Current behaviour.** Sodalis re-transcribes the growing snapshot at most
  every 1.5 s. Measured against that, Parakeet keeps up and Whisper Small
  does not.
- **`finish` waits for an in-flight partial.** This explains most of
  Parakeet's ~1 s final latency in the live-caption test, against about
  0.6–0.9 s in batch. Cancelling that partial when speech ends should close
  the gap; this is tracked in task 0042.
- **Rewrites.** About a quarter to a third of Parakeet's caption updates
  rewrite earlier words. Nemotron never did, but it shows its first caption
  later and is less accurate.
- **Cost grows with utterance length.** Re-transcription cost grows with the
  utterance; Nemotron's cost per chunk does not. Longer turns are needed
  before choosing between the two for live captions.
- **Cancellation.** For every local engine, cancellation aborts the Sodalis
  request but cannot interrupt CPU inference that is already running. For
  Azure, aborting the upload or response is enough.
- **Request length.** The Whistle and Parakeet services reject requests over
  30 s. Whisper.cpp has no such limit in Sodalis: a 44 s recording with
  three distinct passages returned all three.

### Azure

- **Why fast transcription.** Its REST API accepts the browser's WebM/Opus
  directly and takes explicit locales, so it fits the existing
  buffered-session contract without a native SDK.
- **Why final-only.** Re-uploading the growing snapshot every 1.5 s would
  multiply billed audio and data transfer. The adapter therefore declares
  itself final-only.
- **Not chosen: the real-time SDK.** It provides interim events, but would
  need a separate streaming path in the speech API.
- **Not evaluated live.** Measuring Dutch accuracy and latency needs
  credentials and authorization to send test recordings.

### Licensing and deployment

- **Parakeet:** attribution is required for the CC BY 4.0 weights.
- **Whistle:** fully Apache-2.0, and its Python package enables anonymous
  telemetry by default (disabled in the evaluation).
- **Redux and the Cactus engine** are blocked on license terms, not on
  technical fit.
- **Deployment:** all local engines run as CPU Compose services on Docker or
  Podman. Windows has only been exercised through WSL2.

## Limitations

- **Small corpora.** Six MLS clips and six private clips are not a robust
  accuracy or latency evaluation. Each Whisper configuration on the private
  clips was run only once.
- **Reference errors.** Typos and number formatting in the private
  references make absolute WER unreliable at the level of a few points.
- **Short clips** (3.6–18 s) favour re-transcription; longer and noisier
  utterances are untested.
- **Simulated live timing.** Live-caption timing excludes real browser
  capture, encoding, upload, and model lookahead.
- **Concurrent load.** The private-clip measurements ran alongside the main
  Sodalis stack.
- **Not reproducible across machines.** The MLS-subset hardware and VM
  allocation were not recorded, so those latencies cannot be compared with
  the laptop.
- **Private-clip runs can't be reproduced from the repo.** The private-clip
  and live-caption runs used an uncommitted local harness. They also used the
  benchmark's own sherpa-onnx server, not the shipping Parakeet service.
- **No hardware acceleration** was tested beyond Whisper Metal on a Mac.
- **Two candidates are not measured at all:** Azure (no live run) and
  Parakeet Redux (no runtime installed).

## Open items

- Cancel a stale in-flight partial when speech ends, and evaluate a Nemotron
  streaming profile for live captions
  ([task 0042](../../TASKS/0042-live-stt-captions.md)).
- Correct the private reference typos and agree on number normalisation
  before treating WER differences of a few points as meaningful.
- Measure longer, noisier, and continuous-microphone speech, including
  pre-roll, sustained-speech rollover, and the 30 s request limit.
- Run Azure STT live, once credentials and authorization to send test audio
  exist.
- Check the redistribution terms of the Parakeet ONNX conversion before
  publishing an image, and review Nemotron's license before integrating it.
- Re-evaluate Parakeet Redux only if a written `kestrel-kernels` agreement is
  obtained.
- Exercise the Compose stack on native Windows outside WSL2.
