"""Bake an RGBA colour+alpha texture for MetaHuman hair or eyebrow cards.

Unreal shades groom cards procedurally from the `*_CardsAtlas_Attribute.PNG` atlas
(R = coverage, G = per-strand seed, B = root->tip), so the export has no colour map.
This bakes one: a root->tip colour gradient varied per strand, alpha from coverage.

    python bake_card_textures.py hair  ATTRIBUTE.PNG OUT.png [--root 1a100a --tip 4f3423 --gain 4]
    python bake_card_textures.py brows ATTRIBUTE.PNG OUT.png [--root 180f0a --tip 3a281c --gain 16]

Needs numpy and Pillow (a venv or Blender's bundled Python with Pillow installed).
"""
import argparse

import numpy as np
from PIL import Image

PRESETS = {
    # Hair: coverage is strong; 2x2 average keeps soft edges. Seed levelled to 82-100 %.
    "hair": {"root": "1a100a", "tip": "4f3423", "gain": 4.0, "pool": "mean", "seed_lo": 0.82, "seed_hi": 1.0},
    # Brows: 1-2 px strands vanish when averaged, so max-pool coverage and boost it hard.
    "brows": {"root": "180f0a", "tip": "3a281c", "gain": 16.0, "pool": "max", "seed_lo": 0.75, "seed_hi": 1.25},
}


def hex_rgb(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def bake(att, root, tip, gain, pool="mean", seed_lo=0.82, seed_hi=1.0, max_size=2048):
    """att: float32 HxWx3+ in 0..1. Returns float32 RGBA, downsampled 2x until <= max_size."""
    cov, seed, t = att[..., 0], att[..., 1], att[..., 2]
    while cov.shape[0] > max_size:
        q = lambda a: np.stack([a[::2, ::2], a[1::2, ::2], a[::2, 1::2], a[1::2, 1::2]])
        cov = q(cov).max(0) if pool == "max" else q(cov).mean(0)
        seed, t = q(seed).mean(0), q(t).mean(0)
    rgb = root + (tip - root) * t[..., None]
    rgb *= (seed_lo + (seed_hi - seed_lo) * seed)[..., None]
    alpha = np.clip(cov * gain, 0, 1)
    return np.dstack([np.clip(rgb, 0, 1), alpha]).astype(np.float32)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kind", choices=PRESETS)
    ap.add_argument("attribute")
    ap.add_argument("output")
    ap.add_argument("--root", help="root colour, hex sRGB")
    ap.add_argument("--tip", help="tip colour, hex sRGB")
    ap.add_argument("--gain", type=float, help="coverage -> alpha gain")
    ap.add_argument("--max-size", type=int, default=2048)
    a = ap.parse_args()
    p = dict(PRESETS[a.kind])
    for k in ("root", "tip", "gain"):
        if getattr(a, k) is not None:
            p[k] = getattr(a, k)
    att = np.asarray(Image.open(a.attribute).convert("RGB"), dtype=np.float32) / 255
    out = bake(att, hex_rgb(p["root"]), hex_rgb(p["tip"]), p["gain"], p["pool"], p["seed_lo"], p["seed_hi"],
               a.max_size)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(a.output)
    print(f"CARD_TEXTURE {a.kind} {out.shape[1]}x{out.shape[0]} coverage={(out[..., 3] > 0.35).mean():.3f} "
          f"-> {a.output}")


if __name__ == "__main__":
    main()
