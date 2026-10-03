# 0010 Defining the avatar profile and GLB validator

Status: done
Priority: medium
Subsystem: avatar
Depends on: 0009
Owner: Copilot
Agent: current session

## Context

Artists and generators need a stable Sodalis avatar contract and a validator
that reports compatibility problems explicitly. MPFB/Blender is an authoring
workflow only; it is not a runtime dependency.

## Acceptance Criteria

- `docs/avatar/SODALIS_AVATAR_PROFILE.md` documents the 52 ARKit shapes,
  15 Oculus visemes, expected humanoid skeleton/root, framing metadata, and
  supported materials.
- MPFB/Blender instructions record required Faceunits/Visemes packs and
  version provenance.
- A development-time validator reports named rig/morph/material/texture/
  triangle/draw-call/bounds checks and does not silently accept missing items.
- Any reference GLB used is confirmed licensed and compatible; otherwise
  record the asset as a follow-up rather than inventing provenance.

## Implementation Notes

- Prefer a browser validator; add a CLI only if it shares the same validation
  core without duplicating rules.
- Keep source/uncompressed assets separate from optimized runtime copies.

## Agent Notes

- 2026-10-02: Added the Sodalis avatar profile with the full 52-shape ARKit and
  15-viseme Oculus/Meta lists, runtime rig/root contract, framing metadata,
  core PBR material requirements, and MPFB2/Blender authoring provenance.
- Added a browser validator for GLB parsing, a Hips-rooted core bone hierarchy
  bound to a skinned mesh, skin attributes, facial targets, materials,
  texture dimensions, triangle/draw-call budgets, and model bounds. No GLB is
  included because no model has verified licensing and provenance.
- Exported the validator through the avatar package's internal entry point.
- Verification: `pnpm --filter @sodalis/avatar typecheck`,
  `pnpm --filter @sodalis/avatar test` (42 tests), and `git diff --check`.
