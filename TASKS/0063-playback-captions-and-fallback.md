# 0063 Adding speech captions and playback fallback

Status: done
Priority: medium
Subsystem: frontend
Depends on: 0058, 0061, 0062

## Context

Speech playback should stop previous audio before starting a new request,
recover from a failed source where possible, and highlight the currently
spoken word using aligned timestamps.

## Acceptance Criteria

- Stop superseded playback before starting a new request and preserve explicit
  cancellation semantics.
- Fall back only to a configured/available source; surface failure instead
  of silently dropping speech.
- Display captions and highlight the active word according to audio timing.
- Test public playback behavior including replacement, fallback, timing, and
  cleanup.

## Implementation Notes

- Reuse `SpeechPlaybackController`, `AmplitudeLipSyncAdapter`, and the
  existing avatar conversation presentation.
- Adapted code from `zin` must retain Apache-2.0 attribution. Reimplement
  ideas from unlicensed `tts-mlx`.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
- 2026-10-23 Copilot: Reused shared sentence chunking in desktop and server;
  alignment is performed per chunk so longer replies can start and be
  interrupted between chunks.
- 2026-10-23 Copilot: Playback fallback is opt-in through
  `VITE_SODALIS_TTS_FALLBACK_API_URL`; unconfigured browser/cloud voices are
  never selected. Word-alignment failures leave audio playback intact and are
  shown separately from TTS errors.
- 2026-10-23 Copilot: Reimplemented source fallback and active-word highlighting
  from the behavioral ideas in zin (Apache-2.0); no code was copied.
