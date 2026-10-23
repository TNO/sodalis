# 0060 Preprocessing reference voices

Status: open
Priority: medium
Subsystem: speech
Depends on: 0059

## Context

Pocket voice cloning needs a reproducible reference preparation pipeline
that produces mono 24 kHz PCM suitable for the local runtime.

## Acceptance Criteria

- Provide a local ffmpeg pipeline with high/low-pass filtering, declicking,
  and `loudnorm=I=-20:TP=-2:LRA=7`.
- Validate inputs and report ffmpeg failures clearly.
- Never commit generated audio or the licensed Dutch reference WAV.

## Implementation Notes

- Reimplement the idea from unlicensed `tts-mlx`; do not copy code verbatim.
- Keep voice attribution and regeneration details in task 0036.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
