# 0064 Companion dots and accessibility controls

Status: done
Priority: medium
Subsystem: frontend
Depends on: none

## Context

The personal-assistant research recommends interchangeable presentations and
user-controlled pacing/captions. The user chose an additional abstract avatar:
three large, clearly visible dots, changing while thinking and speaking.
Keep existing human avatars and the desktop integration.

## Acceptance Criteria

- Selectable, persistent three-dot presentation, with distinct thinking and
  speaking states, notifications, keyboard activation and reduced motion.
- Persistent speech speed, sentence pause and short-sentence preferences.
- Azure Colette uses SSML prosody; other providers have an explicit playback
  fallback without applying speed twice or breaking word timing/cancellation.
- Subtitle on/off, size, text/background colors and readable preview.
- Hidden subtitles do not remove action confirmations or access to the response.
- Public behavior tests and workspace checks; no cloud test without run consent.

## Implementation Notes

- Research: [memory and embodiment](../docs/evaluations/personal-assistant-memory-and-embodiment.md).
- Keep dots independent of WebGL and leave Aster's iframe boundary untouched.
- Specialists are research recommendations, not new runtime scope.

## Agent Notes

- Research committed separately in `b5b77e1`. Native controls follow the existing
  avatar picker; settings should apply to the next utterance, not alter audio
  already playing. No cloud calls are authorized for these implementation checks.
- Added persistent Three dots in `avatarCatalogue.ts` and `AvatarViewport.ts`,
  with distinct thinking/speaking states and static reduced-motion labels.
  Existing human avatars and Aster's iframe boundary are unchanged.
- Added validated preferences and native controls in `companionPreferences.ts`
  and `CompanionSettings.ts`. Caption presentation updates immediately; speech
  pacing and the fixed short-sentence LLM instruction apply to the next turn.
  Turning captions off keeps the response available under Read response.
- Extended the public speech interfaces with validated rate/pause settings and
  applied-rate metadata. Colette uses escaped SSML prosody; unsupported native
  rate control falls back to Web Audio playback speed, which may change pitch.
  Sentence-aware chunking and timing adjustments preserve caption alignment.
  This is implemented and mock-verified, not a new live Azure voice evaluation.
- Completed `pnpm test` (560 passed, 1 skipped), `pnpm typecheck`, `pnpm build`
  and mocked browser checks at desktop/mobile sizes, including 28/32px captions,
  reduced motion and persisted preferences. No cloud providers were called.
- Finish review found two layout issues: expanded settings displaced the desktop
  companion, and large captions hid essential controls. Constrained the desktop
  workspace/sidebar and made the conversation transcript independently scrollable
  with pinned controls. A scoped verdict pass marked both resolved (`ship`);
  the runtime could not resume the original synchronous reviewer, so the verdict
  used a fresh reviewer of the same role. This is not whole-surface approval.
  The documentation handoff confirmed README/development guide coverage and
  preservation of the incumbent design; no new design-system files were needed.
- User-directed follow-up: Three dots is now the default for devices without a
  valid saved avatar choice. Saved human-avatar choices remain unchanged.
