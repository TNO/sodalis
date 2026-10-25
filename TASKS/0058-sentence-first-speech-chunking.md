# 0058 Chunking speech by sentence

Status: done
Priority: medium
Subsystem: speech
Depends on: 0056

## Context

Long TTS responses should begin promptly and allow cancellation between
sentences while preserving the existing server-to-browser speech contract.

## Acceptance Criteria

- Split at sentence boundaries, keeping closing quotes with the sentence;
  split oversized sentences by clause and then whitespace.
- Clamp configurable chunk size and pause values to safe documented ranges.
- Synthesize and deliver chunks sequentially with configured pauses, stopping
  promptly on cancellation.
- Cover punctuation, quotes, long tokens, bounds, and cancellation in tests.

## Implementation Notes

- Reimplement the general idea from the unlicensed `tts-mlx` project; do not
  copy its source.
- Reuse the public route in `apps/server/src/speech/app.ts`.
- Configuration: `TTS_CHUNK_MAX_CHARACTERS` (320 default, 80–1,000) and
  `TTS_CHUNK_PAUSE_MS` (120 default, 0–1,000).

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
- 2026-10-23 Copilot: Added sentence-first splitting with quote-aware endings,
  clause/whitespace fallback, clamped environment settings, and silent PCM
  gaps between sequential engine calls. The task reimplements the
  `tts-mlx`-inspired behavior without copying code. Also rejects text that
  becomes empty after Markdown cleanup. Public route and chunk behavior tests
  cover boundaries, pauses, cancellation compatibility, and empty content.
  `pnpm test`, `pnpm typecheck`, and `pnpm build` passed.
