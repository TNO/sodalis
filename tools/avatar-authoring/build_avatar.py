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


def subdivide_with_shape_keys(obj, levels):
    """Apply Catmull-Clark subdivision to a mesh while preserving its shape keys.

    Blender cannot apply a modifier to a mesh with shape keys, so each key is
    evaluated through the subdivision on its own, the subdivision is applied to
    the basis, and the keys are rebuilt from the evaluated coordinates.
    """
    import numpy as np

    keys = obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
    other_modifiers = [(modifier, modifier.show_viewport) for modifier in obj.modifiers]
    for modifier, _ in other_modifiers:
        modifier.show_viewport = False
    subsurf = obj.modifiers.new("SodalisSubdivision", "SUBSURF")
    subsurf.levels = levels
    subsurf.render_levels = levels
    subsurf.uv_smooth = "PRESERVE_BOUNDARIES"
    while obj.modifiers[0] != subsurf:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_move_up(modifier=subsurf.name)

    evaluated_keys = []
    obj.show_only_shape_key = True
    for index, key in enumerate(keys):
        obj.active_shape_key_index = index
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
        mesh.vertices.foreach_get("co", coords)
        evaluated_keys.append((key.name, key.relative_key.name, key.slider_min, key.slider_max, key.value, coords))
        obj.evaluated_get(depsgraph).to_mesh_clear()
    obj.show_only_shape_key = False

    if keys:
        obj.shape_key_clear()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=subsurf.name)
    for modifier, visible in other_modifiers:
        modifier.show_viewport = visible

    if not evaluated_keys:
        return
    vertex_count = len(obj.data.vertices)
    for name, _relative, slider_min, slider_max, value, coords in evaluated_keys:
        if len(coords) != vertex_count * 3:
            raise RuntimeError(f"Subdivided shape key {name} has a different vertex count.")
        block = obj.shape_key_add(name=name, from_mix=False)
        block.slider_min = slider_min
        block.slider_max = slider_max
        block.value = value
        block.data.foreach_set("co", coords)
    blocks = obj.data.shape_keys.key_blocks
    for name, relative, *_ in evaluated_keys:
        if relative in blocks:
            blocks[name].relative_key = blocks[relative]
    obj.data.update()


def subdivide_basemesh(services, root, levels):
    if levels <= 0:
        return
    for obj in root.children_recursive:
        if obj.type == "MESH" and services.ObjectService.get_object_type(obj) == "Basemesh":
            subdivide_with_shape_keys(obj, levels)


def hair_bone_names(chain, segments):
    return [f"Hair{chain + 1}_{index + 1}" for index in range(segments + 1)]


def mesh_islands(mesh):
    parent = list(range(len(mesh.vertices)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for edge in mesh.edges:
        a, b = find(edge.vertices[0]), find(edge.vertices[1])
        if a != b:
            parent[a] = b
    return [find(index) for index in range(len(mesh.vertices))]


def kmeans(points, count, iterations=30):
    import numpy as np

    # Deterministic farthest-point initialisation keeps builds reproducible.
    centres = [points[int(np.argmin(points[:, 0]))]]
    while len(centres) < count:
        distances = np.min([((points - centre) ** 2).sum(axis=1) for centre in centres], axis=0)
        centres.append(points[int(np.argmax(distances))])
    centres = np.array(centres)
    for _ in range(iterations):
        labels = np.argmin(((points[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2), axis=1)
        for index in range(count):
            if np.any(labels == index):
                centres[index] = points[labels == index].mean(axis=0)
    return labels


def add_hair_bones(services, armature, settings):
    """Give long hair spring-bone chains for TalkingHead's dynamic bones.

    Hair below chin level is split into mesh islands (hair cards), the islands
    are clustered into strands, and each strand gets a chain parented to Head.
    Island vertices blend from Head into the chain by height, so cards never
    tear. Bones are named Hair<chain>_<n>; the last bone of each chain is a
    non-deforming tip that TalkingHead simulates.
    """
    import numpy as np

    chains = int(settings.get("chains", 4))
    segments = int(settings.get("segments", 3))
    hair = next(
        (obj for obj in armature.children_recursive
         if obj.type == "MESH" and services.ObjectService.get_object_type(obj) == "Hair"),
        None,
    )
    if hair is None:
        raise RuntimeError("hairBones needs the recipe to equip hair.")

    eye_z = (armature.matrix_world @ armature.data.bones["LeftEye"].head_local).z
    root_z = eye_z - float(settings.get("rootBelowEyes", 0.11))
    world = np.array([hair.matrix_world @ vertex.co for vertex in hair.data.vertices])
    islands = np.array(mesh_islands(hair.data))
    hanging = world[:, 2] < root_z
    island_ids = sorted({island for island in islands[hanging]})
    if len(island_ids) < chains:
        raise RuntimeError("Not enough hanging hair islands for the requested chains.")
    island_points = np.array([world[(islands == island) & hanging][:, :2].mean(axis=0) for island in island_ids])
    island_labels = dict(zip(island_ids, kmeans(island_points, chains)))
    chain_of_vertex = np.array([island_labels.get(island, -1) for island in islands])

    to_local = armature.matrix_world.inverted()
    min_length = float(settings.get("minLength", 0.1))
    joints = []
    for chain in range(chains):
        members = world[(chain_of_vertex == chain) & hanging]
        bottom_z = float(np.percentile(members[:, 2], 2))
        if root_z - bottom_z < min_length:
            # Short locks stay on Head; a tiny spring chain would only jitter.
            chain_of_vertex[chain_of_vertex == chain] = -1
            continue
        heights = [root_z - (root_z - bottom_z) * step / segments for step in range(segments + 1)]
        band = (root_z - bottom_z) / segments / 2
        points = []
        for height in heights:
            near = members[np.abs(members[:, 2] - height) <= band]
            xy = near[:, :2].mean(axis=0) if len(near) else (points[-1][:2] if points else members[:, :2].mean(axis=0))
            points.append(Vector((float(xy[0]), float(xy[1]), height)))
        joints.append((chain, bottom_z, points))
    # Renumber the kept chains so bone names stay contiguous.
    kept = {old: new for new, (old, _bottom, _points) in enumerate(joints)}
    chain_of_vertex = np.array([kept.get(int(chain), -1) for chain in chain_of_vertex])
    joints = [(bottom, points) for _old, bottom, points in joints]
    chains = len(joints)

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature.data.edit_bones
    for chain, (_bottom, points) in enumerate(joints):
        parent = edit_bones["Head"]
        names = hair_bone_names(chain, segments)
        for index, name in enumerate(names):
            bone = edit_bones.new(name)
            bone.head = to_local @ points[index]
            if index + 1 < len(points):
                bone.tail = to_local @ points[index + 1]
            else:
                bone.tail = bone.head + (to_local.to_3x3() @ Vector((0.0, 0.0, -0.03)))
            bone.parent = parent
            bone.use_deform = index < segments
            parent = bone
    bpy.ops.object.mode_set(mode="OBJECT")

    groups = {}
    for chain in range(chains):
        for name in hair_bone_names(chain, segments)[:segments]:
            groups[name] = hair.vertex_groups.get(name) or hair.vertex_groups.new(name=name)
    head_group = hair.vertex_groups.get("Head") or hair.vertex_groups.new(name="Head")
    other_groups = [group for group in hair.vertex_groups if group.name not in groups and group != head_group]
    for index in np.nonzero(hanging & (chain_of_vertex >= 0))[0]:
        index = int(index)
        chain = int(chain_of_vertex[index])
        bottom_z = joints[chain][0]
        t = min(1.0, max(0.0, (root_z - world[index, 2]) / max(1e-6, root_z - bottom_z)))
        u = min(segments - 1.0, max(0.0, t * segments - 0.5))
        lower = int(u)
        fraction = u - lower
        ramp = min(1.0, t * segments)
        names = hair_bone_names(chain, segments)
        for group in other_groups:
            group.remove([index])
        for group in groups.values():
            group.remove([index])
        head_group.add([index], 1.0 - ramp, "REPLACE")
        groups[names[lower]].add([index], ramp * (1.0 - fraction), "REPLACE")
        if fraction > 0 and lower + 1 < segments:
            groups[names[lower + 1]].add([index], ramp * fraction, "REPLACE")
    print("SODALIS_HAIR_BONES", chains, segments, [round(root_z - bottom, 3) for bottom, _points in joints])


def cap_textures(max_size):
    for image in bpy.data.images:
        if image.size[0] == 0 or image.size[1] == 0:
            continue
        largest = max(image.size)
        if largest > max_size:
            scale = max_size / largest
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))


def adjust_images(adjustments):
    """Multiply the RGB of named images, e.g. to darken a neutral hair texture.

    Keys match the image's file name without extension; values are
    {"multiply": [r, g, b]}. Unmatched keys fail the build so recipes stay honest.
    """
    import numpy as np

    remaining = dict(adjustments)
    for image in bpy.data.images:
        stem = os.path.splitext(os.path.basename(image.filepath or image.name))[0]
        adjustment = remaining.pop(stem, None)
        if adjustment is None or image.size[0] == 0:
            continue
        factors = np.array(adjustment["multiply"], dtype=np.float32)
        channels = image.channels
        pixels = np.empty(image.size[0] * image.size[1] * channels, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(-1, channels)
        pixels[:, :3] *= factors
        image.pixels.foreach_set(pixels.ravel())
        image.update()
    if remaining:
        raise RuntimeError("No images matched imageAdjustments: " + ", ".join(sorted(remaining)))


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


def clip_alpha(services, root, cutoffs):
    """Export textured alpha as glTF MASK instead of BLEND.

    MakeHuman textures leave unused UV space transparent and hair relies on
    alpha cards; blended export causes sorting artefacts in three.js. A
    "Greater Than" node before the Alpha socket is what the glTF exporter maps
    to alphaMode MASK. Cutoffs are keyed by MPFB object type (e.g. "Hair").
    """
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        cutoff = cutoffs.get(services.ObjectService.get_object_type(obj), cutoffs.get("default", 0.5))
        for slot in obj.material_slots:
            material = slot.material
            if not material or not material.use_nodes:
                continue
            tree = material.node_tree
            for link in list(tree.links):
                if link.to_socket.name != "Alpha" or link.from_node.type != "TEX_IMAGE":
                    continue
                source, target = link.from_socket, link.to_socket
                tree.links.remove(link)
                clip = tree.nodes.new("ShaderNodeMath")
                clip.operation = "GREATER_THAN"
                clip.inputs[1].default_value = cutoff
                tree.links.new(source, clip.inputs[0])
                tree.links.new(clip.outputs[0], target)


def set_roughness(root, overrides):
    """Override Principled roughness per material, e.g. {"punkduck_female_tight_jeans": 0.85}."""
    pending = dict(overrides)
    for obj in [root, *root.children_recursive]:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            key = next((k for k in overrides if material and material.name.split(".")[-1] == k), None)
            if key is None or not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    socket = node.inputs["Roughness"]
                    for link in list(socket.links):
                        material.node_tree.links.remove(link)
                    socket.default_value = float(overrides[key])
                    pending.pop(key, None)
    if pending:
        raise RuntimeError(f"roughness: no material for {sorted(pending)}")


def export_glb(root, output, morph_normals=False, compact_morphs=False):
    """Exports the rig as GLB. Morph normals cost size but keep strongly deforming
    shapes (such as closing eyelids) from shading with their rest-pose normals.
    compact_morphs rewrites morph targets as thresholded sparse accessors (gltf_morphs.py)."""
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
        export_morph_normal=morph_normals,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_materials="EXPORT",
        export_extras=False,
    )
    if compact_morphs:
        from gltf_morphs import compact_morph_targets

        compact_morph_targets(os.path.abspath(output))


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
    subdivide_basemesh(services, root, recipe.get("subdivision", 0))
    if root.type != "ARMATURE":
        raise RuntimeError("Expected the export copy to be rooted in an armature.")

    root.name = "Armature"  # TalkingHead resolves the model root by this name.
    root.data.name = recipe["id"]
    rename_bones(root)
    add_eye_bones(services, root, copy)
    align_rest_frames(root, REST_FRAMES_PATH)
    if recipe.get("hairBones"):
        add_hair_bones(services, root, recipe["hairBones"])
    cap_textures(recipe.get("maxTextureSize", 2048))
    adjust_images(recipe.get("imageAdjustments", {}))
    drop_opaque_alpha_links(root)
    clip_alpha(services, root, recipe.get("alphaCutoffs", {}))
    set_roughness(root, recipe.get("roughness", {}))

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend), compress=True)
    export_glb(root, args.output)
    print("SODALIS_AVATAR_EXPORTED", os.path.abspath(args.output))


if __name__ == "__main__":
    main()
