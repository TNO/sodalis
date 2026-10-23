# Mac-native STT and TTS options

Status: research complete; no new local benchmarks, model downloads, or live
cloud checks. Updated 2026-10-23.

## Summary and recommendation

- **Sodalis STT: keep Parakeet TDT 0.6B v3 as the portable local default.**
  It already has Sodalis-specific Dutch measurements, runs faster than real
  time on CPU, supports Dutch and English, and its Apache-2.0 runtime plus
  CC-BY-4.0 model weights are usable with attribution. A Mac host service can
  be called from Compose, but the existing measurements do not show a
  Parakeet Metal/Core ML speedup.
- **Best measured Mac-specific alternative: Whisper.cpp on Metal.** Its MIT
  runtime and Whisper weights are permissively licensed, upstream explicitly
  supports Apple Silicon Metal, and the existing evaluation measured native
  Whisper Medium at 11.6% WER on the Dutch MLS subset. That score is better
  than the CPU-container Parakeet score on that subset, but timings were not
  recorded and the test set is small.
- **Most promising new STT experiment: Voxtral Mini 4B Realtime 2602.**
  Mistral publishes Dutch and English support, an Apache-2.0 model license,
  and vendor Fleurs results at a configurable 480 ms transcription delay.
  Its card's supported-language list names 13 languages; a separate feature
  bullet says "dozens," so use the explicit list rather than the broader
  marketing count.
  However, the documented realtime server path is vLLM; its published
  deployment target is a GPU with at least 16 GB, and no Apple Silicon Metal
  or MLX path was verified. It is not yet a recommended Mac implementation.
- **System-wide dictation: use macOS Dictation first** for typing in arbitrary
  fields, including email. Apple lists Dutch (Netherlands/Belgium) and many
  English locales for on-device/modeless Dictation, which requires downloading
  speech models. Enable the on-device option and verify the Keyboard settings
  privacy notice on the target Mac.
- **If the system-wide tool should use the same open model as Sodalis, try
  Handy configured for Parakeet V3.** Handy is an MIT-licensed offline
  desktop dictation app that pastes into the active text field and lists both
  Parakeet V3 and Whisper models. This uses the same model family, not the
  same running Sodalis service; verify the model version and attribution in
  its installed release.
- **Mac-native TTS: trial Audio8 TTS Preview 0.6B ONNX INT4 first** following
  the [newer Dutch TTS model comparison](dutch-tts-hugging-face.md). It has
  Apache-2.0 code/weights and a documented macOS arm64 CPU service; its
  Dutch voice quality and latency remain unmeasured. Apple system voices
  are an OS-only alternative, not a demonstrated quality improvement.
  Keep Piper `nl_NL-ronnie-medium` as the measured portable fallback only
  if its GPL-3.0-or-later engine is acceptable; Ronnie weights are CC0.
- **Do not select Voxtral 4B TTS for this permissive-license project.** The
  model inherits CC BY-NC 4.0 from its reference voices, and the documented
  vLLM-Omni deployment needs a GPU with at least 16 GB. Its Dutch and
  streaming claims do not remove those blockers.

## Scope

This evaluation asks which local, Mac-usable speech components fit Sodalis,
whose Docker Compose backend may call a host-native service, and which option
best provides system-wide dictation into arbitrary text fields. Only Dutch
and English are in scope. Code, model weights, voice/reference assets, model
conversions, and hosted services are considered separately for licensing.

The existing Sodalis STT and TTS evaluations remain the source of its
measured provider results:

- [Alternate STT providers](stt-providers.md), measurements through
  2026-10-16.
- [Dutch TTS providers](tts-providers.md), measurements through 2026-10-16.

No application code was changed. No models were downloaded and no cloud
provider was contacted for this research. A subsequent review of the
Hugging Face Dutch TTS listing is recorded separately in
[Dutch TTS models on Hugging Face for a Mac host](dutch-tts-hugging-face.md);
the TTS shortlist below reflects the original 2026-10-23 scope and does
not rank the newer candidates.

## Method and hardware

Reviewed the existing Sodalis evaluation measurements and current upstream
model cards, source repositories, license files, Apple developer
documentation, and Apple feature availability. “Vendor result” below means
the model publisher's reported score or latency, not a Sodalis measurement.
No new hardware, runtime compatibility, or listening test was available in
this research session.

Previously measured hardware/results are retained with their original
caveats: the small six-speaker MLS Dutch subset was run on a Mac, with native
Whisper Medium using Metal and Parakeet in a CPU container; the separate
private six-clip corpus was measured on an Intel i7-1355U laptop running
Linux under WSL2. Those datasets and platforms are not directly comparable.
The TTS Mac comparison used an M4 Max with 128 GB unified memory.

## Results

### STT shortlist

| Rank / option | Dutch and English evidence | Mac execution and integration | License and redistribution |
| --- | --- | --- | --- |
| **1. Parakeet TDT v3 + sherpa-onnx** | Model card lists both languages. Existing Sodalis results: 17.2% WER on the 215-word MLS subset and 8.6% on six private Dutch clips; CPU RTF 0.12 on the latter. | sherpa-onnx supports macOS arm64/x64 and has local batch and streaming APIs. Sodalis has a tested HTTP adapter, but the Mac-specific MLS run used a CPU container; no Metal/Core ML acceleration was established. | Runtime Apache-2.0; weights CC BY 4.0, requiring attribution. Check the exact conversion artifact's terms before redistributing it. |
| **2. Whisper.cpp (Metal)** | Whisper is multilingual. Existing native Mac Whisper Medium scored 11.6% WER on the same small MLS subset; the more recent private corpus results are CPU-only and must not be presented as Mac results. | Upstream explicitly supports Apple Silicon via Metal, as well as Intel Mac, Windows, and Linux. Its HTTP server exposes multipart `/inference`, close to Sodalis's existing Whisper adapter. No Mac timing was recorded in the existing MLS run. | Whisper.cpp code is MIT; OpenAI's Whisper model card identifies the model license as MIT. Check individual converted/quantized artifacts and include notices when redistributing. |
| **3. Voxtral Mini 4B Realtime 2602** | Model card lists Dutch and English. Publisher reports 7.07% Dutch and 4.90% English Fleurs WER at 480 ms delay; this is a vendor benchmark on a different corpus, not directly comparable with Sodalis's scores. | The model card's production realtime route is vLLM's WebSocket `/v1/realtime`; it is not the Sodalis multipart `/inference` API. The card specifies a GPU with at least 16 GB for its BF16 vLLM deployment. No native Metal/MLX support was confirmed. | Model weights Apache-2.0. Serving libraries and any quantized/conversion artifacts have their own licenses and must be checked. |
| **4. MLX Whisper** | Uses the multilingual Whisper models, including Dutch and English. No Sodalis Mac timing or independent accuracy comparison was found. | Apple Silicon-oriented MLX implementation with a Python transcribe API and CLI. It does not provide the existing Sodalis HTTP contract by itself, so a host service/adapter is required. | Whisper model terms remain MIT; review the selected converted checkpoint's repository metadata and provenance separately. |
| **macOS Speech framework** | Apple lists Dutch and English for on-device/modeless system Dictation. `SFSpeechRecognizer` supports locale-specific recognizers, but runtime availability and offline support must be checked on each Mac. | Native API, but not a Linux container engine; a macOS host adapter would be required. Apple documents a `supportsOnDeviceRecognition` capability, so do not silently assume a request stays local. | Proprietary OS framework and system speech models; not an open-weight Sodalis dependency and not redistributable as project assets. |

Voxtral Realtime is the most important new model to test if true incremental
captions matter. Its reported configurable delay and Dutch benchmark are
promising, and its model license meets the non-NC requirement. The execution
path is the blocker for a Mac recommendation: the official instructions
center on vLLM and a 16 GB GPU, not Apple Silicon Metal. The word
“open-source” in a card or API compatibility claim is not evidence of
compatibility with Sodalis's concrete session, partial, finish, and
cancellation endpoints.

### TTS shortlist

This was the initial shortlist before the [Hugging Face model
follow-up](dutch-tts-hugging-face.md). In particular, the Apple voice
prototype below is **not** the top recommendation for improving Dutch voice
quality; trial Audio8 0.6B ONNX first while keeping Piper as a control.

| Rank / option | Dutch and English evidence | Mac execution and integration | License and redistribution |
| --- | --- | --- | --- |
| **1. macOS AVSpeechSynthesizer** | Apple exposes installed voices through `AVSpeechSynthesisVoice.speechVoices()`. Apple feature availability includes Dutch speech and English locales, but the exact voices available to AVFoundation depend on the target OS and installed voice downloads. No Sodalis listening test was run. | Native macOS API; `write(_:toBufferCallback:)` generates speech and supplies audio buffers. A first-party Sodalis adapter must still validate sample format, conversion, cancellation, and request isolation. | Proprietary Apple OS/API and voices. The project can depend on the user's macOS installation without bundling Apple voice assets; do not redistribute them. |
| **2. Piper `nl_NL-ronnie-medium`** | Existing Sodalis TTS evaluation selected Ronnie as its preferred local Dutch voice after one listener rated it 5/10. Existing CPU corpus median was 0.48 s and Parakeet round-trip WER 5.6%. No equivalent English Piper voice was included in that Dutch test. | Existing service works through Compose. It ran much faster than real time on both the evaluated laptop CPU and M4 Max CPU, but the Piper HTTP service emits the full synthesized file rather than incremental audio. | Piper engine is GPL-3.0-or-later; Ronnie voice weights are CC0 according to the existing evaluation. Keep code and voice licensing distinct; assess GPL distribution implications. |
| **3. Chatterbox Multilingual V3** | Existing evaluation confirms a built-in Dutch voice and MIT code/weights. It was judged intelligible and expressive on five short Dutch clips; quality was not panel-rated. English is also supported by the multilingual model. | On the evaluated laptop CPU it took a median 38.69 s per reply and used 6.1 GiB RSS. Apple Silicon MPS performance and Sodalis streaming/cancellation were not measured; the Python `generate` path returns complete audio. | MIT code and weights per the existing upstream review; verify the pinned source revision and exact model files before redistribution. |
| **4. Voxtral 4B TTS 2603** | Model card advertises Dutch and English, 20 preset voices, and batch/streaming synthesis. Reported latency uses a single NVIDIA H200, not a Mac. | Official serving instructions recommend vLLM-Omni and state at least 16 GB GPU memory for BF16. No Mac/Metal runtime was verified; prior Sodalis MLX Voxtral results were for a different model/repository and do not validate this TTS release. | Model inherits CC BY-NC 4.0 from the included/reference voices. Exclude under the project's non-NC/permissive constraint. |

The existing measured alternative engines do not displace Piper for portable
conversation: the TTS evaluation found CPU Chatterbox, Parler, and Fish too
slow or unsuitable; F5-TTS lacked a verified Dutch checkpoint; and the
tested Voxtral TTS model used non-commercial weights. The Mac-native Apple voice path remains a possible OS-only fallback, not a
quality winner established by measurement. The newer Audio8 and Pocket
candidates are analyzed in the linked follow-up.

## Analysis

### Sodalis integration

Keep the already-tested provider selection and Sodalis speech API as the
boundary. The Compose service can call a host service, but the host-native
engine must still sit behind a Sodalis-owned adapter: do not have the browser
call an engine directly, expose an arbitrary host port, or silently fall
back to cloud.

For STT, first benchmark Parakeet running natively on the Mac (or through the
existing supported service) against native Whisper.cpp Medium/Turbo on the
same Dutch/English audio. Whisper.cpp is the lower-risk Metal trial because
its upstream runtime and Sodalis adapter path are already concrete. Parakeet
remains the practical default until a Mac-specific test shows an advantage.
Only after this baseline should Voxtral Realtime be tested on Apple Silicon;
the model card does not establish that its recommended server will run well
there.

For TTS, a Swift host adapter around AVSpeechSynthesizer could expose a
small, authenticated localhost API to the Compose speech service. Enumerate
installed Dutch/English voices at startup instead of hard-coding a voice
name. Verify that the chosen API returns PCM buffers (rather than only
playing through the host speaker), can be stopped on client cancellation,
and works when the app itself is in a container. Until then this is a
feasible integration design, not a tested provider.

### Global dictation and model reuse

macOS Dictation directly meets the “any text field or email” use case and
requires no Sodalis integration. Apple documents that general-text Dictation
can be processed on device, and its current language matrix lists Dutch
(Netherlands and Belgium) and English locales under On-Device and Modeless
Dictation; those speech models must be downloaded. Apple notes a search-box
exception for the privacy statement, so verify the precise Keyboard settings
notice and behavior rather than generalizing it to every text context.

For a same-model workflow, Handy is an alternative with a configurable
shortcut, active-field text insertion, offline processing, and model choices
including Whisper and Parakeet V3. Its repository code is MIT-licensed and
release v0.9.8 is available. Configure Parakeet V3 if matching Sodalis's
model matters, and check the actual downloaded model/version and required
CC-BY attribution. Handy is a separate app and separate inference process;
there is no verified way to share Sodalis's loaded model instance or settings
with it.

### Licensing and the word “permissive”

- MIT/Apache model or runtime licenses are the easiest fit for a permissive
  open-source distribution. A model license does not automatically cover
  conversion code, quantized copies, tokenizers, or voice/reference audio.
- CC BY 4.0 permits broad use but requires attribution; it is not an
  OSI-approved software license. Decide whether attribution-only assets meet
  the project's meaning of “permissive.”
- CC BY-NC 4.0 excludes commercial use and is not suitable for an
  unconstrained open-source project. Voxtral TTS is explicitly in this
  category despite its Dutch support and streaming claims.
- Piper's engine is GPL-3.0-or-later even though the selected Ronnie voice
  has CC0 weights. A separate HTTP process does not itself settle whether
  distributing both components is acceptable; the existing evaluation
  correctly leaves that for legal review.
- Apple system frameworks and voices can be used by software running on
  macOS, but are not project-owned open model assets. Keep them optional and
  never package system voice data in Sodalis.

## Limitations

- No new Mac benchmarks, audio generation, subjective voice review, or
  system-wide dictation trial was run. All numerical Sodalis results above
  are reproduced from the linked evaluations; vendor figures are labeled
  separately.
- The existing MLS Dutch sample is only six speakers/215 words. Results do
  not establish general Dutch performance, English performance, or quality
  across accents and microphones.
- Whisper's Mac MLS WER is known, but its elapsed time on that Mac was not
  recorded. Parakeet's Mac container result is not a native Metal benchmark.
- Apple's language availability and offline behavior vary by macOS version,
  region, voice download, and specific API. A system feature availability
  list is not a quality benchmark for Sodalis or a guarantee that a
  particular `SFSpeechRecognizer` request is on-device.
- Voxtral Realtime and Voxtral TTS are distinct models with distinct
  licenses. Do not carry over the earlier MLX Voxtral TTS timing to the
  current Voxtral TTS release or infer Mac support from an OpenAI-like API.
- Handy's README and release notes are upstream claims, not a Sodalis
  integration test. Permissions, chosen model artifact, insertion behavior,
  and Dutch/English recognition should be checked on the target Mac.
- Apple TTS PCM export and cancellation have not been proven through the
  Sodalis public TTS contract.

## Open items

1. On the target Apple Silicon Mac, run the existing Dutch corpus and a
   matched English corpus through Parakeet and Whisper.cpp with recorded
   wall time, cold start, memory, WER, and concurrent stack load.
2. Validate Voxtral Realtime on Apple Silicon before treating it as a
   practical candidate: install only after the user explicitly chooses to
   download weights; verify its supported runtime, memory pressure, duplex
   streaming behavior, cancellation, and Sodalis adapter compatibility.
3. Test macOS Dictation in Dutch and English across representative fields
   (including Mail and browser forms); record the on-device setting,
   language model downloads, privacy notice, and punctuation behavior.
4. Trial Handy with the same Parakeet V3 artifact as Sodalis and verify
   active-field insertion, permissions, model version, language selection,
   attribution, and the app's offline behavior.
5. Prototype AVSpeechSynthesizer on a Mac: enumerate available Dutch and
   English voices; compare short and long Sodalis sentences by listener
   review; measure first PCM and completion latency; test interruption and
   WAV/PCM conversion through the public TTS API; document OS/voice
   availability and distribution boundaries.
6. Decide whether CC-BY model weights satisfy Sodalis's intended
   permissive-licensing policy, and obtain legal review of the GPL Piper
   engine before distributing it.

## Primary sources

- Apple: [Dictation on Mac](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac),
  [macOS feature availability](https://www.apple.com/macos/feature-availability/#dictation),
  [Speech framework](https://developer.apple.com/documentation/speech),
  [`supportsOnDeviceRecognition`](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition),
  [`requiresOnDeviceRecognition`](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition),
  [AVSpeechSynthesizer](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer),
  [generating speech audio buffers](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:)),
  and [available AVSpeechSynthesisVoice instances](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice/speechvoices()).
- [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) and its
  [MIT license](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE);
  OpenAI [Whisper model card](https://github.com/openai/whisper/blob/main/model-card.md);
  Apple [MLX Whisper example](https://github.com/ml-explore/mlx-examples/tree/main/whisper).
- NVIDIA [Parakeet TDT 0.6B v3 model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3);
  [sherpa-onnx platform/runtime documentation](https://github.com/k2-fsa/sherpa-onnx)
  and [Apache-2.0 license](https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/LICENSE).
- Mistral [Voxtral Mini 4B Realtime 2602 model card](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602)
  and [Voxtral 4B TTS 2603 model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603);
  Resemble AI [Chatterbox repository and model information](https://github.com/resemble-ai/chatterbox).
- [Handy source repository](https://github.com/cjpais/Handy),
  [MIT license](https://raw.githubusercontent.com/cjpais/Handy/main/LICENSE),
  and [release notes](https://github.com/cjpais/Handy/releases).
- [Piper 1 GPL repository](https://github.com/OHF-Voice/piper1-gpl) and
  [Dutch Ronnie model files](https://huggingface.co/rhasspy/piper-voices/tree/main/nl/nl_NL/ronnie/medium),
  with [voice metadata](https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json).
