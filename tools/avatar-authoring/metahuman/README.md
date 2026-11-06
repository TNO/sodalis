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

## Restore Anna on demand

With GitHub CLI installed and authenticated with access to the private
`TNO/sodalis-licensed-avatars` repository, run from the Sodalis root:

```bash
pnpm avatar:anna
pnpm dev
```

The command downloads the pinned `session-snapshot-2026-11-06` release's
`anna-eval.glb`, checks its SHA-256 and GLB header, and installs it in the
gitignored `apps/desktop/public/avatars/eval/` directory. It preserves unrelated
settings in `apps/desktop/.env.local`, enables evaluation avatars, and sets Anna
as the default. A previously stored avatar selection still takes precedence;
use `?avatar=metahuman-anna-eval` to select Anna explicitly.

Downloads require repository access; no GitHub credentials are sent to the
browser. This remains a development-only opt-in, not permission to publish
licensed assets or include them in a production distribution. Files under
`public/` are served to anyone with access to the dev server, so keep it local.
The existing private repository's `anna.glb` is an older build and is unchanged.

The same private release preserves this session's Odette GLB and source
archives. See its `BACKUP.md` and `SHA256SUMS` before deleting local sources.
The public Sodalis repository alone cannot reconstruct licensed inputs.
