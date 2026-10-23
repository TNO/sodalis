# 0059 Adding the local Pocket TTS provider

Status: open
Priority: high
Subsystem: speech
Depends on: 0057, 0058

## Context

Run Pocket TTS natively on the Mac host because Docker cannot use Metal.
Sodalis must connect to it over HTTP through its existing server-side speech
engine seam, with no browser-to-engine access or silent cloud fallback.

## Acceptance Criteria

- Provide host-local `POST /v1/audio/speech`, `GET /v1/voices`, and
  `GET /v1/capabilities` endpoints around the configured pockettts.cpp
  runtime; warm the model at startup.
- Select the engine only through explicit configuration and preserve server
  cancellation/error behavior.
- Do not bundle model weights or reference WAVs; require explicit runtime and
  model/reference paths and document license/attribution requirements.
- Verify route and adapter behavior with local mocks; do not call cloud
  providers.

## Implementation Notes

- Reuse `SpeechSynthesisEngine` and provider selection in
  `apps/server/src/speech/`; browser access remains through the Sodalis route.
- Reference runtime and weights are user-local under `~/tts-trials`; never
  copy their artifacts into this repository.
- See task 0036 and `docs/evaluations/dutch-tts-hugging-face.md`.

## Agent Notes

- 2026-10-23 Copilot: User-directed implementation request supersedes the
  prior defer-integration note in task 0036. Keep weights external and record
  any unresolved runtime/license constraints before integration.
