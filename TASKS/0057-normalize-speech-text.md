# 0057 Normalizing Dutch and English speech text

Status: open
Priority: high
Subsystem: speech
Depends on: 0056

## Context

Pocket TTS has no text normalization and misreads digits such as house
numbers. Normalize Dutch and English spoken forms without changing the text
sent to other providers that already pronounce numbers correctly.

## Acceptance Criteria

- Cover numbers, house numbers, ordinals, dates, times, money, and common
  abbreviations in Dutch and English with deterministic behavior tests.
- Apply normalization only to providers that require it; do not regress
  Azure or Piper/espeak behavior.
- Keep unknown or ambiguous input intact rather than guessing.

## Implementation Notes

- Prefer a maintained permissively licensed npm number-to-words library if it
  meets Dutch requirements; otherwise implement narrowly with tests.
- Pocket selection and Dutch voice attribution are in task 0036 and
  `docs/evaluations/dutch-tts-hugging-face.md`.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
