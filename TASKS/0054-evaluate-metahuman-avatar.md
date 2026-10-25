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
- 2026-10-19: Unblocked with assets the user exported from Unreal:
  - Epic's `PA_MetaHuman_ARKit_Mapping` pose asset drives 51 baked ARKit
    shapes. `mouthClose` is derived from the lips-together pose;
    `tongueRollDown` has no pose and is not baked.
  - The 15 Oculus visemes are composed from Anna's own RigLogic controls.
  - The hair cards are fitted to her scalp with a similarity ICP and skinned
    to `Head`.
  - The eval GLB passes the profile validator (warning: 163k triangles) and
    renders on `?stage` at about 100 fps.
- 2026-10-19: Look fixes ("less zombie"); scripts are outside the repo:
  - Eyelids followed the gaze by 16 mm (RPM: 5 mm) under TalkingHead's resting
    `eyesLookDown`. Skin deltas of `eyeLook*` are now scaled by 0.35.
  - The dark eyeshadow baked into the basecolor read as "double eyes" and as
    dark lids when blinking. It is neutralised in a derived map
    (`clean_makeup.py`).
  - Eyebrows come from Epic's eyebrow cards, wrapped onto the skin. Each card
    vertex takes the barycentric skin weights and all 67 shape-key deltas of
    its nearest non-eyelid triangle, so brows follow raises and frowns but not
    blinks.
  - The eyelashes were already in the head mesh.
  - The hair is brown, less glossy, and sits 1 cm lower on the forehead.
  - Brows are projected along the view axis rather than snapped to the
    nearest skin point, which had folded the arch into two segments.
  - Hair volume: a smooth radial lift about the cranium centre (+5% at the
    tips, +11% at the crown), then a push out of the skin. The skin under the
    hair roots is tinted dark brown so the scalp doesn't show, faded on
    forward-facing skin to avoid a painted hairline.
  - `?stage` adds a RoomEnvironment light for eye catch-lights and skin
    specular.
- 2026-10-19: Realism pass, aimed at Unreal's look:
  - More triangles would not help. The head is already Unreal's LOD0, and
    subdividing would multiply all 67 morphs. The gap is in shading.
  - `?stage` now applies `stageRealism.ts` to every avatar:
    - PCF-soft shadows from the key light (4096 map, intensity 0.6, frustum
      fitted to the avatar). Hair cards cast shadows but don't receive them.
    - Alpha-to-coverage on cutout materials.
    - Per-channel wrap diffuse on skin materials, approximating subsurface
      scattering.
  - Anna's hair alpha cutoff is lowered from 0.35 to 0.15, which gives
    visibly fuller hair now that alpha-to-coverage smooths the edges.
  - MetaHuman's eye-occlusion shell is kept, with a generated soft-shadow
    alpha mask: darker at the corners and under the upper lid.
  - All stage avatars render at 120 FPS (vsync cap, M4 Max).
- 2026-10-19: Open eyes. At idle, TalkingHead holds `eyeBlink` near 0.1
  with some squint and downward gaze, which lowers Anna's upper lid about
  2.5 mm on a 10 mm opening. Her MetaHuman neutral pose already covers the
  top of the iris.
  - The build now bakes 70% of her own `eyeWide` pose into the rest shape,
    limited to the eyelids (about 4.1 mm at most). At 40% (2.3 mm) she
    still looked sleepy.
  - The `eyeBlink` keys keep their absolute closed pose, so blinks still
    close fully. Measured on stage, blinks last 200–250 ms.
  - The lash alpha cutoff is lowered from 0.3 to 0.15.
  - The validator passes (164k-triangle warning only).
- Over-tilted idle poses: TalkingHead's neutral mood switches between the
  `side`, `hip` and `straight` poses every 5–30 s, and `hip` sways the hips
  and tilts the head strongly. A new `behavior.poseScale` (0–1) slerps the
  standing idle templates toward `straight` before load. Anna uses 0.35.
  Euler lerp broke joints that wrap around ±π (a leg swung up), so the
  blend uses quaternion slerp.
- Unreal glTF export (`AnnaExportTest.glb`, 2026-10-20). The first copy was
  all zero bytes, and the second transfer is valid.
  - File: 839,036,112 bytes, glTF 2.0, written by UE 5.8.3. Blender 5.2.2
    imports it in 2 s with no errors.
  - Contents: 5 meshes and 5 skins.
    - Body: 37,929 triangles.
    - Face: 64,094 triangles in 9 sections.
    - Crop top: 31,668 triangles.
    - Jeans: 23,358 triangles.
    - Sneakers: 12,276 triangles.
    - Materials and textures: 18 materials (6 unused magenta LOD
      placeholders), 32 PNGs. Almost all textures are 1K; only the jeans'
      normal, specular and AO maps are 2–4K.
  - Missing: hair and eyebrows (grooms are not exported).
  - Visibly wrong:
    - `MI_Face_EyeShell` is unlit opaque black and covers the eyes.
    - Eyelashes have an alpha of 0, so they are invisible.
  - Body: hidden-surface removal cut the body under the outfit (the torso
    and upper arms under the top, the feet). The body only works with this
    outfit.
  - Geometry and normals: no out-of-range, `-1` or degenerate indices. The
    face has the same 34,659 vertices as the head FBX. Only the sneakers
    have zero-length normals (23) and tangents (9).
  - Shape keys: 856 face targets, unnamed (`target_0…855`).
    - 804 match the FBX FACS correctives by index (for example
      `target_615` = `jaw_open`). They are at most 9 mm, so the visible
      change is subtle.
    - There are no ARKit or `viseme_*` names. The face still needs
      RigLogic to drive its FACIAL joints, and skinning works.
  - Skeleton: MetaHuman `root → pelvis → spine_01…`, with no `Hips`, and 5
    duplicated skeletons (342 and 875 joints). It needs conversion, as
    before.
  - Placement: Y-up, about 1.81 m tall with shoes. The character is placed
    at (4.2, −0.4) in the level.
  - Size: 856 dense position and normal targets make up most of the size.
  - Verdict: not a replacement for the FBX + RigLogic pipeline. It is a
    useful source for the outfit meshes and their textures, which are
    skinned to the MetaHuman body skeleton.
- Outfit transfer (`add_outfit.py`, writes a copy `anna-eval-outfit.blend`;
  the original `.blend`, `.glb` and Unreal GLB checksums are unchanged).
  - Only the top, jeans and sneakers and their 3 used materials are kept.
    The GLB skeletons, body, face and placeholders are discarded.
  - Fit: pure translation (−4.2, 0, +0.4), scale 1.0, 0.00 mm joint
    residual over 14 joints.
  - The GLB skin weights are corrupt: `WEIGHTS_n` hold small sequential
    integers, not weights summing to 255, and left and right are mixed.
    Weights are instead transferred from `Anna_Body` by nearest-surface
    barycentric blending.
  - Clipping, tested over 11 poses (rest, arms down, talk, reach up,
    T-pose, cross arms, hip sway, twist-bend, stride, sit, deep knee):
    - Before culling, the body poked through the top by up to 10–28 mm
      (armpits, sides, chest) and through the sneaker toes by 15 mm. The
      jeans clipped by 25 mm only in the deep knee pose.
    - Body faces under the garments are now deleted (37,530 of 60,816),
      keeping skin within 3 cm of exposed skin, like Unreal's
      hidden-surface removal. After culling, every pose measures 0 mm, and
      renders show no gaps at the collar, cuffs, hem or ankles.
  - Remaining: a grey patch at the top's shoulder/collar in raised-arm
    poses. It also appears with the body hidden, so it comes from the
    top's own geometry or weights.
- MetaHuman Creator settings (user screenshots, 2026-10-21) are appearance
  parameters, not glTF export options. They give targets for matching the
  look:
  - Hair: brown base with ombre, and warm highlights at intensity 1.0.
  - Brows: near-black.
  - Lips: dark red, roughness 0.25.
  - Eye makeup: soft navy liner, opacity 0.85.
  - Blush: intensity 0.25.
  - Iris: olive-brown and grey, radial blend, saturation 0.4.
  - Eyelashes: tan.
  - Every outfit has Prune, Relax, Hammer, Clamp and Normalize skin weights
    enabled. The corrupt GLB weights therefore come from the glTF exporter,
    not the outfit fitting.
- "4K" texture packs (`~/Downloads/MHC_Anna_4k`, with and without makeup,
  2026-10-21):
  - Despite the name, every map is 2048 px; teeth are 1024 px. That is the
    same resolution as `dcc/`. `head.dna` is identical.
  - The no-makeup pack's head base colour is Unreal's own clean skin. It
    keeps the eyelid creases and natural shading that the generated
    `Head_Basecolor_Clean` (`clean_makeup.py`) flattened.
  - Its body map also drops the faint underwear-strap seams on the
    shoulders.
  - `build_anna.py` now reads `dcc-nomakeup/Maps` by default; set
    `ANNA_MAPS=dcc` to use the old maps. The output went to
    `anna-eval-nomakeup.glb`, and is installed as the app's `anna-eval.glb`.
    The previous file is kept as `anna-eval.prev.glb`, and `out/anna-eval.*`
    is untouched.
  - The glTF export settings explain the 1K GLB textures: *Default Material
    Bake Size* is 1024 with auto-detect on. *Export Thin Translucent
    Materials* is off, which fits the opaque eye shell and invisible
    lashes. No setting explains the corrupt skin weights.
- `AnnaExportTest_v2.glb`: outfit textures are now 2K (jeans normal and
  specular 4K), and it includes a 2K face occlusion map whose UVs match the DCC
  head, so `extract_face_ao.py` reuses it as `Head_Occlusion`. Skin weights
  are still corrupt. The head mesh reaches the collarbones and showed through
  the top, so garments take weights from the nearer of body and head, and
  `clear_skin` keeps the top at least 3 mm off the head (the head is not culled:
  that opened a gap inside the collar).
- Body culling: the first proximity rule (within 3 cm of fabric) also removed
  the bare belly between hem and waistband. Skin is now hidden when fabric
  touches it (within 1 cm), when a ray along its normal hits fabric within
  3 cm, or hits a garment's back face within 15 cm (loose fabric), or when fabric
  lies just under the surface (1.5 cm backward ray). Toes are always culled.
  This culls 37,682 of 60,816 faces and keeps the belly. The 11-pose test
  shows no body clipping; head-to-top is at most 1.2 mm, in reach_up only.
- Unbaked Materials Export (20 `T_*` PNGs): face and body maps are a real
  4096 px; wrinkle maps are 512 (`CM`) and 1024 (`WM`).
  - `T_Face_*` share the DCC head UVs (best match at zero shift, 1% mean
    difference) and contain no makeup. Downscaling them to 2K loses little
    (mean high-frequency 0.5/255 for colour, 1.1/255 for normal). In Face
    framing on the stage, a 4K build (`ANNA_MAPS=dcc-4k
    ANNA_TEXTURE_CAP=4096`, 50 MB) is indistinguishable from 2K, so we ship
    2K. The 4K maps stay in `~/avatar-work/anna/dcc-4k` as sources.
  - `T_Body_Body_*` share the DCC body UVs, but the colour map is an untinted
    grey layer that Unreal's skin material tints at render time; `T_Body_Chest_*`
    match no UV set on the body mesh. Both would need a bake, so the body
    keeps the DCC maps.
  - Wrinkle maps need per-region masks blended by facial controls in a custom
    shader; glTF cannot drive them, so they are not used.
  - Validator: the shipped 2K outfit GLB passes (warning: 193,815 triangles,
    11 draw calls); the 4K build adds a 4096 px texture warning.
- Eyelashes: the v2/v3 glTF lash material has no texture and base-colour
  alpha 0, so it adds nothing. The DCC lash cards have 1-2 px alpha strands;
  a 0.15 alpha cutoff lost them in mipmaps, leaving sparse clumps and dark
  specks under the lower lids. `build_anna.py` (`soften_lash_alpha`) now
  grows the strands by 1 px, multiplies alpha by 1.8 and exports the lashes
  as glTF `BLEND`. In Face framing this gives a defined lash line with soft
  individual lashes; a lower cutoff (0.05) looked clumpy and the
  original alpha blended was too faint. Installed; validator passes.
- `AnnaExportTest_v3.glb` (1.11 GB; v2 0.90 GB): same meshes, materials
  and 32 images as v2, but 30 maps are now 4096 px (v2: mostly 2048). They
  are upscaled bakes: high-frequency detail is 3-6x lower than our DCC maps
  (face colour 0.09 vs 0.54/255, face normal 0.26 vs 0.81, eye 0.17 vs 0.33,
  teeth 0.13 vs 0.78). The face colour also includes eyeshadow and painted
  scalp hair. The lash material still has no texture and alpha 0. Not used.
- Closed-eye dark band (user feedback): the glTF morph targets carried
  POSITION only, so a closed lid kept its rest-pose, crease-facing normals
  and shaded as a dark band. `export_glb` in
  `tools/avatar-authoring/build_avatar.py` now takes `morph_normals`
  (default off); Anna's `add_outfit.py` enables it. The band is gone in the
  stage. The installed GLB grew from 41.5 MB to 65.5 MB, and the validator
  still passes. A thin dark slit remained near the top of the closed lid.
- Closed-lid slit fixed (2026-10-21). The crease skin hidden inside the
  upper-lid fold at rest has exported normals that point into the fold. The
  blink pulls it out, and every idle morph's normal delta adds to that wrong
  base. An unlit render showed no line, so the geometry is fine; smoothing or
  unfolding the shape keys did not help. `gltf_morphs.py` now blends base
  normals that disagree with the welded rest geometry toward it, recomputes
  morph normal deltas by rotating them with the smoothed geometric normal, and
  stores all morph targets sparsely. The slit is gone in the stage, and the
  GLB shrank from 65.5 MB to 39.4 MB with morph normals kept. Validator: valid
  (193,815-triangle warning only); Khronos validator: 0 errors.
- The Anna scripts are generalised into `tools/avatar-authoring/metahuman/`
  (`build_anna.py` → `build_metahuman.py` with a per-character JSON config,
  plus `build_openriglogic.sh` and `extract_face_ao.py`). A fresh OpenRigLogic
  build and `characters/anna.json` reproduce the installed GLB byte for byte.
  Tutorial: [docs/avatar/metahuman-to-sodalis.md](../docs/avatar/metahuman-to-sodalis.md).
- Dutch lip-sync test data: `scripts/azure-visemes.py` records the 50
  sentences in `scripts/tts-sentences.json` with `nl-NL-FennaNeural` through
  the Azure Speech SDK (the REST endpoint returns no visemes), about 2,300
  billed characters. It writes MP3s, viseme ids with offsets, and word
  boundaries to the ignored `public/avatars/eval/speech-nl/` (2.6 MB, 13–56
  visemes per clip). `createAzureVisemeSequence` (`@sodalis/avatar/testing/azure`)
  maps Azure's 22 ids to the 15 Oculus visemes plus 4 detail visemes (below).
  The stage's *Recorded Dutch* picker plays a clip and starts the track
  on the audio's `playing` event. The resource key works only through the
  regional endpoint (`westeurope`), not the custom domain.
- Detail visemes: Azure's 22 ids are phoneme groups, so the 7 "missing" ones
  are covered by 4 new shapes and 3 glides. `visemes.json` adds `viseme_AX`
  (id 1), `viseme_OW` (8), `viseme_ER` (5) and `viseme_HH` (12, Dutch g/ch);
  the diphthongs glide aa→U (9), O→I (10) and aa→I (11). Avatars without the
  detail morphs fall back to aa/O/RR/kk at runtime. Anna's rebuilt GLB has 71
  head targets and is 41.4 MB (was 39.4 MB). Azure blend shapes
  (`FacialExpression`) return no frames for nl-NL, so they are not an option.
- Eye colour: the DCC `Eyes_Color.png` is a lighter, turquoise generic iris.
  The build now overrides it with Unreal's baked `MI_EyeL_Baked_Face`
  texture (`extract_glb_texture.py`, `map_overrides`), giving her darker
  hazel-green eyes with a limbal ring. GLB 41.4 MB.
- Head bob: incidental pitch (mood animation, gaze, breathing) now scales
  with framing: 0 in Face/Head, 0.35 in Head & shoulders/Bust, 1 otherwise.
- Avatar Lab on `?stage` hides Presentation, Dock, Size and "Show avatar on
  desktop": they only drive the desktop overlay (Presentation only scales
  it by up to 14%), so they had no effect on the stage.
- Open: tearline shell, baked ambient occlusion, 4K texture sources,
  T-shirt (garment FBX not exported), judging the Dutch viseme timing by eye
  and tuning `visemes.json`, Azure visemes in the live speech path, the
  evaluation write-up, and the licence.

- Speech start and lip timing: ambient sway is now additive and fades over
  0.6 s, so the body no longer snaps when speech starts or ends. Visemes use
  TalkingHead's `realtime` channel; lip correlation for Dutch clip 01 went
  from 0.71 to 0.86, with the mouth about 60 ms ahead of the audio. The
  system voice stops on `onend`. See the tutorial's "Lip-sync timing".
- 2026-10-22: Expanded the linked tutorial into a reusable, character-neutral
  Unreal-to-Blender checklist. Anna's asset names and colours are examples;
  the guide now covers first-time setup, rigging/assembly order, the required
  exports, Windows-to-Mac hand-off and common Unreal export failures. The
  dev-only avatar stage described there is still on `mpfb-avatar-pipeline`,
  not `main`.
- 2026-10-22: Added GUI locations for first-time Unreal users: where the
  Launcher, Plugins, Content Drawer, Creator categories, Outliner and export
  dialogs are, and how to identify each required asset.
- 2026-10-22: Merged `main` and added a second MetaHuman, **Odette**
  (`?avatar=metahuman-odette-eval`; GLB 42.0 MB, 154k triangles, validator
  passes with only the triangle warning). Same pipeline and visemes as Anna;
  blouse tucked into the jeans (`outfit.tuck`). Fixes found on the way:
  - Cheek creases came from the face occlusion map: Unreal's baked textures
    carry a `KHR_texture_transform` that `extract_face_ao.py` ignored. It
    now bakes it in; Anna's AO had a smaller offset and was rebuilt too.
  - Long hair was fitted at scale 0.89, showing the scalp: new hair
    `ROOT_FRAC`/`FIT_SCALE` options (Odette: 0.05, 1.0).
  - The lace pattern exists only in the blouse's roughness texture:
    `extract_glb_texture.py --detail-from-roughness` plus `outfit.textures`.
  - Hair colours from `groom-colours.txt` (Melanin/Redness) were matched by
    eye: hair `0d0907`/`110c09`, brows `140e0a`.
  - Resolved: the faint straight-edged band on the left cheek in Face
    framing (also on Anna) was the hair cards' shadow from the stage key
    light (shadow maps ignore alpha). Hiding the hair or the key-light
    shadow removed it. Cutout and transparent materials no longer cast
    stage shadows.
  - Odette's back of head was bald: only hair card `Group0` (front and
    sides, 12.5 cm deep on a 23 cm head) was exported. `hair.FBX` now
    accepts a list of groups; until the other `Hair_L_Straight` groups are
    exported, `hair.BACK_FILL [35, 70, 105]` copies the side curtains
    towards the back (12k -> 43k hair vertices; GLB 42 -> 44 MB). Anna's
    build is byte-identical. See the tutorial, *Bald back of the head*.
  - Odette skin and brows (user feedback): the DCC face map lacks the
    Creator makeup; `extract_glb_texture.py --tone-onto` transfers it from
    Unreal's baked face. The brows sat about 7 mm too low, on the upper
    lids (3191/5676 brow rays hit), so they curled under the lids and
    lashes. New `brows.BROW_EYE_HEIGHT` (Odette 0.26; Anna measures 0.26)
    gives 5648/5676 hits. Brows rebaked soft brown; `rest_lid_lift` 0.35
    (0.7 looked surprised). Anna's build is byte-identical.
  - Odette's hair Group1 exported (back of the head). It came out about
    15 cm higher than Group0 and with its atlas UVs named `LightMapUV`, so
    `hair.py` now fits each group separately (brows reuse Group0's fit) and
    renames UV channel 0. `BACK_FILL` removed: 729 cards, 38 MB GLB, root
    error 4.6 mm, brows unchanged (5648/5676 hits). Anna is byte-identical.
  - "Why is the Sodalis Odette uglier than Unreal's?" Geometry (grey render
    of Unreal's own glTF face) and baked face texture match. The causes
    were flat studio lighting, TalkingHead's random idle face drift (up to
    0.2 on `noseSneer`/`cheekPuff`/`mouthRoll`: a grimace), side hair 1–4 cm
    off the cheeks, near-black hair and wide eyes. Fixes:
    `lighting: "portrait"` and `behavior.idleFaceScale` 0.3 for MetaHuman
    entries, `hair.HUG` 0.03, hair rebaked `1c130d`/`2c1f16`,
    `rest_lid_lift` 0.15. Anna's build is byte-identical; her catalogue
    entry gets the new lighting and idle scale too.
