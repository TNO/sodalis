# 0036 Evaluating alternate TTS providers

Status: open
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
