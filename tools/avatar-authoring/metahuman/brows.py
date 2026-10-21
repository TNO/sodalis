"""Wrap MetaHuman eyebrow cards onto a MetaHuman's skin and make them follow the face rig.

The cards ship in the template head space (same as the hair groom), so we
1. apply the hair's template->character similarity transform;
2. snap every card vertex onto the nearest skin triangle, BROW_LIFT above it;
3. give each vertex the barycentric blend of that triangle's skin weights and
   of every head shape-key delta, then join into the head mesh so brow raises,
   frowns and blinks carry the brows (Blender's join matches keys by name).
"""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

# Set by configure(); see build_metahuman.py for the config keys.
FBX = None  # eyebrow-card LOD0 FBX exported from Unreal
TEX = None  # baked RGBA brow texture (bake_card_textures.py)
NAME = "MetaHuman_Brows"
BROW_LIFT = 0.0006
# The scalp-based template fit can leave the brows above the brow ridge (Anna: ~8 mm,
# checked against the brow shading baked in her basecolor); move them down first.
BROW_OFFSET = np.array([0.0, 0.0, -0.006])
LID_MOTION = 0.001  # skin moving more than this in a blink is eyelid, not brow


def configure(cfg):
    """Override module settings from a config dict (keys are the upper-case names above)."""
    for k, v in cfg.items():
        if k not in globals() or not k.isupper():
            raise KeyError(f"unknown brow setting {k}")
        globals()[k] = np.array(v, float) if isinstance(v, list) else v


def import_cards():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=FBX)
    new = set(bpy.data.objects) - before
    cards = next(o for o in new if o.type == "MESH" and o.name.startswith("Eyebrows_"))
    for o in new - {cards}:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    cards.select_set(True)
    bpy.context.view_layer.objects.active = cards
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    uv = cards.data.uv_layers
    for layer in [l for l in uv if l.name != uv[0].name]:
        uv.remove(layer)
    return cards


def brow_material():
    m = bpy.data.materials.new(NAME)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(TEX)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    else:
        m.blend_method = "BLEND"
    m.use_backface_culling = False
    return m


def add_brows(head, s, t, skin_slot=0):
    """Join fitted eyebrow cards into `head` (call after all head shape keys are final)."""
    cards = import_cards()
    me = cards.data
    n = len(me.vertices)
    v = np.empty(n * 3)
    me.vertices.foreach_get("co", v)
    v = v.reshape(-1, 3) * s + t + BROW_OFFSET

    hm = head.data
    hm.calc_loop_triangles()
    inv = np.array(head.matrix_world.inverted())
    v = v @ inv[:3, :3].T + inv[:3, 3]  # into head local space
    basis = np.empty(len(hm.vertices) * 3)
    hm.vertices.foreach_get("co", basis)
    basis = basis.reshape(-1, 3)
    lid = np.zeros(len(basis), bool)
    for name in ("eyeBlinkLeft", "eyeBlinkRight"):
        co = np.empty(len(basis) * 3)
        hm.shape_keys.key_blocks[name].data.foreach_get("co", co)
        lid |= np.linalg.norm(co.reshape(-1, 3) - basis, axis=1) > LID_MOTION
    tris = [tuple(lt.vertices) for lt in hm.loop_triangles
            if lt.material_index == skin_slot and not lid[list(lt.vertices)].any()]
    bvh = BVHTree.FromPolygons([Vector(p) for p in basis], tris)

    tri_idx = np.empty((n, 3), np.int64)
    bary = np.empty((n, 3))
    out = np.empty((n, 3))
    dist = np.empty(n)
    # Project along the view axis (MetaHumans face -Y) so the template's frontal arch
    # survives; nearest-point snapping folds it over the curved brow ridge.
    fwd = Vector(inv[:3, :3] @ np.array([0.0, 1.0, 0.0])).normalized()
    hits = 0
    for i, p in enumerate(v):
        co, nrm, f, d = bvh.ray_cast(Vector(p) - fwd * 0.05, fwd, 0.1)
        if co is None:
            co, nrm, f, d = bvh.find_nearest(Vector(p))
        else:
            hits += 1
            d = (Vector(p) - co).length
        a, b, c = (Vector(basis[k]) for k in tris[f])
        tri_idx[i] = tris[f]
        w = barycentric_transform(co, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        bary[i] = np.clip(np.array(w), 0, 1)
        bary[i] /= bary[i].sum()
        out[i] = np.array(co + nrm * BROW_LIFT)
        dist[i] = d
    me.vertices.foreach_set("co", out.ravel())
    me.update()
    print(f"BROW_FIT verts={n} rayHits={hits} snap(mm) med={np.median(dist)*1000:.1f} p95={np.percentile(dist, 95)*1000:.1f}")

    # Skin weights.
    groups = {g.index: g.name for g in head.vertex_groups}
    wmat = {}
    for hv in hm.vertices:
        for ge in hv.groups:
            if ge.weight > 0:
                wmat.setdefault(ge.group, {})[hv.index] = ge.weight
    for gi, col in wmat.items():
        acc = np.zeros(n)
        for k in range(3):
            acc += bary[:, k] * np.array([col.get(j, 0.0) for j in tri_idx[:, k]])
        idx = np.nonzero(acc > 1e-4)[0]
        if len(idx) == 0:
            continue
        g = cards.vertex_groups.new(name=groups[gi])
        for j in idx:
            g.add([int(j)], float(acc[j]), "REPLACE")

    # Shape keys, transferred by barycentric delta.
    keys = hm.shape_keys.key_blocks
    cards.shape_key_add(name=keys[0].name, from_mix=False)
    for kb in keys[1:]:
        co = np.empty(len(hm.vertices) * 3)
        kb.data.foreach_get("co", co)
        delta = co.reshape(-1, 3) - basis
        bd = sum(bary[:, k, None] * delta[tri_idx[:, k]] for k in range(3))
        sk = cards.shape_key_add(name=kb.name, from_mix=False)
        sk.data.foreach_set("co", (out + bd).ravel())

    me.uv_layers[0].name = hm.uv_layers[0].name  # join merges UV layers by name
    me.materials.clear()
    me.materials.append(brow_material())
    cards.matrix_world = head.matrix_world.copy()
    bpy.ops.object.select_all(action="DESELECT")
    cards.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = head
    ngroups = len(cards.vertex_groups)
    bpy.ops.object.join()
    print(f"BROW_JOINED keys={len(keys) - 1} groups={ngroups}")
