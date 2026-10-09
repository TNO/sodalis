# 0041 Fix STT transcription accuracy and silence hallucination

Status: done
Priority: high
Subsystem: speech
Depends on: 0023, 0024

## Context

Users reported that the desktop overlay's transcript is frequently wrong in
two ways:

- Sentences are truncated to one or two words instead of the full utterance.
- The overlay occasionally shows unrelated hallucinated text, e.g.
  `"(C) TV GELDERLAND 2021"`.

Both symptoms trace back to the energy-based VAD in
`packages/speech/src/voiceActivity.ts`:

- `DEFAULT_THRESHOLD_RMS` (0.025) is low enough to trigger on ambient noise.
- `DEFAULT_END_FRAMES` (12 frames = 240ms) treats any pause longer than 240ms
  as the end of speech, which is shorter than many natural inter-word and
  inter-sentence pauses. A single sentence is therefore split into multiple
  speech segments, each transcribed and submitted independently, producing
  short fragments in the overlay.
- The short/low-energy segments this produces (and bare noise bursts that
  cross the low threshold) get sent straight to whisper.cpp with no
  minimum-duration gate and no `no_speech_thold` tuning
  (`apps/server/src/speech/WhisperCppHttpEngine.ts`), which is a known trigger
  for whisper.cpp hallucinating stock phrases from its training data on
  low-information audio.

## Acceptance Criteria

- Raise the default VAD energy threshold and end-of-speech hangover in
  `voiceActivity.ts` so that natural speech pauses no longer split a single
  utterance into multiple segments, while still ending segments after real
  silence.
- Add a minimum speech-segment duration gate in `SpeechInputController.ts` so
  that noise blips shorter than the configured minimum never reach the STT
  provider.
- Send whisper.cpp's `no_speech_thold` parameter from
  `WhisperCppHttpEngine.transcribe()` so the engine suppresses low-confidence
  output on silence/noise.
- Add/update unit tests for the new VAD defaults, the duration gate, and the
  `no_speech_thold` form parameter.
- Document the chosen threshold values and rationale in this task's Agent
  Notes and in `apps/server/README.md`.

## Implementation Notes

- Keep all new thresholds tunable via existing options objects
  (`EnergyVoiceActivityDetectorOptions`, `SpeechInputControllerOptions`,
  `WhisperCppHttpEngineOptions`) rather than hardcoding, consistent with the
  existing pattern of optional overrides with defaults.
- Do not change the Whisper model (`ggml-small.bin`) or add overlay-side
  fragment merging as part of this task; both are explicitly deferred.
- `no_speech_thold` is whisper.cpp's actual multipart form field name
  (default `0.6` in whisper.cpp itself); do not rename it.

## Agent Notes

- Raised `DEFAULT_THRESHOLD_RMS` from 0.025 to 0.045 and `DEFAULT_END_FRAMES`
  from 12 (240ms) to 35 (700ms) in `voiceActivity.ts`, so the default hangover
  survives typical inter-word/sentence pauses while still ending segments
  after real silence. `DEFAULT_START_FRAMES` (40ms) is unchanged.
- Added `SpeechInputControllerOptions.minSegmentDurationMs` (default 300ms) in
  `SpeechInputController.ts`. Segments shorter than this never reach
  `onSpeechEnd`, so the overlay never requests a transcript for a noise blip;
  the recorder is still stopped normally via `capture.endSpeechSegment()`.
- Added `WhisperCppHttpEngineOptions.noSpeechThreshold` (default 0.6, matching
  whisper.cpp's own default) in `WhisperCppHttpEngine.ts`, sent as the
  `no_speech_thold` multipart field (confirmed exact field name from
  `ggml-org/whisper.cpp`'s `examples/server/server.cpp`).
- Deferred: `verbose_json` response format with per-segment `no_speech_prob`
  filtering. whisper.cpp's `no_speech_thold` already suppresses most silence
  hallucinations at the decoder level; adding segment-level filtering on top
  is a reasonable fast-follow if hallucinations are still observed after this
  fix, but was not needed to address the reported symptoms.
- Deferred (explicitly out of scope per product decision): overlay-side
  fragment merging/accumulation, and switching the Whisper model size away
  from `ggml-small.bin`.
- Exact threshold values (VAD RMS/hangover, minimum segment duration,
  no_speech_thold) are starting points based on code analysis, not tuned
  against real microphone recordings; validate empirically and adjust via the
  existing options if real-world testing shows they need changing.

