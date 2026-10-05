# 0036 Evaluating alternate TTS providers

Status: in_progress
Priority: medium
Subsystem: speech
Depends on: 0030, 0034

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

## Agent Notes

- Chatterbox and Azure AI Speech are evaluation targets; integrate when they
  meet the provider contract and platform constraints.
- Added Fish Speech and F5-TTS for review, not as selected engines. Licensing
  and macOS deployment need explicit checks before an integration decision.
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
