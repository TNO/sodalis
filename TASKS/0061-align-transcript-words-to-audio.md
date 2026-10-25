# 0061 Aligning transcript words to audio

Status: done
Priority: medium
Subsystem: speech
Depends on: 0024

## Context

Expose word-level timing aligned to audio content for captions and avatar
lip-sync. Prefer existing local whisper.cpp/Parakeet STT integrations over a
new Python dependency.

## Acceptance Criteria

- Return source-word timestamps by aligning recognized words to source text
  by content, with deterministic interpolation for missing words.
- Preserve the existing text-only STT public behavior for providers without
  timing support.
- Test matching, punctuation normalization, missing/extra words, and invalid
  timing.

## Implementation Notes

- Reimplement the approach described in the unlicensed `tts-mlx` project;
  do not copy its source.
- Extend existing Sodalis speech result/provider contracts.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
- 2026-10-23 Copilot: Added a local whisper.cpp verbose-JSON alignment path,
  content-based word matching with deterministic interpolation, and a bounded
  multipart API. Existing providers and STT session routes remain text-only;
  unsupported providers return an explicit 503. Implemented the alignment
  algorithm independently rather than copying tts-mlx.
