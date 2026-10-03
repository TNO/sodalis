# 0014 Generating a Blender/MPFB avatar

Status: open
Priority: medium
Subsystem: frontend
Depends on: none
Owner: Copilot
Agent: unassigned

## Context

The user wants to generate original avatar content with Blender and the MPFB
plugin and says they already have instructions for this workflow. Sodalis's
profile in `docs/avatar/SODALIS_AVATAR_PROFILE.md` records the runtime GLB
contract and baseline MPFB2/Blender requirements.

## Acceptance Criteria

- Follow the user's Blender/MPFB instructions, recording their source or
  attaching them to this task before execution.
- Produce an editable Blender project and a self-contained GLB that passes the
  Sodalis avatar profile validator.
- Record model provenance, asset licenses, Blender/MPFB versions, and checksums.
- Keep source project and unoptimized authoring assets separate from the
  optimized runtime GLB.

## Implementation Notes

- Baseline profile instructions: `docs/avatar/SODALIS_AVATAR_PROFILE.md`,
  section “MPFB and Blender authoring”.
- Required facial shapes: `faceunits01` ARKit shapes and `visemes02` visemes.
- Do not assume that MakeHuman/MPFB system assets share one license; record the
  specific licenses for all shipped content.

## Agent Notes

- 2026-10-03: Created at the user's request. The repository contains the
  baseline authoring section in `docs/avatar/SODALIS_AVATAR_PROFILE.md`; the
  user's separate detailed instructions were not present in the workspace
  during task creation.
