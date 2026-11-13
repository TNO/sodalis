# On-device wake-word engines for a custom Dutch phrase ("Hey Sodalis") in a tablet browser

**Question.** Which on-device, browser-capable wake-word engines can detect a custom phrase such as "Hey Sodalis" spoken by a Dutch speaker in Android Chrome / iPadOS Safari? Per engine: licence/cost (code *and* weights), custom-keyword training and Dutch support, published FAR/FRR, CPU/battery, size, latency, browser support.

Research date: 2026-11-13. Facts only; no recommendations. Evidence tags: **[1P]** first-party vendor/author claim, **[3P]** independent third party, **[plot]** value read by eye off a published plot (approximate). "Not published" means not found in the primary sources listed in [Sources](#sources).

## Summary

- **No engine publishes a Dutch-speaker FAR/FRR, nor any measured CPU/battery figure for a tablet browser.** All published error rates are English (see [Gaps](#gaps--not-published)).
- **Porcupine** is the only engine with an official, maintained browser SDK (WASM, Chrome/Safari/Firefox/Edge). Its custom keywords are trained in Picovoice's cloud from typed text. Dutch is **not** in its supported language list (en, fr, de, it, ja, ko, zh, pt, es). It needs an AccessKey with intermittent internet connectivity and has proprietary terms despite an Apache-2.0 repo licence.
- **openWakeWord** (code Apache-2.0; shipped pretrained weights CC BY-NC-SA 4.0) trains custom phrases from TTS-synthetic data. The official trainer uses an English-only Piper voice. A `nl_NL-mls-medium.pt` Piper sample-generator model exists but is not wired into `train.py` (open issue #170). There is no official browser port; third-party ONNX-Runtime-Web ports exist.
- **microWakeWord** (Apache-2.0, weights explicitly Apache-2.0) has ~52–60 KB TFLite models aimed at microcontrollers. There is no browser port, and published models are `trained_languages: ["en"]`.
- **hey-buddy** is an openWakeWord-derived trainer *and* browser (ONNX) runtime; code and pretrained models are Apache-2.0. Its TTS is an English Piper voice (`en-us`).
- **sherpa-onnx KWS** is open-vocabulary (type any keyword, no training) and has a WASM build. Pretrained KWS models cover English (BPE) and Chinese only. Chunk latency is 160 ms or 320 ms.
- **Vosk** (Dutch small model, Apache-2.0, 39 MB) runs in browsers via third-party `vosk-browser`. It is an ASR with a phrase grammar, not a dedicated wake-word engine.
- **EfficientWord-Net** and **rustpotter** need only a few recorded samples (language-agnostic by construction), and both have browser/WASM front ends. Neither publishes FAR/FRR.
- **Mycroft Precise** and **Snowboy** have no browser target (Snowboy's service shut down 2020-12-31). **Whisper** is general ASR, not a keyword spotter. **Web Speech API** is server-based by default.

## Comparison table

| Engine | Licence: code / weights / cost | Custom phrase training | Dutch | Published FAR/FRR | CPU / battery | Size | Latency | Browser |
|---|---|---|---|---|---|---|---|---|
| **Porcupine** (Picovoice) | Repo Apache-2.0, but needs AccessKey + proprietary Terms; no personal/non-commercial plan; Free Trial for enterprises | Type phrase in Console/REST; cloud-trained in seconds; `.ppn` per platform | **Not supported** (9 listed languages); extra languages "case-by-case" for commercial customers | [1P] 2.7 % miss @ 1 FA/10 h (6 English keywords); "97 %+ detection, <1 FA/10 h" | [1P] <4 % of 1 Pi 3 core; 0.6 % Pi 5; browser: not published | `.pv` ≈ 0.98 MB; WASM 200–245 KB | Not published | Official WASM SDK, Chrome/Safari/Firefox/Edge; SAB optional |
| **openWakeWord** | Code Apache-2.0; pretrained weights CC BY-NC-SA 4.0 | Colab/notebook; ≥ several thousand TTS clips + ~30,000 h negatives | English-only TTS in official trainer; `nl_NL` Piper model exists (issue #170 open) | [1P] target <5 % FRR, <0.5 FA/h; plots only; no numbers in text | [1P] 15–20 models on 1 Pi 3 core; browser: not published | ≈ 3.3 MB (mel 1.09 + emb 1.33 + head ≥ 0.2–1.7 MB) | 80 ms frames; end-to-end not published | No official port; 3P ORT-Web ports |
| **microWakeWord** | Code Apache-2.0; weights Apache-2.0 (stated) | Notebook; Piper TTS; "very difficult" per README | No Dutch model; manifest has `trained_languages` | [1P] ROC plot only | Not published | 52–60 KB `.tflite` | Inference every 30 ms; end-to-end not published | No port found |
| **hey-buddy** | Code + pretrained models Apache-2.0 | `heybuddy train "phrase"`; 100k Piper clips | English Piper voice (`en-us`) in default pipeline | Not published | "plenty of frame budget" (no number) | Not published | Not published | Browser ONNX (CPU/GPU) |
| **sherpa-onnx KWS** | Code Apache-2.0; KWS weights: licence not stated in docs | None: open-vocabulary keywords file | No Dutch KWS model; English BPE, Chinese pinyin, zh-en | [1P] icefall tables (generic commands) | Not published | ≈ 5.2 MB int8 (zh-en) / 15.7 MB mobile archive | 160 ms / 320 ms (chunk 8 / 16) | WASM KWS app; 512 MB initial memory; ScriptProcessor |
| **Vosk / Kaldi (vosk-browser)** | Apache-2.0; nl small model Apache-2.0 | Runtime grammar list; no training | `vosk-model-small-nl-0.22` (39 MB), WER 22–27 % general ASR | Not published for KWS | ~300 MB RAM (small model) | 39 MB | Not published | 3P WASM, Web Worker, ScriptProcessor |
| **EfficientWord-Net** | Code Apache-2.0; browser demo MIT; weights: licence not stated | 4–10 recorded samples → `_ref.json` | Language-agnostic by design; MSWC data includes Dutch; no Dutch result | [1P] "95.40 % accuracy" (paper abstract) | Not published | 22.1 MB int8 / 87.6 MB fp32 ONNX | 1.5 s window, 0.75 s slide | 3P-style ORT-Web demo (Beta), AudioWorklet |
| **rustpotter** | Apache-2.0 | 3–8 WAVs (DTW reference) or trained model | Language-agnostic (MFCC); no Dutch result | Not published | Not published | Not published | 30 ms frames | WASM AudioWorklet (`rustpotter-worklet`) |
| **Mycroft Precise** | Apache-2.0 | `precise-collect/train` (Python/TF) | Not stated | [3P-ish] competitor plot in openWakeWord repo | Not published | Not published | Not published | Linux only |
| **Snowboy** | Apache-2.0 (source + one model) | Cloud API (shut down 2020) | Not stated | Plot-only in Picovoice benchmark | [1P] <10 % on weakest Pi | Not published | Not published | No web build |
| **Whisper (whisper.cpp wasm)** | MIT (code + weights) | None (transcribe, then match text) | Multilingual model | N/A | Browser RTF ≈ 0.33–0.5 (tiny/base, desktop) | 75 MiB tiny (~273 MB RAM) | Not a streaming KWS | WASM SIMD required |

## Per-engine findings

### Porcupine (Picovoice)

- **Licence/cost.**
  - The repo LICENSE is Apache-2.0 (https://github.com/Picovoice/porcupine/blob/master/LICENSE; npm `@picovoice/porcupine-web` 4.0.1 is Apache-2.0).
  - Use requires an AccessKey: "Anyone who is using Picovoice needs to have a valid AccessKey" (https://picovoice.ai/docs/porcupine/).
  - **[1P]** Picovoice staff say it needs intermittent connectivity "every couple of weeks"/"every few days" for licence management, while voice processing stays on-device (https://github.com/Picovoice/porcupine/issues/798, 2022-10-18; https://github.com/Picovoice/porcupine/issues/804, 2022-11-03; https://github.com/Picovoice/porcupine/issues/1241, 2024-03-12).
  - Usage is metered per monthly active user ("typically a unique device, app, or browser instance … within a 30-day period") (https://picovoice.ai/docs/faq/general/). The SDK has activation errors, including `PorcupineActivationLimitError` (https://picovoice.ai/docs/api/porcupine-web/).
  - The Terms of Use grant a "limited … revocable, non-transferable, non-sublicensable right"; they prohibit modifying the Software, circumventing licensing features and using the Services to train ML models; usage data is pushed to Picovoice's servers when online (https://picovoice.ai/docs/terms-of-use/, §5–7).
  - The FAQ says there are "no dedicated free or paid plans for personal or non-commercial use" and offers a one-time Free Trial for enterprise developers (https://picovoice.ai/docs/faq/general/). The Model API page says "You can obtain a free AccessKey from the Picovoice Console" (https://picovoice.ai/docs/model-api/porcupine/). The two pages are inconsistent. `https://picovoice.ai/pricing/` redirected to `/contact` on 2026-11-13; price per MAU is not published.
- **Custom keyword.**
  - Type the phrase in the Console; it is trained "within seconds" by transfer learning, then downloaded as a platform-specific `.ppn` (Web = WASM) (https://picovoice.ai/docs/porcupine/; https://picovoice.ai/docs/quick-start/porcupine-web/).
  - The REST API is `POST https://rest.picovoice.ai/{language}/api/ppn` with the phrase and AccessKey (https://picovoice.ai/docs/model-api/porcupine/). Training therefore happens server-side; the phrase is sent to Picovoice.
  - Guidance: ≥ 6 phonemes, avoid very short or very long phrases, diverse sounds (https://picovoice.ai/docs/tips/choosing-a-wake-word/).
- **Dutch.** The supported languages are English, French, German, Italian, Japanese, Korean, Mandarin, Portuguese and Spanish (https://picovoice.ai/docs/faq/porcupine/; https://github.com/Picovoice/porcupine/tree/master/lib/common has `porcupine_params_{de,es,fr,it,ja,ko,pt,zh}.pv` plus English). "Support for additional languages is available for commercial customers on a case-by-case basis" (README § Language Support). Behaviour for a Dutch-spoken phrase typed under another language model: not published.
- **FAR/FRR.**
  - **[1P]** "97 %+ accuracy (detection rate) with less than 1 false alarm in 10 hours in the presence of background speech and ambient noise" (https://picovoice.ai/docs/faq/porcupine/).
  - **[1P]** Benchmark repo: miss rate **2.7 %** at 1 false alarm per 10 h, averaged over 6 English keywords (alexa, computer, jarvis, smart mirror, snowboy, view glass). Positives are 300+ crowd-sourced recordings from 50+ speakers mixed with DEMAND noise at 10 dB SNR; the negative set is LibriSpeech test-clean. Compared with PocketSphinx 52.0 % and Snowboy 31.9 % [plot] (https://github.com/Picovoice/wake-word-benchmark; `doc/img/summary.png`).
  - **[3P-adjacent]** The openWakeWord author's own tests show Porcupine worse than openWakeWord on "alexa" (FRR ≈ 0.17 @ 0.56 FA/h, ≈ 0.13 @ 2 FA/h [plot]) but better than Precise on "hey mycroft" (FRR ≈ 0.04 @ 0.2–0.75 FA/h [plot]). The author cautions that sample sizes are small (https://github.com/dscripka/openWakeWord#performance-and-evaluation).
  - Picovoice states it works across accents but "it's impossible to quantify it" (FAQ).
- **CPU/battery.**
  - **[1P]** Standard model "about 1 MB of memory and less than 4 % of a single core on a Raspberry Pi 3" (FAQ). 0.6 % CPU on Raspberry Pi 5 32-bit vs Snowboy 3.8 % and PocketSphinx 12.1 % [plot] (benchmark README § Runtime; methodology in `runtime/README.md`).
  - Power: Picovoice declines to give wattage ("depends on numerous factors", FAQ). Browser/tablet CPU or battery: **not published**.
- **Size.** `porcupine_params.pv` is 984,948 B and `porcupine_params_de.pv` is 987,189 B. `lib/wasm/pv_porcupine_simd.wasm` is 200,230 B and `pv_porcupine_pthread.wasm` is 244,662 B (GitHub contents API, `master`). `.ppn` size: not published.
- **Latency.** Not published.
- **Browser.**
  - WebAssembly, with a Web Worker (`PorcupineWorker`); IndexedDB is required for worker mode. Chrome, Safari, Firefox and Edge are listed (https://github.com/Picovoice/porcupine/blob/master/binding/web/README.md; https://picovoice.ai/docs/faq/porcupine/).
  - Optional SharedArrayBuffer multithreading needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; otherwise it falls back to single-threaded.
  - `@picovoice/web-voice-processor` says all modern browsers incl. mobile are supported, needs a secure context, and its AudioWorklet is "not currently used" (https://github.com/Picovoice/web-voice-processor).
  - Latest release v4.0 (2025-12-11). iPadOS-specific constraints: not published by Picovoice.

### openWakeWord (David Scripka)

- **Licence.**
  - Code Apache-2.0. Pretrained models are CC BY-NC-SA 4.0 "due to the inclusion of datasets with unknown or restrictive licensing" (https://github.com/dscripka/openWakeWord#license).
  - The README does not separately state the licence of the shipped `melspectrogram.onnx`/`embedding_model.onnx` front-end files. The embedding architecture derives from Google's `speech_embedding` (Apache-2.0) (§ Model Architecture).
  - Models you train yourself carry whatever licence your training data allows (not stated by the project).
  - Cost: none.
- **Custom keyword.**
  - Fully automatic training script plus Colab (<1 h, "performance … may be low in some deployment scenarios") and a detailed notebook (README § Training New Models).
  - Positives are 100 % synthetic TTS ("minimum of several thousand" clips; example config recommends ≥ 20,000, often 100,000+). Negatives are ~30,000 h of speech, noise and music (`examples/custom_model.yml`, `docs/models/hey_mycroft.md`).
  - Pretrained models used ~31,000 h of negatives, including Common Voice 11 "representing multiple languages". Test positives were an American-English male speaker (`docs/models/hey_mycroft.md`).
  - Optional per-speaker "custom verifier" (logistic regression) to cut false accepts (`docs/custom_verifier_models.md`).
- **Dutch / TTS language.**
  - "Currently, openWakeWord only supports English, primarily because the pre-trained text-to-speech models used to generate training data are all based on english datasets" (README § Language Support).
  - `train.py` imports the dscripka fork of `piper-sample-generator`. The default model is `en_US-libritts_r-medium.pt` (https://github.com/rhasspy/piper-sample-generator, README). Release v2.0.0 (2023-10-06) also contains `nl_NL-mls-medium.pt`, `de_DE-mls-medium.pt` and `fr_FR-mls-medium.pt` (https://github.com/rhasspy/piper-sample-generator/releases/tag/v2.0.0).
  - openWakeWord issue #170 (2024-05-20, open) asks to expose these models in `train.py` (https://github.com/dscripka/openWakeWord/issues/170). No published evaluation of a Dutch openWakeWord model.
  - Piper has Dutch voices: `nl_NL` (mls, mls_5809, mls_7432, pim) and `nl_BE` (nathalie, rdh) (https://github.com/rhasspy/piper/blob/master/VOICES.md). Per-voice licences are CC-BY 4.0 (mls) or CC0 (pim, nathalie, rdh) (model cards in https://huggingface.co/rhasspy/piper-voices). The Piper repo is MIT but archived; a GPL-3.0 successor `OHF-Voice/piper1-gpl` exists.
- **FAR/FRR.**
  - **[1P]** Stated target for included models: FRR <5 % and FAR <0.5/h "with appropriate threshold tuning". The README calls these "subjective" (§ Pre-Trained Models).
  - **[1P]** Evaluation: FRR from clean clips mixed with noise at 5–10 dB SNR plus room impulse responses, or from manually collected far-field data. FAR from the DiPCo dinner-party corpus (~5.5 h) (§ Performance and Evaluation).
  - **[1P] [plot]** "alexa" (Picovoice positives, DEMAND noise 10 dB, RIR): openWakeWord FRR ≈ 0.04 at 0.4–1.5 FA/h and ≈ 0.03 at 2 FA/h (`docs/models/images/alexa_performance_plot.png`). "hey mycroft" (one speaker, home recordings): openWakeWord ≈ 0.02 at 0.37 FA/h and ≈ 0 at ≥ 0.55 FA/h; Precise ≈ 0.31 at 1.5–2 FA/h (`docs/models/images/hey_mycroft_performance.png`). The author says results are small-sample and "should be interpreted cautiously".
  - **[1P]** Fluent Speech Commands SLU accuracy ~97.5 % (not a wake-word metric).
  - No independent (3P) benchmark found; no Dutch data.
- **CPU/battery.** **[1P]** "a single core of a Raspberry Pi 3 can run 15–20 openWakeWord models simultaneously in real-time"; "likely too large for less powerful systems or micro-controllers"; several seconds per 80 ms frame on a quantised ESP32-S3 (README § Project Goals / FAQ, citing community reports). Browser/mobile CPU or battery: not published. A third-party write-up notes the pipeline must run continuously (VAD is a confirmation, not a trigger) and that the melspectrogram/VAD models fail on the ORT WebGL backend, so a WASM/WebGPU hybrid was used (https://deepcorelabs.com/open-wake-word-on-the-web/, **[3P]**, no timings given).
- **Size.** From release v0.5.1 assets: `melspectrogram.onnx` 1,087,958 B; `embedding_model.onnx` 1,326,578 B; head models 204 KB (`hey_rhasspy`) to 1.74 MB (`timer`), e.g. `alexa_v0.1.onnx` 854,246 B; optional `silero_vad.onnx` 1,807,522 B. An "alexa" pipeline without VAD ≈ 3.3 MB. A custom head is ~100k parameters (0.41 MB) per `docs/models/alexa.md`.
- **Latency.** Models process 80 ms frames; "audio frames should be multiples of 80 ms, with longer frames increasing overall efficiency at the cost of detection latency" (README). The head needs 16 embeddings of history (https://deepcorelabs.com/open-wake-word-on-the-web/). Phrase-end-to-event latency: not published.
- **Browser.**
  - The README FAQ says a JS port "is not currently on the roadmap". The repo's `examples/web` streams browser audio over websockets to a Python server.
  - **[3P]** `dnavarrom/openwakeword_wasm` (npm `openwakeword-wasm-browser`): onnxruntime-web, AudioWorklet with 1280-sample chunks, Silero VAD gate, bundled pretrained models only. Repo has no licence file; if `ortWasmPath` is omitted it loads ORT WASM from a CDN (https://github.com/dnavarrom/openwakeword_wasm, README).
  - ORT Web multithreading needs `crossOriginIsolated`; otherwise single-threaded (https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html). onnxruntime-web is MIT.

### microWakeWord (Kevin Ahrendt / Open Home Foundation)

- **Licence.** Code Apache-2.0. The ESPHome model repo states Apache-2.0 "cover[s] … the trained model weights … no separate or additional terms" (https://github.com/esphome/micro-wake-word-models, README § License). Training augmentation data includes WHAM! (CC BY-NC 4.0 per `documentation/data_sources.md`) and Common Voice (negatives); no legal analysis is given by the project.
- **Custom keyword.** Piper-generated samples + augmentation + MixConv streaming model based on Google `kws_streaming`. "Training a model that works well is still very difficult … early release … advanced users" (https://github.com/kahrendt/microWakeWord, README).
- **Dutch.** No Dutch model published. Model manifests carry `trained_languages` (e.g. `["en"]` in `okay_nabu.json`); the ESPHome docs define it as "primary languages/pronunciations used when training" (https://esphome.io/components/micro_wake_word/). Piper Dutch voices exist (see openWakeWord). No Dutch evaluation found.
- **FAR/FRR.** **[1P] [plot]** Only ROC PNGs (`benchmarks/{alexa,hey_jarvis,okay_nabu}_roc_curve.png`); the "okay nabu" curve on a "Picovoice Wakeword Test Dataset" shows FRR ≈ 0.020 for 0–0.75 FA/h and ≈ 0.0105 at 2 FA/h. No text numbers; test-set composition beyond the title not described.
- **CPU/battery.** Designed for low-power MCUs via TFLite Micro; sizes `tensor_arena_size: 26080` for okay_nabu. The openWakeWord author recommends it for very low-power devices (**[1P]** of a sibling project). Browser/mobile CPU or battery: not published.
- **Size.** v2 `.tflite`: alexa 55,856 B; hey_jarvis 52,272 B; hey_mycroft 57,248 B; okay_nabu 60,264 B; `vad.tflite` 34,328 B (https://github.com/esphome/micro-wake-word-models/tree/main/models/v2).
- **Latency.** Features every 10 ms, inference every 30 ms, `sliding_window_size` 5 and `probability_cutoff` 0.97 for okay_nabu; "a small [window] value lowers latency but may increase … false accepts". End-to-end latency: not published.
- **Browser.** No official or third-party browser port found (GitHub repo search, 2026-11-13). The front end is the TFLite-Micro `micro_speech` preprocessor, which would need a WASM build.

### hey-buddy (Benjamin Paine)

- **Licence.** Source and pretrained models Apache-2.0; pre-computed datasets CC-BY 4.0. Default augmentation datasets chosen for "commercial availability" (https://github.com/painebenjamin/hey-buddy, README § License / Augmentation Datasets). Piper TTS cited as MIT.
- **Custom keyword.** `heybuddy train "phrase"` generates 100,000 positive and 100,000 adversarial Piper samples, then trains on speech embeddings (Google speech-embedding, as in openWakeWord). Exports `.onnx` for a JS module (README § Training Models). The default training dataset is 72 GB (25–46 GB variants available).
- **Dutch.** The default pipeline uses `piper-libritts-en-r-medium` with the `en-us` espeak voice (`src/python/heybuddy/piper/pretrained.py`). The Python library "only works on Linux at the moment". No Dutch support documented.
- **FAR/FRR, CPU, size, latency.** Not published. The README claims "plenty of frame budget left over" for many models, without numbers. A live HuggingFace demo "runs entirely on-device".
- **Browser.** "deploying them to the browser for real-time use on CPU or GPU". iOS/Safari statements: not published. Last push 2025-07-25.

### sherpa-onnx keyword spotting (k2-fsa / Next-gen Kaldi)

- **Licence.** Code Apache-2.0 (also icefall). Licence of the KWS model weights is not stated on the model pages checked (https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html).
- **Custom keyword.** Open-vocabulary: no training. The keyword is encoded with `sherpa-onnx-cli text2token` into model tokens, with a per-keyword boosting score (`:`) and trigger threshold (`#`) (https://k2-fsa.github.io/sherpa/onnx/kws/index.html). Supported token types are `cjkchar, bpe, cjkchar+bpe, fpinyin, ppinyin, phone+ppinyin` (English CMU phonemes via `en.phone`).
- **Dutch.** Pretrained KWS models listed: Gigaspeech English (500 BPEs), WenetSpeech Chinese, zh-en 3M (2025-12-20). No Dutch model or Dutch lexicon is listed. Fine-tuning a new language is not documented on those pages.
- **FAR/FRR.**
  - **[1P]** icefall `egs/gigaspeech/KWS/RESULTS.md`: a 3.3 M-parameter model, positives from `pkufool/open-commands` (generic English commands, not wake phrases), negatives from the Gigaspeech test set (40 h). Original model: recall 86 % with 0.025 FA/h on 20 commands; large set (>200 commands) recall 83.6 % with 0.45 FA/h. Fine-tuned on the commands: recall 98.7 % with 0.6 FA/h (small set) and 97.9 % with 1.3 FA/h (large set).
  - **[1P]** The Chinese model's own notes say the original model's performance "is very poor" on product commands (recall 56.8 %) until fine-tuned (95.9 %) (`egs/wenetspeech/KWS/RESULTS.md`).
  - No Dutch data; no independent benchmark found.
- **CPU/battery.** Not published for KWS (no RTF on the KWS pages checked).
- **Size.** zh-en 3M package: int8 encoder 4.4 MB + fp32 decoder 743 KB + int8 joiner 85 KB ≈ 5.2 MB (fp32 encoder 12 MB). Release archives: 15.7 MB (gigaspeech "mobile") and 32.9 MB (zh-en, includes extras) (GitHub release `kws-models`).
- **Latency.** **[1P]** "The chunk_size=8 model has a latency of 160 ms, while the chunk_size=16 model has a latency of 320 ms" (lower latency usually means lower accuracy).
- **Browser.**
  - `wasm/kws` in the repo is built with `build-wasm-simd-kws.sh` (SIMD build) and uses `INITIAL_MEMORY=512MB` with memory growth. Its `app.js` uses `createScriptProcessor` with a 4096-sample buffer and a 16 kHz AudioContext. The repo's assets README points to the Chinese WenetSpeech model.
  - Safari/iPadOS behaviour with 512 MB initial memory: not published.

### Vosk / Kaldi (browser via `vosk-browser`)

- **Licence.** Vosk Apache-2.0; `vosk-browser` Apache-2.0 (npm 0.0.8, 2022-12-25) — **[3P]** port (https://github.com/ccoreilly/vosk-browser). Models: `vosk-model-small-nl-0.22` Apache-2.0 (39 MB); `vosk-model-nl-spraakherkenning-0.6` (860 MB) CC-BY-NC-SA (https://alphacephei.com/vosk/models).
- **Custom keyword.** No training. `grammar` (a JSON list of phrases, e.g. `["one two three", "[unk]"]`) restricts recognition (https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h; `grammar?: string` in `vosk-browser/lib/src/interfaces.ts`). "Most small model allow dynamic vocabulary reconfiguration". Handling of an out-of-lexicon word such as "Sodalis": not documented in the sources checked.
- **Dutch.** Dutch small model WER (general ASR, not KWS): 22.45 (Common Voice test), 26.80 (tv), 25.84 (MLS), 24.09 (VoxPopuli) (https://alphacephei.com/vosk/models).
- **FAR/FRR.** Not published for keyword spotting.
- **CPU/battery.** **[1P]** "Small model typically is around 50 Mb in size and requires about 300 Mb of memory in runtime" (models page). No CPU/RTF/battery numbers.
- **Latency.** Not published.
- **Browser.** WASM in a Web Worker; the README example uses `createScriptProcessor(4096, 1, 1)` (deprecated API; no AudioWorklet example found). iPadOS specifics: not published.

### EfficientWord-Net (Ant-Brain)

- **Licence.** Python package Apache-2.0 (`LICENSE.md`); in-browser demo repo MIT. Licence of the model weights is not separately stated; the model was trained on MLCommons Multilingual Spoken Words (CC-BY 4.0; 50 languages incl. Dutch, 1.13 GB for Dutch) (https://mlcommons.org/datasets/multilingual-spoken-words/).
- **Custom keyword.** Few-shot: 4–10 recordings of the phrase → `{wakeword}_ref.json`, no retraining (https://github.com/Ant-Brain/EfficientWord-Net, README § Generating Custom Wakewords). The browser demo can record samples and generate the reference locally.
- **Dutch.** Not stated. Training data includes Dutch; no evaluation on Dutch.
- **FAR/FRR.** **[1P]** The paper abstract reports "an accuracy of 95.40 %" with no FAR/FRR split or conditions in the abstract (https://doi.org/10.1142/S0219649222500599, 2022). No independent evaluation found.
- **CPU/battery.** Not published.
- **Size.** `resnet_50_arc`: fp32 87.6 MB, int8 22.1 MB; the browser demo ships a 22.1 MB `model.onnx` plus ~322 KB `*_ref.json` per keyword (GitHub contents API).
- **Latency.** Fixed 1.5 s window; the README example slides by 0.75 s with an 0.8 s relaxation time. End-to-end: not published.
- **Browser.** `EfficientWord-Net-InBrowser-Hotword-Detection`: ONNX Runtime Web + AudioWorklet (24,000-sample buffer), labelled "Status: Beta" and "Built with Gemini" in its README; last push 2026-02-10.

### rustpotter

- **Licence.** Apache-2.0 (code); `rustpotter-worklet` Apache-2.0.
- **Custom keyword.** Two modes (https://github.com/GiviMAD/rustpotter, README): (a) "wakeword reference" from 3–8 WAV recordings using MFCC + dynamic time warping, "less accuracy than a wakeword model trained with enough data"; (b) a trained classifier ("wakeword model") from tagged WAV sets.
- **Dutch.** Language-agnostic acoustics (no phonetic lexicon); no Dutch evaluation.
- **FAR/FRR / CPU / size.** Not published (README only says well-trained models give "very low missing or false detections").
- **Latency.** Input frames of 30 ms; MFCC every 10 ms; a partial detection is emitted after half the feature window of further updates.
- **Browser.** `rustpotter-worklet`: AudioWorkletProcessor + Worker + WASM; last release/push 2023-09-16. A browser sample recorder is linked from the README. Safari/iPadOS: not published.

### Mycroft Precise, Snowboy (legacy)

- **Precise:** Apache-2.0 (GitHub). README: "designed to run on Linux" (x86_64, armv7l binaries); RNN trained with `precise-train` from collected samples (https://github.com/MycroftAI/mycroft-precise, wiki "Training your own wake word"). No browser build found; no CPU/size/latency published. The only error-rate data found is the competitor plot in openWakeWord (Precise FRR ≈ 0.31 at 1.5–2 FA/h on one speaker's "hey mycroft" [plot]). Last push 2023-11-25.
- **Snowboy:** LICENSE (Apache-2.0) covers the source, libs, and `snowboy.umdl` only; "all other hotword models are governed by their own licenses". KITT.AI announced shutdown of all products "by Dec. 31st, 2020"; repo remains with community support only (https://github.com/Kitt-AI/snowboy). **[1P]** "<10 % CPU on the weakest Pi (single-core 700 MHz ARMv6)". Platforms listed do not include web. Benchmarked miss rate 31.9 % at 1 FA/10 h by Picovoice (see Porcupine) **[1P of a competitor]**. Custom models were trained via the now-closed web API.

### Whisper / whisper.cpp WASM (not a keyword spotter)

- MIT code **and** weights (https://github.com/openai/whisper, README § License). Multilingual models exist (README). No keyword training: transcribe and match text.
- `whisper.wasm`: needs WASM SIMD; "x2 or x3 real-time for the tiny and base models on a modern CPU and browser" (60 s audio in ~20–30 s) and a 120 s audio cap. Memory ~273 MB for `tiny` (75 MiB on disk) (https://github.com/ggml-org/whisper.cpp, `examples/whisper.wasm/README.md`, README § Memory usage). `stream.wasm` and `command.wasm` exist (continuous transcription / commands). No wake-word FAR/FRR, battery or tablet numbers published.

### Web Speech API (brief; not on-device by default)

- MDN: "By default, using speech recognition … involves a server-based recognition engine. Your audio is sent to a web service" (https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API). An on-device mode (`processLocally`) exists in the spec, but MDN browser-compat-data v8.1.9 lists it as unsupported (`version_added: false`) on Chrome Android and Safari iOS. It is not a wake-word API.

## Browser platform facts (apply to all WASM/ONNX options)

Source: `@mdn/browser-compat-data` v8.1.9 (https://github.com/mdn/browser-compat-data), first-party browser-vendor-derived data.

| Feature | Chrome Android | Safari iOS/iPadOS |
|---|---|---|
| AudioWorklet / AudioWorkletNode | 66 | 14.5 |
| WebAssembly fixed-width SIMD | 91 | 16.4 |
| WebAssembly threads/atomics | 88 | 15.2 |
| SharedArrayBuffer | 89 | 15.2 |
| `getUserMedia` | 53 | 11 |

- Multithreaded WASM needs cross-origin isolation (COOP/COEP headers). ORT Web enables threads only if `crossOriginIsolated` (https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html); Porcupine falls back to single-thread without it (see above).
- Microphone capture needs a secure context (HTTPS or localhost) (https://github.com/Picovoice/web-voice-processor).
- Continuous background/screen-locked microphone capture on iPadOS Safari or Android Chrome: not published in the sources checked.

## Gaps / not published

- **Dutch accuracy for every engine:** no FAR/FRR for Dutch-accented or Dutch-language phrases anywhere in the sources. All published curves and tables use English phrases and mostly English speakers.
- **Browser CPU/battery:** no engine publishes % CPU, RTF or mA/%-battery-per-hour for Android Chrome or iPadOS Safari. Only native numbers exist (Porcupine Pi 3 / Pi 5; openWakeWord Pi 3; Snowboy Pi Zero-class).
- **Phrase-end-to-event latency:** not published for any engine. Only frame/chunk parameters are (openWakeWord 80 ms frames; microWakeWord 30 ms stride; sherpa-onnx 160/320 ms; EfficientWord-Net 1.5 s window).
- **Numeric FAR/FRR for openWakeWord and microWakeWord:** only plots; values above are eyeballed ([plot]).
- **Porcupine:** price per MAU (pricing page redirected on 2026-11-13); iPadOS-specific limits; `.ppn` size; behaviour of an out-of-language phrase; whether Free Trial/Free Plan can be used by an MIT public repo (Terms are proprietary and the FAQ says B2B only).
- **Weights licences not stated:** sherpa-onnx KWS models, EfficientWord-Net weights, openWakeWord front-end ONNX files, `openwakeword_wasm` repo (no licence file).
- **Third-party ports** (openwakeword_wasm, vosk-browser, EfficientWord-Net browser demo, rustpotter-worklet) have no published accuracy/CPU data and mixed maintenance (vosk-browser 2022, rustpotter-worklet 2023).
- **Vosk grammar handling of out-of-vocabulary words** ("Sodalis") not documented.
- **Dutch Piper-voice quality for wake-word training** (and `nl_NL-mls-medium.pt` working with openWakeWord/microWakeWord/hey-buddy trainers): not documented by any project.

## Sources

Fetched 2026-11-13. Raw paths are on `main`/`master` unless noted.

- openWakeWord: https://github.com/dscripka/openWakeWord (README, `docs/models/{alexa,hey_mycroft}.md`, `docs/synthetic_data_generation.md`, `docs/custom_verifier_models.md`, `examples/custom_model.yml`, `openwakeword/train.py`); releases v0.5.1/v0.6.0 assets (GitHub API); issue https://github.com/dscripka/openWakeWord/issues/170
- Piper sample generator / voices: https://github.com/rhasspy/piper-sample-generator (README; release v2.0.0); https://github.com/rhasspy/piper/blob/master/VOICES.md; https://huggingface.co/rhasspy/piper-voices (model cards)
- openWakeWord web ports: https://github.com/dnavarrom/openwakeword_wasm; https://deepcorelabs.com/open-wake-word-on-the-web/
- microWakeWord: https://github.com/kahrendt/microWakeWord (README, `benchmarks/`, `documentation/data_sources.md`); https://github.com/esphome/micro-wake-word-models (`models/v2/*`); https://esphome.io/components/micro_wake_word/
- hey-buddy: https://github.com/painebenjamin/hey-buddy
- Porcupine: https://github.com/Picovoice/porcupine (README, LICENSE, `binding/web/README.md`, `lib/`); https://picovoice.ai/docs/porcupine/; https://picovoice.ai/docs/faq/porcupine/; https://picovoice.ai/docs/faq/general/; https://picovoice.ai/docs/terms-of-use/; https://picovoice.ai/docs/model-api/porcupine/; https://picovoice.ai/docs/quick-start/porcupine-web/; https://picovoice.ai/docs/api/porcupine-web/; https://picovoice.ai/docs/tips/choosing-a-wake-word/; https://github.com/Picovoice/wake-word-benchmark (README, `doc/img/*.png`, `runtime/README.md`); https://github.com/Picovoice/web-voice-processor; issues https://github.com/Picovoice/porcupine/issues/798, /804, /1241
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx (`wasm/kws/*`, release `kws-models`); https://k2-fsa.github.io/sherpa/onnx/kws/index.html; https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html; https://github.com/k2-fsa/icefall (`egs/gigaspeech/KWS/RESULTS.md`, `egs/wenetspeech/KWS/RESULTS.md`)
- Vosk: https://alphacephei.com/vosk/models; https://github.com/alphacep/vosk-api (`src/vosk_api.h`); https://github.com/ccoreilly/vosk-browser
- EfficientWord-Net: https://github.com/Ant-Brain/EfficientWord-Net; https://github.com/Ant-Brain/EfficientWord-Net-InBrowser-Hotword-Detection; https://doi.org/10.1142/S0219649222500599; https://mlcommons.org/datasets/multilingual-spoken-words/
- rustpotter: https://github.com/GiviMAD/rustpotter; https://github.com/GiviMAD/rustpotter-worklet
- Mycroft Precise: https://github.com/MycroftAI/mycroft-precise (README; wiki "Training your own wake word", "Software Comparison")
- Snowboy: https://github.com/Kitt-AI/snowboy (README, LICENSE)
- Whisper: https://github.com/openai/whisper; https://github.com/ggml-org/whisper.cpp (README; `examples/whisper.wasm`, `stream.wasm`, `command.wasm`)
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- Browser support / runtime: https://github.com/mdn/browser-compat-data (npm `@mdn/browser-compat-data` 8.1.9); https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
