"""Extract a material texture from an Unreal glTF export into our UV layout.

Unreal's glTF exporter can bake a material (for example the eye shader, with its
limbal ring and iris colour) into a texture, but it stores a small
KHR_texture_transform alongside it. This writes the texture with that transform
baked in, so it can replace the matching DCC map, and downscales it to the cap.

    uv run -q --with pillow python extract_glb_texture.py \
        --glb AnnaExportTest_v3.glb --material MI_EyeL_Baked_Face \
        --out ~/avatar-work/anna/maps-override/Eyes_Color.png [--cap 2048]

Some garment exports bake a blurred base colour and keep the fine pattern (for example
lace) only in roughness. `--detail-from-roughness K` darkens the base colour by up to K
where roughness dips below its local average (needs numpy: add `--with numpy`).
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


def texture_ref(material, slot):
    """A texture reference from pbrMetallicRoughness or the material itself (normal/occlusion)."""
    return material.get("pbrMetallicRoughness", {}).get(slot) or material.get(slot)


def extract(glb, material_name, slot="baseColorTexture", cap=2048, gltf_blob=None):
    """Return (RGB image in plain UV layout, transform, original size)."""
    gltf, blob = gltf_blob or read_glb(os.path.expanduser(glb))
    material = next((m for m in gltf.get("materials", []) if m.get("name") == material_name), None)
    if material is None:
        names = ", ".join(m.get("name", "?") for m in gltf.get("materials", []))
        raise SystemExit(f"material {material_name!r} not found; available: {names}")
    ref = texture_ref(material, slot)
    if ref is None:
        raise SystemExit(f"material {material_name!r} has no {slot}")
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
    if max(img.size) > cap:
        img = img.resize((cap, cap * height // width), Image.Resampling.LANCZOS)
    return img.convert("RGB"), (sx, sy, ox, oy), (width, height)


def roughness_detail(img, roughness, strength, radius=12, depth=0.12):
    """Darken `img` where the roughness (G channel) falls below its blurred neighbourhood."""
    import numpy as np
    from PIL import ImageFilter

    g = roughness.getchannel("G").resize(img.size, Image.Resampling.LANCZOS)
    r = np.asarray(g, float) / 255
    local = np.asarray(g.filter(ImageFilter.GaussianBlur(radius)), float) / 255
    mask = np.clip((local - r) / depth, 0, 1)
    out = np.asarray(img, float) * (1 - strength * mask[..., None])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--glb", required=True)
    parser.add_argument("--material", required=True, help="glTF material name")
    parser.add_argument("--slot", default="baseColorTexture",
                        help="texture slot, e.g. baseColorTexture, normalTexture or occlusionTexture")
    parser.add_argument("--out", required=True)
    parser.add_argument("--cap", type=int, default=2048, help="maximum edge in pixels")
    parser.add_argument("--detail-from-roughness", type=float, default=0.0, metavar="K",
                        help="darken by up to K (0-1) where roughness dips, restoring baked-out detail")
    args = parser.parse_args()

    gltf_blob = read_glb(os.path.expanduser(args.glb))
    img, (sx, sy, ox, oy), (width, height) = extract(args.glb, args.material, args.slot, args.cap, gltf_blob)
    if args.detail_from_roughness:
        rough, _, _ = extract(args.glb, args.material, "metallicRoughnessTexture", args.cap, gltf_blob)
        img = roughness_detail(img, rough, args.detail_from_roughness)
    out = os.path.expanduser(args.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    img.save(out)
    print(f"{args.material}.{args.slot}: {width}x{height} -> {img.size[0]}x{img.size[1]} "
          f"(scale {sx:.4f},{sy:.4f} offset {ox:.4f},{oy:.4f}) -> {out}")

if __name__ == "__main__":
    main()
