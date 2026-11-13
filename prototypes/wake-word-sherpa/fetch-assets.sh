#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
ASSETS="$HERE/assets"
MODEL_DIR="$ASSETS/model"
SOURCE_DIR="$ASSETS/sherpa-onnx-src"
RUNTIME_DIR="$ASSETS/runtime"
MODEL_ARCHIVE="$ASSETS/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
MODEL_SHA256="68447f4fbc67e70eee3a93961f36e81e98f47aef73ce7e7ca00885c6cd3616a6"
SHERPA_TAG="v2.0.1"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build the official KWS WebAssembly target." >&2
  exit 1
fi
mkdir -p "$MODEL_DIR" "$RUNTIME_DIR"

if [ ! -s "$MODEL_DIR/tokens.txt" ] || \
   [ ! -s "$MODEL_DIR/en.phone" ] || \
   [ ! -s "$MODEL_DIR/encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx" ] || \
   [ ! -s "$MODEL_DIR/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" ] || \
   [ ! -s "$MODEL_DIR/joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx" ]; then
  if [ ! -s "$MODEL_ARCHIVE" ]; then
    curl -fL --retry 3 "$MODEL_URL" -o "$MODEL_ARCHIVE"
  fi
  echo "$MODEL_SHA256  $MODEL_ARCHIVE" | sha256sum --check
  tar -xjf "$MODEL_ARCHIVE" --strip-components=1 --wildcards -C "$MODEL_DIR" \
    '*/encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx' \
    '*/decoder-epoch-13-avg-2-chunk-16-left-64.onnx' \
    '*/joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx' \
    '*/tokens.txt' '*/en.phone'
fi
# The upstream archive also contains example WAVs; retain only weights and text files.
rm -rf "$MODEL_DIR/test_wavs"
rm -f "$MODEL_ARCHIVE"

for file in \
  encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx \
  decoder-epoch-13-avg-2-chunk-16-left-64.onnx \
  joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx \
  tokens.txt en.phone; do
  test -s "$MODEL_DIR/$file" || { echo "Missing model file: $MODEL_DIR/$file" >&2; exit 1; }
done

if [ ! -d "$SOURCE_DIR/.git" ]; then
  git clone --branch "$SHERPA_TAG" --depth 1 --recurse-submodules --shallow-submodules \
    https://github.com/k2-fsa/sherpa-onnx.git "$SOURCE_DIR"
else
  git -C "$SOURCE_DIR" checkout --detach "$SHERPA_TAG"
  git -C "$SOURCE_DIR" submodule update --init --recursive --depth 1
fi

WASM_ASSETS="$SOURCE_DIR/wasm/kws/assets"
cp -u "$MODEL_DIR/encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx" "$WASM_ASSETS/"
cp -u "$MODEL_DIR/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" "$WASM_ASSETS/"
cp -u "$MODEL_DIR/joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx" "$WASM_ASSETS/"
cp -u "$MODEL_DIR/tokens.txt" "$WASM_ASSETS/"
# Upstream's KWS CMake guard still checks the older epoch-12 decoder filename.
# This same checkpoint is copied under that guard name; the page loads epoch-13.
cp -u "$MODEL_DIR/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" \
  "$WASM_ASSETS/decoder-epoch-12-avg-2-chunk-16-left-64.onnx"

WASM_OUTPUT="$SOURCE_DIR/build-wasm-simd-kws/install/bin/wasm"
if [ ! -s "$WASM_OUTPUT/sherpa-onnx-wasm-kws-main.wasm" ] || \
   [ "$WASM_ASSETS/encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx" -nt "$WASM_OUTPUT/sherpa-onnx-wasm-kws-main.data" ] || \
   [ "$WASM_ASSETS/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" -nt "$WASM_OUTPUT/sherpa-onnx-wasm-kws-main.data" ] || \
   [ "$WASM_ASSETS/joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx" -nt "$WASM_OUTPUT/sherpa-onnx-wasm-kws-main.data" ]; then
  docker run --rm \
    --volume "$SOURCE_DIR:/src" \
    --workdir /src \
    emscripten/emsdk:4.0.23 \
    bash -lc './build-wasm-simd-kws.sh'
fi

cp "$WASM_OUTPUT/"* "$RUNTIME_DIR/"
cp "$SOURCE_DIR/wasm/kws/sherpa-onnx-kws.js" "$RUNTIME_DIR/"
printf 'Runtime and model downloaded/built under %s\n' "$ASSETS"
