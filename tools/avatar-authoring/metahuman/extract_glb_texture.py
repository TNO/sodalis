"""Extract a material texture from an Unreal glTF export into our UV layout.

Unreal's glTF exporter can bake a material (for example the eye shader, with its
limbal ring and iris colour) into a texture, but it stores a small
KHR_texture_transform alongside it. This writes the texture with that transform
baked in, so it can replace the matching DCC map, and downscales it to the cap.

    uv run -q --with pillow python extract_glb_texture.py \
        --glb AnnaExportTest_v3.glb --material MI_EyeL_Baked_Face \
        --out ~/avatar-work/anna/maps-override/Eyes_Color.png [--cap 2048]
"""

import argparse
import io
import json
import os
import struct

from PIL import Image


def read_glb(path):
    with open(path, "rb") as f:
        magic, _version, _length = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError(f"{path} is not a binary glTF file")
        json_length, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(json_length))
        bin_length, _ = struct.unpack("<II", f.read(8))
        return gltf, f.read(bin_length)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--glb", required=True)
    parser.add_argument("--material", required=True, help="glTF material name")
    parser.add_argument("--slot", default="baseColorTexture",
                        help="pbrMetallicRoughness texture slot (default baseColorTexture)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--cap", type=int, default=2048, help="maximum edge in pixels")
    args = parser.parse_args()

    gltf, blob = read_glb(os.path.expanduser(args.glb))
    material = next((m for m in gltf.get("materials", []) if m.get("name") == args.material), None)
    if material is None:
        names = ", ".join(m.get("name", "?") for m in gltf.get("materials", []))
        raise SystemExit(f"material {args.material!r} not found; available: {names}")
    ref = material.get("pbrMetallicRoughness", {}).get(args.slot)
    if ref is None:
        raise SystemExit(f"material {args.material!r} has no {args.slot}")
    image_def = gltf["images"][gltf["textures"][ref["index"]]["source"]]
    view = gltf["bufferViews"][image_def["bufferView"]]
    start = view.get("byteOffset", 0)
    img = Image.open(io.BytesIO(blob[start:start + view["byteLength"]]))
    img.load()

    transform = ref.get("extensions", {}).get("KHR_texture_transform", {})
    if transform.get("rotation"):
        raise SystemExit("rotated texture transforms are not supported")
    sx, sy = transform.get("scale", [1.0, 1.0])
    ox, oy = transform.get("offset", [0.0, 0.0])
    width, height = img.size
    if (sx, sy, ox, oy) != (1.0, 1.0, 0.0, 0.0):
        # glTF samples the image at uv * scale + offset; resample so plain uv does the same.
        img = img.transform(img.size, Image.Transform.AFFINE,
                            (sx, 0, ox * width, 0, sy, oy * height),
                            resample=Image.Resampling.BICUBIC)
    if max(img.size) > args.cap:
        img = img.resize((args.cap, args.cap * height // width), Image.Resampling.LANCZOS)
    out = os.path.expanduser(args.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    img.convert("RGB").save(out)
    print(f"{args.material}.{args.slot}: {width}x{height} -> {img.size[0]}x{img.size[1]} "
          f"(scale {sx:.4f},{sy:.4f} offset {ox:.4f},{oy:.4f}) -> {out}")


if __name__ == "__main__":
    main()
