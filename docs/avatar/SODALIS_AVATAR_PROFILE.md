# Sodalis Avatar Profile 0.1

Status: implementation contract with one included non-commercial example
avatar; no model is approved for commercial use.

## Runtime contract

- Container: self-contained binary glTF 2.0 (`.glb`), using the default scene.
- Coordinate system: glTF Y-up, meters; the avatar faces the camera at positive
  Z. Keep the character centered near the origin and the feet at Y=0.
- Root: an optional `AvatarRoot` scene wrapper may contain the humanoid
  skeleton. The skeleton's humanoid root is `Hips`, with these required core
  joints in the hierarchy: `Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, and
  `Head`. Visible rigged meshes must contain matching four-component
  `skinIndex` and `skinWeight` attributes bound to that skeleton.
- Runtime rig compatibility: use the full-body Ready Player Me-compatible,
  Mixamo-named bone hierarchy expected by TalkingHead 1.7.0. The validator
  checks the named core joints and skin attributes needed by the current
  head/upper-body behavior; it does not certify every limb or finger joint.
- Morph targets: names and case must match the lists below. All 52 ARKit face
  units and all 15 Oculus/Meta visemes are required across visible meshes.
- Materials: use glTF core metallic-roughness PBR, represented by
  `MeshStandardMaterial` or `MeshPhysicalMaterial` at runtime. Blender
  procedural materials and custom shader materials are not part of the
  supported profile. Solid base-color materials are allowed; textures are
  optional.
- Textures: embed them in the GLB. 2048 px is the recommended maximum
  dimension; larger textures are reported as a performance warning.
- Geometry: target at most 100,000 triangles and 48 estimated mesh/group draw
  calls. Exceeding either is a warning, not a compatibility failure. Runtime
  performance still depends on browser, GPU, materials, and device pixel
  ratio.
- Bounds: the visible scene must have finite, non-empty bounds and positive
  height. The validator reports dimensions; heights outside 0.5–3 m are
  warnings for likely unit/scale mistakes.

The GLB validator is available in the development-only Avatar Lab and through
the package's internal `@sodalis/avatar/internal/validation` entry. Missing
required joints, skin attributes, morphs, supported materials, geometry, or
valid bounds fail validation. Large geometry or textures warn but do not hide
measurements.

## Included example asset

The desktop currently loads the TalkingHead `brunette.glb` example by default:

- Local path: `apps/desktop/public/avatars/talkinghead-brunette.glb`
- Source: [TalkingHead v1.7.0 brunette.glb](https://github.com/met4citizen/TalkingHead/blob/v1.7.0/avatars/brunette.glb)
- Creator attribution: Ready Player Me, as identified by the TalkingHead README
- License: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
- SHA-256: `8864c504b5c11daa2f0037afffdc0815bb0fa2e6062e37a584746116a3c2f538`
- Validator: all profile checks pass; 13,317 triangles, 10 estimated draw
  calls, 17 textures (largest 1024 px), and measured bounds of
  0.93m × 1.77m × 0.34m.

The desktop shows source attribution and links the license beside the viewer.
The model is included unchanged; its non-commercial restriction applies
independently of the MIT license for Sodalis code. See
`apps/desktop/public/avatars/NOTICE.md` when redistributing the asset.

## Facial shape names

### ARKit face units (52)

```text
browDownLeft, browDownRight, browInnerUp, browOuterUpLeft, browOuterUpRight
cheekPuff, cheekSquintLeft, cheekSquintRight
eyeBlinkLeft, eyeBlinkRight
eyeLookDownLeft, eyeLookDownRight, eyeLookInLeft, eyeLookInRight
eyeLookOutLeft, eyeLookOutRight, eyeLookUpLeft, eyeLookUpRight
eyeSquintLeft, eyeSquintRight, eyeWideLeft, eyeWideRight
jawForward, jawLeft, jawOpen, jawRight
mouthClose, mouthDimpleLeft, mouthDimpleRight, mouthFrownLeft, mouthFrownRight
mouthFunnel, mouthLeft, mouthLowerDownLeft, mouthLowerDownRight
mouthPressLeft, mouthPressRight, mouthPucker, mouthRight
mouthRollLower, mouthRollUpper, mouthShrugLower, mouthShrugUpper
mouthSmileLeft, mouthSmileRight, mouthStretchLeft, mouthStretchRight
mouthUpperUpLeft, mouthUpperUpRight, noseSneerLeft, noseSneerRight, tongueOut
```

### Oculus/Meta visemes (15)

```text
viseme_sil, viseme_PP, viseme_FF, viseme_TH, viseme_DD
viseme_kk, viseme_CH, viseme_SS, viseme_nn, viseme_RR
viseme_aa, viseme_E, viseme_I, viseme_O, viseme_U
```

TalkingHead 1.7.0 can synthesize its optional helper morphs
`mouthOpen`, `mouthSmile`, `eyesClosed`, `eyesLookUp`, and `eyesLookDown` from
ARKit shapes when they are absent. They are not substitutes for the required
profile names above.

## Framing metadata

`AvatarAsset.framing` may provide:

| Field | Contract |
|---|---|
| `preferred` | `head`, `upper-body`, or `half-body`; default framing for the runtime |
| `cameraTargetYOffset` | Optional finite offset in meters added to the measured framing target |
| `cameraDistanceScale` | Optional finite positive multiplier for the bounds-derived camera distance |

The scene measures the loaded model's bounds, uses the `Head` joint for head
framing when present, and derives camera distance from the chosen vertical and
horizontal field of view. Explicit Avatar Lab framing changes override the
asset's preferred preset.

## Quality and recovery

The runtime caps device pixel ratio at 1 for `low`, 1.5 for `medium`, and 2 for
`high`; `auto` uses the conservative 1.5 cap. The Avatar Lab reports measured
render-loop FPS in one-second samples. This measures JavaScript frame
submission, not GPU completion. These caps are cost controls, not guarantees
of a particular frame rate; actual performance depends on the browser, GPU,
scene complexity, and viewport size.

The desktop keeps Aster usable when WebGL setup, rendering, or context recovery
or default model loading fails. The avatar viewer displays the error and offers
a retry that recreates the scene and reloads the default asset. Visibility
changes pause/resume the render loop, and scene disposal removes
observers/listeners, stops animation, disposes the runtime and renderer, and
clears scene children.

## MPFB and Blender authoring

MPFB2 is an authoring workflow only; it is not installed or imported by Sodalis
at runtime.

1. Use Blender 4.2.0 or later and the MPFB2 Blender extension. The MPFB2
   `v2.0.17` release is the version provenance recorded for this profile.
2. Install the MakeHuman system assets needed by the character. In MPFB's
   facial-shape-key workflow, enable **`visemes02`** for the 15 Meta/Oculus
   visemes and **`faceunits01`** for the 52 ARKit face units. Do not substitute
   the Microsoft `visemes01` set for `visemes02`.
3. Use the export-copy/face-shape-key flow to bake facial targets onto the
   exported character, preserve the names above, and remove Blender-only
   helpers/modifiers.
4. Export a self-contained GLB using core PBR materials and embedded textures.
   Validate the exported GLB in Avatar Lab before integration.
5. Keep the editable Blender project and original, unoptimized textures
   separate from the optimized runtime GLB. Record the model author, source
   URL, license, source revision, MPFB/Blender versions, and a checksum before
   publishing an asset.

MPFB version provenance and authoring references:

- [MPFB2 v2.0.17 release](https://github.com/makehumancommunity/mpfb2/releases/tag/v2.0.17)
- [MPFB2 getting started](https://static.makehumancommunity.org/mpfb/docs/getting_started.html)
- [MPFB2 face operations](https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/docs/ui/operations/faceops.md)
- [MPFB2 FaceService](https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/docs/services/faceservice.md)
- [TalkingHead 1.7.0 model compatibility notes](https://github.com/met4citizen/TalkingHead/blob/v1.7.0/README.md)

The included example is a pipeline smoke-test asset, not a commercially
approved production model. Generating original models with Blender and MPFB
and adding an in-app chooser for multiple validated assets remain follow-up
tasks.
