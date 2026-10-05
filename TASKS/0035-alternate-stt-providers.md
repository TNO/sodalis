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
- Cactus licensing restricts organizations above funding/revenue thresholds;
  Photon runtime terms were not established; Azure requires credentials and
  authorization to transfer test audio. None of these candidates has yet
  passed a local Dutch streaming/cancellation evaluation, so no adapter or
  Compose profile for them is claimed.
