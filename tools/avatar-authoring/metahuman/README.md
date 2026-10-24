# MetaHuman → Sodalis avatar tools

Scripts that convert a MetaHuman (Unreal DCC export + DNA + FBX) into a
TalkingHead/Sodalis GLB with ARKit and viseme morph targets. The full
workflow, from Unreal exports to checking the avatar in the app, is in
[docs/avatar/metahuman-to-sodalis.md](../../../docs/avatar/metahuman-to-sodalis.md).

```bash
tools/avatar-authoring/metahuman/build_openriglogic.sh      # once
blender -b -noaudio --python-exit-code 1 \
  --python tools/avatar-authoring/metahuman/build_metahuman.py -- \
  --config path/to/character.json --out avatar.glb [--blend avatar.blend]
```

`extract_glb_texture.py` pulls a single texture, such as Unreal's baked iris,
from a glTF export for use in `map_overrides` or `outfit.textures`. It bakes
the material's texture transform into the image; `--detail-from-roughness K`
restores pattern detail that Unreal only kept in roughness.
`extract_face_ao.py` does the same for the face occlusion map.

`characters/anna.json` is an example config. Its paths point at local
exports. Keep MetaHuman exports, DNA, textures, `arkit_mapping.json` and the
generated GLB out of git (Unreal Engine EULA).
