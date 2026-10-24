"""Fit MetaHuman hair cards (template space) onto a MetaHuman head.

UE binds grooms to a character through a GroomBinding (RBF warp from the
template head); that binding is not exportable, so we approximate it:
1. root vertices = atlas root->tip channel (Attribute B) near 0;
2. similarity fit (uniform scale + translation) of roots onto the character's scalp
   with closest-point iterations;
3. push any vertex that ends up inside the head skin outward.
"""
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

# Set by configure(); see build_metahuman.py for the config keys.
FBX = None  # hair-card LOD0 FBX exported from Unreal
BASE = None  # baked RGBA hair texture (bake_card_textures.py)
SCALP_OUT = None  # where to write the scalp-tinted head basecolor
NAME = "MetaHuman_Hair"
CLEARANCE = 0.002


def world_verts(o):
    M = np.array(o.matrix_world)
    v = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get("co", v)
    return v.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def import_cards():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=FBX)
    new = set(bpy.data.objects) - before
    cards = next(o for o in new if o.name.startswith("Hair_") and o.type == "MESH")
    for o in new - {cards}:  # UCX_ collision hull
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    cards.select_set(True)
    bpy.context.view_layer.objects.active = cards
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return cards


def root_mask(cards, frac=None):
    """Per card (connected component): vertices in the top `frac` of its height.

    Card corners sit on transparent atlas texels, so the atlas root->tip
    channel cannot label them; for a hanging bob the root end is the top end.
    """
    frac = ROOT_FRAC if frac is None else frac
    me = cards.data
    n = len(me.vertices)
    parent = np.arange(n)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    ev = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", ev)
    for a, b in ev.reshape(-1, 2):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    comp = np.array([find(i) for i in range(n)])
    z = world_verts(cards)[:, 2]
    zmax = np.full(n, -np.inf)
    zmin = np.full(n, np.inf)
    np.maximum.at(zmax, comp, z)
    np.minimum.at(zmin, comp, z)
    hi, lo = zmax[comp], zmin[comp]
    print(f"HAIR_CARDS components={len(np.unique(comp))}")
    return z >= hi - frac * (hi - lo)


def root_mask_atlas(cards, attr_png):
    img = bpy.data.images.load(attr_png)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    b = px.reshape(h, w, 4)[:, :, 2]
    bpy.data.images.remove(img)
    me = cards.data
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    vi = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", vi)
    x = np.clip((uv[:, 0] % 1.0) * w, 0, w - 1).astype(int)
    y = np.clip((uv[:, 1] % 1.0) * h, 0, h - 1).astype(int)  # Blender pixels: row 0 = bottom = v 0
    val = np.ones(len(me.vertices))
    np.minimum.at(val, vi, b[y, x])
    return val < 0.12


def scalp(head):
    """Head skin (material 0) above the eyes as a point set + BVH of all skin."""
    v = world_verts(head)
    tris = [tuple(p.vertices) for p in head.data.polygons if p.material_index == 0]
    used = np.unique(np.concatenate([np.array(t) for t in tris]))
    bvh = BVHTree.FromPolygons([Vector(p) for p in v], tris)
    return v[used], bvh


def fit(roots, target, iters=40):
    kd = KDTree(len(target))
    for i, p in enumerate(target):
        kd.insert(p, i)
    kd.balance()
    s, t = 1.0, np.array([0.0, 0.0, target[:, 2].max() - roots[:, 2].max()])
    t[:2] = target[:, :2].mean(0) - roots[:, :2].mean(0)
    for _ in range(iters):
        p = roots * s + t
        q = np.array([kd.find(x)[0] for x in p])
        pc, qc = roots.mean(0), q.mean(0)
        a, b = roots - pc, q - qc
        s = float((a * b).sum() / (a * a).sum()) if FIT_SCALE is None else float(FIT_SCALE)
        t = qc - s * pc
    err = np.linalg.norm(roots * s + t - q, axis=1)
    return s, t, err


def push_out(v, bvh):
    pushed = 0
    for i, p in enumerate(v):
        co, n, _, _ = bvh.find_nearest(Vector(p))
        if co is None:
            continue
        d = (Vector(p) - co).dot(n)
        if d < CLEARANCE:
            v[i] = np.array(co + n * CLEARANCE)
            pushed += 1
    return pushed


def hair_material():
    m = bpy.data.materials.new(NAME)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(BASE)
    tex.image.colorspace_settings.name = "sRGB"
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    # Low cutoff keeps the cards full; alpha-to-coverage on stage smooths edges.
    gt.inputs[1].default_value = 0.15
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], gt.inputs[0])
    nt.links.new(gt.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    bsdf.inputs["Metallic"].default_value = 0.0
    m.use_backface_culling = False
    return m


# Per-groom tuning, overridable via configure(); defaults are Anna's bob.
HAIR_OFFSET = np.array([0.0, -0.003, -0.012])
# Volume: Unreal's groom binding keeps the layers standing off the skull, but our
# similarity fit leaves them hugging it. Spread each vertex away from the skin.
VOLUME_SIDE = 0.05
VOLUME_CROWN = 0.11
SCALP_MIN_Z_ABOVE_EYES = 0.015
SCALP_TINT = np.array([0x2a, 0x1c, 0x14]) / 255  # sRGB, dark-brown root colour
SCALP_STRENGTH = 0.85
# Share of each card's height treated as root. Long hair needs less: a large share
# reaches below the cranium and the fit shrinks the groom to pull it up.
ROOT_FRAC = 0.15
# None fits a uniform scale; a number fixes it (grooms are authored for their head).
FIT_SCALE = None


def configure(cfg):
    """Override module settings from a config dict (keys are the upper-case names above)."""
    for k, v in cfg.items():
        if k not in globals() or not k.isupper():
            raise KeyError(f"unknown hair setting {k}")
        globals()[k] = np.array(v, float) if isinstance(v, list) else v


def volumize(v, centre, top):
    """Smooth radial lift about the cranium centre: more at the crown, less at the tips."""
    r = v - centre
    h = np.clip((v[:, 2] - centre[2]) / max(top - centre[2], 1e-6), 0, 1)
    h = h * h * (3 - 2 * h)
    f = 1 + VOLUME_SIDE + (VOLUME_CROWN - VOLUME_SIDE) * h
    return centre + r * f[:, None]


def _blur(a, r):
    for axis in (0, 1):
        c = np.cumsum(np.pad(a, [(r + 1, r) if k == axis else (0, 0) for k in (0, 1)], mode="edge"), axis=axis)
        a = (np.take(c, range(2 * r + 1, c.shape[axis]), axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis)) / (2 * r + 1)
    return a


def tint_scalp(head, roots, out_path):
    """Paint hair colour on the skin under the hair roots so the scalp never shows through."""
    from mathutils.kdtree import KDTree as KD

    kd = KD(len(roots))
    for i, p in enumerate(roots):
        kd.insert(p, i)
    kd.balance()
    hv = world_verts(head)
    w = np.array([kd.find(p)[2] for p in hv])
    w = np.clip(1 - (w - 0.004) / 0.008, 0, 1)
    eyes_z = np.median(world_verts(head)[[p for poly in head.data.polygons if poly.material_index == 2 for p in poly.vertices]][:, 2])
    w *= np.clip((hv[:, 2] - eyes_z - SCALP_MIN_Z_ABOVE_EYES) / 0.015, 0, 1)
    # Fade on forward-facing skin (MetaHumans face -Y): the lifted fringe no longer covers
    # the hairline, so a full-strength tint reads as a painted band on the forehead.
    nrm = np.empty(len(head.data.vertices) * 3)
    head.data.vertices.foreach_get("normal", nrm)
    ny = (nrm.reshape(-1, 3) @ np.array(head.matrix_world.to_3x3()).T)[:, 1]
    w *= np.clip((ny + 0.75) / 0.5, 0.1, 1)

    mat = head.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = bsdf.inputs["Base Color"].links[0].from_node
    img = tex.image
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H, W, 4)

    me = head.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) * [W, H]
    mask = np.zeros((H, W), np.float32)
    for lt in me.loop_triangles:
        if lt.material_index != 0:
            continue
        ws = w[list(lt.vertices)]
        if ws.max() <= 0:
            continue
        t = uv[list(lt.loops)]
        x0, y0 = np.floor(t.min(0)).astype(int)
        x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        l3 = 1 - l1 - l2
        inside = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
        val = np.where(inside, l1 * ws[0] + l2 * ws[1] + l3 * ws[2], 0)
        sub = mask[y0:y1 + 1, x0:x1 + 1]
        np.maximum(sub, val, out=sub)
    mask = np.clip(_blur(_blur(mask, 6), 6), 0, 1) * SCALP_STRENGTH
    px[..., :3] = px[..., :3] * (1 - mask[..., None]) + SCALP_TINT * mask[..., None]
    out = bpy.data.images.new("Head_Basecolor_Scalp", W, H, alpha=True)
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()
    tex.image = out
    print(f"SCALP_TINT texels={(mask > 0.4).sum()} -> {out_path}")


def add_hair(head, armature=None, bone="Head"):
    bpy.context.view_layer.update()  # matrix_world is stale right after reparenting
    cards = import_cards()
    mask = root_mask(cards)
    v = world_verts(cards)
    target, bvh = scalp(head)
    top = target[:, 2].max()
    target = target[target[:, 2] > top - 0.13]  # cranium only
    s, t, err = fit(v[mask], target)
    # The similarity fit can land the hairline above the groom's bound position (Anna: ~1 cm,
    # judged against the MetaHuman Creator render); HAIR_OFFSET corrects it before pushing out.
    v = v * s + t + HAIR_OFFSET
    tint_scalp(head, v[mask], SCALP_OUT)
    centre = np.array([target[:, 0].mean(), target[:, 1].mean(), top - 0.10])
    v = volumize(v, centre, top)
    pushed = push_out(v, bvh)
    cards.data.vertices.foreach_set("co", v.ravel())
    cards.data.update()
    cards.data.materials.clear()
    cards.data.materials.append(hair_material())
    cards.name = NAME
    print(f"HAIR_FIT roots={int(mask.sum())} scale={s:.4f} t={np.round(t, 4)} "
          f"rootErr(mm) med={np.median(err)*1000:.1f} p95={np.percentile(err, 95)*1000:.1f} pushed={pushed}")
    if armature is not None:
        cards.parent = armature
        cards.matrix_parent_inverse = armature.matrix_world.inverted()
        g = cards.vertex_groups.new(name=bone)
        g.add(range(len(cards.data.vertices)), 1.0, "REPLACE")
        mod = cards.modifiers.new("Armature", "ARMATURE")
        mod.object = armature
    return cards, s, t
