"""Builds the Sodalis male thuiszorg-style avatar with MPFB inside Blender.

Run with the pinned Blender profile prepared by setup.sh, as documented in
tools/avatar-authoring/README.md. Arguments after "--":
  --out-dir DIR    where to write the .blend source, GLB and build report
"""

import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix, Vector

from bl_ext.user_default.mpfb.services import (
    ExportService,
    FaceService,
    HumanService,
    LocationService,
    ObjectService,
    TargetService,
)

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get(
    "SODALIS_AVATAR_CACHE", os.path.expanduser("~/.cache/sodalis-avatar-authoring")
)
DATA = LocationService.get_user_data()

# MakeHuman macro scale: age 0.5 = 25 years and 1.0 = 90 years, so 0.615 ≈ 40.
MACRO = {
    "gender": 1.0,
    "age": 0.615,
    "muscle": 0.55,
    "weight": 0.52,
    "proportions": 0.6,
    "height": 0.55,
    "cupsize": 0.5,
    "firmness": 0.5,
    "race": {"caucasian": 1.0, "african": 0.0, "asian": 0.0},
}

SKIN = "skins/middleage_caucasian_male/middleage_caucasian_male.mhmat"
EYE_MATERIAL = "materials/brownlight.mhmat"
# Subtle MakeHuman detail targets for a mature, defined (not exaggerated) adult face.
FACE_TARGETS = [
    ("head-age-incr", 0.3),
    ("head-square", 0.25),
    ("chin-width-incr", 0.2),
    ("chin-prominent-incr", 0.15),
    ("l-cheek-bones-incr", 0.25),
    ("r-cheek-bones-incr", 0.25),
    ("l-cheek-volume-decr", 0.2),
    ("r-cheek-volume-decr", 0.2),
]
EYEBROWS = "eyebrow012"
EYEBROW_COLOR = (0.20, 0.14, 0.10)
BODYPARTS = [
    ("eyes", "eyes/low-poly/low-poly.mhclo"),
    ("eyebrows", f"eyebrows/{EYEBROWS}/{EYEBROWS}.mhclo"),
    ("eyelashes", "eyelashes/eyelashes01/eyelashes01.mhclo"),
    ("teeth", "teeth/teeth_base/teeth_base.mhclo"),
    ("tongue", "tongue/tongue01/tongue01.mhclo"),
    ("hair", "hair/short02/short02.mhclo"),
]
HAIR_MATERIAL = "short02/bogdan666_short_02_brown/bogdan666_short_02_brown.mhmat"
GARMENT = "male_casualsuit06"
CLOTHES = [
    f"clothes/{GARMENT}/{GARMENT}.mhclo",
    "clothes/shoes02/shoes02.mhclo",
]
# Cut-out materials keep their alpha as a glTF MASK; everything else is opaque.
MASKED_MATERIAL_SUFFIXES = ("eyebrow012", "eyelashes01", "short02")
ALPHA_CUTOFF = {"eyebrow012": 0.4, "eyelashes01": 0.4, "short02": 0.5}
MAX_TEXTURE_SIZE = 2048
# Alpha textures stay PNG, so the hair is capped lower to keep the GLB compact.
TEXTURE_SIZE_LIMITS = {"short02_diffuse": 1024}
ROUGHNESS = {"body": 0.62, GARMENT: 0.85, "shoes02": 0.7, "short02": 0.75}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    return parser.parse_args(argv)


def data_path(relative):
    path = os.path.join(DATA, relative)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return path


def mhclo_uuid(relative):
    with open(data_path(relative), encoding="utf-8") as f:
        for line in f:
            if line.startswith("uuid "):
                return line.split()[1]
    raise ValueError(f"No uuid in {relative}")



def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def build_character():
    basemesh = HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=True,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=MACRO,
    )
    basemesh.use_shape_key_edit_mode = True
    TargetService.bulk_load_targets(
        basemesh, [{"target": name, "value": value} for name, value in FACE_TARGETS]
    )
    HumanService.add_custom_rig(basemesh, "custom.talkinghead", import_weights=True)
    HumanService.set_character_skin(
        data_path(SKIN), basemesh, skin_type="GAMEENGINE", material_instances=False
    )
    for asset_type, relative in BODYPARTS:
        alternative_materials = None
        if asset_type == "hair":
            alternative_materials = {mhclo_uuid(relative): HAIR_MATERIAL}
        elif asset_type == "eyes":
            alternative_materials = {mhclo_uuid(relative): EYE_MATERIAL}
        HumanService.add_mhclo_asset(
            data_path(relative),
            basemesh,
            asset_type=asset_type,
            subdiv_levels=0,
            material_type="GAMEENGINE",
            alternative_materials=alternative_materials,
        )
    for relative in CLOTHES:
        HumanService.add_mhclo_asset(
            data_path(relative),
            basemesh,
            asset_type="Clothes",
            subdiv_levels=0,
            material_type="GAMEENGINE",
        )
    return basemesh


def base_color_node(obj):
    material = obj.data.materials[0]
    bsdf = next(n for n in material.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    return bsdf.inputs["Base Color"].links[0].from_node


def tint_texture(obj, color):
    """Recolours a texture to `color`, keeping its alpha and strand-level shading."""
    import numpy as np

    node = base_color_node(obj)
    image = node.image.copy()
    image.name = f"{obj.name.split('.')[-1]}_tinted"
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(-1, 4)
    luminance = rgba[:, :3].mean(axis=1, keepdims=True)
    rgba[:, :3] = np.clip(np.array(color) * (0.55 + 0.9 * luminance), 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    node.image = image


def apply_tunic(basemesh):
    sys.path.insert(0, HERE)
    from tunic_texture import paint_tunic

    rig = basemesh.parent
    garment = next(o for o in rig.children if o.name.endswith(GARMENT))
    eyebrows = next(o for o in rig.children if o.name.endswith(EYEBROWS))
    tint_texture(eyebrows, EYEBROW_COLOR)
    node = base_color_node(garment)
    ambient_occlusion = bpy.data.images.load(data_path(f"clothes/{GARMENT}/{GARMENT}_ao.png"))
    node.image = paint_tunic(
        garment,
        diffuse=node.image,
        ambient_occlusion=ambient_occlusion,
    )


def create_export_copy(basemesh):
    collection = bpy.data.collections.new("export copy")
    bpy.context.scene.collection.children.link(collection)
    root = ExportService.create_character_copy(
        basemesh, name_suffix="_export", place_in_collection=collection
    )
    new_basemesh = ObjectService.find_object_of_type_amongst_nearest_relatives(root)
    TargetService.bake_targets(new_basemesh)
    FaceService.load_targets(
        new_basemesh,
        load_microsoft_visemes=False,
        load_meta_visemes=True,
        load_arkit_faceunits=True,
    )
    FaceService.interpolate_targets(new_basemesh)
    ExportService.bake_modifiers_remove_helpers(
        new_basemesh, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True
    )
    return root, collection


def prepare_armature(root):
    root.name = "Armature"
    root.data.name = "Armature"
    align_bone_frames(root)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def align_bone_frames(root):
    """Gives each bone the rest orientation of TalkingHead's CC0 MPFB reference.

    TalkingHead poses bones with absolute local rotations, so rest frames that differ from
    the reference become constant offsets (for example a lowered head or gaze). Joint
    positions and skin weights are unchanged; only bone directions and rolls are aligned.
    """
    with open(os.path.join(HERE, "reference", "talkinghead-mpfb-bone-frames.json"), encoding="utf-8") as f:
        frames = json.load(f)["frames"]
    gltf_to_blender = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    select_only(root)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = root.data.edit_bones
    for bone in bones:
        bone.use_connect = False
    for name, frame in frames.items():
        bone = bones.get(name)
        if bone is None:
            continue
        direction = (gltf_to_blender @ Vector(frame["y"])).normalized()
        bone.tail = bone.head + direction * bone.length
        bone.align_roll(gltf_to_blender @ Vector(frame["z"]))
    bpy.ops.object.mode_set(mode="OBJECT")


def material_key(material):
    return material.name.split(".", 1)[-1]


def prepare_materials(collection):
    seen = set()
    for obj in collection.all_objects:
        if obj.type != "MESH":
            continue
        name = obj.name.removeprefix("Human.").removesuffix("_export")
        obj.name = "Body" if name == "Human" else name
        for material in obj.data.materials:
            if material is None or material.name in seen:
                continue
            seen.add(material.name)
            key = material_key(material)
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            bsdf = next(n for n in nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
            alpha_input = bsdf.inputs["Alpha"]
            for link in list(alpha_input.links):
                source = link.from_socket
                links.remove(link)
                if key in MASKED_MATERIAL_SUFFIXES:
                    # glTF exports an alpha clip as MASK when Alpha passes through "Greater Than".
                    cutoff = nodes.new("ShaderNodeMath")
                    cutoff.operation = "GREATER_THAN"
                    cutoff.inputs[1].default_value = ALPHA_CUTOFF[key]
                    links.new(source, cutoff.inputs[0])
                    links.new(cutoff.outputs[0], alpha_input)
            alpha_input.default_value = 1.0
            if key in ROUGHNESS:
                bsdf.inputs["Roughness"].default_value = ROUGHNESS[key]
            bsdf.inputs["Metallic"].default_value = 0.0
            material.name = key


def limit_texture_sizes():
    for image in bpy.data.images:
        width, height = image.size
        limit = next(
            (size for prefix, size in TEXTURE_SIZE_LIMITS.items() if image.name.startswith(prefix)),
            MAX_TEXTURE_SIZE,
        )
        if max(width, height) > limit:
            factor = limit / max(width, height)
            image.scale(round(width * factor), round(height * factor))


def export_glb(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_morph=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_extras=False,
    )


def report_objects(collection):
    rows = []
    for obj in collection.all_objects:
        row = {"name": obj.name, "type": obj.type}
        if obj.type == "MESH":
            mesh = obj.data
            row["triangles"] = sum(len(p.vertices) - 2 for p in mesh.polygons)
            row["materials"] = [m.name for m in mesh.materials if m]
            keys = mesh.shape_keys.key_blocks if mesh.shape_keys else []
            row["shape_keys"] = len(keys)
            row["modifiers"] = [m.type for m in obj.modifiers]
        rows.append(row)
    return rows


def main():
    args = parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    clear_scene()
    basemesh = build_character()
    apply_tunic(basemesh)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out_dir, "male-thuiszorg.blend"))
    root, collection = create_export_copy(basemesh)
    prepare_armature(root)
    prepare_materials(collection)
    limit_texture_sizes()
    glb_path = os.path.join(args.out_dir, "male-thuiszorg.glb")
    export_glb(root, glb_path)
    report = {"objects": report_objects(collection), "glb_bytes": os.path.getsize(glb_path)}
    with open(os.path.join(args.out_dir, "build-report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("SODALIS_BUILD_OK", json.dumps(report))


main()
