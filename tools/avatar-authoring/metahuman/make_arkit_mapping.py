"""Convert Epic's MetaHuman ARKit pose asset (exported as T3D) into arkit_mapping.json.

In Unreal, find `PA_MetaHuman_ARKit_Mapping` (MetaHuman plugin content, "Show Plugin Content"),
right-click > Asset Actions > Export > .T3D. The pose asset stores, for each ARKit pose, the
values of the rig's `CTRL_expressions_*` curves. This writes each pose as additive control
weights relative to the asset's Default pose, in the recipe format build_metahuman.py bakes.

    python make_arkit_mapping.py PA_MetaHuman_ARKit_Mapping.T3D arkit_mapping.json

The output is derived from an Epic asset: keep it next to your MetaHuman sources, not in git.
"""
import json
import re
import sys

EPS = 1e-4
# ARKit's mouthClose is absent from Epic's asset; derive it as the usual corrective
# (jawOpen + lips together) - jawOpen using the rig's dedicated lips-together control.
MOUTH_CLOSE = {"with": {"jawOpen": 1.0, "mouthLipsTogether*": 1.0}, "minus": {"jawOpen": 1.0}}


def _paren_block(s, start):
    """Text inside the parenthesis opening at s[start]."""
    depth = 0
    for i in range(start, len(s)):
        depth += {"(": 1, ")": -1}.get(s[i], 0)
        if depth == 0:
            return s[start + 1:i]
    raise ValueError("unbalanced parentheses")


def parse(text):
    pc = text.index("PoseContainer=")
    names = re.findall(r'"([^"]*)"', _paren_block(text, text.index("PoseFNames=", pc) + len("PoseFNames=")))
    poses = [[float(x) for x in m.split(",")] for m in re.findall(r"(?<!Source)CurveData=\(([^)]*)\)", text)]
    curves = re.findall(r'CurveName="([^"]+)"', text)
    if len(poses) != len(names) or any(len(p) != len(curves) for p in poses):
        raise ValueError(f"{len(names)} poses, {len(poses)} curve rows, {len(curves)} curves: unexpected layout")
    return names, curves, poses


def to_recipes(names, curves, poses):
    default = poses[names.index("Default")]
    out = {}
    for name, values in zip(names, poses):
        if name == "Default" or re.fullmatch(r"Pose_\d+", name):
            continue
        arkit = name[0].lower() + name[1:]
        rec = {}
        for curve, v, d in zip(curves, values, default):
            # Other curves (blend-shape, wrinkle-map) are RigLogic outputs, not inputs.
            if curve.startswith("CTRL_expressions_") and abs(v - d) > EPS:
                rec[curve.removeprefix("CTRL_expressions_")] = round(v - d, 4)
        out[arkit] = rec
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    names, curves, poses = parse(open(src, encoding="utf-8", errors="replace").read())
    recipes = to_recipes(names, curves, poses)
    doc = {
        "_note": "ARKit poses from Epic's PA_MetaHuman_ARKit_Mapping (additive CTRL_expressions deltas vs. its "
                 "Default pose); unnamed Pose_N entries ignored; mouthClose derived; controls missing from a DNA are skipped at bake time. Derived from an Epic asset: "
                 "do not commit.",
        "_derived": ["mouthClose"],
    }
    doc.update(recipes)
    doc["mouthClose"] = MOUTH_CLOSE
    json.dump(doc, open(dst, "w"), indent=1)
    print(f"ARKIT_MAPPING poses={len(recipes) + 1} curves={len(curves)} -> {dst}")


if __name__ == "__main__":
    main()
