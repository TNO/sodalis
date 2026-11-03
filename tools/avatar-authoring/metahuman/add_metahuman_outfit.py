"""Transfer garments from Unreal's glTF export of a MetaHuman onto the FBX/DNA-based rig.

Called by build_metahuman.py when the config has an "outfit" section. Only the listed garment
meshes and their materials/textures are kept; the GLB's skeletons, body, face and placeholder
materials are discarded. Unreal's glTF skin weights are unusable, so weights are re-transferred
from the FBX body and head, and body skin hidden under the garments is culled.
"""
import bpy
import numpy as np
from mathutils import Matrix, Vector

# Joints compared to fit the GLB onto the FBX rig (MetaHuman -> converted name).
FIT_JOINTS = {
    "pelvis": "Hips", "spine_03": "Spine1", "neck_01": "Neck", "head": "Head",
    "upperarm_l": "LeftArm", "upperarm_r": "RightArm", "hand_l": "LeftHand", "hand_r": "RightHand",
    "thigh_l": "LeftUpLeg", "thigh_r": "RightUpLeg", "foot_l": "LeftFoot", "foot_r": "RightFoot",
    "ball_l": "LeftToeBase", "ball_r": "RightToeBase",
}


def similarity(src, dst):
    """Umeyama fit dst ~= s R src + t."""
    src, dst = np.asarray(src), np.asarray(dst)
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, d, vt = np.linalg.svd(b.T @ a / len(src))
    sgn = np.diag([1, 1, np.sign(np.linalg.det(u @ vt))])
    r = u @ sgn @ vt
    s = (d * np.diag(sgn)).sum() / (a ** 2).sum(1).mean()
    t = md - s * r @ ms
    return s, r, t


def transfer_weights(obj, sources):
    """Nearest-surface barycentric copy of skin weights from whichever source mesh is closest.

    Sources are the body and the head (a MetaHuman head mesh runs down to the collarbones);
    they share rest space with the garments.
    """
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc

    data = []
    for src in sources:
        me = src.data
        me.calc_loop_triangles()
        verts = [v.co.copy() for v in me.vertices]
        tris = [tuple(t.vertices) for t in me.loop_triangles]
        names = {g.index: g.name for g in src.vertex_groups}
        vw = [{names[x.group]: x.weight for x in v.groups} for v in me.vertices]
        data.append((BVHTree.FromPolygons(verts, tris), verts, tris, vw))
    obj.vertex_groups.clear()
    groups = {}
    far = 0
    used = [0] * len(sources)
    for v in obj.data.vertices:
        hits = [(d[0].find_nearest(v.co), k) for k, d in enumerate(data)]
        (loc, _, ti, dist), k = min((h for h in hits if h[0][0] is not None), key=lambda h: h[0][3])
        used[k] += 1
        _, verts, tris, vw = data[k]
        far += dist > 0.05
        tri = tris[ti]
        bary = poly_3d_calc([verts[i] for i in tri], loc)
        acc = {}
        for i, b in zip(tri, bary):
            for n, w in vw[i].items():
                acc[n] = acc.get(n, 0.0) + w * b
        total = sum(acc.values())
        for n, w in acc.items():
            if w / total > 1e-3:
                g = groups.get(n) or groups.setdefault(n, obj.vertex_groups.new(name=n))
                g.add([v.index], w / total, "REPLACE")
    print("  weights:", obj.name, "groups", len(groups), "verts per source",
          dict(zip((s.name for s in sources), used)), "verts >5cm", far)


HIDE_MARGIN = 0.03  # keep body skin this close to exposed skin (hem, cuffs, collar, ankles)
HEAD_CLEARANCE = 0.003


def clear_skin(obj, skin, clearance=HEAD_CLEARANCE):
    """Push garment vertices to at least `clearance` outside a skin that is not culled."""
    from mathutils.bvhtree import BVHTree

    mw = skin.matrix_world
    skin.data.calc_loop_triangles()
    tree = BVHTree.FromPolygons([mw @ v.co for v in skin.data.vertices],
                                [t.vertices for t in skin.data.loop_triangles])
    moved = 0
    for v in obj.data.vertices:
        hit, normal, _, _ = tree.find_nearest(v.co, 0.02)
        if hit is None:
            continue
        depth = (v.co - hit).dot(normal)
        if depth < clearance:
            v.co += normal * (clearance - depth)
            moved += 1
    print(f"CLEAR {obj.name} moved {moved} verts off {skin.name}")


def cull_hidden_body(body, garments):
    """Delete body faces covered by garments at rest, as Unreal's hidden-surface removal does.

    Skin within HIDE_MARGIN of any uncovered body vertex is kept so openings never show gaps.
    """
    import bmesh
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree

    me = body.data
    trees = []
    for g in garments:
        g.data.calc_loop_triangles()
        trees.append(BVHTree.FromPolygons([v.co for v in g.data.vertices],
                                          [t.vertices for t in g.data.loop_triangles]))
    # Hidden skin looks out along its normal into the back of a garment within 15 cm, which
    # also catches loose fabric under the chest. Bare skin between garments, such as the belly
    # between hem and waistband, sees out and stays; so do hands facing the jeans' front.
    # Toes always go: they poke through shoes even at rest.
    groups = {g.index: g.name for g in body.vertex_groups}

    def toe(v):
        return v.groups and groups[max(v.groups, key=lambda x: x.weight).group].endswith("ToeBase")

    def inside(v):
        # Fabric within 3 cm along the normal covers the skin. Further out, only a garment's
        # back face counts (loose fabric under the chest), since the top's side normals vary.
        for t in trees:
            hit, n, _, dist = t.ray_cast(v.co + v.normal * 1e-4, v.normal, 0.15)
            if hit is not None and (dist < 0.03 or n.dot(v.normal) > 0):
                return True
            # Fabric touching the skin, or just under its surface, clips through it.
            if t.find_nearest(v.co, 0.01)[0] is not None:
                return True
            if t.ray_cast(v.co + v.normal * 1e-4, -v.normal, 0.015)[0] is not None:
                return True
        return False

    def hidden_skin(v):
        return toe(v) or inside(v)

    under = [hidden_skin(v) for v in me.vertices]
    exposed = [v.co for v in me.vertices if not under[v.index]]
    kd = KDTree(len(exposed))
    for i, p in enumerate(exposed):
        kd.insert(p, i)
    kd.balance()
    hidden = [under[v.index] and kd.find(v.co)[2] > HIDE_MARGIN for v in me.vertices]
    bm = bmesh.new()
    bm.from_mesh(me)
    faces = [f for f in bm.faces if all(hidden[v.index] for v in f.verts)]
    before = len(bm.faces)
    bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    print(f"CULL {body.name} removed {len(faces)} of {before} faces, {len(me.vertices)} verts remain")


TUCK_MARGIN = 0.02  # length of inner garment kept under the outer garment's edge
TUCK_CLEARANCE = 0.003


def tuck_under(inner, outer, margin=TUCK_MARGIN, clearance=TUCK_CLEARANCE):
    """Tuck `inner` (e.g. a blouse) into `outer` (e.g. jeans): cut what `outer` covers.

    Faces of `inner` that are covered by `outer` are deleted, except a `margin` strip next to
    the visible part so no gap opens at the edge. That strip is pushed `clearance` inside
    `outer`, so it cannot show through.
    """
    import bmesh
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree

    outer.data.calc_loop_triangles()
    tree = BVHTree.FromPolygons([v.co for v in outer.data.vertices],
                                [t.vertices for t in outer.data.loop_triangles])
    me = inner.data

    def covered(v):
        hit, _, _, dist = tree.ray_cast(v.co + v.normal * 1e-4, v.normal, 0.03)
        if hit is not None:
            return True
        if tree.find_nearest(v.co, 0.005)[0] is not None:
            return True
        # Inner fabric already outside the outer garment (the visible poke-through).
        return tree.ray_cast(v.co - v.normal * 1e-4, -v.normal, 0.015)[0] is not None

    under = [covered(v) for v in me.vertices]
    visible = [v.co for v in me.vertices if not under[v.index]]
    if not visible:
        raise RuntimeError(f"tuck: {outer.name} covers all of {inner.name}")
    kd = KDTree(len(visible))
    for i, p in enumerate(visible):
        kd.insert(p, i)
    kd.balance()
    cut = [under[v.index] and kd.find(v.co)[2] > margin for v in me.vertices]

    pushed = 0
    for v in me.vertices:
        if not under[v.index] or cut[v.index]:
            continue
        hit, normal, _, _ = tree.find_nearest(v.co, 0.05)
        if hit is None:
            continue
        depth = (v.co - hit).dot(normal)
        if depth > -clearance:
            v.co -= normal * (depth + clearance)
            pushed += 1

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    faces = [f for f in bm.faces if all(cut[v.index] for v in f.verts)]
    before = len(bm.faces)
    bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    print(f"TUCK {inner.name} into {outer.name}: removed {len(faces)} of {before} faces, "
          f"pushed {pushed} verts inside")


def add_outfit(rig, rig_body, rig_head, glb, garments_map, tuck=None):
    """Import `glb` and keep {GLB mesh object name: new object/material name} garments on `rig`.

    `tuck` maps an inner garment's new name to the outer garment it is tucked into.
    """
    assert rig.matrix_world == Matrix.Identity(4)
    before = set(bpy.data.objects)
    mats_before = set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    garments = {o.name: o for o in new if o.name in garments_map}
    if len(garments) != len(garments_map):
        raise RuntimeError(f"garments {sorted(garments_map)} not all in GLB meshes "
                           f"{sorted(o.name for o in new if o.type == 'MESH')}")
    src_arms = {g: next(m.object for m in o.modifiers if m.type == "ARMATURE") for g, o in garments.items()}

    # Fit: bone heads of the GLB outfit skeleton vs the converted FBX skeleton.
    gl_arm = src_arms[next(iter(garments_map))]
    gl = [gl_arm.matrix_world @ gl_arm.data.bones[k].head_local for k in FIT_JOINTS]
    fb = [rig.data.bones[v].head_local for v in FIT_JOINTS.values()]
    s, r, t = similarity(gl, fb)
    fit = Matrix.Translation(Vector(t)) @ (Matrix(r.tolist()) * s).to_4x4()
    fit[3][3] = 1.0
    resid = max(((fit @ a) - b).length for a, b in zip(gl, fb))
    print(f"FIT scale={s:.5f} rot_deg={np.degrees(np.arccos(np.clip((np.trace(r) - 1) / 2, -1, 1))):.3f} "
          f"t={np.round(t, 4).tolist()} max_joint_residual_mm={resid * 1000:.2f}")

    for gname, obj in garments.items():
        new_name = garments_map[gname]
        # Bind-pose geometry: undeformed vertices in world space, then fitted.
        mw = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(fit @ mw)
        # Unreal's glTF skin weights are corrupt (raw WEIGHTS_n bytes are small sequential
        # integers, left/right mixed), so weights come from the FBX body and head instead.
        transfer_weights(obj, [rig_body, rig_head])
        # The head reaches the collarbones and is never culled, so the top must sit clear of it.
        clear_skin(obj, rig_head)
        stray = [g.name for g in obj.vertex_groups if g.name not in rig.data.bones]
        assert not stray, stray
        for m in list(obj.modifiers):
            obj.modifiers.remove(m)
        obj.parent = rig
        obj.matrix_parent_inverse.identity()
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        obj.name = obj.data.name = new_name
        if len(obj.material_slots) != 1:
            raise RuntimeError(f"{gname}: expected one material, got {len(obj.material_slots)}")
        obj.material_slots[0].material.name = new_name
        print("GARMENT", new_name, "verts", len(obj.data.vertices), "groups", len(obj.vertex_groups))

    worn = [bpy.data.objects[v] for v in garments_map.values()]
    for inner, outer in (tuck or {}).items():
        tuck_under(bpy.data.objects[inner], bpy.data.objects[outer])
    cull_hidden_body(rig_body, worn)  # the head is not culled: it would open a gap inside the collar
    for o in new:
        if o.name not in set(garments_map.values()):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in [a for a in bpy.data.armatures if a.users == 0]:
        bpy.data.armatures.remove(a)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    for m in [m for m in bpy.data.materials if m not in mats_before and m.users == 0]:
        bpy.data.materials.remove(m)
    for im in [i for i in bpy.data.images if i.users == 0]:
        bpy.data.images.remove(im)
    for c in [c for c in bpy.data.collections if not c.objects and not c.children]:
        bpy.data.collections.remove(c)
    for im in bpy.data.images:
        if im.packed_file is None and im.source == "FILE" and not im.filepath:
            im.pack()
    print("OUTFIT materials", [m.name for m in bpy.data.materials if m.users])
    return worn
