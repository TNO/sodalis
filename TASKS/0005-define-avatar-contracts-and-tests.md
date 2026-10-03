# 0005 Defining avatar contracts and tests

Status: done
Priority: high
Subsystem: avatar
Depends on: 0004
Owner: Copilot
Agent: current session

## Context

Phase 1 needs a stable, Sodalis-owned API so the desktop and assistant do not
depend on Three.js internals, TalkingHead instances, DOM nodes, raw bones, or
blendshape dictionaries.

## Acceptance Criteria

- Public TypeScript contracts cover controller, state, affect, gestures,
  visemes, look targets, asset metadata, scene/quality boundaries as needed.
- Runtime exports define the five states, 15 Oculus visemes, and semantic
  gestures; tests assert the public vocabulary and affect clamping.
- A discriminated metadata validation result reports invalid asset fields
  explicitly and is covered through its exported public function.
- Loading and gesture APIs accept `AbortSignal`; deterministic sequence and
  interruption behavior are implemented/tested in 0008.
- The 15 Oculus viseme names and five avatar states match the spec.

## Implementation Notes

- TDD: add one public-behavior test before each minimal implementation slice.
- Keep TalkingHead and Three.js types out of the public controller API.

## Agent Notes

- Started after 0004 confirmed the external-loop API and package versions.
- Added the `@sodalis/avatar` workspace package with public state, affect,
  expression, gesture, viseme, look-target, quality, asset, and controller
  types in `packages/avatar/src/index.ts`. The public entry imports neither
  Three.js nor TalkingHead; load/gesture methods accept `AbortSignal`.
- Exported stable runtime vocabularies and added affect clamping plus
  discriminated avatar metadata validation with path-specific issues.
- Added `packages/avatar/src/index.test.ts` and wired the package into root
  `pnpm test`. Validation: 8 avatar tests, full workspace tests, typecheck, and
  production build passed.
- The adapter/scene/behavior implementations remain in their dependent tasks.
