"""Copy the baked face ambient-occlusion map out of Unreal's glTF export of a MetaHuman.

Unreal's glTF exporter bakes the face material and writes its occlusion map as an image named
`..._Face_Occlusion`. The face keeps the DCC head UVs, so the map applies to the FBX head as-is.
build_metahuman.py uses `<maps>/Head_Occlusion.png` when it exists.

    python extract_face_ao.py UnrealExport.glb <maps>/Head_Occlusion.png
"""
import json
import struct
import sys


def extract(src, dst, suffix="_Face_Occlusion"):
    with open(src, "rb") as f:
        f.read(12)
        length, _ = struct.unpack("<II", f.read(8))
        doc = json.loads(f.read(length))
        f.read(8)
        base = f.tell()
        matches = [i for i in doc.get("images", []) if i.get("name", "").endswith(suffix)]
        if not matches:
            names = [i.get("name") for i in doc.get("images", [])]
            raise SystemExit(f"no image ending in {suffix!r} in {src}; images: {names}")
        view = doc["bufferViews"][matches[0]["bufferView"]]
        f.seek(base + view.get("byteOffset", 0))
        data = f.read(view["byteLength"])
    with open(dst, "wb") as out:
        out.write(data)
    print("WROTE", dst, matches[0]["name"], len(data))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    extract(sys.argv[1], sys.argv[2])
