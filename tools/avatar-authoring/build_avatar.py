"""Build a Sodalis Avatar Profile GLB from an MPFB recipe.

Run headless with Blender 5.2+ and the MPFB extension enabled (do not pass
--factory-startup, which disables extensions):

    blender -b -noaudio --python-exit-code 1 \
        --python tools/avatar-authoring/build_avatar.py -- \
        tools/avatar-authoring/recipes/<id>.json <output.glb> [--blend <file.blend>]

The recipe's "mpfb" object is an MPFB human preset (see HumanService
serialization). The script forces the Mixamo rig and game-engine materials,
bakes ARKit face units and Meta visemes onto an export copy, renames the rig to
the TalkingHead/Ready Player Me bone names, adds the LeftEye/RightEye joints,
caps textures, and exports a self-contained GLB.
"""

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

MIXAMO_PREFIX = "mixamorig:"
EYE_BONE_LENGTH = 0.02
REST_FRAMES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rpm_rest_frames.json")


def mpfb_services():
    import importlib

    for package in ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb", "mpfb"):
        try:
            return importlib.import_module(package + ".services")
        except ImportError:
            continue
    raise RuntimeError(
        "MPFB is not enabled. Run tools/avatar-authoring/setup.sh and do not use --factory-startup."
    )


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build_avatar.py")
    parser.add_argument("recipe")
    parser.add_argument("output")
    parser.add_argument("--blend", help="Also save the editable export scene to this .blend file")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_homefile(use_empty=True)


def create_human(services, recipe):
    human_info = dict(recipe["mpfb"])
    human_info["rig"] = "mixamo"
    human_info.setdefault("skin_material_type", "GAMEENGINE")
    human_info.setdefault("eyes_material_type", "GAMEENGINE")
    human_info.setdefault("clothes_material_type", "GAMEENGINE")
    settings = services.HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    return services.HumanService.deserialize_from_dict(human_info, settings)


def create_export_copy(services, basemesh):
    root = services.ExportService.create_character_copy(basemesh, name_suffix="")
    source_root = basemesh.parent or basemesh
    for obj in [source_root, *source_root.children_recursive]:
        bpy.data.objects.remove(obj, do_unlink=True)

    copy = services.ObjectService.find_object_of_type_amongst_nearest_relatives(root)
    services.TargetService.bake_targets(copy)
    services.FaceService.load_targets(
        copy,
        load_microsoft_visemes=False,
        load_meta_visemes=True,
        load_arkit_faceunits=True,
    )
    services.FaceService.interpolate_targets(copy)
    services.ExportService.bake_modifiers_remove_helpers(
        copy, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True
    )
    for obj in [root, *root.children_recursive]:
        if obj.type == "MESH":
            for modifier in list(obj.modifiers):
                if modifier.type in {"MASK", "SUBSURF"}:
                    obj.modifiers.remove(modifier)
    return root, copy


def rename_bones(armature):
    for bone in armature.data.bones:
        if bone.name.startswith(MIXAMO_PREFIX):
            bone.name = bone.name[len(MIXAMO_PREFIX):]
    for obj in armature.children_recursive:
        if obj.type != "MESH":
            continue
        for group in obj.vertex_groups:
            if group.name.startswith(MIXAMO_PREFIX):
                group.name = group.name[len(MIXAMO_PREFIX):]


def eye_centres(services, basemesh):
    eyes = services.ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, "Eyes")
    if eyes is None:
        raise RuntimeError("The recipe must equip eyes so LeftEye/RightEye joints can be placed.")
    world = eyes.matrix_world
    points = [world @ vertex.co for vertex in eyes.data.vertices]
    left = [point for point in points if point.x > 0]
    right = [point for point in points if point.x < 0]
    if not left or not right:
        raise RuntimeError("Could not split the eye mesh into left and right eyes.")

    def centre(group):
        low = Vector((min(p.x for p in group), min(p.y for p in group), min(p.z for p in group)))
        high = Vector((max(p.x for p in group), max(p.y for p in group), max(p.z for p in group)))
        return (low + high) / 2

    return centre(left), centre(right)


def add_eye_bones(services, armature, basemesh):
    # The character faces -Y, so the character's left eye is at +X.
    left, right = eye_centres(services, basemesh)
    to_local = armature.matrix_world.inverted()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    head = armature.data.edit_bones["Head"]
    for name, position in (("LeftEye", left), ("RightEye", right)):
        bone = armature.data.edit_bones.new(name)
        bone.head = to_local @ position
        bone.tail = bone.head + Vector((0.0, -EYE_BONE_LENGTH, 0.0))
        bone.roll = 0.0
        bone.parent = head
        bone.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")


def align_rest_frames(armature, frames_path):
    """Give every joint the Ready Player Me rest orientation, keeping joint positions.

    TalkingHead poses are absolute local rotations, so matching rest frames is
    what makes its gestures and idle poses deform this skeleton as intended.
    """
    from math import radians

    from mathutils import Matrix, Quaternion

    with open(frames_path, encoding="utf-8") as handle:
        frames = json.load(handle)["frames"]

    gltf_to_blender = Matrix.Rotation(radians(90.0), 3, "X")
    world_to_armature = armature.matrix_world.to_3x3().inverted()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature.data.edit_bones
    for bone in edit_bones:
        bone.use_connect = False
    missing = []
    for bone in edit_bones:
        frame = frames.get(bone.name)
        if frame is None:
            missing.append(bone.name)
            continue
        x, y, z, w = frame
        # Left-multiply only: the glTF exporter converts the world basis but keeps
        # bone-local axes, so exported world rotations equal the reference exactly.
        rotation = world_to_armature @ gltf_to_blender @ Quaternion((w, x, y, z)).to_matrix()
        head = bone.head.copy()
        length = bone.length
        bone.matrix = Matrix.Translation(head) @ rotation.to_4x4()
        bone.tail = bone.head + bone.y_axis * length
    bpy.ops.object.mode_set(mode="OBJECT")
    if missing:
        raise RuntimeError("No reference rest frame for bones: " + ", ".join(missing))


def cap_textures(max_size):
    for image in bpy.data.images:
        if image.size[0] == 0 or image.size[1] == 0:
            continue
        largest = max(image.size)
        if largest > max_size:
            scale = max_size / largest
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))


def image_is_opaque(image):
    import numpy as np

    if image.channels < 4:
        return True
    pixels = np.empty(image.size[0] * image.size[1] * image.channels, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return float(pixels[3 :: image.channels].min()) >= 0.999


def drop_opaque_alpha_links(root):
    """Unlink unused alpha so the glTF exporter writes opaque textures as JPEG."""
    materials = {
        slot.material
        for obj in root.children_recursive
        if obj.type == "MESH"
        for slot in obj.material_slots
        if slot.material and slot.material.use_nodes
    }
    for material in materials:
        tree = material.node_tree
        for link in list(tree.links):
            if link.to_socket.name != "Alpha" or link.from_node.type != "TEX_IMAGE":
                continue
            image = link.from_node.image
            if image and image_is_opaque(image):
                tree.links.remove(link)


def export_glb(root, output):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_materials="EXPORT",
        export_extras=False,
    )


def main():
    args = parse_args()
    with open(args.recipe, encoding="utf-8") as handle:
        recipe = json.load(handle)

    services = mpfb_services()
    if not services.FaceService.is_faceunits01_installed(force_recheck=True):
        raise RuntimeError("The MPFB faceunits01 pack is not installed. Run tools/avatar-authoring/setup.sh.")

    clear_scene()
    basemesh = create_human(services, recipe)
    root, copy = create_export_copy(services, basemesh)
    if root.type != "ARMATURE":
        raise RuntimeError("Expected the export copy to be rooted in an armature.")

    root.name = "Armature"  # TalkingHead resolves the model root by this name.
    root.data.name = recipe["id"]
    rename_bones(root)
    add_eye_bones(services, root, copy)
    align_rest_frames(root, REST_FRAMES_PATH)
    cap_textures(recipe.get("maxTextureSize", 2048))
    drop_opaque_alpha_links(root)

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend), compress=True)
    export_glb(root, args.output)
    print("SODALIS_AVATAR_EXPORTED", os.path.abspath(args.output))


if __name__ == "__main__":
    main()
