# Converting a MetaHuman into a Sodalis avatar

This tutorial turns a character made in MetaHuman Creator into a single GLB file
that Sodalis (TalkingHead 1.7) can animate. The GLB has the 52 ARKit face
shapes, the 15 Oculus visemes, eye bones and a Mixamo/Ready Player Me
skeleton. It is a workflow for **new** MetaHumans, not a recipe for
recreating Anna. Anna is the only character tested end to end so far and is
used only as the example
([TASKS/0054](../../TASKS/0054-evaluate-metahuman-avatar.md)). Use `<name>`
for a lowercase character folder/id (Anna: `anna`), `<MHC>` for its Unreal
MetaHuman Character asset (Anna: `MHC_Anna`), and `<repo>` for your Sodalis
checkout. Replace these placeholders in commands and filenames.

![Anna in Sodalis, Bust framing](images/metahuman/anna-bust.jpg)

> **Licence.** Keep converted avatars for local evaluation until the
> provenance and distribution terms of each component are checked.
> Unreal's EULA allows certain character models developed with Engine Code
> to be distributed as Non-Engine Products; acquired MetaHuman and Fab
> assets may have different restrictions. Do not commit MetaHuman exports,
> DNA files, textures, Epic-derived ARKit mappings or the resulting GLB
> without clearance. See the
> [licensing assessment](../evaluations/metahuman-fab-licensing.md).
> The repository ignores `apps/desktop/public/avatars/eval/` for that
> reason. The scripts in `tools/avatar-authoring/metahuman/` are ours and
> contain no Epic content.

## Next-character checklist

After the one-time setup in A0 and B:

1. In Creator (A1), select skin, card-capable hair and brows, optional
   garments; record groom colours. Rig, download texture sources, assemble.
2. Export DCC ZIP, head/body FBX, and hair/brow card FBX + attribute PNG
   (A2). Export the ARKit mapping once per Unreal version. Export a GLB
   only when you need garments or the optional face AO.
3. Check and transfer the files in A3, prepare textures and config in C,
   build in D, then inspect in E.

## Why not Unreal's own glTF export?

Unreal can export a MetaHuman straight to glTF, but the result is not a
TalkingHead avatar. With UE 5.8.3 we found:

| Problem | Effect |
| --- | --- |
| 856 morph targets named `target_0…855`, all FACS correctives | No ARKit or viseme names. The face is driven by joints that RigLogic moves, and glTF cannot run RigLogic. |
| Skin weights are corrupt (`WEIGHTS_n` hold small integers that don't sum to 1; left/right mixed) | The mesh tears as soon as a bone moves. The outfit fitting settings are not the cause. |
| Five duplicated skeletons (342 and 875 joints), MetaHuman bone names | Needs conversion to `Hips`/`Spine`/… anyway. |
| Eyelash material has no texture and alpha 0; eye shell is opaque black | Invisible lashes and black eyes, also with *Export Thin Translucent Materials* on. |
| Grooms (hair, brows) are not exported | Bald. |
| Body under the outfit is removed | The body only works with that outfit. |
| "4K" maps (with a 4096 bake size) are upscaled from lower-resolution bakes | 8× bigger file, 3–6× less fine detail than the DCC maps. |

So the face and body come from the **DCC export + DNA + FBX**, and the face
shapes are baked by evaluating the character's own RigLogic rig. Unreal's
glTF export is still useful as a source of **garments** (meshes and textures)
and of the baked **face ambient-occlusion** map.

## Overview

```mermaid
flowchart LR
  subgraph Windows["Unreal Engine (Windows)"]
    MHC[MetaHuman Creator] --> DCC[DCC export: DNA + 2K maps]
    MHC --> FBX[Head and body FBX]
    MHC --> CARDS[Hair/brow card FBX + atlases]
    MHC --> GLTF[glTF export: garments, face AO]
    PA[PA_MetaHuman_ARKit_Mapping] --> T3D[.T3D]
  end
  subgraph Mac["Blender 5.2 + OpenRigLogic (Mac)"]
    T3D --> MAP[make_arkit_mapping.py]
    CARDS --> BAKE[bake_card_textures.py]
    GLTF --> AO[extract_face_ao.py]
    DCC & FBX & MAP & BAKE & AO --> BUILD[build_metahuman.py]
    BUILD --> POST[gltf_morphs.py: normals + compaction]
  end
  POST --> GLB[avatar.glb] --> APP[Sodalis ?stage / Avatar Lab]
```

| Stage | Where | Time |
| --- | --- | --- |
| A. Create and export | Unreal 5.6+ with the MetaHuman plugin (tested 5.8.3) | Allow extra time for first-time downloads |
| B. One-time Mac setup | Blender 5.2, OpenRigLogic | 15 min |
| C. Prepare inputs | Python scripts | 5 min |
| D. Build | Blender, headless | about 35 s |
| E. Install and check | Sodalis dev server | 10 min |

## Part A — Unreal: create and export

Unreal runs on Windows here (more disk space); Part B onwards runs on a Mac.
The menus below were checked with UE 5.8.3. Names can move between versions.

### A0. One-time Unreal setup

1. Install the Unreal Engine version you will use (5.8.3 was tested) and
   **MetaHuman Creator Core Data** through Epic Games Launcher. Sign in to
   your Epic account; full rig creation and texture synthesis need its
   online services.
2. Create or open a project with the **MetaHuman Creator** plugin enabled.
   For a fresh project, *Games > Blank* is sufficient. Enable **glTF
   Exporter** under *Edit > Plugins* if you plan to export garments; it ships
   with Unreal, but may need enabling and an editor restart. The experimental
   *MetaHuman Creator - UAF support* plugin is **not required** for this
   workflow.
3. In the Content Browser's *Settings*, turn on **Show Plugin Content**.
   This is needed to find the ARKit pose asset and some groom card assets.
   Prefer a local project drive with enough space; cloud-synced project
   directories can make the large asset downloads slow.

### A1. Create and assemble a character

1. Create a **MetaHuman Character** asset in the Content Browser, name it
   `<MHC>`, and open it in Creator. Pick and edit face, body and skin.
2. Choose hair and brow groom styles with **cards** (not only strands).
   Record their root/tip colours as hex sRGB: the card atlas has coverage
   but no baked colour, so C2 recreates it. After assembly, confirm the
   styles have `*_CardsMesh_Group0_LOD0` assets; otherwise select a style
   with cards. Anna used `Hair_S_BobLayered` and `Eyebrows_L_Shaded`.

   ![Anna's groom settings as an example](images/metahuman/creator-grooms.png)

3. Add clothing if wanted. Fab outfits are Chaos Outfit assets; the DCC
   export does **not** contain them, so you will need the optional GLB in
   A2.5. Keep the default fitting/skin-weight fixes (*Prune*, *Relax*,
   *Hammer*, *Clamp*, *Normalize*); the converter transfers garment weights
   from the FBX body. Record any custom garment colours, which the GLB bakes.

   ![Anna's outfit settings as an example](images/metahuman/creator-outfit-clothing.png)

4. Decide whether to bake makeup into the exported skin. For Anna, no makeup
   avoided dark eyelids; makeup is a character choice, not a pipeline
   requirement. Keep *Grooms* and *Outfit Clothing* **Visible** in Preview
   and face/body on *Idle*.

   ![Preview settings](images/metahuman/creator-preview-details.png)

5. When appearance is final, **Create Full Rig**, then **Download Texture
   Sources**. Rigging locks some face/body texture controls behind a warning;
   if you need to change them, remove the rig, edit, then rig again.
6. In Creator's **Assembly** category, assemble for this project; start
   with **UE Cine** to retain high-detail LOD0 meshes. If choosing **UE
   Optimized**, verify the exported FBXs still contain LOD0 before building.
   The tested example used standard, non-UAF output. This produces
   `BP_<MHC>` and the assembled
   meshes under `/Game/MetaHumans/`. Assembly is distinct from **DCC
   Export**; in UE 5.8 DCC Export moved to the *Export* category. After
   later Creator edits, assemble again before exporting from the project.
   *File > Save All*.

### A2. Exports to make

Keep one folder per character on Windows, e.g. `Downloads\<name>\`, with
these inputs for the hand-off in A3. Names in screenshots are **Anna
examples**; use the assets belonging to your `<MHC>` and its chosen grooms.

#### A2.1 DCC ZIP (required)

In Creator, **Export > DCC Export** (in older versions, see *Assembly*).
Save the downloaded ZIP as `<MHC>_DCC.zip` in the character folder.
Extract the ZIP and confirm it includes `head.dna`, `body.dna`, and
`Maps/Head_Basecolor.png` plus body, teeth, eyes and eyelash maps.
**DCC Export has no 4K setting.** Check the dimensions of
`Maps/Head_Basecolor.png`, not a 1024 px preview image; Anna's actual
maps were 2048 px. Keep the ZIP or its extracted contents outside git.

#### A2.2 Head and body FBX (required)

In the Content Browser, locate the **face and body skeletal meshes** of
the assembled `<MHC>` under `/Game/MetaHumans/`. For each, right-click
**Asset Actions > Export** and save an FBX as `<MHC>_Head.FBX` or
`<MHC>_Body.FBX`. Do not export the Blueprint as the FBX. The Blender
build selects LOD0 and fixes Unreal's 0.01-scale FBX hierarchy.

#### A2.3 Hair and brow cards (for a character with hair/brows)

For **each selected groom**, export its `*_CardsMesh_Group0_LOD0`
**static mesh** as FBX and its `*_CardsAtlas_Attribute` **texture** as
PNG. Search the Content Browser with *Show Plugin Content* enabled and
match the asset's groom name to the character's selected style; use
*Reference Viewer* on the groom if the search shows several candidates.
The hair and brow atlases are different. Do not export lash cards: the
build uses the DCC eyelashes.

#### A2.4 ARKit mapping (once per Unreal version)

With *Show Plugin Content* enabled, search for
`PA_MetaHuman_ARKit_Mapping`. Right-click **Asset Actions > Export** and
save the `.T3D` outside the per-character folder, e.g. in
`Downloads\metahuman-shared\`. C1 converts it once; reuse the mapping for
characters built with that version. Keep this Epic-derived data out of git.

#### A2.5 GLB (only for garments or optional face AO)

1. *File > New Level > Basic*, then save the level. An **Empty** level has
   no lights; in *Lit* view the character may show only an outline while
   *Unlit* still shows it.
2. Drag **`BP_<MHC>`** (not the MetaHuman Character asset) from
   `/Game/MetaHumans/` into the level. In the Outliner select **only this
   actor**, not lights or the floor. *File > Save All* before exporting:
   GLTFExporter crashed once during the Anna evaluation.
3. *File > Export Selected*, save as `<name>Export.glb`, choose **glTF
   binary (`.glb`)** and use:

   ![Anna's working glTF export settings](images/metahuman/unreal-gltf-export-settings.png)

   - *Export Uniform Scale*: **0.01** (metres).
   - *Default Material Bake Size*: **1024** with *Auto-detect*, as in the
     tested export. Inspect the resulting maps rather than assuming
     Auto-detect guarantees a size. Forcing 4096 upscaled Anna's bakes and
     inflated the GLB.
   - Disable *Export Lights* and *Export Cameras*. Morph targets and skin
     weights are not used from the GLB for the face/body. *Export Thin
     Translucent Materials* did not fix Anna's black eye shell or lashes.

Warnings about `-1` indices, near-zero normals/tangents and Eye or
Subsurface materials becoming *Default Lit* did not prevent garment
extraction in Anna's case. If the editor crashes, reopen the saved level
and retry; if the exported garments are broken, investigate rather than
ignoring new warnings.

### A3. Handoff checklist

Keep the **actual files**, not only Unreal asset references. Copy this
folder to the Mac; substitute your character's and grooms' names:

```text
~/avatar-work/
  shared/
    PA_MetaHuman_ARKit_Mapping.T3D       # once per Unreal version
    arkit_mapping.json                   # generated in C1
  <name>/
    unreal/
      <MHC>_DCC.zip                      # or extracted dcc/ below
      <MHC>_Head.FBX
      <MHC>_Body.FBX
      <HairGroom>_CardsMesh_Group0_LOD0.FBX
      <HairGroom>_CardsAtlas_Attribute.PNG
      <BrowGroom>_CardsMesh_Group0_LOD0.FBX
      <BrowGroom>_CardsAtlas_Attribute.PNG
      <name>Export.glb                   # only when needed
      groom-colours.txt                  # hair/brow root + tip hex values
    dcc/                                 # extracted ZIP: head.dna, Maps/, ...
    hair/                                # generated in C2
    out/                                 # generated in D
```

Before leaving Unreal, confirm the two body/face FBXs and, for each groom
used, its card FBX, attribute PNG and recorded colours. Check the real DCC map dimensions and the
optional GLB's garments. Copy only assets selected for this character;
shared/unused outfits (`Khaos*`, `RomanticCasual*` in Anna's project),
underwear variants and animated wrinkle maps are not separate required
inputs. `CombinedSkelMesh` references are body assets, **not garments**.
The optional **Materials Export** gave Anna real 4K inputs, but those had
no visible benefit in the Face evaluation and its untinted body colour
needs Unreal's shader: start with the DCC maps, not 220 material textures.

| Unreal symptom | Next step |
| --- | --- |
| Rig warning blocks skin controls | Remove the rig to change textures; re-rig and reassemble. |
| DCC Export absent from Assembly | In UE 5.8, find it in **Export**. |
| Pose mapping or groom cards not found | Enable **Show Plugin Content**; check the selected groom has cards. |
| Visible in Unlit but not Lit | Use a **Basic** level with lighting. |
| GLB misses character | Select **only** `BP_<MHC>` before Export Selected. |
| ZIP previews show 1024 px | Inspect `Maps/Head_Basecolor.png` instead. |

## Part B — Mac: one-time setup

1. **Blender 5.2** (tested 5.2.2 LTS) on your `PATH` as `blender`. It
   bundles Python 3.13 and numpy.
2. **OpenRigLogic** (MIT), Epic's open-source RigLogic with Python bindings,
   built for Blender's Python:

   ```bash
   brew install cmake swig
   uv python install 3.13      # same minor version as Blender's Python
   tools/avatar-authoring/metahuman/build_openriglogic.sh   # installs to ~/avatar-work/tools/openriglogic
   ```

   The script pins upstream commit `9ca65ac` (RigLogic 13.5.0) and applies
   [`openriglogic-macos.patch`](../../tools/avatar-authoring/metahuman/openriglogic-macos.patch):
   it links the Python *module* target instead of libpython (Blender embeds
   its own), and renames a macro for SWIG 4.5. It then adds `.so` links, an
   `@loader_path` rpath and an ad-hoc signature, and checks that Blender can
   `import dna, riglogic`. If you install elsewhere, set `OPENRIGLOGIC_LIB`
   to the `lib` folder.
3. **Pillow** for the card-texture baker: any Python 3 venv with `numpy` and
   `pillow`.

## Part C — Prepare the inputs

Extract the DCC ZIP into `~/avatar-work/<name>/dcc/`. Ensure the **actual**
`head.dna` and `Maps/` directory are directly inside `dcc/` (some unzip
tools introduce an extra parent directory). The build expects in `Maps/`:
`Head_Basecolor`, `Head_Normal`, `Head_SRMF`, `Body_Basecolor`,
`Body_Normal`, `Body_SRMF`, `Teeth_Color`, `Teeth_Normal`, `Eyes_Color`,
`Eyes_Normal` and `Eyelashes_Color` (`.png`).

### C1. ARKit mapping (once per Unreal version)

```bash
python3 <repo>/tools/avatar-authoring/metahuman/make_arkit_mapping.py \
  ~/avatar-work/shared/PA_MetaHuman_ARKit_Mapping.T3D \
  ~/avatar-work/shared/arkit_mapping.json
```

Each ARKit pose becomes additive `CTRL_expressions_*` weights relative to the
pose asset's *Default* pose. The same file works for every MetaHuman of that
Unreal version, but keep it out of git: it is derived from an Epic asset.
`mouthClose` is derived from the lips-together pose; `tongueRollDown` has no
pose in the asset. The 15 visemes come from our own
[`visemes.json`](../../tools/avatar-authoring/metahuman/visemes.json), which
combines rig controls by hand.

### C2. Hair and brow colour textures

Unreal colours grooms in its shader from the attribute atlas
(R = coverage, G = per-strand seed, B = root→tip). Bake a colour + alpha
texture, using the hex colours recorded in `unreal/groom-colours.txt` in A3.
From the character folder (`~/avatar-work/<name>/`), run:

```bash
mkdir -p hair
python3 <repo>/tools/avatar-authoring/metahuman/bake_card_textures.py hair \
  unreal/<HairGroom>_CardsAtlas_Attribute.PNG hair/Hair_BaseAlpha.png \
  --root <hair-root-hex> --tip <hair-tip-hex> --gain 4
python3 <repo>/tools/avatar-authoring/metahuman/bake_card_textures.py brows \
  unreal/<BrowGroom>_CardsAtlas_Attribute.PNG hair/Brows_BaseAlpha.png \
  --root <brow-root-hex> --tip <brow-tip-hex> --gain 16
```

`--gain` scales coverage into alpha; thin brow strands need more. For
Anna, hair used `1a100a`/`4f3423` and brows `180f0a`/`3a281c`.

### C3. Face ambient occlusion (optional)

If you made the glTF export, copy its baked face occlusion map next to the
DCC maps. The build uses it when it is there:

```bash
python3 <repo>/tools/avatar-authoring/metahuman/extract_face_ao.py \
  unreal/<name>Export.glb dcc/Maps/Head_Occlusion.png
```

### C4. Character config

Copy [`characters/anna.json`](../../tools/avatar-authoring/metahuman/characters/anna.json)
to `~/avatar-work/<name>/character.json` as a **template**. Change `name`,
`id`, and every Anna-specific path to this character's `unreal/`, `dcc/`,
`hair/` and the shared mapping. In `recipes`, use the absolute path to
`<repo>/tools/avatar-authoring/metahuman/visemes.json` and
`~/avatar-work/shared/arkit_mapping.json`; the original `../visemes.json`
path only works when the config is beside the example file. Relative paths
resolve from the config file; `~` is expanded. Delete the `outfit` section
if you did not export garments, and remove `hair`/`brows` sections if they
do not apply.

| Key | Required | Meaning |
| --- | --- | --- |
| `name`, `id` | yes | Material/mesh prefix; skeleton name and default output file |
| `head_fbx`, `body_fbx`, `dna`, `maps` | yes | Part A exports (`dna` is the head DNA) |
| `recipes` | yes | `visemes.json` and your `arkit_mapping.json` |
| `face.lash_alpha_gain` | no (1.8) | Multiplies lash alpha after growing the strands 1 px |
| `face.lid_follow` | no (0.35) | How much the lids follow the eyes in `eyeLook*` shapes |
| `face.rest_lid_lift` | no (0.7) | Fraction of the character's own `eyeWide` baked into the rest pose |
| `hair.FBX`, `hair.BASE`, `hair.SCALP_OUT` | with hair | Card FBX, baked texture, output for the scalp-tinted head colour |
| `hair.HAIR_OFFSET`, `VOLUME_SIDE`, `VOLUME_CROWN`, `SCALP_TINT` | no | Hair placement (m), volume lift at tips/crown, scalp colour (sRGB 0–1) |
| `brows.FBX`, `brows.TEX`, `brows.BROW_OFFSET` | with brows | Brow cards, texture, offset (m). Brows need hair: they reuse its fit. |
| `outfit.glb`, `outfit.garments` | no | Unreal glTF export, and `{glTF mesh name: new mesh name}` for each garment |
| `texture_cap` | no (2048) | Largest texture side; Sodalis recommends at most 2048 |

To find the garment mesh names, open the glTF in Blender or read its JSON
`meshes[].name` (Anna: `MHC_Anna_Outfits`, `_2`, `_3`).

`SCALP_TINT` is a starting colour, not a universal constant: Anna used
`[0.1647, 0.1098, 0.0784]` for dark brown hair. Start with the example's
fit offsets, then adjust for a different groom after inspecting the GLB.

## Part D — Build

```bash
cd ~/avatar-work/<name>
blender -b -noaudio --python-exit-code 1 \
  --python <repo>/tools/avatar-authoring/metahuman/build_metahuman.py -- \
  --config character.json --out out/<name>.glb --blend out/<name>.blend
```

It ends with `METAHUMAN_EXPORTED <path> <bytes>`. Anna took about 35 s and
gave a 39 MB GLB; new characters vary. `--blend` saves the scene for
inspection; the GLB is the only artefact Sodalis needs. Blender's FBX importer prints
`Error, could not find any file path in FBXElem(... EnvSamplerTex ...)` for
Unreal's environment-sampler textures. These are harmless; real failures
stop the build with a traceback and a non-zero exit code.

What the build does:

1. **Imports** the head and body FBX. It applies Unreal's 0.01 scale and
   moves the vertex groups of helper empties to real bones.
2. **Bakes the face** (`rigbake.py`). It evaluates RigLogic from the DNA for
   each ARKit pose and viseme, and writes the resulting joint motion and
   correctives as shape keys on the head. DNA LOD0 holds the head, teeth,
   saliva, eyeLeft, eyeRight, eyeshell, eyelashes, eyeEdge and cartilage
   meshes in that order; the mapping is by vertex index, so the bake runs
   before any topology change.
3. **Face clean-up.** Drops the saliva, eyeEdge and cartilage meshes. Keeps
   the eyeshell as a soft eye-occlusion layer with a generated alpha mask.
   Scales the lid motion in `eyeLook*` shapes to `lid_follow`. Opens the
   rest lids by `rest_lid_lift`. Softens the lash alpha.
4. **Skeleton.** Moves the head onto the body skeleton, renames bones to
   Mixamo/Ready Player Me names, adds `LeftEye`/`RightEye`/`HeadTop_End`, and
   aligns the rest frames to TalkingHead's.
5. **Hair and brows** (`hair.py`, `brows.py`). Unreal binds grooms with an
   RBF warp that cannot be exported. The build fits the card roots to the
   scalp (scale + translation), adds volume and pushes cards out of the
   skin. Brow cards are wrapped onto the skin and take its weights and shape
   keys, so they follow raises and frowns.
6. **Outfit** (`add_metahuman_outfit.py`). Keeps only the listed garments and
   their materials, aligns them to the body, and re-transfers skin weights
   from the body and head. It hides body skin under the garments: skin that
   fabric touches, or that a short ray along its normal hits fabric from.
   Body skin is never hidden by distance alone, which would remove a bare
   belly between top and jeans.
7. **Export** (`build_avatar.export_glb`) with morph normals, then
   **post-process** (`gltf_morphs.py`): repairs fold normals and stores morph
   targets sparsely (see the eyelid observation below).

## Part E — Install and check in Sodalis

**This step requires the dev-only avatar stage on
`mpfb-avatar-pipeline`; it is not on `main` as of this guide's update.**
Do not expect `?stage`, `EVALUATION_CANDIDATES` or the env override to
work on `main`. Once that branch's avatar-stage changes are integrated,
place the GLB in the git-ignored `apps/desktop/public/avatars/eval/`
folder and register an entry with its own id, file path and any
`behavior.poseScale` adjustment. Anna's `metahuman-anna-eval` entry in
`apps/desktop/src/avatar/defaultAvatar.ts` on that branch is an example,
not a default for every character.

```bash
cp out/<name>.glb <repo>/apps/desktop/public/avatars/eval/<name>-eval.glb
VITE_SODALIS_EVAL_AVATARS=1 pnpm --filter @sodalis/desktop dev
# open http://localhost:5173/?stage&avatar=<registered-id>
```

To make an evaluation avatar the default on your machine, without
`?avatar=`, put this in the git-ignored `apps/desktop/.env.local` and restart
the dev server:

```bash
VITE_SODALIS_EVAL_AVATARS=1
VITE_SODALIS_DEFAULT_AVATAR=<registered-id>
```

The override applies to development builds only; an unknown id falls back to
the first catalogue entry.

Check:

- **Avatar Lab validator**: `valid: true`. A MetaHuman with an outfit gives
  one warning, about 190k triangles over the 100k recommended. That is
  expected: the head alone is Unreal's LOD0.
- **Framing**: walk through Face, Head, Head & Shoulders, Bust, Half Body,
  Three-Quarter and Full Body. Look at the hairline, the neck seam between
  head and body, and the collar.
- **Eyes**: open, mid-blink, closed, and looking up/down/left/right.
- **Speech**: *Say it* with the on-device voice for visemes; then the idle
  poses for a minute for body motion.

## Observations and troubleshooting

### Closed eyelids: dark band, then a dark slit

![Closed lid: no morph normals, Blender morph normals, repaired normals](images/metahuman/closed-lid-normals.jpg)

1. **Dark band** (top). glTF morph targets without NORMAL deltas keep
   rest-pose normals. The closed upper lid uses skin that faces down into
   the crease at rest, so it shades dark. Exporting morph normals fixes the
   band, but the GLB grew from 41 MB to 65 MB.
2. **Thin dark slit** (middle). At rest, the skin inside the upper-lid crease
   is hidden, and its exported normals point *into* the fold (z ≈ −0.17
   where the surface faces +0.88). A blink pulls that skin out. Every other
   active morph (squint, look down, which TalkingHead holds at idle) adds its
   delta to that wrong base normal. An unlit render showed no line, so the
   geometry was fine. Smoothing or "unfolding" the shape keys in Blender did
   not help and collapsed the lid into the eyeball.
3. **Fix** (bottom), in `gltf_morphs.py` after export:
   - Base normals that disagree with the welded, area-weighted geometric
     rest normal are blended toward it. Normals that agree are kept.
   - Morph normal deltas are recomputed by rotating the repaired normal with
     the change of the geometric normal, smoothed over 3 vertex rings.
   - All targets are then stored sparsely, keeping deltas above 0.02 mm and
     about 0.5°. The GLB went from 65.5 MB to **39.4 MB** with morph
     normals included.

The same issue can appear in any deep fold that a shape opens (lips,
nasolabial crease). The post-process handles every primitive with morph
targets.

### Eyes look sleepy or follow the gaze too much

TalkingHead holds `eyeBlink` near 0.1 at idle, with a little squint and a
downward gaze. A MetaHuman's neutral upper lid already covers the top of the
iris, so together this looks sleepy. `rest_lid_lift` 0.7 bakes 70% of the
character's own `eyeWide` into the rest pose; blinks still close fully. In
the RigLogic poses, the lids follow `eyeLookDown` by about 16 mm, compared
with about 5 mm for a Ready Player Me avatar. `lid_follow` 0.35 scales that
down.

### Eyelashes

The DCC lash cards have strands of 1–2 px of alpha. With an alpha cutoff
they vanish in mipmaps and leave clumps and specks. The build grows the
strands by 1 px, multiplies alpha by `lash_alpha_gain`, and exports the lashes
as alpha `BLEND`. The glTF export's lash material cannot help: it has no
texture.

### Wrinkle maps

The DCC and Materials exports include animated colour (`CM1–3`) and normal
(`WM1–3`) wrinkle maps. Unreal blends them per face region, with masks,
driven by rig controls in a custom shader. glTF materials cannot express
that, so they are not used.

### Texture resolution

The DCC maps are 2048 px. "4K" packs are worth checking with `magick
identify` or `sips -g pixelWidth`. Packs named 4K have turned out to be 2K,
and glTF bakes at 4096 have turned out to be upscaled. Real 4K face maps
(Materials Export) looked the same as 2K in Face framing, so ship 2K.

### Body and outfit

- The head mesh reaches the collarbones and can show through a high collar.
  Garments take weights from the nearer of body and head, and are kept at
  least 3 mm off the head.
- Body skin is hidden under garments, like Unreal's hidden-surface removal,
  so the body doesn't poke through in poses. The outfit was tested in 11
  poses (reach up, sit, deep knee, twist and others).
- The FBX body has no garment. Without an `outfit` section the character is
  in Unreal's default underwear from the body texture.

### Idle body motion

TalkingHead's neutral idle switches between `side`, `hip` and `straight`
poses. On a realistic body the `hip` pose looks exaggerated. Set
`behavior.poseScale` (Anna: 0.35) in the avatar entry to blend the idle poses
toward `straight`.

## Files

| File | Purpose |
| --- | --- |
| `tools/avatar-authoring/metahuman/build_metahuman.py` | Main build, run in Blender |
| `.../characters/<name>.json` | Per-character config |
| `.../rigbake.py` | RigLogic evaluation and shape-key baking |
| `.../visemes.json` | Viseme recipes in rig controls |
| `.../make_arkit_mapping.py` | T3D pose asset → `arkit_mapping.json` |
| `.../bake_card_textures.py` | Hair/brow colour textures from the attribute atlas |
| `.../extract_face_ao.py` | Face occlusion from Unreal's glTF |
| `.../hair.py`, `brows.py`, `add_metahuman_outfit.py` | Hair, brows, garments |
| `.../build_openriglogic.sh`, `openriglogic-macos.patch` | OpenRigLogic build |
| `tools/avatar-authoring/build_avatar.py` | Shared skeleton alignment, texture cap and GLB export |
| `tools/avatar-authoring/gltf_morphs.py` | Fold-normal repair and sparse morph targets |
