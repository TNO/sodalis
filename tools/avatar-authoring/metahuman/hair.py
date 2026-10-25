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
FBX = None  # hair-card LOD0 FBX exported from Unreal, or a list (one per card group)
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
    """Import each card-group FBX; returns one mesh object per group, not joined.

    Unreal does not export every group in the same frame (Odette: Group0 in groom
    template space, Group1 about 15 cm higher), so each group is fitted separately.
    """
    groups = []
    for path in FBX if isinstance(FBX, list) else [FBX]:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=path)
        new = set(bpy.data.objects) - before
        cards = next(o for o in new if o.name.startswith("Hair_") and o.type == "MESH")
        for o in new - {cards}:  # UCX_ collision hull
            bpy.data.objects.remove(o)
        bpy.ops.object.select_all(action="DESELECT")
        cards.select_set(True)
        bpy.context.view_layer.objects.active = cards
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # UV channel 0 holds the atlas UVs, but its name varies per export
        # (UVmap_0, or LightMapUV when no lightmap channel was exported).
        if groups and cards.data.uv_layers:
            cards.data.uv_layers[0].name = groups[0].data.uv_layers[0].name
        groups.append(cards)
    return groups


def join(groups):
    bpy.ops.object.select_all(action="DESELECT")
    for o in groups:
        o.select_set(True)
    bpy.context.view_layer.objects.active = groups[0]
    if len(groups) > 1:
        bpy.ops.object.join()
    return groups[0]


def components(cards):
    """Card index (connected component root) per vertex."""
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
    return np.array([find(i) for i in range(n)])


def root_mask(cards, frac=None):
    """Per card (connected component): vertices in the top `frac` of its height.

    Card corners sit on transparent atlas texels, so the atlas root->tip
    channel cannot label them; for a hanging bob the root end is the top end.
    """
    frac = ROOT_FRAC if frac is None else frac
    n = len(cards.data.vertices)
    comp = components(cards)
    z = world_verts(cards)[:, 2]
    zmax = np.full(n, -np.inf)
    zmin = np.full(n, np.inf)
    np.maximum.at(zmax, comp, z)
    np.minimum.at(zmin, comp, z)
    hi, lo = zmax[comp], zmin[comp]
    print(f"HAIR_CARDS components={len(np.unique(comp))}")
    return z >= hi - frac * (hi - lo)


def back_fill(cards, v, mask, centre, bvh):
    """Cover a bare back of the head with rotated copies of the side curtains.

    Some grooms export their back cards in a separate group; without it the
    back of the scalp is bare. Long cards whose tips hang beside the face are
    copied and rotated about the vertical axis through `centre`, towards the
    back, by each angle in BACK_FILL (degrees). The skull is deeper than it
    is wide, so each copied vertex is then moved out along the ray from
    `centre` by the difference in skull radius, keeping its stand-off. Returns the new v,
    mask and a copy flag per vertex.
    """
    def skin_along(p):
        d = Vector(p - centre)
        hit = bvh.ray_cast(Vector(centre), d.normalized(), 1.0)[0]
        return None if hit is None else (hit - Vector(centre)).length

    comp = components(cards)
    n = len(v)
    tip = np.full(n, np.inf)
    np.minimum.at(tip, comp, v[:, 2])
    side = np.zeros(n)
    low = v[:, 2] <= tip[comp] + 0.03
    np.add.at(side, comp[low], v[low, 0] - centre[0])
    cnt = np.zeros(n)
    np.add.at(cnt, comp[low], 1)
    side = np.divide(side, cnt, out=np.zeros(n), where=cnt > 0)[comp]
    long_card = tip[comp] < centre[2] - 0.08
    pick = long_card & (np.abs(side) > BACK_FILL_MIN_SIDE)

    cards.data.vertices.foreach_set("co", v.ravel())
    bm = bmesh.new()
    bm.from_mesh(cards.data)
    bm.verts.ensure_lookup_table()
    faces = [f for f in bm.faces if all(pick[x.index] for x in f.verts)]
    v_out, m_out = [v], [mask]
    for deg in BACK_FILL:
        dup = bmesh.ops.duplicate(bm, geom=faces)
        vmap = dup["vert_map"]
        bm.verts.index_update()
        src = [a for a in vmap if a.index < n]
        idx = np.array([a.index for a in src])
        a = np.radians(deg) * np.sign(side[idx])  # MetaHumans face -y: turn each side towards +y
        p = v[idx] - centre
        x = p[:, 0] * np.cos(a) - p[:, 1] * np.sin(a)
        y = p[:, 0] * np.sin(a) + p[:, 1] * np.cos(a)
        q = np.column_stack([x, y, p[:, 2]]) + centre
        for j, i in enumerate(idx):
            r_new, r_old = skin_along(q[j]), skin_along(v[i])
            if r_new is not None and r_old is not None:
                out = (q[j] - centre) / np.linalg.norm(q[j] - centre)
                q[j] += out * np.clip(r_new - r_old, 0.0, 0.05)
        for s, co in zip(src, q):
            vmap[s].co = Vector(co)
        new_idx = np.array([vmap[s].index for s in src])
        add = np.zeros((len(bm.verts) - sum(len(x) for x in v_out), 3))
        madd = np.zeros(len(add), bool)
        off = sum(len(x) for x in v_out)
        add[new_idx - off] = q
        madd[new_idx - off] = mask[idx]
        v_out.append(add)
        m_out.append(madd)
    bm.to_mesh(cards.data)
    bm.free()
    cards.data.update()
    print(f"HAIR_BACK_FILL cards={len(np.unique(comp[pick]))} angles={[float(a) for a in BACK_FILL]} "
          f"verts {n} -> {sum(len(x) for x in v_out)}")
    copied = np.arange(sum(len(x) for x in v_out)) >= n
    return np.concatenate(v_out), np.concatenate(m_out), copied


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
# Degrees to rotate copies of the side curtains towards the back, for grooms whose
# back cards were not exported (see back_fill). None disables it.
BACK_FILL = None
BACK_FILL_MIN_SIDE = 0.06  # m from the head's mid-plane for a card to count as a side curtain
# Long hair: Unreal's groom physics lays the cards over the shoulders, but our rigid
# cards hang straight down into them. drape() slides each card's clipping part
# forward or back over the clothing and skins it to DRAPE_BONE. Off by default.
DRAPE = False
DRAPE_BONE = "Spine2"
DRAPE_BLEND = 0.06  # m above the shoulder line over which skinning blends Head -> DRAPE_BONE
DRAPE_CLEARANCE = 0.012  # m from the body: room for the clothing worn over it
DRAPE_BEND = 0.04  # m above a contact over which a card starts to bend away
# Share of a card's front-to-back slope below the pivot (m above the shoulder line)
# to remove, so locks authored sweeping back hang straight as under gravity.
DRAPE_STRAIGHTEN = 0.0
DRAPE_PIVOT = 0.12
DRAPE_FRONT_ROOT = None  # m (y): cards rooted ahead of this are straightened and laid in front; None = judge by tip
# [|x|, y] m: cards rooted this close to the parting must be rooted ahead of y, else they hang behind the neck
DRAPE_FRONT_PART = None
DRAPE_LEAN = 0.0
DRAPE_SIM_FRAMES = 0  # cloth-simulate the draped hair against body and clothes; 0 = off
DRAPE_SIM_PIN = [0.03, 0.10]  # m above the shoulder line: free below the first, pinned above the second
DRAPE_SIM_BEND = 0.5  # stiffness (0-1) of the across-vertex constraints that keep cards from folding
DRAPE_SIM_ITERS = 8
DRAPE_SIM_COMB_TO = 0.08  # m ahead of the shoulder ridge where combing stops
DRAPE_SIM_STRAIGHT = 0.2  # 0-1: how much each strand segment follows the one above it
DRAPE_SIM_COMB = 3.0  # m/s^2 forward on the locks drape() lays in front, as if combed there
DRAPE_SIM_COMB_BACK = 0.0  # m/s^2 backward on the other locks, so they fall down the back, not onto the shoulders
DRAPE_SIM_SLIDE = None  # m a lock may slide towards the mid-plane, so side locks can't wrap round the neck
DRAPE_SIM_BACK = True  # simulate the back hair too; False keeps it as drape() left it
DRAPE_SIM_DAMP = 0.85  # velocity kept per frame
DRAPE_SIM_RES = 0.008  # m: body distance-field lattice
DRAPE_FRONT = 0.0  # m behind the shoulder ridge a straightened tip may land and still fall in front


def configure(cfg):
    """Override module settings from a config dict (keys are the upper-case names above)."""
    for k, v in cfg.items():
        if k not in globals() or not k.isupper():
            raise KeyError(f"unknown hair setting {k}")
        globals()[k] = np.array(v, float) if isinstance(v, list) and k != "FBX" else v


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
    groups = import_cards()
    target, bvh = scalp(head)
    top = target[:, 2].max()
    target = target[target[:, 2] > top - 0.13]  # cranium only
    fits, errs = [], []
    for g in groups:
        gv = world_verts(g)
        gs, gt, gerr = fit(gv[root_mask(g)], target)
        if len(groups) > 1:
            print(f"HAIR_GROUP {g.name} scale={gs:.4f} t={np.round(gt, 4)} "
                  f"rootErr(mm) med={np.median(gerr)*1000:.1f}")
        if fits:  # move later groups into the first group's frame
            s0, t0 = fits[0]
            g.data.vertices.foreach_set("co", ((gv * gs + gt - t0) / s0).ravel())
        fits.append((gs, gt))
        errs.append(gerr)
    # The first group shares the brow cards' (template) frame; the brows reuse its fit.
    s, t = fits[0]
    err = np.concatenate(errs)
    cards = join(groups)
    mask = root_mask(cards)
    # The similarity fit can land the hairline above the groom's bound position (Anna: ~1 cm,
    # judged against the MetaHuman Creator render); HAIR_OFFSET corrects it before pushing out.
    v = world_verts(cards) * s + t + HAIR_OFFSET
    centre = np.array([target[:, 0].mean(), target[:, 1].mean(), top - 0.10])
    tint_at = v[mask]
    if BACK_FILL is not None and len(BACK_FILL):
        v, mask, _ = back_fill(cards, v, mask, centre, bvh)
        # The copies hang from the parting, so their roots don't reach the back of
        # the scalp: tint the back half of the cranium as well.
        tint_at = np.concatenate([tint_at, target[target[:, 1] > centre[1]]])
    tint_scalp(head, tint_at, SCALP_OUT)
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


def _exit_distance(bvhs, p, d):
    """Distance along d to leave every collider p is inside (odd hit count), or 0."""
    far = 0.0
    for bvh in bvhs:
        hits, o, t = 0, Vector(p), 0.0
        last = 0.0
        while True:
            co, _, _, dist = bvh.ray_cast(o, d, 1.0)
            if co is None:
                break
            hits += 1
            t += dist + 1e-4
            last = t
            o = co + d * 1e-4
        if hits % 2:
            far = max(far, last)
    return far


def drape(cards, body):
    """Slide hair that hangs into the shoulders over them (see DRAPE).

    Runs before the outfit is added: the body is closed there, so a ray's hit
    count tells inside from outside; garments have inner and outer layers.
    """
    v = world_verts(cards)
    bv = world_verts(body)
    bvh = BVHTree.FromPolygons([tuple(p) for p in bv], [tuple(f.vertices) for f in body.data.polygons])
    # Shoulder line: the body's top 12 cm beside the mid-plane; its y splits front from back.
    band = bv[(np.abs(np.abs(bv[:, 0]) - 0.12) < 0.01) & (bv[:, 2] < v[:, 2].max() - 0.2)]
    ridge = band[band[:, 2].argmax()]
    comp = components(cards)
    pivot = ridge[2] + DRAPE_PIVOT
    moved = 0
    _DRAPED["ridge"], _DRAPED["front"] = ridge, np.zeros(len(v), bool)
    if DRAPE_SIM_FRAMES:
        hang = v[v[:, 2] < ridge[2] + DRAPE_SIM_PIN[1] + 0.02]
        _DRAPED["sdf"] = _body_sdf(body, hang.min(0) - 0.08, hang.max(0) + 0.08)
    for c in np.unique(comp):
        idx = np.flatnonzero(comp == c)
        if v[idx, 2].min() > ridge[2] + 0.04:
            continue
        below = idx[v[idx, 2] < pivot]
        tip = idx[v[idx, 2].argmin()]
        # Locks rooted ahead of DRAPE_FRONT_ROOT fall in front however far the groom sweeps them back.
        if DRAPE_FRONT_ROOT is None:
            yp = v[idx[np.argmin(np.abs(v[idx, 2] - pivot))], 1]
            forward = v[tip, 1] - DRAPE_STRAIGHTEN * (v[tip, 1] - yp) < ridge[1] + DRAPE_FRONT
        else:
            root = v[idx[v[idx, 2].argmax()]]
            forward = root[1] < DRAPE_FRONT_ROOT
            if DRAPE_FRONT_PART is not None and abs(root[0]) < DRAPE_FRONT_PART[0]:
                forward = root[1] < DRAPE_FRONT_PART[1]
        if DRAPE_STRAIGHTEN and len(below) and len(below) < len(idx):
            yp = v[idx[np.argmin(np.abs(v[idx, 2] - pivot))], 1]
            # Ease in below the pivot so the card bends rather than kinks.
            e = np.clip((pivot - v[below, 2]) / 0.05, 0, 1)
            # Forward locks straighten towards a line leaning DRAPE_LEAN (dy/dz) forward from the pivot.
            target = yp - (DRAPE_LEAN if forward else 0.0) * (pivot - v[below, 2])
            dy = DRAPE_STRAIGHTEN * e * (v[below, 1] - target)
            # Only locks that then fall in front: the back hair rests on the back as authored.
            if forward:
                v[below, 1] -= dy
        if DRAPE_FRONT_ROOT is None:
            forward = v[tip, 1] < ridge[1] + DRAPE_FRONT
        sgn = -1.0 if forward else 1.0
        _DRAPED["front"][idx] = sgn < 0
        d = Vector((0, sgn, 0))
        # Probe slightly inset so hair just outside the body still gets clearance.
        need = np.array([_exit_distance([bvh], v[i] - np.array(d) * DRAPE_CLEARANCE, d) for i in idx])
        need = np.where(need > 0, need, 0)
        if not need.any():
            continue
        # Each contact bends the card from DRAPE_BEND above it down to the tip.
        dz = v[idx, 2][:, None] - v[idx, 2][None, :]  # row: moved vertex, col: contact
        f = np.where(dz <= 0, 1.0, np.clip(1 - dz / DRAPE_BEND, 0, 1) ** 2)
        v[idx, 1] += sgn * (f * need[None, :]).max(1)
        moved += 1
    _set_world_verts(cards, v)
    _skin_drape(cards, v)
    print(f"HAIR_DRAPE cards={moved} shoulder z={ridge[2]:.3f} y={ridge[1]:.3f} lowest z={v[:, 2].min():.3f}")


_DRAPED = {}


def _set_world_verts(o, v):
    M = np.array(o.matrix_world)
    local = (v - M[:3, 3]) @ np.linalg.inv(M[:3, :3]).T
    o.data.vertices.foreach_set("co", local.ravel())
    o.data.update()


def _body_sdf(body, lo, hi):
    """Signed distance grid (negative inside) of the closed body, on a DRAPE_SIM_RES lattice."""
    bv = world_verts(body)
    bvh = BVHTree.FromPolygons([tuple(p) for p in bv], [tuple(f.vertices) for f in body.data.polygons])
    axes = [np.arange(lo[k], hi[k] + DRAPE_SIM_RES, DRAPE_SIM_RES) for k in range(3)]
    g = np.stack(np.meshgrid(*axes, indexing="ij"), -1).reshape(-1, 3)
    d = Vector((1.0, 0.0123, 0.0071)).normalized()  # skewed so rays rarely graze edges
    sdf = np.empty(len(g))
    for n, p in enumerate(g):
        q = Vector(p)
        sdf[n] = bvh.find_nearest(q)[3]
        hits = 0
        while True:
            h = bvh.ray_cast(q, d)
            if h[0] is None:
                break
            hits += 1
            q = h[0] + d * 1e-5
        if hits % 2:
            sdf[n] = -sdf[n]
    return np.array(lo, float), sdf.reshape([len(a) for a in axes])


def _trilinear(grid, origin, p):
    """Sample grid at points p (clamped to the grid)."""
    f = (p - origin) / DRAPE_SIM_RES
    hi = np.array(grid.shape) - 1.001
    f = np.clip(f, 0, hi)
    i = f.astype(int)
    t = f - i
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                out = out + w * grid[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz]
    return out


def simulate(cards, garments):
    """Let the hair below the head settle onto the body and clothes (position-based dynamics).

    Unreal drapes the groom with physics; this bakes one settled frame of it. The
    collider is the closed body's signed distance (sampled in drape(), before the
    outfit culls it), raised locally by how far the garments stand off the body.
    A distance field pushes hair out from any depth, which a cloth solver cannot.
    """
    origin, sdf = _DRAPED["sdf"]
    gb = [world_verts(o) for o in garments]
    gv = np.concatenate(gb) if gb else np.zeros((0, 3))
    # Garment stand-off per grid node: the body distance of the outermost garment vertex nearby.
    axes = [origin[k] + DRAPE_SIM_RES * np.arange(sdf.shape[k]) for k in range(3)]
    nodes = np.stack(np.meshgrid(*axes, indexing="ij"), -1).reshape(-1, 3)
    off = np.zeros(len(nodes))
    if len(gv):
        kd = KDTree(len(gv))
        for n, p in enumerate(gv):
            kd.insert(p, n)
        kd.balance()
        gd = np.clip(_trilinear(sdf, origin, gv), 0, 0.06)
        for n, p in enumerate(nodes):
            if abs(sdf.flat[n]) < 0.08:
                _, k, dist = kd.find(p)
                if dist < 0.04:
                    off[n] = gd[k]
    off = off.reshape(sdf.shape)
    for ax in range(3):  # smooth out folds so hair rests on the garment's overall shape
        off = (np.roll(off, 1, ax) + off + np.roll(off, -1, ax)) / 3
    field = sdf - off - DRAPE_CLEARANCE
    grad = np.stack(np.gradient(field, DRAPE_SIM_RES), -1)

    x0 = world_verts(cards)
    lo = _DRAPED["ridge"][2] + DRAPE_SIM_PIN[0]
    w = np.clip((x0[:, 2] - lo) / (DRAPE_SIM_PIN[1] - DRAPE_SIM_PIN[0]), 0, 1)
    pin = w * w * (3 - 2 * w)
    if not DRAPE_SIM_BACK:
        pin[~_DRAPED["front"]] = 1.0
    free = pin < 1
    e = np.array([ed.vertices[:] for ed in cards.data.edges])
    nb = [[] for _ in range(len(x0))]
    for a, b in e:
        nb[a].append(b)
        nb[b].append(a)
    bend = np.array([(a, c) for b in range(len(x0)) for k, a in enumerate(nb[b]) for c in nb[b][k + 1:]])
    cons = [(e, np.linalg.norm(x0[e[:, 0]] - x0[e[:, 1]], axis=1), 1.0)]
    if len(bend):
        cons.append((bend, np.linalg.norm(x0[bend[:, 0]] - x0[bend[:, 1]], axis=1), DRAPE_SIM_BEND))
    # Follow-the-leader: every vertex keeps its rest distance to a parent one hop nearer the root.
    comp = components(cards)
    anchor = pin > 0.5
    for c in np.unique(comp[~anchor]):
        m = np.flatnonzero(comp == c)
        if not anchor[m].any():
            top = m[x0[m, 2].argmax()]
            anchor[top], pin[top] = True, 1.0
    depth = np.where(anchor, 0, -1)
    parent = np.full(len(x0), -1)
    front = list(np.flatnonzero(anchor))
    levels = []
    while front:
        nxt = []
        for a in front:
            for b in nb[a]:
                if depth[b] < 0:
                    depth[b] = depth[a] + 1
                    nxt.append(b)
        for b in nxt:
            ps = [a for a in nb[b] if depth[a] == depth[b] - 1]
            parent[b] = min(ps, key=lambda a: np.linalg.norm(x0[a] - x0[b]))
        if nxt:
            levels.append(np.array(nxt))
        front = nxt
    seg = [np.linalg.norm(x0[l] - x0[parent[l]], axis=1)[:, None] for l in levels]

    gp = [np.where(parent[parent[l]] >= 0, parent[parent[l]], parent[l]) for l in levels]

    def ftl(p, straight=0.0):
        for l, r, g in zip(levels, seg, gp):
            d = p[l] - p[parent[l]]
            d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
            # Strand stiffness: lean each segment towards its parent's direction.
            dp = p[parent[l]] - p[g]
            n = np.linalg.norm(dp, axis=1, keepdims=True)
            d = np.where(n > 1e-6, (1 - straight) * d + straight * dp / (n + 1e-9), d)
            p[l] = p[parent[l]] + d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9) * r

    side = np.sign(x0[:, 0])
    inner = np.maximum(np.abs(x0[:, 0]) - (DRAPE_SIM_SLIDE or 0), 0)

    def keep_side(p):
        if DRAPE_SIM_SLIDE is not None:
            p[:, 0] = side * np.maximum(side * p[:, 0], inner)

    x = x0.copy()
    vel = np.zeros_like(x)
    dt, gvec = 1 / 60, np.array([0, 0, -9.81])
    n = len(x)
    comb = np.zeros_like(x)
    back = ~_DRAPED["front"] & free
    comb[_DRAPED["front"] & free, 1] = -DRAPE_SIM_COMB
    comb[back, 1] = DRAPE_SIM_COMB_BACK
    for _ in range(DRAPE_SIM_FRAMES):
        vel[free] += gvec * dt
        # Comb only over the shoulders; below them gravity lays the locks down the chest.
        # and only until a lock is in front of the shoulders.
        over = (x[:, 2] > _DRAPED["ridge"][2] - 0.02) & np.where(
            back, x[:, 1] < _DRAPED["ridge"][1] + DRAPE_SIM_COMB_TO, x[:, 1] > _DRAPED["ridge"][1] - DRAPE_SIM_COMB_TO
        )
        vel += comb * over[:, None] * dt
        p = x + vel * dt
        for _ in range(DRAPE_SIM_ITERS):
            for idx, rest, k in cons:
                d = p[idx[:, 1]] - p[idx[:, 0]]
                ln = np.linalg.norm(d, axis=1) + 1e-9
                c = (k * 0.5 * (ln - rest) / ln)[:, None] * d
                acc = np.zeros((n, 3))
                cnt = np.bincount(idx.ravel(), minlength=n)[:, None] + 1e-9
                for ax in range(3):
                    acc[:, ax] += np.bincount(idx[:, 0], c[:, ax], n) - np.bincount(idx[:, 1], c[:, ax], n)
                p += acc / cnt * (1 - pin)[:, None]
            f = _trilinear(field, origin, p)
            hit = f < 0
            if hit.any():
                g = np.stack([_trilinear(grad[..., k], origin, p[hit]) for k in range(3)], 1)
                g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-9
                p[hit] -= g * f[hit, None] * (1 - pin[hit])[:, None]
            keep_side(p)
            p = p * (1 - pin)[:, None] + x0 * pin[:, None]
            ftl(p)
        ftl(p, DRAPE_SIM_STRAIGHT)
        keep_side(p)
        f = _trilinear(field, origin, p)
        hit = (f < 0) & free
        if hit.any():
            g = np.stack([_trilinear(grad[..., k], origin, p[hit]) for k in range(3)], 1)
            g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-9
            p[hit] -= g * f[hit, None]
        vel = (p - x) / dt * DRAPE_SIM_DAMP
        x = p
    inside = (_trilinear(field, origin, x) < -0.002) & free
    print(f"HAIR_SIM frames={DRAPE_SIM_FRAMES} moved max={np.linalg.norm(x - x0, axis=1).max():.3f} "
          f"inside={inside.sum()}/{free.sum()} lowest z={x[:, 2].min():.3f}")
    _set_world_verts(cards, x)
    _skin_drape(cards, x)


def _skin_drape(cards, v):
    """Hair below the shoulders follows DRAPE_BONE, blending into Head above."""
    w = np.clip((v[:, 2] - _DRAPED["ridge"][2]) / DRAPE_BLEND, 0, 1)
    w = w * w * (3 - 2 * w)
    head = cards.vertex_groups["Head"]
    low = cards.vertex_groups.get(DRAPE_BONE) or cards.vertex_groups.new(name=DRAPE_BONE)
    for i, wi in enumerate(w):
        head.add([i], float(wi), "REPLACE")
        if wi < 1:
            low.add([i], float(1 - wi), "REPLACE")
        else:
            low.remove([i])
