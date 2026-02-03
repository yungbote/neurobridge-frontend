#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

MEDIAPIPE_VERSION="0.4.1633559619"
ASSET_VERSION="20260203"
MEDIAPIPE_BASE_URLS=(
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}"
  "https://unpkg.com/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}"
)

WEBGAZER_URLS=(
  "https://cdn.jsdelivr.net/npm/webgazer@2.1.0/build/webgazer.js"
  "https://unpkg.com/webgazer@2.1.0/build/webgazer.js"
  "https://webgazer.cs.brown.edu/webgazer.js"
)

OUT_DIR="$ROOT_DIR/public/mediapipe/face_mesh"
OUT_DIR_ROUTE_MIRROR="$ROOT_DIR/public/path-nodes/mediapipe/face_mesh"

WEBGAZER_DIR="$ROOT_DIR/public/eye-tracking"
WEBGAZER_MIRROR="$ROOT_DIR/public/path-nodes/eye-tracking"

mkdir -p "$OUT_DIR" "$OUT_DIR_ROUTE_MIRROR" "$WEBGAZER_DIR" "$WEBGAZER_MIRROR"

files=(
  "face_mesh.js"
  "face_mesh_solution_packed_assets.data"
  "face_mesh_solution_packed_assets_loader.js"
  "face_mesh_solution_simd_wasm_bin.js"
  "face_mesh_solution_simd_wasm_bin.wasm"
  "face_mesh_solution_wasm_bin.js"
  "face_mesh_solution_wasm_bin.wasm"
)

download_first() {
  local out="$1"
  shift
  local urls=("$@")
  for url in "${urls[@]}"; do
    echo "- $url"
    if curl -fL "$url" -o "$out"; then
      return 0
    fi
  done
  return 1
}

echo "Downloading WebGazer to $WEBGAZER_DIR/webgazer.js"
if ! download_first "$WEBGAZER_DIR/webgazer.js" "${WEBGAZER_URLS[@]}"; then
  echo "Failed to download WebGazer from all sources." >&2
  exit 1
fi
cp "$WEBGAZER_DIR/webgazer.js" "$WEBGAZER_MIRROR/webgazer.js"

echo "Downloading MediaPipe Face Mesh assets to $OUT_DIR"
for file in "${files[@]}"; do
  urls=()
  for base in "${MEDIAPIPE_BASE_URLS[@]}"; do
    urls+=("$base/$file")
  done
  if ! download_first "$OUT_DIR/$file" "${urls[@]}"; then
    echo "Failed to download $file from all sources." >&2
    exit 1
  fi
done

# Patch loader to version-bust binary assets and avoid stale HTML cache poisoning.
LOADER="$OUT_DIR/face_mesh_solution_packed_assets_loader.js"
if [[ -f "$LOADER" ]]; then
  python - <<PY
import re
path = "$LOADER"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()
def replace(name):
    pattern = re.compile(re.escape(name) + r"(\\?v=[^\\\"']+)?")
    return pattern.sub(name + "?v=$ASSET_VERSION", text)
text = replace("face_mesh_solution_packed_assets.data")
text = replace("face_mesh_solution_simd_wasm_bin.wasm")
text = replace("face_mesh_solution_wasm_bin.wasm")
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
fi

echo "Mirroring assets under $OUT_DIR_ROUTE_MIRROR"
for file in "${files[@]}"; do
  cp "$OUT_DIR/$file" "$OUT_DIR_ROUTE_MIRROR/$file"
done

echo "Done. Assets are now available under:"
echo "  - /mediapipe/face_mesh/"
echo "  - /path-nodes/mediapipe/face_mesh/"
echo "  - /eye-tracking/webgazer.js"
echo "  - /path-nodes/eye-tracking/webgazer.js"
