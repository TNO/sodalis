# 0030 Selecting STT and TTS providers independently

Status: done
Priority: high
Subsystem: speech
Depends on: 0029

## Context

Sodalis speech contracts are provider-neutral, but runtime wiring currently
chooses Whisper.cpp and Piper directly. STT and TTS must be selected
independently so either can use a local engine container or an explicitly
configured external service.

## Acceptance Criteria

- Configure STT and TTS independently using explicit provider identifiers.
- Retain the existing Whisper.cpp STT and Piper TTS implementations.
- Provide deterministic mock providers usable by service-level tests.
- Validate required settings at service startup and report actionable errors.
- Do not silently fall back between providers or from local to cloud.
- Keep provider APIs behind the Sodalis speech service; the browser never calls
  an engine directly.
- Support provider-specific external endpoints without assuming all engines
  share one wire protocol.
- Preserve streaming, cancellation, capability, and session semantics.
- Document model/configuration requirements and platform constraints.

## Implementation Notes

- Keep STT and TTS independently selectable; do not require them to share a
  vendor or deployment mode.
- Compose profile activation and the single `.env` selection workflow are in
  task `0034`.
- Cactus and Azure AI Speech are evaluated in task `0035`; Chatterbox and
  Azure AI Speech are evaluated in task `0036`.

## Agent Notes

- Default local selections are Whisper.cpp and Piper. Alternative providers
  must be explicitly selected.
- 2026-10-04 Copilot: Added independently validated `STT_PROVIDER` and
  `TTS_PROVIDER` choices, deterministic mocks and a Piper HTTP WAV adapter
  alongside Whisper.cpp HTTP and local Piper CLI. Verified 4 new provider
  tests and server typecheck; remote engines must honor their adapter's wire
  protocol and be reachable from the speech process.
