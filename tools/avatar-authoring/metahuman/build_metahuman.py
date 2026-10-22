"""Convert a MetaHuman (Unreal DCC export + DNA) into a TalkingHead/Sodalis GLB.

    blender -b -noaudio --python-exit-code 1 --python build_metahuman.py -- \
        --config characters/anna.json [--out avatar.glb] [--blend avatar.blend]

Face motion is baked from the character's own RigLogic rig (rigbake.py): visemes from
visemes.json, ARKit shapes from arkit_mapping.json (make_arkit_mapping.py). Hair and brow
cards (hair.py, brows.py) and Unreal's glTF garments (add_metahuman_outfit.py) are optional.
See docs/avatar/metahuman-to-sodalis.md for the full workflow and the config keys.
"""
import json
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import rigbake  # noqa: E402
import hair  # noqa: E402
import brows  # noqa: E402
import add_metahuman_outfit  # noqa: E402
import build_avatar  # noqa: E402  (align_rest_frames, export_glb, cap_textures)

CFG = {}  # loaded config; see load_config()
MAPS = None
NAME = "MetaHuman"
LASH_ALPHA_GAIN = 1.8

SIDES = {"l": "Left", "r": "Right"}
FINGERS = {"thumb": "Thumb", "index": "Index", "middle": "Middle", "ring": "Ring", "pinky": "Pinky"}


def rpm_name(mh):
    fixed = {"pelvis": "Hips", "spine_01": "Spine", "spine_03": "Spine1", "spine_05": "Spine2",
             "neck_01": "Neck", "head": "Head"}
    if mh in fixed:
        return fixed[mh]
    parts = mh.split("_")
    if len(parts) == 2 and parts[1] in SIDES:
        side = SIDES[parts[1]]
        limb = {"clavicle": "Shoulder", "upperarm": "Arm", "lowerarm": "ForeArm", "hand": "Hand",
                "thigh": "UpLeg", "calf": "Leg", "foot": "Foot", "ball": "ToeBase"}.get(parts[0])
        return side + limb if limb else None
    if len(parts) == 3 and parts[0] in FINGERS and parts[1] in ("01", "02", "03") and parts[2] in SIDES:
        return f"{SIDES[parts[2]]}Hand{FINGERS[parts[0]]}{int(parts[1])}"
    return None


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    meshes = [o for o in new if o.type == "MESH"]
    lod0 = next(o for o in meshes if o.name.endswith("_LOD0"))
    for o in meshes:
        if o is not lod0:
            bpy.data.objects.remove(o)
    # Unreal FBX puts the armature under 0.01-scaled LOD-group empties; keep the
    # world transform but drop the empties so apply_scale bakes the real scale.
    bpy.context.view_layer.update()
    mw = arm.matrix_world.copy()
    arm.parent = None
    arm.matrix_world = mw
    for o in [o for o in bpy.data.objects if o not in before and o.type == "EMPTY"]:
        bpy.data.objects.remove(o)
    return arm, lod0


def apply_scale(arm, mesh):
    bpy.ops.object.select_all(action="DESELECT")
    for o in (arm, mesh):
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def remap_weights(obj, resolve):
    """Rebuild vertex groups, summing each source group into resolve(name) (None = drop)."""
    names = {g.index: g.name for g in obj.vertex_groups}
    target = {i: resolve(n) for i, n in names.items()}
    acc = {}
    for v in obj.data.vertices:
        for g in v.groups:
            t = target[g.group]
            if t and g.weight > 0:
                acc.setdefault(t, {}).setdefault(v.index, 0.0)
                acc[t][v.index] += g.weight
    obj.vertex_groups.clear()
    for t, weights in acc.items():
        grp = obj.vertex_groups.new(name=t)
        for vi, w in weights.items():
            grp.add([vi], w, "REPLACE")


def ancestor_resolver(arm, special=None):
    special = special or {}
    parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}

    def resolve(name):
        n = name
        while n:
            if n in special:
                return special[n]
            r = rpm_name(n)
            if r:
                return r
            n = parent.get(n)
        return "Hips"
    return resolve


def bake_face(head, rig):
    head.shape_key_clear()
    mapping, worst = rigbake.build_map(head, rig)
    assert worst < 1e-4, worst
    recipes = {}
    for p in CFG["recipes"]:
        recipes.update({k: v for k, v in json.load(open(p)).items() if not k.startswith("_")})
    for name, rec in recipes.items():
        if "with" in rec:  # corrective: shape(with) - shape(minus), e.g. ARKit mouthClose vs jawOpen
            a = rig.evaluate(rig.expand(rec["with"], strict=False))
            b = rig.evaluate(rig.expand(rec["minus"], strict=False))
            deltas = {m: a[m] - b[m] for m in a}
        else:
            controls = rig.expand(rec, strict=False) if not any(k.startswith("CTRL_") for k in rec) else rec
            deltas = rig.evaluate(controls)
        moved = rigbake.add_shape(head, name, deltas, mapping)
        if moved < 1e-3:
            raise RuntimeError(f"{name} produced an empty shape")
        print("SHAPE", name, round(moved, 3))


def drop_slots(obj, slots):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in slots], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def image(name, color):
    path = CFG.get("map_overrides", {}).get(name) or os.path.join(MAPS, name + ".png")
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return img


def material(name, base, normal=None, srmf=None, alpha=False, rough=None, flip_green=True, occlusion=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image(base, True)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if normal:
        nimg = image(normal, False)
        if flip_green:  # Unreal maps are DirectX-style; glTF expects OpenGL green.
            px = np.empty(nimg.size[0] * nimg.size[1] * 4, np.float32)
            nimg.pixels.foreach_get(px)
            px[1::4] = 1.0 - px[1::4]
            nimg.pixels.foreach_set(px)
            nimg.pack()
        nt_ = nt.nodes.new("ShaderNodeTexImage")
        nt_.image = nimg
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nt_.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if srmf:
        st = nt.nodes.new("ShaderNodeTexImage")
        st.image = image(srmf, False)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(st.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = rough if rough is not None else 0.5
    if occlusion:  # exported as the glTF occlusionTexture
        ot = nt.nodes.new("ShaderNodeTexImage")
        ot.image = image(occlusion, False)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(ot.outputs["Color"], sep.inputs["Color"])
        out = nt.nodes.new("ShaderNodeGroup")
        out.node_tree = gltf_output_group()
        nt.links.new(sep.outputs["Red"], out.inputs["Occlusion"])
    return m



def soften_lash_alpha(mat):
    """Thickens the 1-2 px lash strands and boosts their alpha so they survive mipmapping.

    The material stays alpha-blended (glTF BLEND): a cutoff loses mip-averaged strands and
    leaves clumps and specks, while blending keeps them as soft, thin lashes.
    """
    tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
    img = tex.image
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    a = px[:, :, 3].copy()
    p = np.pad(a, 1)
    grown = np.maximum.reduce([a, p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
    px[:, :, 3] = np.clip(grown * LASH_ALPHA_GAIN, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    print("LASH alpha mean", round(float(a.mean()), 4), "->", round(float(px[:, :, 3].mean()), 4))

def gltf_output_group():
    g = bpy.data.node_groups.get("glTF Settings")
    if g is None:
        g = bpy.data.node_groups.new("glTF Settings", "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def eye_occlusion_material(size=256):
    """Soft contact shadow for MetaHuman's eye-occlusion shell (slot 5).

    The shell's UVs run from the outer corner (u=0) to the inner corner (u=1), lower lid (v=0) to
    upper lid (v=1). Unreal shades it procedurally; this bakes a comparable mask into alpha.
    """
    u, v = np.meshgrid(np.linspace(0, 1, size), np.linspace(0, 1, size))

    def ramp(x, a, b):
        t = np.clip((x - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)

    corner = np.maximum(0.55 * ramp(u, 0.22, 0.0), 0.7 * ramp(u, 0.8, 1.0))
    upper = 0.6 * ramp(v, 0.55, 0.95)
    lower = 0.25 * ramp(v, 0.35, 0.05)
    alpha = 1 - (1 - corner) * (1 - upper) * (1 - lower)
    px = np.zeros((size, size, 4), np.float32)
    px[..., 0], px[..., 1], px[..., 2] = 0.05, 0.025, 0.02
    px[..., 3] = alpha
    img = bpy.data.images.new(NAME + "_EyeOcclusion", size, size, alpha=True)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new(NAME + "_EyeOcclusion")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    bsdf.inputs["Metallic"].default_value = 0.0
    m.blend_method = "BLEND"
    return m


# TalkingHead already lowers the lids with gaze (eyeBlink >= (eyesLookDown + browDown) / 2) and
# holds eyesLookDown near 0.3 for eye contact. MetaHuman's gaze poses carry full lid follow too, so
# together the lids droop ~8 mm at rest versus ~3 mm on RPM. Keep the eyeball rotation; damp skin.
LID_FOLLOW = 0.35


def soften_lid_follow(obj, eye_slot):
    eye_verts = {v for p in obj.data.polygons if p.material_index == eye_slot for v in p.vertices}
    skin = np.array([i not in eye_verts for i in range(len(obj.data.vertices))])
    base = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.shape_keys.key_blocks[0].data.foreach_get("co", base)
    base = base.reshape(-1, 3)
    for kb in obj.data.shape_keys.key_blocks:
        if not kb.name.startswith("eyeLook"):
            continue
        co = np.empty_like(base.ravel())
        kb.data.foreach_get("co", co)
        co = co.reshape(-1, 3)
        co[skin] = base[skin] + (co[skin] - base[skin]) * LID_FOLLOW
        kb.data.foreach_set("co", co.ravel())


# TalkingHead idles with eyeBlink ~0.1 plus some squint and downward gaze, lowering the upper lid
# ~2.5 mm on a ~10 mm opening, while MetaHuman's neutral already covers the top of the iris. Bake
# part of the character's own eyeWide pose into the rest shape, limited to the lids, so the eyes
# read open.
REST_LID_LIFT = 0.7


def open_rest_lids(obj):
    keys = obj.data.shape_keys.key_blocks
    n = len(obj.data.vertices)

    def co(name):
        a = np.empty(n * 3, np.float32)
        keys[name].data.foreach_get("co", a)
        return a.reshape(-1, 3)

    base = co(keys[0].name)
    lift = np.zeros_like(base)
    for side in ("Left", "Right"):
        blink = np.linalg.norm(co("eyeBlink" + side) - base, axis=1)
        weight = np.clip((blink - 0.0002) / 0.002, 0, 1)[:, None]
        lift += (co("eyeWide" + side) - base) * weight * REST_LID_LIFT
    # Blink keys keep their absolute closed pose, so a full blink still closes the lids.
    for kb in keys:
        if kb.name.startswith("eyeBlink"):
            continue
        c = co(kb.name) + lift
        kb.data.foreach_set("co", c.ravel())
    print("REST_LID_LIFT verts", int((np.linalg.norm(lift, axis=1) > 1e-4).sum()),
          "max mm", round(float(np.linalg.norm(lift, axis=1).max()) * 1000, 2))


def add_leaf(eb, name, parent, head, tail, deform=False):
    b = eb.new(name)
    b.head, b.tail, b.parent, b.use_deform = head, tail, eb[parent], deform
    return b


def rebuild_skeleton(arm, eye_centres, head_top):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for b in eb:
        b.use_connect = False
    keep = {b.name: rpm_name(b.name) for b in eb if rpm_name(b.name)}
    for b in list(eb):
        if b.name in keep:
            p = b.parent
            while p and p.name not in keep:
                p = p.parent
            b.parent = p
    for b in list(eb):
        if b.name not in keep:
            eb.remove(b)
    for old, new in keep.items():
        eb[old].name = new
    # Point limb bones at their child so tails match TalkingHead's expectations.
    for b in eb:
        kids = [c for c in b.children]
        if len(kids) == 1 and (kids[0].head - b.head).length > 1e-4:
            b.tail = kids[0].head.copy()
    for side in ("Left", "Right"):
        for f in FINGERS.values():
            b3 = eb[f"{side}Hand{f}3"]
            d = b3.tail - b3.head
            if d.length < 1e-4:
                d = b3.head - b3.parent.head
            add_leaf(eb, f"{side}Hand{f}4", b3.name, b3.head + d, b3.head + d * 1.5)
        toe = eb[f"{side}ToeBase"]
        tip = toe.head + Vector((0, -0.06, 0))
        toe.tail = tip
        add_leaf(eb, f"{side}Toe_End", toe.name, tip, tip + Vector((0, -0.02, 0)))
    head = eb["Head"]
    head.tail = head_top
    add_leaf(eb, "HeadTop_End", "Head", head_top, head_top + Vector((0, 0, 0.03)))
    for name, c in eye_centres.items():
        add_leaf(eb, name, "Head", c, c + Vector((0, -0.02, 0)), deform=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def load_config(path):
    """Read a character config; relative paths resolve against the config's folder."""
    global CFG, MAPS, NAME, LASH_ALPHA_GAIN, LID_FOLLOW, REST_LID_LIFT
    base = os.path.dirname(os.path.abspath(path))
    cfg = json.load(open(path))

    def resolve(p):
        return os.path.normpath(os.path.join(base, os.path.expanduser(p)))

    for key in ("head_fbx", "body_fbx", "dna", "maps"):
        cfg[key] = resolve(cfg[key])
    cfg["recipes"] = [resolve(p) for p in cfg.get("recipes", [os.path.join(HERE, "visemes.json")])]
    for section, keys in (("hair", ("FBX", "BASE", "SCALP_OUT")), ("brows", ("FBX", "TEX"))):
        for k in keys:
            if cfg.get(section) and k in cfg[section]:
                cfg[section][k] = resolve(cfg[section][k])
    if cfg.get("outfit"):
        cfg["outfit"]["glb"] = resolve(cfg["outfit"]["glb"])
    cfg["map_overrides"] = {k: resolve(v) for k, v in cfg.get("map_overrides", {}).items()
                            if not k.startswith("_")}
    missing = [p for p in [cfg["head_fbx"], cfg["body_fbx"], cfg["dna"], cfg["maps"], *cfg["recipes"],
                           *cfg["map_overrides"].values()]
               if not os.path.exists(p)]
    if missing:
        raise FileNotFoundError(f"config {path}: missing {missing}")
    face = cfg.get("face", {})
    CFG, MAPS, NAME = cfg, cfg["maps"], cfg["name"]
    LASH_ALPHA_GAIN = face.get("lash_alpha_gain", LASH_ALPHA_GAIN)
    LID_FOLLOW = face.get("lid_follow", LID_FOLLOW)
    REST_LID_LIFT = face.get("rest_lid_lift", REST_LID_LIFT)
    return cfg


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

    def arg(flag, default=None):
        return os.path.abspath(argv[argv.index(flag) + 1]) if flag in argv else default

    cfg = load_config(arg("--config") or sys.exit("usage: ... -- --config character.json [--out f.glb]"))
    out = arg("--out", os.path.abspath(cfg["id"] + ".glb"))
    blend = arg("--blend")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    head_arm, head = import_fbx(cfg["head_fbx"])
    rig = rigbake.Rig(cfg["dna"])
    bake_face(head, rig)  # before any topology change: mapping is by vertex index
    body_arm, body = import_fbx(cfg["body_fbx"])
    apply_scale(head_arm, head)
    apply_scale(body_arm, body)
    # Character faces -Y in Blender after FBX import, as with the MPFB pipeline.
    head_res = ancestor_resolver(head_arm, {"FACIAL_L_Eye": "LeftEye", "FACIAL_R_Eye": "RightEye"})
    remap_weights(head, head_res)
    remap_weights(body, ancestor_resolver(body_arm))

    # Hidden helper meshes (saliva, eyeEdge, cartilage) go; the eyeshell is kept as a soft
    # eye-occlusion layer.
    slot = rig.slot
    drop_slots(head, {slot("saliva"), slot("eyeEdge"), slot("cartilage")})
    occlusion = "Head_Occlusion" if os.path.exists(os.path.join(MAPS, "Head_Occlusion.png")) else None
    mats = [
        material(NAME + "_Head", "Head_Basecolor", "Head_Normal", "Head_SRMF", occlusion=occlusion),
        material(NAME + "_Teeth", "Teeth_Color", "Teeth_Normal", rough=0.35),
        material(NAME + "_Eyes", "Eyes_Color", "Eyes_Normal", rough=0.08),
        material(NAME + "_Eyelashes", "Eyelashes_Color", alpha=True, rough=0.7),
        eye_occlusion_material(),
    ]
    slot_mat = {slot("head"): 0, slot("teeth"): 1, slot("eyeLeft"): 2, slot("eyeRight"): 2,
                slot("eyelashes"): 3, slot("eyeshell"): 4}
    old = [slot_mat[p.material_index] for p in head.data.polygons]
    head.data.materials.clear()
    for m in mats:
        head.data.materials.append(m)
    head.data.polygons.foreach_set("material_index", old)
    soften_lid_follow(head, 2)
    open_rest_lids(head)
    soften_lash_alpha(mats[3])
    body.data.materials.clear()
    body.data.materials.append(material(NAME + "_Body", "Body_Basecolor", "Body_Normal", "Body_SRMF"))

    world = head.matrix_world
    eyes = {}
    for name in ("LeftEye", "RightEye"):
        pts = [world @ head.data.vertices[v].co for p in head.data.polygons if p.material_index == 2
               for v in p.vertices]
        side = [p for p in pts if (p.x > 0) == (name == "LeftEye")]
        lo = Vector([min(p[i] for p in side) for i in range(3)])
        hi = Vector([max(p[i] for p in side) for i in range(3)])
        eyes[name] = (lo + hi) / 2
    top = max((world @ v.co).z for v in head.data.vertices)
    head_top = Vector((0, eyes["LeftEye"].y + 0.02, top))

    # Move the head mesh onto the body skeleton; drop the face rig.
    head.parent = body_arm
    head.matrix_parent_inverse.identity()
    for mod in head.modifiers:
        if mod.type == "ARMATURE":
            mod.object = body_arm
    bpy.data.objects.remove(head_arm)

    rebuild_skeleton(body_arm, eyes, head_top)
    hair_s, hair_t = 1.0, np.zeros(3)
    if cfg.get("hair"):
        hair.configure({"NAME": NAME + "_Hair", **cfg["hair"]})
        _, hair_s, hair_t = hair.add_hair(head, body_arm, "Head")
    if cfg.get("brows"):
        if not cfg.get("hair"):
            raise ValueError("brows are placed with the hair's template fit; configure hair too")
        brows.configure({"NAME": NAME + "_Brows", **cfg["brows"]})
        brows.add_brows(head, hair_s, hair_t)
    body_arm.name = "Armature"  # TalkingHead resolves the model root by this name.
    body_arm.data.name = cfg["id"]
    head.name, body.name = NAME + "_Head", NAME + "_Body"
    build_avatar.align_rest_frames(body_arm, build_avatar.REST_FRAMES_PATH)
    bones = {b.name for b in body_arm.data.bones}
    for o in (head, body):
        stray = [g.name for g in o.vertex_groups if g.name not in bones]
        if stray:
            raise RuntimeError(f"{o.name}: groups without bones {stray}")
    if cfg.get("outfit"):
        add_metahuman_outfit.add_outfit(body_arm, body, head, cfg["outfit"]["glb"], cfg["outfit"]["garments"])
    build_avatar.cap_textures(cfg.get("texture_cap", 2048))
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    build_avatar.export_glb(body_arm, out, morph_normals=True, compact_morphs=True)
    print("METAHUMAN_EXPORTED", out, os.path.getsize(out))


main()
