# 0054 Adding a male thuiszorg-style avatar option

Status: done
Priority: medium
Subsystem: avatar, frontend
Depends on: 0010, 0012, 0013, 0016

## Context

The desktop previously showed only the non-commercial TalkingHead brunette.
This task delivers one original, rights-verified male avatar and a small two-option
selector ahead of the broader three-avatar collection in
[0014](./0014-generate-mpfb-avatar.md) and the full gallery in
[0015](./0015-build-avatar-selection.md). Follow the approved
[design specification](../docs/avatar/MALE_THUISZORG_AVATAR_SPEC.md) and the
existing [avatar profile](../docs/avatar/SODALIS_AVATAR_PROFILE.md).

## Acceptance Criteria

- An original semi-realistic male avatar with the approved Dutch carewear
  appearance is delivered as an editable, reproducible source project (where
  licenses permit) and an optimized self-contained GLB; no MPFB/Blender
  runtime dependencies are introduced.
- All component licenses and attribution requirements are recorded and
  checked for commercial redistribution. The GLB passes the Sodalis validator
  and its report, measurements, versions and checksum are recorded. Avatar
  Lab inspection covers expression, speech, gaze, head motion and reduced
  motion. User approval of the in-app preview or representative screenshots
  is required before considering the asset complete.
- The desktop exposes an accessible Male / Brunette choice with accurate
  selected-asset attribution; the choice persists locally. First use
  defaults to the male avatar (changed from Brunette at the user's request).
  A failed load is explicit and retryable, with an option to switch; there is
  no silent fallback.
- Public-interface tests cover default/remembered choice, switching,
  attribution, error and recovery behavior. Run `pnpm test`,
  `pnpm typecheck` and `pnpm build`, and verify both models in the desktop.
- The brunette remains unchanged and documented as non-commercial. Do not
  claim the existing prototype bundle is commercially redistributable or
  implement a commercial packaging mode as part of this task.

## Implementation Notes

- Prepare and verify authoring assets before integration; do not ship a
  minimally valid or legally uncertain placeholder to meet the UI criterion.
- Keep the avatar catalogue distinct from the renderer and preserve the
  existing desktop and TalkingHead adapter boundaries.
- No asset notice, checksum, validator outcome, FPS measurement, or license
  clearance is assumed until the actual model has been produced and checked.

## Agent Notes

- 2026-10-19: Built the authoring pipeline in `tools/avatar-authoring/`
  (pinned Blender 4.5.14 LTS, MPFB 2.0.18, CC0 MakeHuman packs, TalkingHead rig
  at `2afe6d7`). All 18 components are CC0 or MIT; see the shipped manifest.
- 2026-10-19: Runtime checks in a headless browser found the head and gaze
  lowered at rest. TalkingHead poses bones with absolute rotations, so the
  build now aligns rest bone frames to TalkingHead's CC0 `mpfb.glb`. Also fixed
  red-brown eyes, black brows, a salmon V-neck (sampled from unmorphed
  geometry), and a 4 MB hair texture (now 1024 px; GLB 9 MB).
- 2026-10-19: Added the model and the persisted Brunette / Male choice with
  per-avatar attribution and Retry / Switch recovery. The shipped GLB passes
  every validator check (39,132 triangles, 9 draw calls, 1.82 m). In the
  desktop, the default avatar loads, switching works, and the choice
  survives a reload, with no console errors.
- 2026-10-19: At the user's request, the V-neck now shows a red undershirt
  instead of skin, the trousers stay navy up to the tunic hem (the texture had
  painted a white band onto them), and the male avatar is the default, listed
  before the brunette. An existing stored choice still takes precedence.
- 2026-10-19: User visually approved the in-app preview. This closes the user
  approval gate; the avatar is approved as presented.
- 2026-10-19: `pnpm test`, `pnpm typecheck`, and `pnpm build` passed. The live
  Azure STT test was skipped because its endpoint and key are unset.
- 2026-10-19: User reports performance is smooth, with no noticeable
  slowness or visual irregularities. No FPS figure or device details were
  captured.
- 2026-10-19: Inspected the male avatar in the local desktop and Avatar Lab:
  neutral, warm, happy and concerned expressions; listening and mock speaking
  with visemes; user and UI-target gaze; nod/head motion; and reduced-motion
  mode. These controls ran without Avatar Lab errors. The Lab displayed
  60 FPS in this preview session; this is an observed render-loop reading,
  not a representative-hardware benchmark.
- 2026-10-19: Closed 0054. Visual approval, smooth-performance feedback,
  Avatar Lab checks, acceptance tests, and workspace validation are complete.
  The previously noted hair/temple shape and larger GLB size are accepted
  quality trade-offs for this approved asset, not open blockers. Screen-edge
  gaze can turn both avatars to a full profile; this predates the male model
  and is outside this task.
- 2026-10-19: Included the editable Blender source project in
  `tools/avatar-authoring/source/` for distribution alongside the pinned
  rebuild scripts and approved GLB.
