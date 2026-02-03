#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/mediapipe/face_mesh"

mkdir -p "$OUT_DIR"

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

echo "Done. Assets are now available under /mediapipe/face_mesh/"
