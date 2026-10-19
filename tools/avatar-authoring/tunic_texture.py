"""Paints an original thuiszorg-style tunic texture onto MakeHuman's CC0 male_casualsuit06.

The garment's triangles are rasterized into UV space to get each texel's 3D position on the
fitted character. Details are then placed by body position (metres; character faces -Y,
wearer's left is +X), so the design does not depend on hand-picked UV coordinates.
Only MakeHuman's CC0 ambient-occlusion and denim luminance are reused, for fabric shading.
"""

import bpy
import numpy as np

WHITE = np.array([0.93, 0.935, 0.93])
TRIM_BLUE = np.array([0.50, 0.70, 0.86])
STITCH = np.array([0.74, 0.78, 0.82])
NAVY = np.array([0.075, 0.095, 0.17])
UNDERSHIRT_RED = np.array([0.72, 0.07, 0.09])

V_HALF_WIDTH = 0.062
V_DEPTH = 0.125
TRIM_WIDTH = 0.011
SLEEVE_TRIM_WIDTH = 0.016
STITCH_WIDTH = 0.0022
CHEST_POCKET = (0.055, 0.150, 1.255, 1.355)  # x0, x1, z0, z1 on the wearer's left chest
HIP_POCKETS = [(-0.160, -0.045, 0.952, 1.045), (0.045, 0.160, 0.952, 1.045)]


def _image_array(image, size):
    if tuple(image.size) != (size, size):
        image = image.copy()
        image.scale(size, size)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(size, size, 4)


def _rasterize(obj, size):
    """Returns per-texel position, normal, UV-region mask and coverage for the mesh."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    uv_layer = mesh.uv_layers.active.data
    co = _morphed_positions(obj)
    normals = np.array([v.normal for v in mesh.vertices])
    position = np.zeros((size, size, 3), dtype=np.float32)
    normal = np.zeros((size, size, 3), dtype=np.float32)
    covered = np.zeros((size, size), dtype=bool)
    for tri in mesh.loop_triangles:
        uv = np.array([uv_layer[i].uv for i in tri.loops]) * size - 0.5
        x0, y0 = np.floor(uv.min(axis=0)).astype(int)
        x1, y1 = np.ceil(uv.max(axis=0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = uv
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / det
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / det
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        weights = np.stack([w0, w1, w2], axis=-1)[inside]
        verts = list(tri.vertices)
        py, px = ys[inside], xs[inside]
        position[py, px] = weights @ co[verts]
        normal[py, px] = weights @ normals[verts]
        covered[py, px] = True
    return position, normal, covered


def _segment_distance(points, a, b):
    ab = b - a
    t = np.clip(((points - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(points - (a + t[..., None] * ab), axis=-1)


def _rect_outline(x, z, rect, width):
    x0, x1, z0, z1 = rect
    inside = (x > x0 - width) & (x < x1 + width) & (z > z0 - width) & (z < z1 + width)
    core = (x > x0 + width) & (x < x1 - width) & (z > z0 + width) & (z < z1 - width)
    return inside & ~core


def _dilate(colors, covered, iterations=8):
    filled = covered.copy()
    for _ in range(iterations):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted_fill = np.roll(filled, (dy, dx), axis=(0, 1))
            shifted = np.roll(colors, (dy, dx), axis=(0, 1))
            grow = shifted_fill & ~filled
            colors[grow] = shifted[grow]
            filled |= grow
    return colors


def _boundary_segments(obj, predicate):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    segments = [
        (np.array(e.verts[0].co), np.array(e.verts[1].co))
        for e in bm.edges
        if e.is_boundary and predicate(np.array(e.verts[0].co))
    ]
    bm.free()
    return segments


def _morphed_positions(obj):
    """Vertex positions including MPFB's macro/detail shape keys (vertex.co is the base mesh)."""
    keys = obj.data.shape_keys
    count = len(obj.data.vertices)
    positions = np.empty(count * 3, dtype=np.float64)
    if keys is None:
        obj.data.vertices.foreach_get("co", positions)
        return positions.reshape(-1, 3)
    basis = np.empty(count * 3, dtype=np.float64)
    keys.reference_key.data.foreach_get("co", basis)
    positions[:] = basis
    shape = np.empty(count * 3, dtype=np.float64)
    for key in keys.key_blocks:
        if key == keys.reference_key or key.value == 0 or key.mute:
            continue
        key.data.foreach_get("co", shape)
        positions += key.value * (shape - basis)
    return positions.reshape(-1, 3)


def paint_tunic(garment, *, diffuse, ambient_occlusion, size=2048):
    position, normal, covered = _rasterize(garment, size)
    x, y, z = position[..., 0], position[..., 1], position[..., 2]
    uv_v = (np.arange(size)[:, None] + 0.5) / size * np.ones((1, size))
    is_shirt = covered & (uv_v > 0.55)
    is_trousers = covered & ~is_shirt
    front = normal[..., 1] < -0.2

    ao = _image_array(ambient_occlusion, size)[..., :3].mean(axis=-1)
    base = _image_array(diffuse, size)[..., :3]
    fold_shading = (0.55 + 0.45 * ao)[..., None]

    colors = base.copy()
    tunic = is_shirt
    colors[tunic] = (WHITE * fold_shading)[tunic]

    denim_luma = base.mean(axis=-1)
    detail = np.clip(1 + 0.6 * (denim_luma - denim_luma[is_trousers].mean()), 0.75, 1.2)
    colors[is_trousers] = (NAVY * fold_shading * detail[..., None])[is_trousers]

    neck_center = np.array([0.0, 0.0, 1.512])
    apex = np.array([0.0, 1.512 - V_DEPTH])
    left_top = np.array([V_HALF_WIDTH, neck_center[2]])
    right_top = np.array([-V_HALF_WIDTH, neck_center[2]])
    xz = np.stack([x, z], axis=-1)
    v_distance = np.minimum(_segment_distance(xz, apex, left_top), _segment_distance(xz, apex, right_top))
    half_width_at_z = np.clip((z - apex[1]) / V_DEPTH, 0, None) * V_HALF_WIDTH
    in_v = is_shirt & front & (z > apex[1]) & (np.abs(x) < half_width_at_z)
    # A red undershirt shows through the V-neck.
    colors[in_v] = (UNDERSHIRT_RED * fold_shading)[in_v]
    v_trim = is_shirt & front & ~in_v & (v_distance < TRIM_WIDTH) & (z > apex[1] - TRIM_WIDTH)
    colors[v_trim] = (TRIM_BLUE * fold_shading)[v_trim]

    sleeve_segments = _boundary_segments(garment, lambda c: abs(c[0]) > 0.22 and 1.2 < c[2] < 1.45)
    sleeve = is_shirt & (np.abs(x) > 0.2)
    if sleeve_segments:
        points = position[sleeve]
        distance = np.min([_segment_distance(points, a, b) for a, b in sleeve_segments], axis=0)
        sleeve_trim = np.zeros_like(sleeve)
        sleeve_trim[sleeve] = distance < SLEEVE_TRIM_WIDTH
        colors[sleeve_trim] = (TRIM_BLUE * fold_shading)[sleeve_trim]

    on_tunic_front = tunic & front
    pocket_top = (
        on_tunic_front
        & (x > CHEST_POCKET[0]) & (x < CHEST_POCKET[1])
        & (np.abs(z - CHEST_POCKET[3]) < 0.005)
    )
    stitches = on_tunic_front & _rect_outline(x, z, CHEST_POCKET, STITCH_WIDTH)
    for rect in HIP_POCKETS:
        stitches |= on_tunic_front & _rect_outline(x, z, rect, STITCH_WIDTH)
        pocket_top |= on_tunic_front & (x > rect[0]) & (x < rect[1]) & (np.abs(z - rect[3]) < 0.004)
    colors[stitches] = (STITCH * fold_shading)[stitches]
    colors[pocket_top] = (TRIM_BLUE * fold_shading)[pocket_top]

    colors = _dilate(colors, covered)
    rgba = np.concatenate([np.clip(colors, 0, 1), np.ones((size, size, 1))], axis=-1)
    image = bpy.data.images.new("thuiszorg_tunic_diffuse", size, size, alpha=False)
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.pack()
    return image
