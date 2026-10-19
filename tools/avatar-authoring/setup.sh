#!/usr/bin/env bash
# Installs the MPFB extension and the pinned CC0 asset packs used by build_avatar.py.
set -euo pipefail

BLENDER="${BLENDER:-blender}"
CACHE="${SODALIS_MPFB_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/sodalis/mpfb-packs}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="https://files.makehumancommunity.org/asset_packs"

# name|url|sha256
PACKS=(
  "makehuman_system_assets_cc0.zip|$BASE/makehuman_system_assets/makehuman_system_assets_cc0.zip|b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107"
  "faceunits01.zip|https://files.makehumancommunity.org/functional/faceunits01.zip|d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146"
  "visemes02.zip|https://files.makehumancommunity.org/functional/visemes02.zip|a69ab6fb95ddd5f56f70acc7e859f5f9c6ae613c527d577ea1571eff2183d29e"
  "skins01_cc0.zip|$BASE/skins01/skins01_cc0.zip|7495ab99287053bd19ff1636114e64b608994d9f7437fea6cc75ea387f96dba9"
  "skins02_cc0.zip|$BASE/skins02/skins02_cc0.zip|1613f1ef3afca53094511d26620ed7cf1d2dedc29ed3d384d60bdebe250698ae"
  "system_eye_materials01_cc0.zip|$BASE/system_eye_materials01/system_eye_materials01_cc0.zip|acad4636c08ff96ac8a27775cfa071052c8cba9b21e0029b649bdd6ec7aeb332"
  "system_hair_materials01_cc0.zip|$BASE/system_hair_materials01/system_hair_materials01_cc0.zip|bfdbbf3407a7877e2ad5bee211310709b51cc6203e73c90bbb2adf71375848fe"
  "system_hair_materials02_cc0.zip|$BASE/system_hair_materials02/system_hair_materials02_cc0.zip|c69aec30698734b8b57f6876d4ba8f6231535a776f98adb92c7bbe4acdea7b74"
)

command -v "$BLENDER" >/dev/null || { echo "Blender 5.2+ is required (set BLENDER=/path/to/blender)." >&2; exit 1; }

echo "Installing the MPFB extension from extensions.blender.org…"
"$BLENDER" -b -noaudio --online-mode --command extension install -s -e mpfb

mkdir -p "$CACHE"
zips=()
for entry in "${PACKS[@]}"; do
  IFS="|" read -r name url sha <<<"$entry"
  file="$CACHE/$name"
  [[ -f "$file" ]] || curl -fL --retry 3 -o "$file" "$url"
  echo "$sha  $file" | shasum -a 256 -c - >/dev/null || { echo "Checksum mismatch: $file" >&2; exit 1; }
  zips+=("$file")
done

"$BLENDER" -b -noaudio --python-exit-code 1 --python "$HERE/load_packs.py" -- "${zips[@]}"
echo "MPFB and asset packs are ready."
