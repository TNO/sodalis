# 0022 Speech provider contracts

Status: done
Priority: high
Subsystem: speech
Depends on: none
Owner: Copilot
Agent: Copilot

## Context

Sodalis needs speech-to-text and text-to-speech, but the runtime must not depend on a particular implementation.

Moderate tablets may not have enough performance for good browser-local STT/TTS. Therefore STT and TTS must independently support browser and server implementations, with future automatic provider selection.

This task establishes the provider contracts and configuration before real speech engines are integrated.

## Acceptance Criteria

- Define provider-neutral STT interfaces.
- Define provider-neutral TTS interfaces.
- Support provider selection:
    - `browser`
    - `server`
    - `auto`
- STT and TTS are independently configurable.
- Define provider capability metadata.
- Define streaming partial/final STT events.
- Define streaming TTS audio output.
- Define cancellation semantics using `AbortSignal` or the repository's equivalent.
- Define speech/session IDs so stale events can be rejected.
- Add deterministic mock STT and TTS providers.
- Add configuration validation.
- Add unit tests for provider selection, cancellation, and mock streaming.
- Do not integrate a production speech model yet.

## Implementation Notes

Conceptually:

```ts
interface SpeechToTextProvider {
  readonly id: string;
  readonly capabilities: STTCapabilities;

  createSession(
    config: STTSessionConfig
  ): Promise<STTSession>;
}

interface TextToSpeechProvider {
  readonly id: string;
  readonly capabilities: TTSCapabilities;

  speak(
    request: SpeechRequest,
    signal: AbortSignal
  ): AsyncIterable<SpeechOutputChunk>;
}
```

## Agent Notes

- 2026-10-04: Added provider-neutral STT/TTS contracts, configuration validation, ordered `auto` selection, and deterministic abort-aware mocks in `packages/speech/`. STT events carry a session ID; TTS chunks carry session and speech IDs plus sequence numbers. Wired the package into workspace tests; no production speech engine was added.
