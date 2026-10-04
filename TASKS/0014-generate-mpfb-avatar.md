# 0014 Building a native Sodalis avatar asset pipeline

Status: open
Priority: medium
Subsystem: avatar
Depends on: 0010, 0012
Owner: Copilot
Agent: unassigned

## Context

**Future task — do not implement as part of the current milestone.**

Build a small, attractive, legally redistributable collection of native
Sodalis avatars. Use MPFB 2.x and Blender as authoring tools, then deliver
optimized GLBs that conform to the existing Sodalis Avatar Profile and run
through TalkingHead. MPFB and Blender must not become runtime dependencies.

Prefer this owned authoring pipeline over a production collection dependent on
commercial avatar services or older third-party libraries:

- Avaturn's service availability and export/redistribution terms are outside
  Sodalis's control.
- Ready Player Me is no longer a practical public source.
- Microsoft Rocketbox is permissively licensed but its visual assets are not
  the desired primary collection.
- The TalkingHead brunette bundled by 0013 is CC BY-NC 4.0 and is only a
  non-commercial pipeline sample, not an assumed production asset.

## Objective and pipeline

Create a repeatable authoring and optimization workflow:

```text
MPFB 2.x -> Blender -> Sodalis Avatar Profile -> optimized GLB
          -> Sodalis GLB validator -> Three.js scene -> TalkingHead adapter
```

The runtime must remain unaware of how a GLB was authored. Every finished
avatar should use the existing `AvatarAsset` metadata/registry so a future
chooser can load another compatible model without application-code changes.

## Initial avatar set

Do not attempt a large library initially. Target approximately three reference
avatars:

1. An older male adult, approximately 60–70 in appearance, friendly but
   neutral, realistic proportions, contemporary casual clothing.
2. An older female adult, approximately 60–70 in appearance, friendly but
   neutral, realistic proportions, contemporary casual clothing.
3. A contrasting adult, younger and/or somewhat more stylized, demonstrating
   the range possible with the same pipeline.

The apparent ages are guidelines, not hard requirements. Avoid exaggerated
game-character proportions. Use the set to evaluate the range of companion
personalities the pipeline can produce.

## Facial and runtime compatibility

Every production model must satisfy `docs/avatar/SODALIS_AVATAR_PROFILE.md`:

- Mixamo-compatible humanoid skeleton and the profile's named core joints.
- All 52 required ARKit facial morph targets.
- All 15 Oculus/Meta visemes.
- Eye and head movement suitable for TalkingHead.
- Compatible self-contained GLB/glTF materials and embedded textures.
- Valid profile metadata and a passing Sodalis GLB validator report.

Use MPFB's `faceunits01` pack for ARKit facial units and `visemes02` for the
required visemes. Do not substitute Microsoft's `visemes01`. Do not add
model-specific TalkingHead exceptions without a documented technical need.

## Visual quality

Do not judge MPFB solely by its defaults. Develop a reusable, GLB-compatible
Sodalis authoring workflow for:

- **Skin:** tune roughness, tone, and age detail; avoid plastic-looking skin
  and Blender-only shader features.
- **Eyes:** prioritize believable iris, sclera, highlights, roughness, and
  natural conversational gaze.
- **Hair:** favor modern-looking styles that export cleanly and remain
  efficient on tablets; avoid excessive transparency, geometry, and draw calls.
- **Clothing:** create a small set of contemporary, neutral outfits so the
  avatars read as people rather than game characters or mannequins.

## Performance

Evaluate triangle count, material count, draw calls, texture sizes,
transparency, GPU memory, and browser FPS on representative moderate tablets.
Prefer textures no larger than 2K for normal/high quality and optional 1K
variants for low quality. Limit materials and transparency and optimize GLBs,
without sacrificing facial deformation quality merely to reduce polygons.
Record actual measurements rather than claiming performance from budgets alone.

## Licensing and provenance

Licensing is a hard requirement. For every shipped base mesh, skin, hair,
clothing, texture, accessory, and other source asset, record:

```text
asset:
source:
author:
license:
redistribution allowed:
commercial use allowed:
modification allowed:
attribution required:
source URL:
```

Prefer CC0 assets where practical. Do not assume MakeHuman core assets and
community/MPFB assets share one license. Do not add an asset to the production
chooser until its redistribution terms are verified and an attribution
manifest is shipped with the collection.

## Registry, evaluation, and comparison

Each avatar must have profile-valid `AvatarAsset` metadata and be discoverable
through the avatar registry. Keep the model catalogue separate from the
renderer so adding a model does not require changing application code.

Evaluate every candidate in Avatar Lab with neutral, warm, happy, and concerned
expressions; blinking; user and UI-element gaze; head movement; nod; mock
visemes; speaking/listening states; and reduced motion. Prioritize natural
conversation over static screenshots. Reject models that look good at rest but
become uncanny while speaking.

Compare all three candidates side by side. Assess appearance, facial
deformation, lip-sync, eye/gaze quality, age representation, hair, clothing,
performance, and consistency. For visual problems, identify whether they
originate in geometry, textures, materials, hair, lighting, or TalkingHead
animation. Do not discard MPFB solely because default materials look dated;
if geometry and animation are sound, improve the Sodalis material/eye/hair
workflow.

## Future customization and alternatives

Do not implement MPFB or Blender in the browser. Initially, customization
should use pre-generated profile-compatible avatars. Preserve an architecture
that could later support choices for age appearance, face, hair/style, hair
color, and clothing.

Keep newer open procedural-human projects under observation, but do not replace
MPFB without demonstrated advantages in model quality, maintenance, licensing,
facial animation, pipeline reliability, and tablet performance. VRoid may be
considered later as an optional stylized family, not as the primary Sodalis
avatar format. Any alternative must preserve the Sodalis Avatar Profile and
runtime architecture.

## Deliverables

1. Approximately three reference Sodalis avatars, subject to the quality
   evaluation.
2. Editable Blender/MPFB projects where their licenses permit redistribution.
3. Optimized runtime GLBs and a complete asset/license manifest.
4. Reusable Sodalis skin and eye materials/setups.
5. Documented hair workflow and MPFB-to-Blender-to-GLB procedure.
6. Validator reports for all candidate avatars.
7. Avatar Lab performance measurements on representative hardware.
8. Screenshots or video showing expressions, gaze, and speech animation.
9. A recommendation on whether MPFB should remain the primary authoring
   pipeline.

## Acceptance criteria

- The workflow can produce approximately three visually coherent avatars, or
  the documented evaluation explains why it cannot and recommends the next
  authoring source.
- Every delivered model passes the Sodalis Avatar Profile validator and has
  verified redistribution rights and a complete manifest.
- Source projects, runtime GLBs, notices, and attribution are organized so the
  runtime consumes only the optimized GLBs.
- Avatar Lab evaluation covers conversational behavior and reduced motion, not
  only static rendering.
- Performance, visual tradeoffs, licensing, and the continued suitability of
  MPFB are documented.
- The common Sodalis profile and runtime remain unchanged unless a separately
  justified ADR approves a change.

## Implementation Notes

- Runtime contract and authoring baseline:
  `docs/avatar/SODALIS_AVATAR_PROFILE.md`.
- MPFB 2.x release provenance:
  https://github.com/makehumancommunity/mpfb2/releases/tag/v2.0.17
- MPFB getting started:
  https://static.makehumancommunity.org/mpfb/docs/getting_started.html
- Face operations:
  https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/docs/ui/operations/faceops.md
- FaceService:
  https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/docs/services/faceservice.md
- The detailed task instructions were supplied by the user on 2026-10-03 and
  are captured here; no separate attachment is needed to start the task.

## Agent Notes

- 2026-10-03: Created at the user's request. The repository contained only the
  baseline authoring section in the avatar profile at that time.
- 2026-10-03: Expanded this future task from the user's detailed asset-pipeline
  brief. Keep it open; do not start authoring until the user selects this task.
