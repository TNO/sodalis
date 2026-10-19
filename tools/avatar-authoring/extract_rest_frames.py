"""Extract Ready Player Me-compatible rest frames from a reference GLB.

TalkingHead 1.7.0 animates bones with absolute local rotations authored for
the Ready Player Me/Mixamo skeleton, so a compatible avatar must use the same
rest-frame orientation for each joint. This writes each named joint's world
rest rotation (glTF Y-up quaternion, x/y/z/w) to JSON. Only orientation
convention data is recorded; no geometry, texture, or other model content.

    python3 tools/avatar-authoring/extract_rest_frames.py \
        apps/desktop/public/avatars/talkinghead-brunette.glb \
        tools/avatar-authoring/rpm_rest_frames.json
"""

import hashlib
import json
import struct
import sys


def read_gltf(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"glTF":
        raise ValueError(f"{path} is not a binary glTF file")
    length = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + length]), hashlib.sha256(data).hexdigest()


def multiply(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def world_rotations(gltf):
    nodes = gltf["nodes"]
    parents = {child: index for index, node in enumerate(nodes) for child in node.get("children", [])}
    joints = set(gltf["skins"][0]["joints"])
    result = {}
    for index in joints:
        chain = []
        current = index
        while current is not None:
            chain.append(current)
            current = parents.get(current)
        rotation = (0.0, 0.0, 0.0, 1.0)
        for node_index in reversed(chain):
            rotation = multiply(rotation, tuple(nodes[node_index].get("rotation", (0, 0, 0, 1))))
        result[nodes[index]["name"]] = [round(value, 6) for value in rotation]
    return result


def main():
    source, output = sys.argv[1], sys.argv[2]
    gltf, digest = read_gltf(source)
    frames = world_rotations(gltf)
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "description": "World-space rest rotations (glTF Y-up, x/y/z/w) of the Ready Player Me skeleton expected by TalkingHead 1.7.0.",
                "sourceSha256": digest,
                "frames": dict(sorted(frames.items())),
            },
            handle,
            indent=2,
        )
        handle.write("\n")


if __name__ == "__main__":
    main()
