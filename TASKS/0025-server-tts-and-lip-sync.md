# 0025 Server TTS and lip sync

Status: done
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
- The user requested a comparative test of Piper, XTTS-v2, Chatterbox, KugelAudio, and Kokoro where Dutch is supported.
- A local four-phrase Dutch check used the same utterances for Piper and Chatterbox, with Whisper.cpp as a rough intelligibility check (not a human pronunciation evaluation):
  - Piper `nl_NL-pim-medium` was the strongest measured candidate: warm synthesis took about 52–390 ms per phrase and Whisper recognized three phrases accurately, mishearing “afspraak” once as “aspraak.”
  - Piper `nl_BE-nathalie-medium` synthesized in about 34–88 ms. Whisper recognized the first and third phrases accurately, misheard “afspraak” once, and also made an error on the fourth phrase when transcribing the macOS reference. Piper yields audio chunks, but these short utterances each yielded one chunk.
  - Chatterbox Multilingual V2 (MIT) synthesized complete waveforms rather than streaming chunks. On Apple M4 Max/MPS, these 4–5 second utterances took about 10–35 seconds; Whisper recognized the first phrase well but made multiple errors in the other three.
  - XTTS-v2 supports Dutch and streaming but was not run: its model download stopped at an interactive CPML non-commercial-license confirmation. Do not accept those terms or select XTTS for production without resolving licensing.
  - KugelAudio lists Dutch but has no Dutch preset voice, warns that Dutch quality may be reduced, has no documented streaming, and its approximately 18.7 GB model / 19 GB VRAM requirement prevented a practical local test.
  - Kokoro 82M has no Dutch language or voice and was excluded.
- The user chose to try Piper but specified a female voice for the female avatar. Use `nl_BE-nathalie-medium` (female Belgian Dutch; its model card lists CC0 for the source dataset), not the male `nl_NL-pim-medium` voice. Nathalie measured about 34–88 ms per phrase in the local warm run; this is a preliminary Whisper-based check, not a subjective voice-quality approval.
- Piper's GPLv3 engine licensing still needs to be respected in packaging and deployment.
