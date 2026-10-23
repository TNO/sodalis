# 0057 Normalizing Dutch and English speech text

Status: done
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

- `apps/server/src/speech/speechTextNormalization.ts` provides an explicit
  opt-in helper. The Pocket adapter in task 0059 will be the only provider
  wired to it; existing provider requests remain unchanged.
- Use the maintained MIT-licensed `to-words` package for Dutch/English
  cardinal and ordinal conversion; handle dates, times, house-number suffixes,
  common abbreviations, and currency around it.
- Pocket selection and Dutch voice attribution are in task 0036 and
  `docs/evaluations/dutch-tts-hugging-face.md`.

## Agent Notes

- 2026-10-23 Copilot: Task split from the requested reusable TTS feature set.
- 2026-10-23 Copilot: Added `normalizeSpeechText` and deterministic tests for
  Dutch/English house numbers, ordinals, dates, times, money, abbreviations,
  and preservation of invalid dates, unsafe integers, and unsupported
  languages. Chose `to-words` 7.4.0 (MIT; documents Dutch `nl-NL` and English
  locales) after checking npm metadata; no Wiktionary data is used. The helper
  remains opt-in until task 0059 wires it only into Pocket. `pnpm test`,
  `pnpm typecheck`, and `pnpm build` passed.
