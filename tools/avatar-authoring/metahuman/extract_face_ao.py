"""Copy the baked face ambient-occlusion map out of Unreal's glTF export of a MetaHuman.

Unreal's glTF exporter bakes the face material and writes its occlusion map as an image named
`..._Face_Occlusion`. The face keeps the DCC head UVs, but the export may store a
KHR_texture_transform with the map (Odette: V scale 1.22); the transform is baked in so the
map lines up with the FBX head. Without it the lid and nose creases land on the cheeks.
build_metahuman.py uses `<maps>/Head_Occlusion.png` when it exists.

    uv run -q --with pillow python extract_face_ao.py UnrealExport.glb <maps>/Head_Occlusion.png
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_glb_texture import extract, read_glb  # noqa: E402


def face_material(src, suffix="_Face_Occlusion"):
    gltf, _ = read_glb(os.path.expanduser(src))
    for m in gltf.get("materials", []):
        ref = m.get("occlusionTexture")
        if ref is None:
            continue
        image = gltf["images"][gltf["textures"][ref["index"]]["source"]]
        if image.get("name", "").endswith(suffix):
            return m["name"], image["name"]
    names = [i.get("name") for i in gltf.get("images", [])]
    raise SystemExit(f"no occlusion image ending in {suffix!r} in {src}; images: {names}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    material, image = face_material(sys.argv[1])
    img, (sx, sy, ox, oy), _ = extract(sys.argv[1], material, "occlusionTexture")
    img.save(os.path.expanduser(sys.argv[2]))
    print(f"WROTE {sys.argv[2]} {image} (scale {sx:.4f},{sy:.4f} offset {ox:.4f},{oy:.4f})")
