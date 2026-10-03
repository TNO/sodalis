# 0008 Implementing avatar behaviors

Status: done
Priority: high
Subsystem: avatar
Depends on: 0007
Owner: Copilot
Agent: current session

## Context

Implement restrained conversational behavior for idle, listening, thinking,
speaking, and interrupted states, including affect, blink, gaze, nod, and a
deterministic mock-viseme timeline.

## Acceptance Criteria

- All five states have distinct, restrained behavior and deterministic timing.
- Affect values are clamped/mapped internally; no caller controls raw
  blendshape weights.
- The nod is interruptible; interruption cancels speech/gesture and smoothly
  releases visemes into listening.
- Reduced motion keeps speaking lip sync, necessary gaze, and natural blinks.

## Implementation Notes

- Seed/inject randomness and clocks for deterministic tests.
- UI gaze must use semantic targets, not arbitrary DOM or model internals.

## Agent Notes

- Added deterministic seeded mock-viseme sequences with timestamped
  interpolation, bounded input validation, and simulation-time playback.
- Implemented semantic nod/shake/acknowledge mappings, AbortSignal handling,
  and interruption cancellation with a smooth 180 ms viseme release back to
  listening.
- Added restrained state-specific focus, viewport-based thinking gaze,
  normalized affect-to-ARKit mappings, and reduced-motion head-motion controls.
  TalkingHead retains its natural blinking and viseme updates.
- Added the `AvatarBehaviorController` controls used by the Avatar Lab while
  keeping Three.js, DOM, and TalkingHead implementation details outside the
  public semantic interface.
- Validation: full `pnpm test` (31 tests), `pnpm typecheck`, `pnpm build`, and
  `git diff --check` passed.
