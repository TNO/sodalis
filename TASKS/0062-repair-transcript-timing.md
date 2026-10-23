# 0062 Repairing transcript tails and onset timing

Status: open
Priority: medium
Subsystem: speech
Depends on: 0061

## Context

STT alignment can include hallucinated trailing words or timestamps before
actual speech starts. Repair transcript timing against the audio.

## Acceptance Criteria

- Trim transcript tail words not supported by the aligned source content.
- Detect actual speech onset with ffmpeg silencedetect and shift/clamp
  timestamps safely.
- Handle no-silence, all-silence, and ffmpeg failure cases explicitly.
- Add behavior tests without requiring cloud services.

## Implementation Notes

- The reference `language-course-compiler` is MIT; preserve attribution if
  adapting its code. The `tts-mlx` timestamp ideas remain reimplementation
  only.
- Use existing local speech infrastructure and avoid adding Python runtime
  dependencies.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
