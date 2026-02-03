#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/mediapipe/face_mesh"
# Some libs resolve assets relative to the current route (e.g. /path-nodes/*),
# so mirror the assets under that path to avoid 404s / HTML fallbacks.
OUT_DIR_ROUTE_MIRROR="$ROOT_DIR/public/path-nodes/mediapipe/face_mesh"

mkdir -p "$OUT_DIR" "$OUT_DIR_ROUTE_MIRROR"

files=(
  "face_mesh.js"
  "face_mesh_solution_packed_assets.data"
  "face_mesh_solution_packed_assets_loader.js"
  "face_mesh_solution_simd_wasm_bin.js"
  "face_mesh_solution_simd_wasm_bin.wasm"
  "face_mesh_solution_wasm_bin.js"
  "face_mesh_solution_wasm_bin.wasm"
)

echo "Downloading MediaPipe Face Mesh assets to $OUT_DIR"
for file in "${files[@]}"; do
  url="$BASE_URL/$file"
  echo "- $url"
  curl -fL "$url" -o "$OUT_DIR/$file"
done

echo "Mirroring assets under $OUT_DIR_ROUTE_MIRROR"
for file in "${files[@]}"; do
  cp "$OUT_DIR/$file" "$OUT_DIR_ROUTE_MIRROR/$file"
done

echo "Done. Assets are now available under /mediapipe/face_mesh/ and /path-nodes/mediapipe/face_mesh/"
