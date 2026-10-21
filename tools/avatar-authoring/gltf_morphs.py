"""Shrinks the morph targets of an exported GLB without visible change.

Blender's exporter writes a sparse morph accessor only when every unchanged vertex has an
exactly zero delta. Rig-baked shapes (such as MetaHuman RigLogic poses) carry tiny noise on
almost every vertex, so their targets stay nearly dense, and morph normals double that.
`compact_morph_targets` rewrites every POSITION and NORMAL target as a sparse accessor
that keeps only deltas above a visibility threshold, with 16-bit indices where possible.

It also repairs normals around folds. Skin hidden inside a fold at rest (a MetaHuman's upper
lid crease) can have exported normals that point into the fold; when a shape such as a blink
pulls that skin out, it shades as a dark slit. So, for primitives with morph targets:
1. base normals that disagree with the welded, area-weighted rest geometry are blended toward
   it (normals that agree are kept as exported);
2. NORMAL deltas are recomputed by rotating each repaired base normal with the change of the
   smoothed geometric normal between rest and target, replacing Blender's shape-key normals.

Runs inside Blender (which bundles numpy) or any Python with numpy:

    python gltf_morphs.py <in.glb> [out.glb]
"""
import json
import struct
import sys

import numpy as np

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
COMPONENT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
# 0.02 mm of movement, and about 0.5 degrees of normal rotation, are below what any framing shows.
POSITION_EPSILON = 2e-5
NORMAL_EPSILON = 0.008


def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    magic, _, _ = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError(f"{path} is not a GLB file")
    offset, doc, binary = 12, None, b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if kind == JSON_CHUNK:
            doc = json.loads(chunk)
        elif kind == BIN_CHUNK:
            binary = chunk
        offset += 8 + length
    return doc, binary


def write_glb(path, doc, binary):
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<III", GLB_MAGIC, 2, total))
        handle.write(struct.pack("<II", len(text), JSON_CHUNK) + text)
        handle.write(struct.pack("<II", len(binary), BIN_CHUNK) + binary)


def _view_array(doc, binary, view_index, dtype, count, width, byte_offset=0):
    view = doc["bufferViews"][view_index]
    start = view.get("byteOffset", 0) + byte_offset
    item = np.dtype(dtype).itemsize * width
    stride = view.get("byteStride", item)
    raw = np.frombuffer(binary, np.uint8, count=stride * (count - 1) + item if count else 0, offset=start)
    if stride == item:
        return raw.view(dtype).reshape(count, width).copy()
    rows = np.lib.stride_tricks.as_strided(raw, (count, item), (stride, 1))
    return rows.copy().view(dtype).reshape(count, width)


def read_vec3(doc, binary, accessor):
    if accessor["type"] != "VEC3" or accessor["componentType"] != 5126:
        raise ValueError("morph targets must be float VEC3")
    count = accessor["count"]
    out = np.zeros((count, 3), np.float32)
    if "bufferView" in accessor:
        out[:] = _view_array(doc, binary, accessor["bufferView"], np.float32, count, 3,
                             accessor.get("byteOffset", 0))
    sparse = accessor.get("sparse")
    if sparse:
        idx_def, val_def = sparse["indices"], sparse["values"]
        idx = _view_array(doc, binary, idx_def["bufferView"], COMPONENT[idx_def["componentType"]],
                          sparse["count"], 1, idx_def.get("byteOffset", 0))[:, 0]
        vals = _view_array(doc, binary, val_def["bufferView"], np.float32, sparse["count"], 3,
                           val_def.get("byteOffset", 0))
        out[idx.astype(np.int64)] = vals
    return out


def _indices(doc, binary, prim, count):
    if "indices" not in prim:
        return np.arange(count).reshape(-1, 3)
    acc = doc["accessors"][prim["indices"]]
    return _view_array(doc, binary, acc["bufferView"], COMPONENT[acc["componentType"]], acc["count"], 1,
                       acc.get("byteOffset", 0)).reshape(-1, 3).astype(np.int64)


def _write_vec3(doc, binary, acc, values):
    view = doc["bufferViews"][acc["bufferView"]]
    if acc["componentType"] != 5126 or view.get("byteStride", 12) != 12 or "sparse" in acc:
        raise ValueError("expected a tightly packed float VEC3 accessor")
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    data = bytearray(binary)
    data[start:start + values.nbytes] = np.ascontiguousarray(values, np.float32).tobytes()
    return bytes(data)


def _welded_normals(positions, triangles, group, smooth=0):
    """Area-weighted vertex normals, summed over vertices sharing a position (UV seams), then
    averaged over `smooth` rings of welded neighbours to soften sub-millimetre kinks."""
    corners = positions[triangles]
    face = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    tri = group[triangles]
    acc = np.zeros((group.max() + 1, 3))
    for k in range(3):
        np.add.at(acc, tri[:, k], face)
    acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
    if smooth:
        edges = np.unique(np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), axis=1), axis=0)
        for _ in range(smooth):
            total = acc.copy()
            np.add.at(total, edges[:, 0], acc[edges[:, 1]])
            np.add.at(total, edges[:, 1], acc[edges[:, 0]])
            acc = total / np.maximum(np.linalg.norm(total, axis=1, keepdims=True), 1e-12)
    return acc[group]


def _rotate(vectors, a, b):
    """Rotate each vector by the minimal rotation taking unit a onto unit b (Rodrigues)."""
    axis = np.cross(a, b)
    cos = (a * b).sum(1, keepdims=True)
    out = vectors * cos + np.cross(axis, vectors) + axis * (axis * vectors).sum(1, keepdims=True) / np.maximum(1 + cos, 1e-6)
    flip = cos[:, 0] < -0.999  # (anti)parallel: no unique axis, take the geometric normal
    out[flip] = b[flip]
    return out


NORMAL_SMOOTHING = 3  # rings; MetaHuman's closed-lid crease leaves a groove narrower than one ring


def _weld(positions):
    return np.unique(np.round(positions / 1e-6).astype(np.int64), axis=0, return_inverse=True)[1].ravel()


def repair_base_normals(base_positions, base_normals, triangles, smooth=NORMAL_SMOOTHING):
    """Replace exported base normals that disagree with the rest surface by geometric ones.

    MetaHuman skin tucked inside the upper-lid crease is exported with normals pointing into the
    fold. Hidden at rest, it is pulled out by a blink; every other active morph then adds its delta
    to that wrong base and the crease shades as a line. Agreeing normals (including custom normals
    on seams) are kept unchanged.
    """
    rest = _welded_normals(base_positions, triangles, _weld(base_positions), smooth)
    trust = np.clip(((base_normals * rest).sum(1, keepdims=True) - 0.7) / 0.25, 0, 1)
    fixed = trust * base_normals + (1 - trust) * rest
    return (fixed / np.maximum(np.linalg.norm(fixed, axis=1, keepdims=True), 1e-12)).astype(np.float32)


def geometric_normal_deltas(base_positions, base_normals, triangles, position_delta, smooth=NORMAL_SMOOTHING):
    """Morph normal deltas that rotate each base normal with its surface (see module docstring)."""
    group = _weld(base_positions)
    rest = _welded_normals(base_positions, triangles, group, smooth)
    posed = _welded_normals(base_positions + position_delta, triangles, group, smooth)
    moved = np.abs(position_delta).max(1) > 0
    return np.where(moved[:, None], _rotate(base_normals, rest, posed) - base_normals, 0).astype(np.float32)


def compact_morph_targets(path, output=None, position_epsilon=POSITION_EPSILON,
                          normal_epsilon=NORMAL_EPSILON, recompute_normals=True):
    """Rewrites morph targets in place (or to `output`); returns (bytes before, bytes after)."""
    doc, binary = read_glb(path)
    before = len(binary)
    epsilon = {"POSITION": position_epsilon, "NORMAL": normal_epsilon}
    accessors = doc["accessors"]
    new_views = []  # (bytes, target accessor index, role)
    done = set()
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            geometry = None
            if recompute_normals and any("NORMAL" in t for t in prim.get("targets", [])):
                positions = read_vec3(doc, binary, accessors[prim["attributes"]["POSITION"]])
                triangles = _indices(doc, binary, prim, len(positions))
                normal_acc = accessors[prim["attributes"]["NORMAL"]]
                normals = repair_base_normals(positions, read_vec3(doc, binary, normal_acc), triangles)
                binary = _write_vec3(doc, binary, normal_acc, normals)
                geometry = (positions, normals, triangles)
            for target in prim.get("targets", []):
                normals = None
                if geometry is not None and "NORMAL" in target and target["NORMAL"] not in done:
                    delta = read_vec3(doc, binary, accessors[target["POSITION"]])
                    normals = geometric_normal_deltas(*geometry, delta)
                for attr, index in target.items():
                    if attr not in epsilon or index in done:
                        continue
                    done.add(index)
                    acc = accessors[index]
                    if attr == "NORMAL" and normals is not None:
                        values = normals
                    else:
                        values = read_vec3(doc, binary, acc)
                    keep = np.nonzero(np.linalg.norm(values, axis=1) > epsilon[attr])[0]
                    dense = np.zeros_like(values)
                    dense[keep] = values[keep]
                    fresh = {"componentType": 5126, "count": acc["count"], "type": "VEC3"}
                    if attr == "POSITION":  # glTF requires bounds on POSITION accessors
                        fresh["min"] = dense.min(0).tolist()
                        fresh["max"] = dense.max(0).tolist()
                    if len(keep):
                        itype = 5123 if acc["count"] <= 65536 else 5125
                        fresh["sparse"] = {"count": int(len(keep)),
                                           "indices": {"bufferView": None, "componentType": itype},
                                           "values": {"bufferView": None}}
                        new_views.append((keep.astype(COMPONENT[itype]).tobytes(), index, "indices"))
                        new_views.append((values[keep].astype(np.float32).tobytes(), index, "values"))
                    accessors[index] = fresh

    # Rebuild the buffer from the views that are still referenced, then the new sparse data.
    used = set()
    for acc in accessors:
        if "bufferView" in acc:
            used.add(acc["bufferView"])
        sparse = acc.get("sparse")
        if sparse and sparse["indices"]["bufferView"] is not None:
            used.add(sparse["indices"]["bufferView"])
            used.add(sparse["values"]["bufferView"])
    for image in doc.get("images", []):
        if "bufferView" in image:
            used.add(image["bufferView"])
    chunks, views, remap = [], [], {}
    size = 0

    def append(data, view):
        nonlocal size
        pad = -size % 4
        chunks.append(b"\0" * pad)
        size += pad
        view = dict(view, buffer=0, byteOffset=size, byteLength=len(data))
        chunks.append(data)
        size += len(data)
        views.append(view)
        return len(views) - 1

    for old in sorted(used):
        view = doc["bufferViews"][old]
        start = view.get("byteOffset", 0)
        remap[old] = append(binary[start:start + view["byteLength"]],
                            {k: v for k, v in view.items() if k not in ("byteOffset", "byteLength")})
    for acc in accessors:
        if "bufferView" in acc:
            acc["bufferView"] = remap[acc["bufferView"]]
        sparse = acc.get("sparse")
        if sparse and sparse["indices"]["bufferView"] is not None:
            sparse["indices"]["bufferView"] = remap[sparse["indices"]["bufferView"]]
            sparse["values"]["bufferView"] = remap[sparse["values"]["bufferView"]]
    for image in doc.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = remap[image["bufferView"]]
    for data, index, role in new_views:
        accessors[index]["sparse"][role]["bufferView"] = append(data, {})
    binary = b"".join(chunks)
    doc["bufferViews"] = views
    doc["buffers"] = [{"byteLength": len(binary)}]
    write_glb(output or path, doc, binary)
    return before, len(binary)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    src = argv[0]
    dst = argv[1] if len(argv) > 1 else src
    old, new = compact_morph_targets(src, dst)
    print(f"MORPHS_COMPACTED {src} -> {dst}: buffer {old / 1e6:.1f} MB -> {new / 1e6:.1f} MB")
