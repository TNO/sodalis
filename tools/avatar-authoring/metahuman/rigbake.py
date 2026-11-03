"""Evaluate MetaHuman RigLogic poses on the DNA LOD0 meshes and bake them onto the
FBX head as Blender shape keys.

Needs Epic's OpenRigLogic Python bindings (`dna`, `riglogic`), built for Blender's Python;
set OPENRIGLOGIC_LIB to their directory (default ~/avatar-work/tools/openriglogic/lib).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.expanduser(os.environ.get("OPENRIGLOGIC_LIB", "~/avatar-work/tools/openriglogic/lib")))
import dna  # noqa: E402
import riglogic  # noqa: E402

# The DCC head FBX keeps one material slot per DNA LOD0 mesh, in DNA order.
SLOT_TO_MESH = {i: i for i in range(9)}


def _euler(r):
    x, y, z = np.radians(r)
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx  # Maya XYZ rotate order, column vectors


class Rig:
    def __init__(self, path, rot_mode="local"):
        s = dna.FileStream(path, dna.FileStream.AccessMode_Read, dna.FileStream.OpenMode_Binary)
        self.r = r = dna.BinaryStreamReader(s, dna.DataLayer_All)
        r.read()
        if not dna.Status.isOk():
            raise RuntimeError(dna.Status.get().message)
        self.rl = riglogic.RigLogic(r)
        self.ri = riglogic.RigInstance(self.rl)
        self.ri.setLOD(0)
        self.rot_mode = rot_mode
        self.controls = [r.getRawControlName(i) for i in range(r.getRawControlCount())]
        self.index = {n: i for i, n in enumerate(self.controls)}
        nj = r.getJointCount()
        self.parent = [r.getJointParentIndex(i) for i in range(nj)]
        self.nt = np.array([r.getNeutralJointTranslation(i) for i in range(nj)], float)
        self.nr = np.array([r.getNeutralJointRotation(i) for i in range(nj)], float)
        self.nR = np.array([_euler(v) for v in self.nr])
        self.bind = self._world(np.zeros((nj, 9)))
        self.bind_inv = np.linalg.inv(self.bind)
        self.meshes = {m: self._mesh(m) for m in SLOT_TO_MESH.values()}
        self.mesh_names = [r.getMeshName(m) for m in SLOT_TO_MESH.values()]

    def slot(self, role):
        """FBX head material slot of a DNA mesh role such as "eyeshell" or "eyeLeft"."""
        for slot, name in enumerate(self.mesh_names):
            if name.split("_lod")[0] == role:
                return slot
        raise KeyError(f"no {role} mesh in DNA LOD0: {self.mesh_names}")

    def _mesh(self, m):
        r = self.r
        pos = np.stack([r.getVertexPositionXs(m), r.getVertexPositionYs(m), r.getVertexPositionZs(m)], 1).astype(float)
        rows, cols, vals = [], [], []
        for v in range(r.getSkinWeightsCount(m)):
            for j, w in zip(r.getSkinWeightsJointIndices(m, v), r.getSkinWeightsValues(m, v)):
                rows.append(v); cols.append(j); vals.append(w)
        targets = []
        for t in range(r.getBlendShapeTargetCount(m)):
            idx = np.array(r.getBlendShapeTargetVertexIndices(m, t), int)
            if not len(idx):
                continue
            d = np.stack([r.getBlendShapeTargetDeltaXs(m, t), r.getBlendShapeTargetDeltaYs(m, t), r.getBlendShapeTargetDeltaZs(m, t)], 1)
            targets.append((r.getBlendShapeChannelIndex(m, t), idx, d))
        return dict(pos=pos, rows=np.array(rows), cols=np.array(cols), vals=np.array(vals), targets=targets)

    def _world(self, out):
        nj = len(self.parent)
        world = np.zeros((nj, 4, 4))
        done = np.zeros(nj, bool)

        def solve(j):
            if done[j]:
                return world[j]
            o = out[j]
            if self.rot_mode == "local":
                rot = self.nR[j] @ _euler(o[3:6])
            elif self.rot_mode == "parent":
                rot = _euler(o[3:6]) @ self.nR[j]
            else:  # summed euler angles
                rot = _euler(self.nr[j] + o[3:6])
            loc = np.eye(4)
            loc[:3, :3] = rot @ np.diag(1.0 + o[6:9])
            loc[:3, 3] = self.nt[j] + o[0:3]
            p = self.parent[j]
            world[j] = loc if p == j or p < 0 else solve(p) @ loc
            done[j] = True
            return world[j]

        for j in range(nj):
            solve(j)
        return world

    def evaluate(self, weights):
        """weights: {raw control name: value}. Returns {mesh: deformed - neutral (N,3)}."""
        for i in range(len(self.controls)):
            self.ri.setRawControl(i, 0.0)
        for name, v in weights.items():
            self.ri.setRawControl(self.index[name], float(v))
        self.rl.calculate(self.ri)
        out = np.array(self.ri.getJointOutputs(), float).reshape(-1, 9)
        bs = np.array(self.ri.getBlendShapeOutputs(), float)
        skin = self._world(out) @ self.bind_inv
        result = {}
        for m, d in self.meshes.items():
            p = d["pos"].copy()
            for ch, idx, delta in d["targets"]:
                if abs(bs[ch]) > 1e-6:
                    p[idx] += bs[ch] * delta
            ph = np.c_[p, np.ones(len(p))]
            moved = np.einsum("kab,kb->ka", skin[d["cols"]], ph[d["rows"]])[:, :3] * d["vals"][:, None]
            acc = np.zeros_like(p)
            np.add.at(acc, d["rows"], moved)
            result[m] = acc - d["pos"]
        return result

    def expand(self, recipe, strict=True):
        """Expand 'mouthFunnel*' to every CTRL_expressions.mouthFunnel<suffix> control.

        With strict=False, controls this DNA lacks are skipped with a warning instead of failing.
        """
        out = {}
        for key, v in recipe.items():
            if key.endswith("*"):
                stem = "CTRL_expressions." + key[:-1]
                hits = [n for n in self.controls if n.startswith(stem) and n[len(stem):] in ("L", "R", "UL", "UR", "DL", "DR")]
                if not hits:
                    raise KeyError(key)
                for n in hits:
                    out[n] = v
            else:
                n = "CTRL_expressions." + key
                if n not in self.index:
                    if strict:
                        raise KeyError(key)
                    print(f"WARNING: control {key} is not in this DNA; skipped")
                    continue
                out[n] = v
        return out


def dna_to_fbx(v):
    """DNA (x left, y up, z front, cm) -> FBX head object space (Z up, cm)."""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)


def build_map(obj, rig):
    """Map each FBX vertex to its DNA vertex per material slot; returns (fbx idx, mesh, dna idx)."""
    from mathutils.kdtree import KDTree

    me = obj.data
    slot = np.full(len(me.vertices), -1)
    for p in me.polygons:
        for vi in p.vertices:
            slot[vi] = p.material_index
    co = np.array([v.co[:] for v in me.vertices])
    mapping, worst = [], 0.0
    for s, m in SLOT_TO_MESH.items():
        pts = dna_to_fbx(rig.meshes[m]["pos"])
        tree = KDTree(len(pts))
        for i, p in enumerate(pts):
            tree.insert(p, i)
        tree.balance()
        fv = np.where(slot == s)[0]
        di = np.empty(len(fv), int)
        for k, vi in enumerate(fv):
            _, i, dist = tree.find(co[vi])
            di[k] = i
            worst = max(worst, dist)
        mapping.append((fv, m, di))
    return mapping, worst


def add_shape(obj, name, deltas, mapping):
    me = obj.data
    if not me.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    key = me.shape_keys.key_blocks.get(name) or obj.shape_key_add(name=name, from_mix=False)
    base = np.array([v.co[:] for v in me.vertices])
    co = base.copy()
    for fv, m, di in mapping:
        co[fv] += dna_to_fbx(deltas[m][di])
    key.data.foreach_set("co", co.ravel())
    key.value = 0.0
    return float(np.abs(co - base).max())
