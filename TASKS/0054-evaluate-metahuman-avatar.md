# 0054 Evaluating a MetaHuman avatar export

Status: pending
Priority: medium
Subsystem: avatar
Depends on: 0014
Owner: Copilot
Agent: Copilot

## Context

The MPFB avatars from 0014 work, but their faces still look dated next to
current real-time humans. This task tests whether a MetaHuman, exported once
and converted to a TalkingHead-compatible GLB, is good enough to justify the
extra pipeline. It is an evaluation: the result is a test GLB on the dev-only
stage (`?stage`) plus a written verdict, not a production asset.

Licensing (Unreal Engine EULA, read 2026-10-19):

- Since UE 5.6 the MetaHuman Creator EULA is superseded by the Unreal Engine
  EULA. §4(a)(i) treats character model files developed with Engine Code as
  Non-Engine Products, "even if included in Products that use or rely on other
  video game engines". These are royalty-free.
- §6(e) forbids using MetaHuman characters or their animation curves to build
  datasets or to train or test AI/ML. Using the avatar as an LLM's face is not
  training, but legal must confirm this.
- §6(b)(ii) exempts educational institutions from seat fees for educational
  use. A partner institute could author a shared avatar. Who may then
  redistribute it, including to TNO for commercial work, needs legal review.
- Fab content and MetaHuman presets may have separate Epic Content License
  terms; prefer a character authored from scratch.

## Pipeline

1. **Windows (Unreal):**
   - Install the Epic Games Launcher and UE 5.7 or later, with "MetaHuman
     Creator Core Data".
   - Create a project with the MetaHuman Creator plugin. Auto-rig and texture
     synthesis use Epic cloud services and need an online Epic account.
   - Author the character: attractive woman of about 30, long dark hair.
   - Run Export > DCC Export to get head and body `.dna` files, textures and
     JSON. Also export the face and body skeletal meshes as FBX with the
     highest LOD.
   - Copy the bundle to the Mac outside the repository.
2. **Mac (Blender 5.2, headless where possible):**
   - Import the DNA with the Poly Hammer Character DNA add-on. First check
     that it supports macOS arm64.
   - Bake ARKit-52 morph targets and the 15 Oculus visemes by driving the
     `CTRL_expressions_*` controls through RigLogic and capturing each pose
     as a shape key.
   - Rename the skeleton to the RPM/Mixamo bones TalkingHead expects. Reuse
     the 0014 eye-bone and rest-frame steps.
   - Replace strand grooms with hair cards (a MetaHuman card LOD or an MPFB
     hair). Add hair bones as in 0014.
   - Cap textures, then export the GLB.
3. **Desktop:**
   - Add a dev-only catalogue entry and compare it with Sofia on `?stage`:
     lip sync, blinks, gaze, idle motion, close-up skin.

## Acceptance

- [ ] A MetaHuman GLB loads in TalkingHead on the stage with no console
      errors.
- [ ] ARKit and viseme morphs pass the 0010 profile validator.
- [ ] Side-by-side screenshots with the MPFB Sofia.
- [ ] Evaluation in `docs/evaluations/` covering visual quality, file size,
      frame rate, authoring effort and the licence questions above.

## Open questions

- Does the Poly Hammer add-on, or OpenRigLogic, ship macOS arm64 binaries?
  If not, bake on Windows.
- Is there a reusable ARKit-to-`CTRL_expressions` mapping? Live Link Face
  implies one exists inside Unreal (the ARKit pose asset).
- Current seat pricing, and the exact wording of the educational exception
  (behind a login).

## Progress notes

- 2026-10-19: Licence reviewed. Windows chosen for Unreal (more storage).
- 2026-10-19: Inspected Anna's export (UE 5.8.3, kept in `~/avatar-work/anna`):
  - Head FBX LOD0: 34.7k verts, 859 FACS corrective shape keys and 874 bones.
    It has no ARKit or viseme names.
  - Body FBX LOD0: 60.8k tris, 341 bones, no shape keys.
  - DCC zip: head/body DNA plus 2K maps.
  - **There is no hair (groom or cards) and no clothing** in the export.
- 2026-10-19: Built Epic's OpenRigLogic (MIT) with Python bindings for
  Blender 5.2 / Python 3.13 on arm64. Local fixes, none in the repo:
  - link `Python3::Module`;
  - use the SWIG 4.5 `SWIG_STRINGIFY` rename;
  - add `.so` symlinks;
  - add an `@loader_path` rpath.

  It loads `head.dna`: 263 raw controls, 870 joints and 782 blend-shape
  channels. Evaluating a control gives joint deltas plus the corrective
  (e.g. `jawOpen` → `jaw_open`). Poly Hammer's add-on was not needed; its
  compiled bindings come from a private repository.
- 2026-10-19: **Blocked on data, not platform.**
  - No ARKit→`CTRL_expressions` mapping ships with OpenRigLogic or Poly
    Hammer. Epic's `mh_arkit_mapping_pose` asset is inside Unreal; a
    third-party GitHub copy has no clear licence, so it is not used.
  - No Oculus viseme set exists for MetaHumans.
  - No exportable hair is in the export.
- 2026-10-21: Unblocked with Unreal exports (ARKit pose asset as T3D, hair
  and brow cards, glTF garments). The conversion now runs end to end; the
  detailed progress notes are on the `mpfb-avatar-pipeline` branch. Generic
  workflow and Unreal settings:
  [docs/avatar/metahuman-to-sodalis.md](../docs/avatar/metahuman-to-sodalis.md).
  Tools: `tools/avatar-authoring/metahuman/`.
- 2026-10-22: Expanded the linked tutorial into a reusable, character-neutral
  Unreal-to-Blender checklist. Anna's asset names and colours are examples;
  the guide now covers first-time setup, rigging/assembly order, the required
  exports, Windows-to-Mac hand-off and common Unreal export failures. The
  dev-only avatar stage described there is still on `mpfb-avatar-pipeline`,
  not `main`.
- 2026-10-22: User reports a substantial improvement in visual appearance
  over the previous avatar. This is a qualitative assessment, not yet the
  side-by-side screenshots or measured frame-rate comparison in Acceptance.
  The royalty threshold and lack of AI training do not by themselves settle
  rights to publish a GLB with acquired Epic/Fab content; see the
  [MetaHuman and Fab licensing research note](../docs/evaluations/metahuman-fab-licensing.md).
  Continue local evaluation; confirm asset provenance and distribution
  terms before publishing the converted avatar.
- 2026-10-22: Anna's garments are Epic's Fab Standard-licensed MetaHuman
  Jeans, Tucked T Shirt Variants and Casual Sneakers. The user accepts GLB
  conversion as permitted modification. Because the repository is public,
  added a licensed-avatar mechanism on main: GLBs live in a private asset
  store, `pnpm avatars:licensed` copies them into the git-ignored
  `apps/desktop/public/avatars/licensed/`, and catalogue entries with
  `licensedFile` appear only in builds that have them
  ([Licensed avatars](../docs/avatar/licensed-avatars.md)). Next: create the
  private store with Anna's GLB and NOTICE, then rebase
  `mpfb-avatar-pipeline` onto main and register Anna through it.
- 2026-10-22: Added GUI locations for first-time Unreal users: where the
  Launcher, Plugins, Content Drawer, Creator categories, Outliner and export
  dialogs are, and how to identify each required asset.
