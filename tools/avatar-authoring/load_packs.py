"""Install MPFB asset-pack zips into the MPFB user data directory.

Run with: blender -b -noaudio --python-exit-code 1 --python load_packs.py -- <zip>...
"""

import sys

import bpy

for path in sys.argv[sys.argv.index("--") + 1 :]:
    result = bpy.ops.mpfb.load_pack(filepath=path)
    if "FINISHED" not in result:
        raise RuntimeError(f"MPFB could not load {path}: {result}")
    print("SODALIS_PACK_LOADED", path)
