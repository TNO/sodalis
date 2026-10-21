#!/usr/bin/env bash
# Build Epic's OpenRigLogic (MIT) with Python bindings that load in Blender's Python (macOS arm64).
#
#   tools/avatar-authoring/metahuman/build_openriglogic.sh [PREFIX]
#
# PREFIX defaults to ~/avatar-work/tools/openriglogic; rigbake.py looks in PREFIX/lib (or $OPENRIGLOGIC_LIB).
# Needs git, cmake, swig 4.x (brew install cmake swig) and a python3.X matching Blender's Python version.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${1:-$HOME/avatar-work/tools/openriglogic}"
COMMIT=9ca65ac08b64a1ea5f0d79466e64706b3ac524ba  # RigLogic v13.5.0 snapshot
SRC="${OPENRIGLOGIC_SRC:-$(mktemp -d)/OpenRigLogic}"

BLENDER="${BLENDER:-blender}"
PYVER="$("$BLENDER" -b --factory-startup --python-expr 'import sys; print("PYVER=%d.%d" % sys.version_info[:2])' 2>/dev/null | sed -n 's/^PYVER=//p')"
PYTHON="${PYTHON:-$(command -v "python$PYVER" || uv python find "$PYVER" 2>/dev/null || true)}"
[ -n "$PYVER" ] || { echo "Cannot run $BLENDER to find its Python version" >&2; exit 1; }
[ -x "$PYTHON" ] || { echo "Need python$PYVER on PATH (e.g. uv python install $PYVER), or set PYTHON" >&2; exit 1; }

if [ ! -d "$SRC/.git" ]; then
  git clone --quiet https://github.com/EpicGames/OpenRigLogic.git "$SRC"
fi
git -C "$SRC" checkout --quiet "$COMMIT"
# Link the extension module, not libpython (Blender embeds its own), and use SWIG 4.5's macro name.
git -C "$SRC" apply --check "$HERE/openriglogic-macos.patch" 2>/dev/null && git -C "$SRC" apply "$HERE/openriglogic-macos.patch"

cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON \
  -DRL_BUILD_TESTS=OFF -DRL_BUILD_BENCHMARKS=OFF -DRL_BUILD_EXAMPLES=OFF \
  -DRL_BUILD_PYTHON_WRAPPER="$PYVER" -DDNA_BUILD_PYTHON_WRAPPER="$PYVER" \
  -DPython3_EXECUTABLE="$PYTHON" -DCMAKE_INSTALL_PREFIX="$PREFIX" >/dev/null
cmake --build "$SRC/build" --parallel >/dev/null
cmake --install "$SRC/build" >/dev/null

# Python imports _py3*.so; the install only writes .dylib. Let the modules find their siblings.
cd "$PREFIX/lib"
for lib in _py3dna*_?.dylib _py3riglogic*_?.dylib; do
  ln -sf "$lib" "${lib%.dylib}.so"
done
for lib in *.*.*.dylib; do
  install_name_tool -add_rpath @loader_path "$lib" 2>/dev/null || true
  codesign --force --sign - "$lib" 2>/dev/null
done

"$BLENDER" -b --factory-startup --python-expr \
  "import sys; sys.path.insert(0, '$PREFIX/lib'); import dna, riglogic; print('OPENRIGLOGIC_OK')" 2>/dev/null |
  grep -q OPENRIGLOGIC_OK || { echo "Blender cannot import dna/riglogic from $PREFIX/lib" >&2; exit 1; }
echo "OpenRigLogic ready in $PREFIX/lib (set OPENRIGLOGIC_LIB if this is not the default)"
