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
