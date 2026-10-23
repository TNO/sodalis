# Dutch TTS models on Hugging Face for a Mac host

Status: desk research and a **local four-prompt Mac speed trial** complete,
2026-10-23. Listening and intelligibility scores are still outstanding. A
model's Dutch tag, downloads, likes, or recent upload is not evidence of
Dutch voice quality or practical speed.

## Summary and recommendation

**For the next listening trial, start with Pocket TTS Dutch Q8 GGUF/Metal,
but keep Piper as the speed and rights baseline.** With this HF account's
upstream gate approved, Pocket generated the fixed Dutch short/long prompts
in 0.17/0.46 s on an M4 Max, compared with 0.06/0.23 s for Piper Ronnie.
The Pocket weights are CC BY 4.0, gated upstream, and carry prohibited-use
terms; its MIT runtime does not make the weights or bundled voices MIT.
We used **no bundled voice pack**: both Pocket and Audio8 were conditioned
on a locally generated Piper reference. No one has yet graded the sound.

**Audio8 TTS Preview 0.6B ONNX INT4 was also trialed.** The [base checkpoint](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b)
and [conversion](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4)
explicitly support Dutch and English, claim Apache-2.0 code and weights, and
document a macOS arm64 **CPU** runtime with an HTTP service, streaming PCM,
and a cancellation endpoint. Here its Dutch short/long responses took **7.54/72.65 s**
to complete, despite first PCM arriving in ~0.6 s; English was slower. It
does **not** meet conversational completion speed on these prompts. The
publisher's ~1.1–1.2 GiB M2 peak and English quality scores are claims for
different conditions, not substitutes for these M4 Max timings or a Dutch
listening score.

**Retain Piper Ronnie as Sodalis's measured local control**, not a proven
quality winner; it scored 5/10 in the existing single-listener Dutch review
and was fast on CPU. Its engine is GPL-3.0-or-later, so distributing it
requires a separate licensing decision. **Chatterbox Multilingual V3** is a
permissively licensed quality candidate if Mac MPS inference can beat its
previously measured ~39 s/reply on laptop CPU. MOSS-TTS Local Transformer
v1.5 is Apache-2.0 and supports Dutch, but its documented CUDA-centric
stack/large audio tokenizer makes it a lower-priority Mac experiment.

The most popular models in this search are **not** necessarily eligible:
Higgs TTS 3 requires a commercial license for product use; Voxtral TTS
and its GGUF conversion are CC BY-NC; KittenTTS 2 and the Audio8 **0.1B**
base checkpoint have revenue-limited custom licenses. A conversion's
permissive tag cannot override the upstream weights' restrictions.

## Scope

This is a follow-up to [the existing Dutch TTS evaluation](tts-providers.md)
and [Mac speech options](macos-speech-options.md). The question is whether
newer models in the [Hugging Face search for `tts` tagged `nl`, sorted by
trending](https://huggingface.co/models?language=nl&sort=trending&search=tts)
could give Sodalis better **Dutch and English** speech at usable
short-reply latency on a Mac, while permitting unrestricted open-source
project use. A Mac-native process can serve audio to the Compose speech
backend; a model need not run in a Linux container. No voice cloning is
required for the product, though these two trial engines used the licensed
synthetic references described below. Redistribution of a reference voice or model is a distinct
decision from user-initiated download.

## Method and hardware

Inspected the trending listing and queried the public Hugging Face model
metadata on **2026-10-23** for downloads, likes, last modified date, and
license, then checked publisher cards, source/runtime documentation, and
license text. Counts change and are **popularity indicators, not an
objective score or speed benchmark**. "Updated" is the repository's last
modification, not necessarily new training or improved weights. Trending
is a separate ranking, **not** equivalent to sorting by downloads or likes.
The HF `nl`/`tts` search includes models that explicitly omit Dutch in
their cards; those are marked ineligible below. Where a repository redirects to a
new owner, the current canonical owner is used.

The original desk-research phase downloaded no models or audio and ran no
inference. The subsequent local trial is recorded below; **no cloud
inference** was run. The earlier measurements in the [Sodalis baseline](tts-providers.md)
were on
M4 Max/128 GiB for a different MLX Voxtral TTS model and Piper, and an
i7-1355U laptop CPU for Piper, Chatterbox, and Parler. Those timings are
not measurements of these new models.

### Local Mac trial, 2026-10-23 (measured, not publisher claims)

Hardware: Apple M4 Max (`Mac16,5`), 128 GiB unified memory. Three local
engines ran **one at a time**, with one warm-up per voice; table rows are
single subsequent runs (not medians or a controlled quality study).
The *same four texts* were submitted to each engine:

| Prompt | Exact text |
| --- | --- |
| Dutch short | Goedemorgen, uw afspraak is morgen om half tien. |
| Dutch long | Goedemorgen, ik heb uw afspraak voor donderdag om half tien bevestigd. Het adres is Stationsstraat 24 in Utrecht. Laat het gerust weten als u liever een ander tijdstip kiest; dan bekijken we samen de mogelijkheden. |
| English short | Good morning, your appointment is tomorrow at nine thirty. |
| English long | Good morning, I have confirmed your appointment for Thursday at nine thirty. The address is 24 Station Street in Utrecht. Please let me know if another time would suit you better, and we can look at the available options together. |

For Audio8, a local Piper Ronnie/Kristin output of a **separate** matching
reference sentence and its exact transcript registered one synthetic voice
per language. Pocket cloned the same synthetic references directly rather
than fetching its predefined voice GGUFs, whose individual source rights
vary. Piper used `nl_NL-ronnie-medium` and `en_US-kristin-medium` (the
Ronnie card identifies CC0 training data; Kristin identifies public-domain
LibriVox recordings). This controls reference provenance, **not** perceived
voice quality: conditioning on Piper may influence the two newer models.
No real person's voice was cloned and no reference was sent to a remote
inference service.

First PCM measures request-to-first nonempty audio bytes (not the HTTP
headers); Piper's native iterator returns a sentence chunk, Audio8 uses its
NDJSON PCM stream, and Pocket its raw PCM HTTP stream. Total includes local
request overhead (Piper runs in-process); RTF = total synthesis seconds /
output audio seconds, lower is faster. Peak is sampled **process RSS** on
macOS, not a measurement of Metal GPU allocations or total unified memory.
Pocket's low RSS must not be interpreted as its total GPU-memory demand.

| Engine / prompt | First PCM | Total | Output | RTF | Peak process RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Piper Ronnie / Dutch short | 51 ms | 0.06 s | 4.10 s | 0.014 | 0.31 GiB |
| Piper Ronnie / Dutch long | 66 ms | 0.23 s | 17.02 s | 0.014 | 0.37 GiB |
| Piper Kristin / English short | 54 ms | 0.06 s | 3.75 s | 0.016 | 0.26 GiB |
| Piper Kristin / English long | 63 ms | 0.19 s | 12.90 s | 0.015 | 0.27 GiB |
| Audio8 0.6B INT4 CPU / Dutch short | 582 ms | 7.54 s | 3.67 s | 2.054 | 2.32 GiB |
| Audio8 0.6B INT4 CPU / Dutch long | 640 ms | 72.65 s | 16.25 s | 4.470 | 3.58 GiB |
| Audio8 0.6B INT4 CPU / English short | 601 ms | 8.80 s | 3.53 s | 2.493 | 2.99 GiB |
| Audio8 0.6B INT4 CPU / English long | 830 ms | 108.72 s | 15.84 s | 6.865 | 3.06 GiB |
| Pocket Dutch Q8/Metal / Dutch short | 61 ms | 0.17 s | 4.00 s | 0.042 | 0.26 GiB |
| Pocket Dutch Q8/Metal / Dutch long | 13 ms | 0.46 s | 16.72 s | 0.027 | 0.27 GiB |
| Pocket English Q8/Metal / English short | 20 ms | 0.14 s | 3.36 s | 0.043 | 0.24 GiB |
| Pocket English Q8/Metal / English long | 14 ms | 0.35 s | 13.28 s | 0.026 | 0.26 GiB |

The full combined rows, including excluded warm-ups, are in local JSON
`~/tts-trials/{piper-nl,piper-en,audio8,pocket-nl,pocket-en}-results.json`.
These files and all weights/audio are **outside git**. The twelve scored WAVs
for listening are:

| Engine | Dutch short / long | English short / long |
| --- | --- | --- |
| Piper | `~/tts-trials/samples/piper-nl-short.wav`, `~/tts-trials/samples/piper-nl-long.wav` | `~/tts-trials/samples/piper-en-short.wav`, `~/tts-trials/samples/piper-en-long.wav` |
| Audio8 | `~/tts-trials/samples/audio8-nl-short.wav`, `~/tts-trials/samples/audio8-nl-long.wav` | `~/tts-trials/samples/audio8-en-short.wav`, `~/tts-trials/samples/audio8-en-long.wav` |
| Pocket | `~/tts-trials/samples/pocket-nl-short.wav`, `~/tts-trials/samples/pocket-nl-long.wav` | `~/tts-trials/samples/pocket-en-short.wav`, `~/tts-trials/samples/pocket-en-long.wav` |

All twelve WAVs have valid mono sample rates/durations (Piper 22,050 Hz,
Audio8 44,100 Hz, Pocket 24,000 Hz); signal level was checked for the
Dutch samples. These checks do **not** establish spoken-text correctness,
naturalness, or absence of hallucinations.

**Model size and setup.** The pinned Audio8 conversion
`818569c6b832118ad68d61bbd873abe250fcd68a` occupies ~968 MB
including its optional registration encoder; its runtime checkout was
`07e40f5`, Apache-2.0. The Piper voice ONNX files are 62.95 MB (Ronnie)
and 63.53 MB (Kristin), from the MIT-tagged voice repository at `v1.0.0`;
the installed `piper-tts==1.8.0` runtime declares GPL-3.0-or-later (keep it a separate
process if distribution is considered). Pocket's conversion
`b5a0115aee9658c110d747debb03edd548c4b9c7` is 138.50 MB for
each language's Q8 pack; C++ runtime `fab7972` is MIT with an MIT ggml
submodule. Its upstream weights at
`db04f0e653473e5c7333c69686ac92b7460b0c1d` are CC BY 4.0,
plus the upstream gated prohibited-use notice; model attribution applies.
No bundled Pocket voices were downloaded or redistributed.

Reproduction setup: clone the pinned Audio8 runtime outside git, install
`onnx_runtime/requirements.txt` plus `tokenizers==0.22.2` in Python 3.11,
download the pinned ONNX repository including `.onnx`, `.data`, manifests,
tokenizer and registration encoder, run `arktts_runtime.service:app` with
`ARKTTS_MODEL_DIR`/`ARKTTS_VOICES_DIR` and `ARKTTS_THREADS=5` on localhost,
register the local reference WAV and exact transcript at
`/api/voices/register`, then request `/api/tts/stream`. Install Piper
1.8.0 in a separate Python 3.11 venv and use `PiperVoice.synthesize`.
For Pocket, after HF approval of `kyutai/pocket-tts` on the **user's**
account, build the pinned C++ runtime with `-DGGML_METAL=ON`, download
the pinned Dutch and `english_2026-09` Q8 packs, start `tts-server` with
`--device MTL0` on localhost **separately per language**, register the
local WAV at `/v1/audio/voices`, and stream PCM from `/v1/audio/speech`.
The service log verified `Backend: MTL0` / `Apple M4 Max`; Audio8 health
reported `CPUExecutionProvider` for all three ONNX sessions. The exact
temporary harness and reference WAVs remain under `~/tts-trials/`.

Setup issues: the authenticated Pocket account initially returned
`requires approval` for upstream files; the user requested/accepted
access, then the Dutch tokenizer became downloadable. No terms were
accepted by the agent. `hf download --include` with explicit filenames
omitted Audio8's small `.onnx` graph files despite downloading their
`.data` blobs; the graph files were fetched explicitly before startup.
Pocket's CMake reported missing OpenMP but built and ran with Metal.

## Results

### Popularity and eligibility snapshot

The rows sample high-trending models, recently updated Mac-relevant
candidates, and misleading Dutch tags rather than reproducing every search
result or claiming a stable trending order. Downloads,
likes, and modification dates below are from the model's public API at the
research date (not an independently reproducible fixed-time snapshot).

| Model | Downloads / likes | Last updated (UTC) | Dutch / English, license of weights | Mac or speed evidence | Verdict |
| --- | ---: | --- | --- | --- | --- |
| [Higgs TTS 3 4B](https://huggingface.co/bosonai/higgs-tts-3-4b) | 122,455 / 815 | 2026-09-04 | Both; **Boson research/non-commercial** license; creator grant for content does not license embedding in Sodalis | Card claims expressive speech, but no comparable Mac timing | **Exclude** for product use |
| [Voxtral 4B TTS](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) | 1,569 / 942 | 2026-03-31 | Both; **CC BY-NC 4.0** due to reference voices | Publisher's 70 ms figure is on an NVIDIA H200, not a Mac | **Exclude**, including [GGUF conversion](https://huggingface.co/cstr/voxtral-4b-tts-GGUF) (1,431 / 5; 2026-08-02) |
| [Parler-TTS Mini Multilingual v1.1](https://huggingface.co/parler-tts/parler-tts-mini-multilingual-v1.1) | 5,651 / 60 | 2024-12-04 | Both; **Apache-2.0** model; Dutch `Mark` voice | Sodalis measured **152 s median** over five short replies on laptop CPU; Mac GPU/MPS unmeasured | Eligible, not interactive on measured CPU |
| [MOSS-TTS Local Transformer v1.5](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5) | 114,703 / 74 | 2026-06-18 | Both explicitly listed; **Apache-2.0** card and separately [Apache-2.0 audio tokenizer](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-v2) | 48 kHz stereo, large tokenizer; setup pins CUDA PyTorch and uses remote code; no verified MLX/Metal runtime or Mac speed | Conditional, lower priority |
| [Audio8 TTS Preview 0.6B](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b) | 4,586 / 417 | 2026-08-19 | Both among 11 recommended; **Apache-2.0** code and weights with NOTICE | [Publisher ONNX INT4](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4) (760 / 55; 2026-08-02) tested on macOS arm64 CPU, ~1.1–1.2 GiB synthesis RSS claimed on M2; see measured M4 figures above | Trialed; too slow to complete these replies |
| [Pocket TTS GGUF](https://huggingface.co/Serveurperso/pocket-tts-GGUF) | 2,309 / 2 | 2026-09-27 | Separate Dutch and English packs; original **CC BY 4.0**, runtime **MIT**; gated terms accepted for this account, voice rights vary | Community [`pockettts.cpp`](https://github.com/ServeurpersoCom/pockettts.cpp) with Metal, Q8 Dutch pack 138 MB, HTTP PCM streaming; see measured M4 figures above | Trialed; first quality-listening candidate |
| [KittenTTS 2](https://huggingface.co/KittenML/kitten-tts-2) | 46,417 / 168 | 2026-10-22 | Both; weights under **Stellon Labs Community License**, which ends free commercial use at the specified revenue/funding limits; loader Apache-2.0 | Publisher reports CPU/Apple Silicon speed but no unrestricted weight grant | **Exclude** despite freshness |
| [Audio8 0.1B ONNX INT8](https://huggingface.co/Edge0/audio8-TTS-0.1B-ONNX-INT8) | 810 / 76 | 2026-08-28 | Conversion claims both and **Apache-2.0**, but [source 0.1B weights](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b) are **Audio8 Community License**, with a $2m revenue cap; original card does **not** list Dutch | Conversion says macOS arm64 tested, ~0.6 GB loaded; no Dutch quality evidence | **Exclude** pending explicit upstream relicense and Dutch validation |
| [Qwen3-TTS CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) | 1,938,636 / 2,163 | 2026-01-29 | Apache-2.0, but card's 10 supported languages **omit Dutch** | Claimed 97 ms latency cannot establish Dutch support | **Exclude** despite HF filter match |
| [MOSS-TTS Nano 100M](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M) | 114,273 / 244 | 2026-04-13 | Card's 20-language list **omits Dutch** despite search metadata | CPU/streaming claims not relevant without Dutch support | **Exclude** |

Other large MOSS v1.5 releases (including
[8B MOSS-TTS-v1.5](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5),
105,227 downloads / 214 likes, updated 2026-05-26; and
[LAION's 8B voice-acting fine-tune](https://huggingface.co/laion/moss-tts-v1.5-8b-voice-acting),
183 / 3, updated 2026-07-14) claim Dutch via the v1.5 family and
Apache-2.0 licensing, but do not offer verified Mac speed or a better
hardware fit than the smaller Local Transformer. Their audio tokenizer,
reference recordings, and finetune files need separate checks before
redistribution. Popularity does not imply the model runs on Metal.

### Quality and speed evidence that actually applies

- **Audio8 0.6B:** Publisher's unquantized model card reports English
  Seed-TTS WER 1.506% and English CV3 WER 3.128%; neither table gives Dutch
  WER. A recognizer's WER measures intelligibility, not pleasantness or
  latency. ONNX INT4 can change generation; there is no quantitative
  0.6B INT4 Dutch listening comparison. Locally measured first-audio and
  completion timings appear above; the ONNX
  runtime documents `/api/tts` (WAV), `/api/tts/stream` (newline-delimited
  JSON with base64 44.1 kHz PCM chunks), and `/api/tts/cancel`.
- **Pocket TTS:** Kyutai reports roughly 200 ms first chunk and 6x faster
  than real time on M4 MacBook Air using two CPU cores, but the original
  model card's main takeaways do not name Dutch (a third-party GGUF project
  supplies the Dutch pack). Our measured GGUF/Metal results above are not
  measurements of Kyutai's Python runtime. It lists separate voice origins with CC0,
  CC BY 4.0, and CC BY-NC 4.0; **do not indiscriminately redistribute
  predefined voices**. The GGUF server's `response_format: "pcm"` is raw
  s16le as generated; its `"wav"` returns a complete file.
- **MOSS v1.5:** Language tags are recommended to prevent multilingual
  regressions. The Local Transformer card documents SGLang-Omni streaming
  raw 48 kHz PCM, but the documented installation is CUDA-focused. An
  "OpenAI-compatible" `/v1/audio/speech` endpoint does not supply a
  Sodalis adapter, Mac acceleration, or known barge-in semantics.
- **Baseline:** Piper Ronnie made 5.6% Parakeet round-trip WER and 0.48 s
  median synthesis on the laptop CPU (50 Dutch sentences). The existing
  listener rated it 5/10. Native M4 Max Piper timing in the baseline
  used **Nathalie**, not Ronnie; no Ronnie M4 median can be inferred.
  Chatterbox V3 was liked on five sentences but took 38.69 s median on
  laptop CPU. These are not matched comparisons to Audio8/Pocket.

## Analysis

**Next-stage priority, informed by the local speed trial (subject to license
and listening):**

1. Pocket TTS **Dutch** GGUF Q8/Metal: fastest new candidate on this Mac,
   with a user-approved HF gate, CC BY weights plus prohibited-use terms,
   and ungraded Dutch/English output. Do not bundle its mixed-rights
   predefined voices; preserve attribution and assess quality first.
2. Piper Ronnie: measured faster still, with the known 5/10 listener
   baseline; its GPL runtime is a separate product-distribution decision.
3. Audio8 **0.6B** ONNX INT4: Apache code and weights, documented arm64
   service/PCM/cancellation, but slow completion and high RSS in this trial.
   The first chunk arrives quickly enough to audition, not to recommend
   interactive synthesis on this CPU setup.
4. Chatterbox Multilingual V3: MIT code/weights and encouraging prior
   Dutch listening, but no usable CPU latency and MPS performance unknown.
5. MOSS Local Transformer v1.5: eligible Apache model and tokenizer with
   Dutch and English, but much larger and a CUDA-centric documented path.
6. Parler-TTS: eligible and Dutch-intelligible in the prior test, but the
   measured laptop CPU latency is unacceptable for conversation.

This is a **speed-informed listening priority**, not a ranking by perceived
voice quality. Neither Audio8 nor Pocket has been listened to or scored by
the Sodalis owner. Keep Piper in the deployment until a candidate wins a matched
Dutch/English corpus review and meets the latency/cancellation bar.

An adapter should accept Sodalis's server-side text and voice selection,
decode Audio8's NDJSON/base64 or Pocket's raw PCM incrementally, resample
44.1/24 kHz mono to Sodalis's required PCM format, and propagate a cancelled
request to actual inference. The published endpoints **are not drop-in
replacements** for Sodalis's `/api/speech/tts`, even when labeled
OpenAI-compatible. For Audio8, an independent cancel endpoint plus
serialized inference needs a test showing that disconnect/cancel actually
releases capacity; for Pocket, test server cancellation and concurrency.
No browser-to-host access, cloud fallback, or bundled model weights is
proposed. If Compose reaches a host service, bind/expose only the intended
interface and authenticate it; do not expose an unauthenticated host-wide
TTS endpoint.

## Limitations

- Four fixed bilingual prompts per engine, one measured run each; no
  blind listening, local STT/word-error scoring, repeated-run distribution,
  cancellation/concurrency checks, or licensing opinion from counsel.
  Reported synthesis speed is not a Dutch intelligibility or quality score.
- HF counters and cards are mutable. A `language:nl` tag can disagree with
  the model card (Qwen3-TTS, MOSS Nano, Audio8 0.1B original), and a later
  conversion can advertise a different license from its source weights.
- Published English/Chinese WER, GPU results, and prior-model timings do
  not establish Dutch naturalness; use this trial's first-PCM figures
  only for this hardware, runtime revision, and reference.
- Voice cloning requires permission from the recorded speaker and
  verification of the particular reference recording's license; a
  permissive model weight license alone does not grant voice rights.
- Pocket's upstream gate was accepted by the user for this account, not
  by the agent. The gated prohibited-use terms need review before
  **distribution**; another user may require separate approval. CC BY 4.0
  requires attribution and is not an OSI software license.
- Audio8 0.6B ONNX is a publisher conversion, but its license statement
  should still be checked at a pinned revision with the exact codec,
  tokenizer and bundled reference assets before any redistribution.

## Open items

1. Have the owner listen to the twelve saved samples *blindly* and rate
   Dutch/English naturalness, pronunciation, voice stability and
   missing/extra words. Then repeat on the 50-sentence Dutch corpus,
   including names/numbers, with repeated warm/cold measurements and a
   permissively sourced reference that does not anchor the contenders to
   Piper's timbre. Consider Pocket's 24-layer variant only if Q8 quality
   falls short; its speed/rights still need checking.
2. Score the *actual* quantized output with Parakeet round-trip WER (the
   existing automatic gates: median synthesis <=1.5 s and Dutch WER <=10%)
   and a blind, same-sentence human listening review. Compare Mac hardware
   and both 18–74-character and long responses through the public Sodalis
   TTS API before replacing Ronnie.
3. Check stop/cancel after synthesis begins, stream chunk cadence, memory
   under concurrent requests, hot restart, and serialization. Confirm
   error signaling rather than success-shaped empty audio.
4. Pin and review the selected model, conversion, decoder/codec, voice
   source, NOTICE, and any third-party runtime licenses. For Pocket, ensure
   each downloader has upstream approval, preserve the CC BY attribution,
   and select a voice reference without NC restrictions; otherwise leave
   it evaluation-only.

## Primary sources

- [HF Dutch TTS search](https://huggingface.co/models?language=nl&sort=trending&search=tts)
  and each linked publisher model card in the table.
- [Audio8 0.6B source model](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b),
  [publisher's ONNX INT4 release](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4),
  [actual service protocol](https://github.com/Edge0-AI/Audio8_TTS/tree/master/onnx_runtime),
  [runtime LICENSE](https://github.com/Edge0-AI/Audio8_TTS/blob/master/LICENSE)
  and [NOTICE](https://github.com/Edge0-AI/Audio8_TTS/blob/master/NOTICE).
- [Audio8 0.1B source custom license](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b/blob/main/LICENSE)
  versus [0.1B INT8 conversion card](https://huggingface.co/Edge0/audio8-TTS-0.1B-ONNX-INT8).
- [Pocket GGUF model/pack terms](https://huggingface.co/Serveurperso/pocket-tts-GGUF),
  [Pocket C++ runtime and HTTP protocol](https://github.com/ServeurpersoCom/pockettts.cpp),
  [Kyutai model card](https://huggingface.co/kyutai/pocket-tts),
  and [individual reference-voice licenses](https://huggingface.co/kyutai/tts-voices).
- [MOSS Local v1.5 model](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5),
  [audio tokenizer](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-v2),
  and [source license](https://github.com/OpenMOSS/MOSS-TTS/blob/main/LICENSE).
- [Higgs TTS 3 license](https://huggingface.co/bosonai/higgs-tts-3-4b/blob/main/LICENSE),
  [Voxtral TTS license](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603),
  and [KittenTTS 2 weight license](https://huggingface.co/KittenML/kitten-tts-2/blob/main/LICENSE.md).
