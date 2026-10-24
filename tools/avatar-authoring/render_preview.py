"""Renders portrait and full-body previews of an exported avatar GLB.

Usage: blender.sh -b --python render_preview.py -- --glb FILE --out-dir DIR [--shape NAME=VALUE ...]
The GLB is imported into an empty scene so the preview shows exactly what was exported.
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--name", default="preview")
    parser.add_argument("--shape", action="append", default=[], help="shape key weight, e.g. jawOpen=0.6")
    parser.add_argument("--samples", type=int, default=24)
    return parser.parse_args(argv)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_light(name, kind, location, energy, size=1.0):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    look_at(obj, (0, 0, 1.4))


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.glb)

    for spec in args.shape:
        name, value = spec.split("=")
        for obj in bpy.context.scene.objects:
            keys = obj.data.shape_keys if obj.type == "MESH" else None
            if keys and name in keys.key_blocks:
                keys.key_blocks[name].value = float(value)

    head = next(
        (
            obj.matrix_world @ bone.head_local
            for obj in bpy.context.scene.objects
            if obj.type == "ARMATURE"
            for bone in obj.data.bones
            if bone.name == "Head"
        ),
        Vector((0, 0, 1.6)),
    )

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.84, 0.88, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world

    add_light("Key", "AREA", (0.9, -1.6, 2.0), 180, 1.5)
    add_light("Fill", "AREA", (-1.4, -1.2, 1.6), 70, 2.0)
    add_light("Rim", "AREA", (0.0, 1.5, 2.2), 90, 1.0)

    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera

    shots = {
        "portrait": (Vector((0, -0.75, head.z + 0.05)), head + Vector((0, 0, 0.05)), 50, (720, 720)),
        "upper": (Vector((0.35, -1.9, head.z - 0.15)), Vector((0, 0, head.z - 0.35)), 50, (720, 900)),
        "full": (Vector((0, -4.6, 1.0)), Vector((0, 0, 0.9)), 50, (600, 1000)),
    }
    for shot, (location, target, lens, (w, h)) in shots.items():
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.filepath = os.path.join(args.out_dir, f"{args.name}-{shot}.png")
        bpy.ops.render.render(write_still=True)
    print("SODALIS_PREVIEW_OK", args.out_dir)


main()
