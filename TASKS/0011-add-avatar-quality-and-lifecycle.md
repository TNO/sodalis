# 0011 Adding avatar quality and lifecycle safeguards

Status: done
Priority: high
Subsystem: avatar
Depends on: 0010
Owner: Copilot
Agent: current session

## Context

The avatar is optional to desktop operation. It must recover from load/render
failures, support repeated unload/reload without leaks, and offer low/medium/
high/auto quality with reduced-motion behavior.

## Acceptance Criteria

- Low/medium/high/auto quality profiles control DPR and rendering cost
  conservatively; measured FPS is exposed to Avatar Lab.
- Reload/dispose/remount does not accumulate scene children, listeners,
  animation loops, or WebGL resources.
- Resize, visibility/background, and context-loss/recovery paths are covered
  where the browser permits.
- Avatar load/render failures remain non-blocking and expose an explicit retry
  state while Aster remains usable.

## Implementation Notes

- Prefer deterministic lifecycle counters and tests over screenshot-based
  performance expectations.
- Targets: at least 30 FPS low mode and preferably 50–60 FPS on capable
  desktops; report actual available measurements honestly.

## Agent Notes

- 2026-10-02: Added conservative quality DPR caps (low 1, medium/auto 1.5,
  high 2) and one-second measured FPS reporting to the development Avatar Lab.
- Added scene recreation retry after viewer initialization, rendering, or
  context failures. The desktop's Aster iframe remains independent of avatar
  initialization and recovery.
- Covered DPR selection, measured FPS, resize, visibility pause/resume,
  context loss/recovery, and scene/runtime/renderer disposal. Added a UI test
  proving initialization failure displays an explicit retry control.
- Asset-load retry remains deferred until an asset-loading flow exists; there
  is no approved GLB. The user confirmed this scope.
- Verification: avatar package typecheck and full suite (42 tests), desktop
  typecheck/build, focused `AvatarViewport.test.ts` (1 test), and
  `git diff --check`. Production build retains the existing large lazy
  `AvatarScene` chunk warning (561 kB).
