#!/usr/bin/env bash
# Prepares a private, pinned Blender + MPFB authoring environment for Sodalis avatars.
# Nothing is installed system-wide; everything lives in $SODALIS_AVATAR_CACHE.
set -euo pipefail

CACHE="${SODALIS_AVATAR_CACHE:-$HOME/.cache/sodalis-avatar-authoring}"
DL="$CACHE/downloads"
mkdir -p "$DL"

BLENDER_VERSION=4.5.14
BLENDER_ARCHIVE="blender-$BLENDER_VERSION-linux-x64.tar.xz"
BLENDER_SHA256=9ba871ff2ecd36526b77432745980b7e6664ecd0c7ca11c48849073dcfe06da3
MPFB_ARCHIVE=add-on-mpfb-v2.0.18.zip
MPFB_SHA256=c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad
TALKINGHEAD_COMMIT=2afe6d79779313db8909badebf46f9805a6c7b70
MH=https://files.makehumancommunity.org

# file|url|sha256
DOWNLOADS=(
  "$BLENDER_ARCHIVE|https://download.blender.org/release/Blender4.5/$BLENDER_ARCHIVE|$BLENDER_SHA256"
  "$MPFB_ARCHIVE|https://extensions.blender.org/download/sha256:$MPFB_SHA256/$MPFB_ARCHIVE|$MPFB_SHA256"
  "makehuman_system_assets_cc0.zip|$MH/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip|b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107"
  "skins02_cc0.zip|$MH/asset_packs/skins02/skins02_cc0.zip|1613f1ef3afca53094511d26620ed7cf1d2dedc29ed3d384d60bdebe250698ae"
  "system_clothes_materials01_cc0.zip|$MH/asset_packs/system_clothes_materials01/system_clothes_materials01_cc0.zip|d99fdd8d393b46c545ad40ac6f1304c43dd47e215300e0021d740124b5cd05f5"
  "system_hair_materials01_cc0.zip|$MH/asset_packs/system_hair_materials01/system_hair_materials01_cc0.zip|bfdbbf3407a7877e2ad5bee211310709b51cc6203e73c90bbb2adf71375848fe"
  "visemes02.zip|$MH/functional/visemes02.zip|a69ab6fb95ddd5f56f70acc7e859f5f9c6ae613c527d577ea1571eff2183d29e"
  "faceunits01.zip|$MH/functional/faceunits01.zip|d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146"
  "talkinghead.mpfbskel|https://raw.githubusercontent.com/met4citizen/TalkingHead/$TALKINGHEAD_COMMIT/blender/MPFB/talkinghead.mpfbskel|a3965c8298137dbc07cadcd0863974fc2e523a62245cf4719b5f266d9cbad058"
  "talkinghead.mhw|https://raw.githubusercontent.com/met4citizen/TalkingHead/$TALKINGHEAD_COMMIT/blender/MPFB/talkinghead.mhw|8d0175a31e2255a322efbcd051a2a0c738a552168feaa28a3975d6be22c8af0e"
)

for entry in "${DOWNLOADS[@]}"; do
  IFS='|' read -r file url sha <<<"$entry"
  if ! echo "$sha  $DL/$file" | sha256sum -c --status - 2>/dev/null; then
    echo "Downloading $file"
    curl -sSfL -o "$DL/$file" "$url"
    echo "$sha  $DL/$file" | sha256sum -c -
  fi
done

if [ ! -x "$CACHE/blender-$BLENDER_VERSION-linux-x64/blender" ]; then
  tar -xf "$DL/$BLENDER_ARCHIVE" -C "$CACHE"
fi

# Blender needs libSM/libICE; extract them privately when the host lacks them.
LIBDIR="$CACHE/libs/usr/lib/x86_64-linux-gnu"
if LD_LIBRARY_PATH="$LIBDIR" ldd "$CACHE/blender-$BLENDER_VERSION-linux-x64/blender" | grep -q 'not found'; then
  mkdir -p "$CACHE/debs"
  (cd "$CACHE/debs" && apt-get download libsm6 libice6)
  for deb in "$CACHE"/debs/*.deb; do dpkg-deb -x "$deb" "$CACHE/libs"; done
fi

cat >"$CACHE/blender.sh" <<EOF
#!/usr/bin/env bash
# Runs the cached Blender with private runtime libraries and an isolated user profile.
export LD_LIBRARY_PATH="$LIBDIR\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export BLENDER_USER_RESOURCES="$CACHE/blender-user"
exec "$CACHE/blender-$BLENDER_VERSION-linux-x64/blender" "\$@"
EOF
chmod +x "$CACHE/blender.sh"

"$CACHE/blender.sh" -b --factory-startup --command extension install-file \
  -r user_default -e "$DL/$MPFB_ARCHIVE" >/dev/null

# Install asset packs and register the TalkingHead rig as an MPFB custom rig.
"$CACHE/blender.sh" -b --python-expr "
import json, os, zipfile
from bl_ext.user_default.mpfb.services import LocationService
data = LocationService.get_user_data()
for pack in ['makehuman_system_assets_cc0', 'skins02_cc0', 'system_clothes_materials01_cc0',
             'system_hair_materials01_cc0', 'visemes02', 'faceunits01']:
    zipfile.ZipFile(os.path.join('$DL', pack + '.zip')).extractall(data)
rigs = os.path.join(data, 'rigs')
os.makedirs(rigs, exist_ok=True)
rig = json.load(open(os.path.join('$DL', 'talkinghead.mpfbskel')))
rig['identifying_bones'] = ['LeftToe_End']
json.dump(rig, open(os.path.join(rigs, 'talkinghead.json'), 'w'), indent=2)
weights = json.load(open(os.path.join('$DL', 'talkinghead.mhw')))
json.dump(weights, open(os.path.join(rigs, 'weights.talkinghead.json'), 'w'))
print('SODALIS_SETUP_OK', data)
" 2>&1 | grep -E 'SODALIS_SETUP_OK|Error' || { echo "MPFB asset setup failed" >&2; exit 1; }

echo "Authoring environment ready: $CACHE/blender.sh"
