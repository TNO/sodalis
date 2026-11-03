# Male thuiszorg-style avatar design specification

Status: complete. The profile-valid, rights-checked model is in the desktop
and its in-app preview was approved by the user on 2026-10-19. The user reports
smooth performance without noticeable slowness or visual irregularities.
Avatar Lab inspection covered expressions, speech/visemes, user and UI-target
gaze, head motion, and reduced motion; it displayed 60 FPS in the preview
session. That render-loop reading is not a representative-hardware benchmark.

This specification covers one original male avatar and a compact two-option
selection in the existing prototype desktop. It does not replace the
[Sodalis Avatar Profile](./SODALIS_AVATAR_PROFILE.md) or deliver the larger
native collection and gallery in [task 0014](../../TASKS/0014-generate-mpfb-avatar.md)
and [task 0015](../../TASKS/0015-build-avatar-selection.md). Track delivery
in [task 0055](../../TASKS/0055-add-male-thuiszorg-avatar-option.md).

## Character and visual direction

- An approachable, professional, semi-realistic adult man, approximately 40
  in appearance, white/Caucasian, with neat short brown hair and a clean-shaven
  face (no beard or moustache). Favor believable conversational expression
  over photorealism or cartoon exaggeration.
- Dutch *thuiszorg*-inspired workwear: an original short-sleeved white V-neck
  care tunic with discreet functional pockets and a restrained light-blue
  accent, a red undershirt visible at the V-neck, plus plain dark-navy
  trousers. **Not** a long doctor's coat or blue
  scrubs. No logos, badge, stethoscope, hospital insignia, or other props.
- "Care worker" describes the visual character only. Neither the avatar nor
  its UI claims professional credentials or implies that Sodalis provides
  medical advice.
- Visual references, not licensed source art or patterns to reproduce:
  [white V-neck care tunic](https://www.zorgkleding.nl/products/bp-zorgtuniek-unisex-v-hals-wit)
  (short sleeves and pockets); [short white care jacket](https://www.zorgkleding.nl/products/de-berkel-heren-zorgjack-floris-wit-met-kleuraccenten)
  (alternate silhouette and subtle accent). Create distinct original
  geometry/materials; do not reuse product photos or copy branded details.

## Model and authoring requirements

- Deliver a real, self-contained glTF 2.0 GLB, not a render or placeholder.
  Meet the existing profile's coordinate, bounds, rig, skin, material, and
  performance contracts, including the full-body Mixamo-compatible skeleton,
  all 52 named ARKit facial shapes, and all 15 named Oculus/Meta visemes.
  Check eye and head movement in TalkingHead, not only morph names.
- Prefer an original MPFB 2.x / Blender project using the documented
  `faceunits01` and `visemes02` facial assets. These tools are for authoring
  only, not desktop runtime dependencies. Include the editable source project
  and reproducible export/optimization steps if source-component rights permit.
- Audit **each** base mesh, hair, garment, texture, and other included asset:
  source URL and revision, author, license, redistribution and commercial-use
  rights, modification rights, and required attribution. Record tool versions,
  the finished GLB's checksum, and an asset notice/manifest. Do not infer
  rights for every component from MPFB's or TalkingHead's code license.
- Pass the Sodalis GLB validator and record the report, including actual
  triangles, draw calls, texture dimensions and model bounds. The profile's
  100,000-triangle and 48-draw-call targets, and recommended 2048 px texture
  limit, remain in force; warnings require investigation rather than an
  unsupported performance claim. Measure performance on representative
  moderate hardware when available and report the device and conditions.

## Approval gates

1. **Profile-valid**: validator checks pass and the model loads correctly in
   the desktop scene through the existing TalkingHead adapter.
2. **Rights-checked**: every shipped component has documented permission for
   the intended commercial redistribution, with notices and attribution.
3. **Animation and appearance**: inspect neutral, warm, happy and concerned
   expressions; blinks, gaze at user/UI targets, head movement and nods;
   mock visemes, speaking/listening, and reduced-motion behavior in Avatar
   Lab. Inspect clothing and facial deformation at desktop framing, not just
   a static render. Record any measured performance trade-offs.
4. **User approval**: approval of the in-app preview was received on
   2026-10-19. Structural validation cannot substitute for visual approval.
   Do not offer a placeholder or unapproved candidate as a finished option.

All four approval gates are complete for this asset. Performance feedback is
qualitative from the user; the Avatar Lab render-loop reading was 60 FPS in
the inspection browser, with no claim about other hardware.

If original, rights-verified MPFB authoring cannot meet the visual and
animation gates, report the blocker and propose another licensed route rather
than weakening the profile or silently using a third-party sample.

## Prototype selection behavior

- Offer an accessible, compact Male / Brunette choice in the existing desktop
  avatar interface, not the full gallery. Show the selected asset's name,
  source/attribution, and license. Use the male avatar when no local
  choice exists, and persist a valid choice on this device across reloads.
- On a change of choice, release or replace the previous scene/model safely
  without breaking the desktop, conversation overlay, or avatar callbacks.
  If the chosen model fails to load, keep that choice visible, explain the
  error, and offer Retry and Switch to the other available model. Never
  silently overwrite the stored choice with a fallback.
- Keep the current brunette asset and its [notice](../../apps/desktop/public/avatars/NOTICE.md)
  unchanged. Its CC BY-NC 4.0 terms still limit it to non-commercial use;
  adding a commercially redistributable male model does **not** make the
  prototype bundle commercially distributable. A separate commercial asset
  set/build and the full gallery are outside this slice.

## Source contracts

- [Sodalis Avatar Profile](./SODALIS_AVATAR_PROFILE.md)
- [Avatar runtime and asset-approval decision](../adr/0004-avatar-runtime-and-asset-profile.md)
- [TalkingHead model compatibility](https://github.com/met4citizen/TalkingHead/blob/main/README.md#L450-L504)
- [TalkingHead example asset licensing](https://github.com/met4citizen/TalkingHead/blob/main/README.md#L369-L390)
- [TalkingHead MPFB authoring notes](https://github.com/met4citizen/TalkingHead/blob/main/blender/MPFB/MPFB.md)
