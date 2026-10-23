# 0036 Evaluating alternate TTS providers

Status: done
Priority: medium
Subsystem: speech
Depends on: 0030, 0034

Related: [Mac-native STT and TTS options](../docs/evaluations/macos-speech-options.md).
Follow-up research: [Dutch TTS models on Hugging Face for a Mac host](../docs/evaluations/dutch-tts-hugging-face.md).

## Context

Once independent speech provider selection and Compose profiles are in place,
evaluate Chatterbox, Azure AI Speech,
[Fish Speech](https://github.com/fishaudio/fish-speech), and
[F5-TTS](https://github.com/SWivid/F5-TTS) as alternate TTS implementations
without changing the Sodalis browser contract.

## Acceptance Criteria

- Evaluate Chatterbox, Azure AI Speech, Fish Speech, and F5-TTS against the
  Sodalis TTS contract, including Dutch voice quality, streaming audio,
  cancellation, latency, licensing, and Windows/Linux/macOS deployment.
- Integrate each target that can meet the contract through a Sodalis-owned
  adapter; never let the browser call the engine or Azure directly.
- Add a selectable Compose profile for a compatible local container and
  explicit server-side configuration for a cloud/external provider.
- Preserve explicit provider selection and prohibit silent cloud fallback.
- Add adapter tests and a documented compatibility/configuration matrix.
- For any target that cannot meet the contract, document the verified
  limitation and do not claim unsupported capabilities.

## Implementation Notes

- The current Piper path remains available.
- TTS selection is established in task `0030`; the development Compose stack
  is established in task `0034`.
- Check model weights and runtime terms separately from source-code licenses.
  Fish Speech's current README lists a Fish Audio Research License for code
  and weights; F5-TTS lists MIT for code but CC-BY-NC for pretrained models.
  Assess Dutch voice/model availability and practical CPU/Apple Silicon
  performance before proposing either for the local development stack.
- The final, consolidated analysis is in
  `docs/evaluations/tts-providers.md` (see `docs/evaluations/README.md`).

## Current decision (2026-10-23)

The user selected Pocket TTS for now, but explicitly asked not to begin
Sodalis integration. The selection is recorded in
`docs/evaluations/dutch-tts-hugging-face.md#current-selection-user-directed-2026-10-23`.

- Engine: `pockettts.cpp` Q8 GGUF/Metal (`MTL0`), runtime revision
  `fab79722efc72f79d062de7a3a4472fc430a385d`; Dutch and English Q8 pack
  conversion revision `b5a0115aee9658c110d747debb03edd548c4b9c7`, from
  upstream weights revision `db04f0e653473e5c7333c69686ac92b7460b0c1d`.
- Dutch voice: Pocket clones `~/tts-trials/samples/piper-female-nl-reference.wav`,
  generated using Piper `nl_NL-mls-medium`, speaker id 10 (MLS speaker
  12500). Its dataset is MLS/OpenSLR 94, CC BY 4.0; attribution to
  "Multilingual LibriSpeech", Pratap et al. 2020, and the LibriVox reader is
  required.
- English pair was also used: Pocket's English Q8 pack clones
  `~/tts-trials/samples/piper-female-en-reference.wav`, generated with
  `en_US-ljspeech-medium` (LJ Speech, public domain).
- References are outside git. To regenerate, use Piper 1.8.0 and
  `~/tts-trials/models/piper/`. Dutch voice/settings: `nl_NL-mls-medium`,
  `SynthesisConfig(speaker_id=10)`, text `Hallo, ik spreek vandaag een paar
  zinnen in het Nederlands voor deze stemtest.` English:
  `en_US-ljspeech-medium`, default synthesis config, text `Hello, I am
  reading a few English sentences today for this voice test.` Neither Piper
  call set a seed; Piper exposes no seed parameter in this harness, so
  byte-identical regeneration is not guaranteed.
- The selected normalized Pocket sample used reference voice
  `piper-female-nl-reference`, Dutch Q8 pack and seed `42`. Its exact input
  text is recorded in the linked evaluation.
- Requirement before Pocket: normalize Dutch numbers (including house
  numbers), dates and times into spoken forms.
- Before integration: complete blind listening, Parakeet WER on the fixed
  prompts and Dutch corpus, verify in-flight cancellation through the public
  route, and review gated Pocket weight terms and Docker redistribution
  requirements. Do not bundle or redistribute Pocket weights before review.

## Agent Notes

- 2026-10-23 Copilot: User selected Pocket TTS Q8 GGUF/Metal with the female
  Dutch reference sample, and requested that no Sodalis integration start
  yet. Recorded the engine/weight revisions, Dutch and English reference
  voices/licences, regeneration recipe, normalization requirement and
  pre-integration checks above and in the linked Hugging Face evaluation.
  Reference WAVs remain outside git. Do not begin integration until the
  listed listening, WER, cancellation and gated-weight/redistribution checks
  are complete.
- 2026-10-23 Copilot: Ran VibeVoice-Realtime-0.5B locally as a
  research-only listening trial, at the user's explicit acceptance of the
  card's research-only terms. It is **not eligible for Sodalis**. It read
  the raw "24" correctly but ran at RTF 2.4–4.3 on MPS, and no audible
  disclaimer appeared. Pocket remains the selection. Details are in the
  Hugging Face evaluation. Setup gotcha: its preset loader needs
  `torch==2.7.1`, because torch 2.14 rejects the presets under
  `weights_only=True`.
- Chatterbox and Azure AI Speech are evaluation targets; integrate when they
  meet the provider contract and platform constraints.
- Added Fish Speech and F5-TTS for review, not as selected engines. Licensing
  and macOS deployment need explicit checks before an integration decision.
- The local `language-course-compiler` is a consumer of an HTTP TTS service,
  not an additional synthesis engine. Review its backend separately from its
  lesson-generation and transcript workflow.
- 2026-10-05 Copilot: Kept Piper as the default and added an explicitly
  configured server-side Azure REST adapter for Dutch SSML and streaming raw
  22,050 Hz PCM, with HTTPS/key/voice validation and abort propagation.
  Verified five Azure adapter tests, provider selection and TTS public-route
  tests without calling Azure; real Dutch voice quality, latency, quotas, and
  cloud billing remain untested. No cloud fallback is enabled.
- 2026-10-05 Copilot: Verified Chatterbox Multilingual V3 advertises Dutch
  and MIT code/weights but its Python `generate` returns complete audio;
  CPU/MPS latency, incremental delivery, and cancellation remain untested.
  Verified Fish Speech **1.5** weights declare CC BY-NC-SA 4.0 and its
  matching v1.5.0 code is Apache-2.0. Current Fish S2 instead uses a Fish
  Audio Research License and must not be substituted. User approved only
  non-commercial local evaluation with no model weights in source or
  distributable images. The 1.5 HTTP API supports streamed WAV but its Dutch
  quality, resource use, 22,050 Hz conversion, and cancellation still need a
  local container trial. F5-TTS code is MIT and official pretrained weights
  CC BY-NC; the official checkpoint targets Chinese/English, not verified
  Dutch. Neither Fish 1.5 nor F5 is yet offered as a selectable profile.
  Do not mark this task done until compatible local candidates have been
  tested against the public Sodalis TTS contract or ruled out with evidence.
- 2026-10-05 Copilot: Built an evaluation-only Fish Speech 1.5 CPU service
  from pinned source, mounting ignored pinned CC BY-NC-SA model weights
  read-only. The upstream stream sends a WAV header and appends the entire
  waveform after streaming segments; a narrow patch removes that duplicate.
  On an 8 GB macOS ARM Podman VM, CPU warmup took ~68 seconds and a request for
  `Hoe oud bent u?` emitted **no audio within ~160 seconds** at ~0.4
  tokens/second, ~2 GB RAM and ~600% CPU. After client disconnect inference
  kept using CPU; stopped the evaluation container explicitly. This fails
  practical voice-chat latency and effective inference cancellation on that
  machine, so the profile remains standalone, **not a selectable Sodalis
  TTS provider**; no Dutch voice-quality measurement was possible. The source
  LICENSE says Apache-2.0 but pyproject metadata says CC BY-NC-SA, so
  redistribution rights need clarification. Neither Fish nor F5 weights
  ship in an image or repository; no MLS voice was cloned. Windows/Linux
  runtime, GPU speed, and live Azure voice/latency remain untested. Keep
  the task in progress until those criteria are resolved; Piper remains the
  only validated local default.
- 2026-10-05 Copilot: Reviewed the local `voxtral-api`, `vibevoice-mlx`, and
  `kugelaudio-open` projects read-only as further candidates. The Voxtral MLX
  model advertises Dutch preset voices, but the current shared HTTP API waits
  for full synthesis and returns a file, not generated chunks. The original
  VibeVoice 1.5B model card lists English and Chinese, not Dutch; the
  KugelAudio model card lists Dutch but warns of uneven language quality.
  Dutch output, short-reply first-audio latency, in-flight cancellation, and
  PCM conversion remain to be measured before integrating any of them.
- 2026-10-05 Copilot: Ran Fish 1.5 natively on the M4 Max with PyTorch MPS.
  Its upstream `torch.isin` needs matching tensor dtypes on MPS; a
  native-evaluation-only patch fixes this and omits optional PyAudio, whose
  PortAudio headers were unavailable. With fp16 and pinned weights, warmup
  completed and `Hoe oud bent u?` yielded 114,688 bytes of 44.1 kHz PCM
  (~1.30 s) in 3.89 s to first PCM and completion, at ~1.12 GiB process RSS
  after the request (not peak). The streaming header advertises zero frames
  and requires rewrapping for a playable file. No listener validated Dutch
  intelligibility. A longer request kept the server busy after client
  disconnect (health timed out); SIGTERM did not interrupt it promptly, so
  it was stopped by PID. Keep Fish evaluation-only until cancellation,
  long-reply timing, audio quality, resampling, and cross-platform behavior
  meet the contract. No live Azure test was performed.
- 2026-10-05 Copilot: Added a reproducible 50-sentence Dutch avatar listening
  comparison for native Piper, Fish 1.5 MPS, and the Voxtral 6-bit MLX and
  KugelAudio MLX backends in the user's `tts-mlx` checkout. A separate
  first utterance warms each engine and is excluded from scores. All 200
  generated clips were checked for nonempty mono PCM16 and match the
  transcript and per-engine metrics; HTML audio controls compare matching
  sentences side by side. On the M4 Max the median synthesis time was
  0.044 s Piper (CPU), 1.32 s Voxtral (Metal), 11.72 s Fish (MPS), and
  20.06 s KugelAudio (Metal); peak RSS was 0.28, 3.84, 6.64, and 16.58
  GiB respectively. Fish RSS grew across the batch. The sample clips and
  measurements are local-only under ignored `models/tts-comparison/`.
  Dutch intelligibility, prosody, and transcript fidelity need human review;
  no production adapter, external account, or cloning consent is implied.
- 2026-10-08 Copilot: Measured Linux CPU runtime (WSL2 Ubuntu 24.04, Intel
  i7-1355U, 12 logical CPUs, ~7.6 GB RAM, no GPU) with `tts-compare.py`, which
  now has a `chatterbox` backend and reports Linux RSS in the correct units.
  Piper `nl_BE-nathalie-medium`: 50/50 clips, 0.36 s median, RTF 0.13,
  0.26 GiB RSS. Chatterbox Multilingual V3 (pinned source; PyPI 0.1.7 lacks
  V3; built-in voice, `nl`, no cloning): 38.7 s median over 5 clips (RTF
  ~16), 6.1 GiB RSS; one attempt crashed the WSL VM. Chatterbox therefore
  fails interactive latency on laptop CPU; GPU/MPS timing, Dutch listening
  quality, streaming and cancellation remain unmeasured. Azure stays
  untested live (no key available). F5-TTS remains ruled out for lack of a
  verified Dutch checkpoint.
- 2026-10-15 Copilot: The user approved extending this task with extra Dutch
  candidates (all nine Piper Dutch voices, MMS-TTS `facebook/mms-tts-nld`
  CC BY-NC for local evaluation only, Parler-TTS Mini Multilingual v1.1
  Apache-2.0), an automated Parakeet round-trip WER gate, and a 10-sentence
  listening form. `tts-compare.py` gained `--voice`, `mms`, `parler`, and
  `azure` (skipped without `AZURE_TTS_KEY`) backends plus `--review` and
  `--score`; `scripts/tts-intelligibility.ts` transcribes clips through the
  local Sodalis STT API. Gates: median synthesis ≤ 1.5 s, corpus WER ≤ 10%.
  On the same WSL laptop, five Piper voices pass both (WER: pim 3.9%,
  nathalie-medium 5.3%, ronnie 5.6%, nathalie-x_low 7.0%, rdh-medium 8.7%;
  medians 0.24–0.72 s); rdh-x_low (11.1%) and the three MLS voices (39–68%)
  fail WER. MMS fails speed and WER (4.2 s, 15.7%). Parler transcribed
  perfectly on five clips but took 152 s median (RTF ~50) and was stopped,
  as was Chatterbox. Voxtral is MLX-only and was not run on Linux. Azure was
  skipped (no key). The listener scores for the five passing Piper voices are
  still pending; Piper remains the only validated local engine, and no
  provider other than Piper meets the latency contract on laptop CPU.
- 2026-10-16 Copilot: Consolidated all measurements, the contract matrix,
  and limitations in `docs/evaluations/tts-providers.md`. It excludes the human
  listening review. It recommends keeping Piper `nl_BE-nathalie-medium`.
  Most WER on the passing Piper voices comes from number and spelling
  sentences, largely because Parakeet writes digits where the reference
  has words. Also noted that `piper-tts` (piper1-gpl) is GPL-3.0-or-later.
- 2026-10-16 Copilot: Made the live Azure run a key-only step.
  `tts-compare.py --backend azure` now streams PCM. It records time to first
  audio separately from total time and honours `Retry-After` on 429/5xx,
  timing only the successful attempt (the F0 tier allows about 20
  requests/min). On 401/403 it stops with a hint about key and region and
  never prints the key. `--azure-preflight` checks the key, region, and voice
  through the unbilled voices list. Review sentences are now pinned in
  `review.json`. An Azure run is always reviewed on all 50 clips; Piper keeps
  the shared ten. `--score` ranks on the shared ten and reports each run's
  mean over all of its reviewed clips.

  New `scripts/tts-live-check.ts` drives the public `/api/speech/tts` route.
  It measures first-chunk and total latency, checks PCM framing, and cancels
  three copies of a 1,007-character reply while still in flight.

  Its first run found a **crash**: a client disconnect mid-stream became an
  unhandled `reader.cancel` rejection in the Piper HTTP and Azure adapters,
  which killed the speech service (gateway 502). The user approved fixing
  both, test-first, at `engine.synthesize`. Piper live baseline after the fix:
  - first audio 72 / 127 / 173 ms for 18 / 46 / 74 characters;
  - in-flight cancellation at 500 ms passed, with new audio after 200 ms;
  - Piper HTTP starts audio only after full synthesis, so cancelling after
    first audio cannot interrupt it.

  A rehearsal with a bogus key confirmed preflight, benchmark, and stack all
  stop at Azure's 401, and the key appeared in no output or log. Results
  added to `docs/evaluations/tts-providers.md`; runbook in
  `docs/development-stack.md#run-the-live-azure-evaluation`. Remaining:
  - the live Azure run (key in the ignored `.env.azure-eval`);
  - the listening review (5 Piper voices × 10 sentences, Azure × 50);
  - licence decisions;
  - final consolidation.
- 2026-10-16 Copilot: Checked the user's Microsoft Foundry setup.
  "Azure Speech – Text to speech" in Foundry is the same Speech REST API. It
  is reached through the resource endpoint plus `/tts/cognitiveservices/v1`,
  not the project endpoint, using the resource key. The resource is in France
  Central, not westeurope. The user approved:
  - the unbilled voice list: 917 voices, including native Dutch MAI-Voice-2.1
    (preview) and Adam HD with Dutch as a secondary language;
  - 8 one-sentence probes (about 400 characters).

  All probes accepted 22,050 Hz PCM and scored 0/8 Parakeet word errors.
  Adam's HD synthesis took about 1.8 s in total for 3–4 s of audio. Details
  are in `docs/evaluations/tts-providers.md`.

  With approval and test-first, the adapter, stack config, and
  `tts-compare.py` now:
  - accept any Azure voice name, including `:` model suffixes;
  - mark replies as Dutch with SSML `<lang>` for voices from other locales;
  - accept a bare Foundry resource URL;
  - reject project endpoints with an explanation.

  Azure benchmark runs are now named per voice, and the preflight reports
  whether a voice speaks Dutch. The user chose
  `en-US-Adam:DragonHDLatestNeural` and `nl-NL-FennaNeural` for the
  50-sentence benchmark. Per the user, **no Azure call may be made without
  their explicit approval**.
- 2026-10-16 Copilot: Closed the task.
  - **Listening review:** the user reviewed the voices. Grades out of 10:
    Azure Sander (MAI-Voice-2.1-Flash) 8.5, Adam (HD) 8, other Azure voices
    6 or below; Piper Ronnie 5, other Piper voices 4; Chatterbox good but
    too slow.
  - **Azure:** the user decided against further Azure runs, so Azure
    remains judged on its one-sentence probes.
  - **Default voice:** switched to `nl_NL-ronnie-medium`, test-first, across
    the voice constant, Compose, the stack's required model files, and the
    docs. Verified live through Sodalis: in-flight cancellation passed.
  - **Docs:** rewrote `docs/evaluations/tts-providers.md` as the final
    analysis, and trimmed the TTS section of `docs/development-stack.md`
    to configuration and reproduction.
  - **Open follow-ups**, listed in the evaluation:
    - legal review of the Piper GPL-3.0-or-later engine;
    - a decision on non-commercial weights;
    - sentence-by-sentence synthesis for long replies;
    - Azure corpus, cost, and cancellation checks before any production use;
    - optional GPU timing.
