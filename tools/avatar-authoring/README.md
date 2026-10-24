# Avatar authoring

Reproducible MPFB/Blender build for the Sodalis male thuiszorg-style avatar
([design specification](../../docs/avatar/MALE_THUISZORG_AVATAR_SPEC.md)).
These tools are not runtime dependencies; the desktop consumes only the
exported GLB in `apps/desktop/public/avatars/`.

## Build

```bash
tools/avatar-authoring/setup.sh
~/.cache/sodalis-avatar-authoring/blender.sh -b \
  --python tools/avatar-authoring/build_male_thuiszorg.py -- --out-dir /tmp/sodalis-male-build
cp /tmp/sodalis-male-build/male-thuiszorg.glb apps/desktop/public/avatars/sodalis-male-thuiszorg.glb
```

`setup.sh` downloads pinned, checksum-verified inputs into
`~/.cache/sodalis-avatar-authoring` (override with `SODALIS_AVATAR_CACHE`):
Blender 4.5.14 LTS, MPFB 2.0.18, the CC0 MakeHuman packs, and TalkingHead's MPFB
rig and weights. Blender runs with an isolated user profile; nothing is
installed system-wide. On hosts without `libSM`/`libICE`, the script extracts
the Ubuntu packages privately.

The build writes the editable source project (`male-thuiszorg.blend`, with its
textures packed), the GLB, and `build-report.json`. The approved source
project is included at [`source/male-thuiszorg.blend`](./source/male-thuiszorg.blend).
Its SHA-256 is `83335518f87e8696d8d600450cc2e306f300a5da6469718c96d4f16e500ad59c`.
Rebuilding regenerates it; review any differences before replacing the
approved source and GLB.

## What the build does

1. Creates a ~40-year-old male with MPFB macros and subtle face detail targets,
   adds TalkingHead's custom rig, the CC0 skin, hazel eyes, brows, lashes,
   teeth, tongue, short brown hair, the `male_casualsuit06` garment, and shoes.
2. Paints an original white care tunic over the garment
   ([`tunic_texture.py`](./tunic_texture.py)): light-blue V-neck and sleeve
   trim, a red undershirt in the V-neck, chest and lower pockets, and navy
   trousers. Details are placed by 3D
   body position; only MakeHuman's CC0 ambient occlusion and denim shading are
   reused.
3. Makes an MPFB export copy with `visemes02` (15 Oculus visemes) and
   `faceunits01` (52 ARKit face units), and bakes masks and helpers.
4. Names the root `Armature` and aligns every bone's rest orientation to
   TalkingHead's CC0 `mpfb.glb`
   ([`reference/`](./reference/talkinghead-mpfb-bone-frames.json), extracted by
   [`extract_bone_frames.py`](./extract_bone_frames.py)). TalkingHead poses
   bones with absolute rotations, so differing rest frames otherwise show up
   as a lowered head and gaze.
5. Exports opaque materials as JPEG and cut-out hair, brows, and lashes as
   glTF `MASK` PNGs, with the hair capped at 1024 px.

## Check the result

- Preview the exported GLB in a clean scene:
  `blender.sh -b --python tools/avatar-authoring/render_preview.py -- --glb FILE --out-dir DIR`.
- Validate it with the Sodalis GLB validator
  (`@sodalis/avatar/internal/validation`) in a browser, and inspect
  expressions, visemes, gaze, gestures, and speech in the desktop before
  approval.
- Update the checksum and component list in
  `apps/desktop/public/avatars/sodalis-male-thuiszorg.manifest.json` and the
  avatar profile documentation whenever the GLB changes.

## Recipe builds (Henk, Sofia)

Offline tools that turn a JSON recipe into a TalkingHead-ready GLB that
passes the Sodalis Avatar Profile validator. Blender and MPFB are authoring
tools only; the runtime loads the exported GLB.

### Requirements

- Blender 5.2 LTS (tested with 5.2.2; `brew install --cask blender`).
- MPFB 2.0.18 or later. 2.0.17 does not load in Blender 5.2.
- Do not pass `--factory-startup` to Blender. It disables extensions, so the
  `mpfb` modules are unavailable.

`./setup-recipes.sh` installs MPFB from extensions.blender.org, downloads the pinned
CC0 asset packs (verified by sha256) and loads them into MPFB.

### Build an avatar

```bash
blender -b -noaudio --python-exit-code 1 \
  --python tools/avatar-authoring/build_avatar.py -- \
  tools/avatar-authoring/recipes/sodalis-henk.json \
  apps/desktop/public/avatars/sodalis-henk.glb \
  --blend /tmp/sodalis-henk.blend   # optional editable scene
```

The build (about 15 s):

1. Creates the MPFB human from the recipe (`mpfb` section uses MPFB's
   human-serialization format), with the Mixamo rig and game-engine materials.
2. Makes an export copy with baked targets, adds the `faceunits01` ARKit units
   and `visemes02` visemes as shape keys, and interpolates them onto eyes,
   eyebrows, eyelashes, teeth and tongue.
3. Removes the `mixamorig:` prefix, names the armature `Armature`, and adds
   non-deforming `LeftEye`/`RightEye` bones under `Head`. TalkingHead 1.7.0
   requires these names.
4. Aligns every bone's rest orientation with `rpm_rest_frames.json`, the frame
   convention TalkingHead's built-in poses and gestures are authored for.
5. Caps textures at `maxTextureSize`, writes opaque textures as JPEG, and
   exports a self-contained GLB.

Validate the result in Avatar Lab (`pnpm --filter @sodalis/desktop dev`, then
open `/?avatar=<id>`). Development builds list candidates in
`apps/desktop/src/avatar/avatarCatalogue.ts`.

### Rest frames

`rpm_rest_frames.json` holds world-space joint orientations extracted by
`extract_rest_frames.py` from TalkingHead's example `brunette.glb`, a Ready
Player Me model. It contains only bone orientation quaternions, no mesh,
texture or other model content. Regenerate it with:

```bash
python3 tools/avatar-authoring/extract_rest_frames.py <reference.glb> \
  tools/avatar-authoring/rpm_rest_frames.json
```

### Licensing

Use only assets whose MPFB pack metadata says `CC0`. Every MakeHuman system
asset, skin, `faceunits01` target and `visemes02` target in the pinned packs
is CC0. Record each shipped asset in `apps/desktop/public/avatars/NOTICE.md`.

## MetaHuman avatars

[`metahuman/`](./metahuman/) converts an Unreal MetaHuman into an
evaluation-only Sodalis GLB; see
[docs/avatar/metahuman-to-sodalis.md](../../docs/avatar/metahuman-to-sodalis.md).
