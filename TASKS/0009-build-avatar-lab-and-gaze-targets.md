# 0009 Building the Avatar Lab and gaze targets

Status: done
Priority: medium
Subsystem: frontend
Depends on: 0008
Owner: Copilot
Agent: current session

## Context

Build a developer-only harness that can exercise the avatar without STT, TTS,
an LLM, or real assistant services. Reuse an existing semantic target registry
if one is present; otherwise create only the minimal registry needed.

## Acceptance Criteria

- Avatar Lab can change state, affect, intensity, framing, quality, reduced
  motion, gaze target, and trigger nod/mock speaking/interruption.
- A visible `[ Read message ]` control is registered as a UI gaze target.
- User → button → user gaze transitions are smooth, clamped, and inspectable
  through a dev overlay.
- The developer harness is not exposed as a normal user desktop application.

## Implementation Notes

- Resolve target element geometry to a visual center and normalize it against
  the viewport/camera.
- Preserve keyboard and touch access to developer controls.

## Agent Notes

- Added the development-only Avatar Lab with state, affect, intensity, framing,
  quality, reduced-motion, semantic gaze, nod, mock-speech, and interruption
  controls. The `[ Read message ]` button registers/unregisters its visual
  bounds as a semantic target; the overlay reports its clamped viewport center.
- Gaze targets selected before a model loads are retained and applied when the
  runtime becomes available. Tests cover center clamping and this pending-load
  path.
- Browser-verified the lab at desktop and 390px mobile widths. Native controls
  are visible/touch-sized, `[ Read message ]` and `Look at user` update the
  overlay, mock speaking and interruption update the lab state, and Aster
  remains mounted. No browser console errors occurred.
- Production build excludes the developer-only lab copy. Validation: 20
  adapter tests, 34 avatar tests, 3 desktop-host tests, workspace typecheck,
  build, and `git diff --check` passed.
- Known limitation: no approved compatible GLB is available, so a real nod
  could not be rendered in the browser; the harness reports `Avatar is not
  loaded.` rather than silently failing. The production build still warns
  about the 560 kB lazy AvatarScene chunk; address under task 0011.
- 2026-10-03 follow-up: raised the development Avatar Lab's default expression
  intensity and enabled development-only expression/head-motion scaling. The
  production default remains unchanged; `headMotionScale` now affects
  TalkingHead motion options. The debug-scale ceilings make a maximum-weight
  expression and ordinary head movement easier to inspect without treating
  the preview setting as production emotion policy.
- 2026-10-03 follow-up: task 0013 later integrated a profile-compatible,
  non-commercial brunette GLB for local Avatar Lab testing. The earlier
  no-model limitation is historical; the asset is still not approved for
  commercial distribution.
