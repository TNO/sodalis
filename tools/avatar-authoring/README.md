# Avatar authoring (MPFB → Blender → GLB)

Offline tools that turn a JSON recipe into a TalkingHead-ready GLB that
passes the Sodalis Avatar Profile validator. Blender and MPFB are authoring
tools only; the runtime loads the exported GLB.

## Requirements

- Blender 5.2 LTS (tested with 5.2.2; `brew install --cask blender`).
- MPFB 2.0.18 or later. 2.0.17 does not load in Blender 5.2.
- Do not pass `--factory-startup` to Blender. It disables extensions, so the
  `mpfb` modules are unavailable.

`./setup.sh` installs MPFB from extensions.blender.org, downloads the pinned
CC0 asset packs (verified by sha256) and loads them into MPFB.

## Build an avatar

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
`apps/desktop/src/avatar/defaultAvatar.ts`.

## Rest frames

`rpm_rest_frames.json` holds world-space joint orientations extracted by
`extract_rest_frames.py` from TalkingHead's example `brunette.glb`, a Ready
Player Me model. It contains only bone orientation quaternions, no mesh,
texture or other model content. Regenerate it with:

```bash
python3 tools/avatar-authoring/extract_rest_frames.py <reference.glb> \
  tools/avatar-authoring/rpm_rest_frames.json
```

## Licensing

Use only assets whose MPFB pack metadata says `CC0`. Every MakeHuman system
asset, skin, `faceunits01` target and `visemes02` target in the pinned packs
is CC0. Record each shipped asset in `apps/desktop/public/avatars/NOTICE.md`.
