# 0025 Server TTS and lip sync

Status: open
Priority: high
Subsystem: speech
Depends on: 0022, 0023

## Context

Implement the first production-capable TTS path using server-side synthesis.

The TTS path must integrate with the existing TalkingHead-based avatar without coupling `AvatarController` to the chosen speech engine.

Speech should begin streaming as soon as practical and must remain immediately interruptible.

## Acceptance Criteria

- Implement `ServerTTSProvider`.
- Support Dutch speech.
- Stream audio to the browser where supported.
- Begin playback without waiting for an unnecessarily large complete response.
- Support immediate cancellation.
- Prevent cancelled/stale audio chunks from playing.
- Drive the existing avatar speaking state.
- Integrate lip sync.
- If the TTS engine supplies viseme/phoneme timing, adapt it to the Sodalis Oculus-15 viseme contract.
- If it does not supply usable timing, implement a separate lip-sync adapter.
- Smooth viseme transitions.
- Return mouth to neutral on completion/cancellation.
- Measure:
  - request → first audio;
  - first audio → playback;
  - cancellation → silence.
- Conversation captions remain available while speech plays.
- Add automated/integration tests.
- Document the selected TTS engine and Dutch voice.

## Implementation Notes

Preferred architecture:

```text
ServerTTSProvider
       |
       +---- audio ----------------> playback
       |
       +---- timing
                |
                v
          LipSyncAdapter
                |
                v
        Oculus 15 visemes
                |
                v
        AvatarController
```

Do not put TTS-specific phoneme logic inside `AvatarController`.

The avatar should enter speaking when playback actually begins rather than when synthesis is merely requested.

## Agent Notes

- Natural Dutch pronunciation and latency are more important than maximizing the number of available voices.
