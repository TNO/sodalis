# 0035 Evaluating alternate STT providers

Status: in_progress
Priority: medium
Subsystem: speech
Depends on: 0030, 0034

## Context

Once independent speech provider selection and Compose profiles are in place,
evaluate Cactus, Azure AI Speech, and
[Moondream Parakeet Redux](https://huggingface.co/moondream/parakeet-redux)
as alternate STT implementations without changing the Sodalis browser
contract.

## Acceptance Criteria

- Evaluate Cactus, Azure AI Speech, and Parakeet Redux against the Sodalis
  STT contract, including Dutch support and accuracy, streaming/partial
  behavior, cancellation, latency, licensing, and Windows/Linux/macOS
  deployment.
- Integrate each target that can meet the contract through a Sodalis-owned
  adapter; never let the browser call the engine or Azure directly.
- Add a selectable Compose profile for a compatible local container and
  explicit server-side configuration for a cloud/external provider.
- Preserve explicit provider selection and prohibit silent cloud fallback.
- Add adapter tests and a documented compatibility/configuration matrix.
- For any target that cannot meet the contract, document the verified
  limitation and do not claim unsupported capabilities.

## Implementation Notes

- The current Whisper.cpp path remains available.
- STT selection is established in task `0030`; the development Compose stack
  is established in task `0034`.
- Parakeet Redux is a 1.58-bit Parakeet model intended for the Photon runtime.
  Review its Dutch results against Sodalis speech samples, Photon runtime/API
  compatibility (including partials and cancellation), platform acceleration,
  and model/runtime licensing before deciding whether to add an adapter or
  local Compose profile. The model card lists CC-BY-4.0 for the weights;
  verify attribution and runtime terms separately.

## Agent Notes

- Cactus and Azure AI Speech are evaluation targets; integrate when they meet
  the provider contract and platform constraints.
- Added Parakeet Redux as an evaluation target. Check Dutch accuracy and
  Photon integration before deciding whether it meets the same constraints.
- Dutch MLS test data can be supplied locally to `scripts/stt-benchmark.ts`;
  keep audio outside the repository and compare candidate transcripts against
  `test/transcripts.txt`.
  The current Whisper base model transcribed a locally synthesized "Hoe oud
  bent u?" as "Hoe oud ben ik?". Compare stronger models on the same clips,
  then test segmentation, sustained silence, long speech, latency, and interim
  transcripts through the public STT API. Do not transmit local recordings
  or MLS clips to Azure without separate authorization.
- A reproducible six-speaker MLS test-split benchmark through the public STT
  API measured 77/215 word errors for Compose Whisper `base`, 49/215 for
  native `small`, and 25/215 for native `medium` on a Mac with Metal.
  The test subset is too small to claim general Dutch accuracy. A synthetic
  short question still had one substitution on the native `medium` HTTP
  server. See `docs/development-stack.md` for exact setup and caveats.
- Added optional local model selection and a snapshot-based interim
  transcription endpoint: the client receives replaceable partials before
  `finish`, with no silent fallback to another provider. The VAD now keeps
  400 ms pauses within one utterance and ends after 700 ms of silence.
  This does not solve clipped speech onset or background-noise false starts.
- A 46-second recording made by repeating the same MLS passage three times
  returned only two copies, but a 44-second recording with three distinct
  passages returned all three. Do not infer a hard 30-second limit from the
  repeated sample. Pre-roll, sustained-speech rollover, and real
  continuous-microphone regression coverage remain open.
- Cactus Whistle and its Needle runtime are Apache-2.0, distinct from the
  separately licensed Cactus engine (which restricts organizations above
  funding/revenue thresholds). Whistle is available behind an opt-in Compose
  profile and a Sodalis-owned raw-audio HTTP adapter. On the same six-speaker
  MLS subset it made 65/215 word errors (30.2% WER), with roughly 137–252 ms
  per clip; it returned no text for silence but misheard a synthetic "Hoe oud
  bent u?". Its model accepts at most 30 seconds per request.
- The opt-in `parakeet-tdt` profile runs **original NVIDIA Parakeet TDT v3**,
  not Moondream Redux, through Apache-2.0 sherpa-onnx. The original weights
  are CC BY 4.0; check the conversion repository's redistribution terms
  before publishing an image. It made 37/215 word errors (17.2% WER) on the
  same MLS subset, 394–700 ms per clip. The synthetic WAV short question was
  correct; an Opus WebM encoding returned "Who oud bent u?", and three seconds
  of silence returned empty text. The image was killed at startup on a 2 GB
  Podman machine; an 8 GB machine ran it alongside the existing containers.
- Both adapters provide replaceable snapshot partials through the existing
  Sodalis STT session API, not true incremental model decoding. Cancellation
  aborts the request but cannot stop inference already underway inside the
  CPU services. Each service rejects audio over 30 seconds. Real continuous
  microphone input and rollover remain to be evaluated.
- Moondream Redux weights are CC BY 4.0 but its documented Photon dependency
  `kestrel-kernels` requires a separate written agreement; no Redux runtime
  was installed. Azure requires credentials and authorization to transfer
  test audio; local recordings were not sent there. Redux and Azure have no
  adapter or Compose profile, and their Dutch/streaming performance is open.
