"""Extracts rest-pose bone frames from TalkingHead's CC0 MPFB example avatar.

Usage: python3 extract_bone_frames.py MPFB_GLB OUT_JSON
Writes each joint's world-space Y (bone direction) and Z (roll) axes in glTF coordinates.
"""

import json
import math
import struct
import sys

SOURCE = {
    "file": "avatars/mpfb.glb",
    "repository": "https://github.com/met4citizen/TalkingHead",
    "commit": "2afe6d79779313db8909badebf46f9805a6c7b70",
    "sha256": "63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c",
    "license": "CC0-1.0",
}


def read_gltf_json(path):
    with open(path, "rb") as f:
        magic, _version, _length = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            raise ValueError("Not a binary glTF file")
        chunk_length, chunk_type = struct.unpack("<II", f.read(8))
        if chunk_type != 0x4E4F534A:
            raise ValueError("First GLB chunk is not JSON")
        return json.loads(f.read(chunk_length))


def quat_to_matrix(q):
    x, y, z, w = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def main():
    source_path, out_path = sys.argv[1:3]
    gltf = read_gltf_json(source_path)
    nodes = gltf["nodes"]
    parent = {child: i for i, node in enumerate(nodes) for child in node.get("children", [])}
    joints = {j for skin in gltf.get("skins", []) for j in skin["joints"]}

    def local_rotation(i):
        node = nodes[i]
        if "matrix" in node:
            m = node["matrix"]
            return [[m[c * 4 + r] for c in range(3)] for r in range(3)]
        return quat_to_matrix(node.get("rotation", [0, 0, 0, 1]))

    frames = {}
    for i in sorted(joints):
        rotation = local_rotation(i)
        j = i
        while j in parent:
            j = parent[j]
            rotation = matmul(local_rotation(j), rotation)
        name = nodes[i]["name"].removeprefix("mixamorig")
        frames[name] = {
            "y": [round(rotation[r][1], 6) for r in range(3)],
            "z": [round(rotation[r][2], 6) for r in range(3)],
        }
        assert math.isclose(sum(v * v for v in frames[name]["y"]), 1, abs_tol=1e-3)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"source": SOURCE, "space": "glTF world, Y up, +Z front", "frames": frames}, f, indent=1)
        f.write("\n")


main()
