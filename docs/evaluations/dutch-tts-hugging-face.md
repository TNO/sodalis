# Dutch TTS models on Hugging Face for a Mac host

Status: desk research complete, 2026-10-23; **no new synthesis or listening
measurements**. A model's Dutch tag, downloads, likes, or recent upload is not
evidence of Dutch voice quality or practical speed.

## Summary and recommendation

**First local trial: Audio8 TTS Preview 0.6B, specifically the publisher's
ONNX INT4 conversion.** The [base checkpoint](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b)
and [conversion](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4)
explicitly support Dutch and English, claim Apache-2.0 code and weights, and
document a macOS arm64 **CPU** runtime with an HTTP service, streaming PCM,
and cancellation endpoint. On the publisher's M2/16 GB machine the service
used about 1.0 GiB loaded and 1.1–1.2 GiB during synthesis. **Neither Dutch
intelligibility/naturalness nor first-audio/total latency on the Mac was
measured**; its quality benchmarks omit Dutch and apply to the unquantized
checkpoint. Compare the actual quantized output against Sodalis's measured
Piper Ronnie baseline before choosing it for the product.

**Second trial if a Metal backend is important: Pocket TTS Dutch via
`pockettts.cpp` and its corresponding Dutch GGUF pack**, subject to reviewing
the gated upstream model terms and the specific voice's provenance.
Its C++ runtime documents Metal, a streaming PCM HTTP response, and
distinct Dutch and English packs. Kyutai reports ~200 ms first audio and
6x real-time on an M4 MacBook Air **for Pocket TTS generally, not for this
third-party Dutch conversion**. Dutch quality/speed and the rights in the
packaged voice states need independent validation. Do not treat an MIT
runtime as licensing the CC-BY-4.0 weights or every reference voice.

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
required. Redistribution of a reference voice or model is a distinct
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

No models or audio files were downloaded. No local model, Mac runtime, API,
cloud inference, or subjective listening test was run for this follow-up.
The only prior measured hardware here is from the [Sodalis baseline](tts-providers.md):
M4 Max/128 GiB for a different MLX Voxtral TTS model and Piper, and an
i7-1355U laptop CPU for Piper, Chatterbox, and Parler. Those timings are
not measurements of these new models.

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
| [Audio8 TTS Preview 0.6B](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b) | 4,586 / 417 | 2026-08-19 | Both among 11 recommended; **Apache-2.0** code and weights with NOTICE | [Publisher ONNX INT4](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4) (760 / 55; 2026-08-02) tested on macOS arm64 CPU, ~1.1–1.2 GiB synthesis RSS; no reported end-to-end Dutch latency | **First trial** |
| [Pocket TTS GGUF](https://huggingface.co/Serveurperso/pocket-tts-GGUF) | 2,309 / 2 | 2026-09-27 | Separate Dutch and English packs; original **CC BY 4.0**, runtime **MIT**; check gated upstream terms and voice rights | Community [`pockettts.cpp`](https://github.com/ServeurpersoCom/pockettts.cpp) documents Apple Metal, Q8 Dutch pack 138 MB plus 170 MB voices (6-layer), HTTP PCM streaming. No Dutch Mac latency | **Second trial, conditional** |
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
  0.6B INT4 Dutch listening comparison or first-audio timing. The ONNX
  runtime documents `/api/tts` (WAV), `/api/tts/stream` (newline-delimited
  JSON with base64 44.1 kHz PCM chunks), and `/api/tts/cancel`.
- **Pocket TTS:** Kyutai reports roughly 200 ms first chunk and 6x faster
  than real time on M4 MacBook Air using two CPU cores, but the original
  model card's main takeaways do not name Dutch (a third-party GGUF project
  supplies the Dutch pack). It lists separate voice origins with CC0,
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

**Rank for a Mac quality/speed trial (subject to license):**

1. Audio8 **0.6B** ONNX INT4: strongest combination of explicit Dutch,
   Apache code and source weights, documented arm64 runtime, modest memory,
   actual local PCM streaming and cancellation endpoints. It runs on CPU
   only; the existence of an Apple Mac test does **not** imply Metal speed.
2. Pocket TTS **Dutch** GGUF: compelling fast/Metal architecture and
   small footprint, but a third-party conversion, gated upstream model,
   mixed voice-reference licenses, and no verified Dutch Mac latency.
3. Chatterbox Multilingual V3: MIT code/weights and encouraging prior
   Dutch listening, but no usable CPU latency and MPS performance unknown.
4. MOSS Local Transformer v1.5: eligible Apache model and tokenizer with
   Dutch and English, but much larger and a CUDA-centric documented path.
5. Parler-TTS: eligible and Dutch-intelligible in the prior test, but the
   measured laptop CPU latency is unacceptable for conversation.

This is a **trial priority**, not a proven ranking by perceived voice
quality. Neither Audio8 nor Pocket has been listened to by the Sodalis
owner. Keep Piper in the deployment until a candidate wins a matched
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

- No audio generated, model files fetched, installation, latency benchmark,
  native Mac listening comparison, or licensing opinion from counsel. Only
  model metadata, docs, and license text were read.
- HF counters and cards are mutable. A `language:nl` tag can disagree with
  the model card (Qwen3-TTS, MOSS Nano, Audio8 0.1B original), and a later
  conversion can advertise a different license from its source weights.
- Published English/Chinese WER, GPU results, and prior-model timings do
  not establish Dutch naturalness or Mac first-audio speed.
- Voice cloning requires permission from the recorded speaker and
  verification of the particular reference recording's license; a
  permissive model weight license alone does not grant voice rights.
- Pocket's gated upstream terms and restrictive use language require
  review before considering it a permissive **distribution** candidate.
  CC BY 4.0 itself requires attribution and is not an OSI software license.
- Audio8 0.6B ONNX is a publisher conversion, but its license statement
  should still be checked at a pinned revision with the exact codec,
  tokenizer and bundled reference assets before any redistribution.

## Open items

1. On the intended Mac, compare Audio8 0.6B ONNX INT4, Pocket Dutch
   6-/24-layer GGUF (if terms allow), and Piper Ronnie using the same
   50-sentence Dutch corpus plus English replies and a consented fixed
   voice. Record warm/cold first PCM, completion, RTF, peak RAM, playback
   quality, pronunciation of numbers/names, and repeated-run stability.
2. Score the *actual* quantized output with Parakeet round-trip WER (the
   existing automatic gates: median synthesis <=1.5 s and Dutch WER <=10%)
   and a blind, same-sentence human listening review. Compare Mac hardware
   and both 18–74-character and long responses through the public Sodalis
   TTS API before replacing Ronnie.
3. Check stop/cancel after synthesis begins, stream chunk cadence, memory
   under concurrent requests, hot restart, and serialization. Confirm
   error signaling rather than success-shaped empty audio.
4. Pin and review the selected model, conversion, decoder/codec, voice
   source, NOTICE, and any third-party runtime licenses. For Pocket, resolve
   upstream gating and choose a voice reference licensed without NC
   restrictions; otherwise leave it evaluation-only.

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
