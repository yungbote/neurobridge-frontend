#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

MEDIAPIPE_VERSION="0.4.1633559619"
ASSET_VERSION="20260203"
MEDIAPIPE_BASE_URLS="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION} https://unpkg.com/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}"
WEBGAZER_URLS="https://cdn.jsdelivr.net/npm/webgazer@2.1.0/build/webgazer.js https://unpkg.com/webgazer@2.1.0/build/webgazer.js https://webgazer.cs.brown.edu/webgazer.js"

OUT_DIR="$ROOT_DIR/public/mediapipe/face_mesh"
OUT_DIR_ROUTE_MIRROR="$ROOT_DIR/public/path-nodes/mediapipe/face_mesh"

WEBGAZER_DIR="$ROOT_DIR/public/eye-tracking"
WEBGAZER_MIRROR="$ROOT_DIR/public/path-nodes/eye-tracking"

mkdir -p "$OUT_DIR" "$OUT_DIR_ROUTE_MIRROR" "$WEBGAZER_DIR" "$WEBGAZER_MIRROR"

FILES="face_mesh.js face_mesh_solution_packed_assets.data face_mesh_solution_packed_assets_loader.js face_mesh_solution_simd_wasm_bin.js face_mesh_solution_simd_wasm_bin.wasm face_mesh_solution_wasm_bin.js face_mesh_solution_wasm_bin.wasm"

download_first() {
  out="$1"
  shift
  for url in "$@"; do
    echo "- $url"
    if download_url "$url" "$out"; then
      return 0
    fi
  done
  return 1
}

download_url() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$url" -o "$out"
    return $?
  fi
  if command -v node >/dev/null 2>&1; then
    URL="$url" OUT="$out" node - <<'NODE'
const fs = require("fs");
const http = require("http");
const https = require("https");

const url = process.env.URL;
const out = process.env.OUT;
const maxRedirects = 5;

function fetch(u, redirects) {
  const client = u.startsWith("https") ? https : http;
  const req = client.get(u, (res) => {
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400 && res.headers.location && redirects < maxRedirects) {
      const next = new URL(res.headers.location, u).toString();
      res.resume();
      return fetch(next, redirects + 1);
    }
    if (status >= 200 && status < 300) {
      const file = fs.createWriteStream(out);
      res.pipe(file);
      file.on("finish", () => file.close(() => process.exit(0)));
      return;
    }
    res.resume();
    process.exit(1);
  });
  req.on("error", () => process.exit(1));
}

fetch(url, 0);
NODE
    return $?
  fi
  return 1
}

echo "Downloading WebGazer to $WEBGAZER_DIR/webgazer.js"
if ! download_first "$WEBGAZER_DIR/webgazer.js" $WEBGAZER_URLS; then
  echo "Failed to download WebGazer from all sources." >&2
  exit 1
fi
cp "$WEBGAZER_DIR/webgazer.js" "$WEBGAZER_MIRROR/webgazer.js"

echo "Downloading MediaPipe Face Mesh assets to $OUT_DIR"
for file in $FILES; do
  urls=""
  for base in $MEDIAPIPE_BASE_URLS; do
    urls="$urls $base/$file"
  done
  # shellcheck disable=SC2086
  if ! download_first "$OUT_DIR/$file" $urls; then
    echo "Failed to download $file from all sources." >&2
    exit 1
  fi
done

# Patch loader to version-bust binary assets and avoid stale HTML cache poisoning.
LOADER="$OUT_DIR/face_mesh_solution_packed_assets_loader.js"
if [ -f "$LOADER" ]; then
  ASSET_VERSION="$ASSET_VERSION" LOADER="$LOADER" node - <<'NODE'
const fs = require("fs");
const path = process.env.LOADER;
const version = process.env.ASSET_VERSION || "20260203";
let text = fs.readFileSync(path, "utf8");
function replace(name, text) {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
  const re = new RegExp(escaped + "(\\\\?v=[^\\\"']+)?", "g");
  return text.replace(re, `${name}?v=${version}`);
}
text = replace("face_mesh_solution_packed_assets.data", text);
text = replace("face_mesh_solution_simd_wasm_bin.wasm", text);
text = replace("face_mesh_solution_wasm_bin.wasm", text);
fs.writeFileSync(path, text, "utf8");
NODE
fi

echo "Mirroring assets under $OUT_DIR_ROUTE_MIRROR"
for file in $FILES; do
  cp "$OUT_DIR/$file" "$OUT_DIR_ROUTE_MIRROR/$file"
done

echo "Done. Assets are now available under:"
echo "  - /mediapipe/face_mesh/"
echo "  - /path-nodes/mediapipe/face_mesh/"
echo "  - /eye-tracking/webgazer.js"
echo "  - /path-nodes/eye-tracking/webgazer.js"
