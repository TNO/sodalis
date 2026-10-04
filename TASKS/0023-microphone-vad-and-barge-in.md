# 0023 Microphone VAD and barge-in

Status: open
Priority: high
Subsystem: speech
Depends on: 0022

## Context

Sodalis needs responsive microphone handling and voice activity detection.

VAD should normally run close to the microphone in the browser even when STT runs on the server. This allows the UI and avatar to react immediately when the user begins speaking.

Most importantly, users must be able to interrupt Sodalis while she is speaking.

## Acceptance Criteria

- Request and manage browser microphone permission.
- Capture microphone audio through an appropriate browser audio API.
- Implement a VAD abstraction.
- Provide an initial browser-side VAD implementation.
- Expose speech-start and speech-end events.
- Connect microphone state to the existing conversation card.
- Connect listening state to `AvatarController`.
- Implement barge-in:
  - detect user speech while Sodalis is speaking;
  - immediately stop/mute current playback;
  - cancel active TTS;
  - cancel downstream generation where possible;
  - transition avatar through `interrupted` to `listening`;
  - begin the new input turn.
- Handle denied microphone permission gracefully.
- Handle microphone loss/device errors.
- Provide a manual push-to-talk/text fallback.
- Add latency instrumentation for speech-start → visible interruption.
- Add automated tests using synthetic/mock audio events.

## Implementation Notes

Target perceived interruption response should be approximately <200 ms on the client where practical.

Do not wait for the server to acknowledge cancellation before stopping local playback.

Conceptual flow:

```text
avatar speaking
      |
user starts talking
      |
      v
 browser VAD
      |
      +----> stop audio immediately
      +----> avatar interrupted
      +----> cancel TTS
      +----> cancel LLM generation
      |
      v
   listening
```

Use operation/session IDs from 0022 so late chunks from cancelled speech cannot restart playback.

Do not implement production STT in this task.

## Agent Notes

- Responsiveness is more important here than perfect VAD classification.
