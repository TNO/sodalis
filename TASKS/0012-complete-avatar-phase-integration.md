# 0012 Completing Phase 1 integration and documentation

Status: done
Priority: high
Subsystem: testing
Depends on: 0011
Owner: Copilot
Agent: current session

## Context

The last Phase 1 task closes the complete avatar vertical slice against the
attached definition of done, records exact dependency/asset provenance, and
leaves later integrations out of scope.

## Acceptance Criteria

- Automated unit/browser tests cover load, states, mock visemes, interruption,
  target gaze, reduced motion, reload/dispose, and graceful avatar failure.
- Typecheck, focused tests, full tests, and production build pass.
- `TASKS/README.md`, task files, docs, and ADRs reflect delivered behavior and
  deviations.
- Final report includes dependency versions, model/license, measured FPS,
  profile/validator result, residual visual issues, and recommended next work.
- Stop at Phase 1; do not implement STT/TTS, LLM, mail, memory, or Home
  Assistant.

## Implementation Notes

- No screenshot-perfect assertions; validate public behavior and lifecycle.
- Run code review before committing.

## Agent Notes

- 2026-10-02: Closed Phase 1 integration with the avatar profile, runtime
  boundary, dev-only Avatar Lab, validator, lifecycle recovery, and project
  documentation. Added the desktop UI retry test to the standard `pnpm test`
  command.
- Verification: `pnpm typecheck`, `pnpm test` (48 tests across desktop-host,
  avatar, and desktop), `pnpm build`, and `git diff --check` all pass. The
  production build still reports the lazy AvatarScene chunk at 561 kB.
- Runtime versions: `@met4citizen/talkinghead@1.7.0`, `three@0.180.0`, and
  `@types/three@0.180.0` (development only).
- No avatar model is integrated; no model/license provenance can be claimed.
  The compatible scene fixture passes the profile validator; no real GLB has
  been validated.
- The deterministic scene test reports about 63.5 render-loop FPS for a
  simulated 16 ms frame schedule. This is not a GPU/model benchmark. Actual
  performance remains unmeasured until a licensed model is approved and run
  in target browsers.
- Remaining visual checks: real-model framing, lighting, expression/viseme
  quality, and gesture quality. Recommended next work is to source and approve
  a model, run it through the validator, then capture browser performance and
  visual results. Model-load retry remains part of that future asset-loading
  flow.
- 2026-10-03: Hardened the vendored Aster startup-failure path against null
  and other non-`Error` rejection values, with a regression test for the
  fallback message, and bumped the service-worker cache revision to `r3`.
  Workspace typecheck, all 49 tests, production build, and `git diff --check`
  pass. A fresh browser load shows Aster's desktop and active `r3` cache;
  the user's original rejection could not be reproduced, so its underlying
  source remains unknown.
