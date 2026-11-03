# 0056 Cleaning Markdown before speech

Status: done
Priority: medium
Subsystem: speech
Depends on: none

## Context

Assistant replies may contain Markdown that should not be read literally by
the speech engine. Clean text at Sodalis' server-side TTS boundary; the browser
must not call speech engines directly.

## Acceptance Criteria

- Remove Markdown syntax for links, images, code, headings, bullets, and
  emphasis while retaining their readable text.
- Preserve ordinary punctuation and meaningful line boundaries.
- Exercise the public TTS route to show synthesis receives cleaned text.

## Implementation Notes

- Reuse the behavior of `_strip_markdown_for_speech` from the MIT-licensed
  `language-course-compiler` only as a reference; preserve attribution if
  adapting code.
- Existing TTS route: `apps/server/src/speech/app.ts`.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
- 2026-10-23 Copilot: Added `markdownToSpeech` at the server TTS route and a
  public-route test covering links, images, inline/fenced code, headings,
  bullets, quotes, and emphasis. Retained readable labels and code contents;
  no third-party implementation was copied. Documented the server-side
  cleanup boundary in `apps/server/README.md`. `pnpm test`, `pnpm typecheck`,
  and `pnpm build` passed.
