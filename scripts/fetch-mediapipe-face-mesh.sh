#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

MEDIAPIPE_VERSION="0.4.1633559619"
ASSET_VERSION="20260203"
MEDIAPIPE_BASE_URLS="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION} https://unpkg.com/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}"
WEBGAZER_URLS="https://cdn.jsdelivr.net/npm/webgazer@2.1.0/build/webgazer.js https://unpkg.com/webgazer@2.1.0/build/webgazer.js https://webgazer.cs.brown.edu/webgazer.js"

OUT_DIR="$ROOT_DIR/public/mediapipe/face_mesh"
OUT_DIR_ROUTE_MIRROR="$ROOT_DIR/public/path-nodes/mediapipe/face_mesh"
OUT_DIR_ROOT_MIRROR="$ROOT_DIR/public"
OUT_DIR_ROUTE_ROOT_MIRROR="$ROOT_DIR/public/path-nodes"

WEBGAZER_DIR="$ROOT_DIR/public/eye-tracking"
WEBGAZER_MIRROR="$ROOT_DIR/public/path-nodes/eye-tracking"

mkdir -p "$OUT_DIR" "$OUT_DIR_ROUTE_MIRROR" "$OUT_DIR_ROOT_MIRROR" "$OUT_DIR_ROUTE_ROOT_MIRROR" "$WEBGAZER_DIR" "$WEBGAZER_MIRROR"

FILES="face_mesh.js face_mesh_solution_packed_assets.data face_mesh_solution_packed_assets_loader.js face_mesh_solution_simd_wasm_bin.js face_mesh_solution_simd_wasm_bin.wasm face_mesh_solution_wasm_bin.js face_mesh_solution_wasm_bin.wasm"

safe_copy() {
  src="$1"
  dest="$2"
  if cp "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  echo "Warning: unable to copy $src to $dest" >&2
  return 0
}

download_first() {
  out="$1"
  shift
  if [ -s "$out" ]; then
    return 0
  fi
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
  if command -v curl >/dev/null 2>&1; then
    if curl -fL "$url" -o "$out"; then
      return 0
    fi
  fi
  return 1
}

echo "Downloading WebGazer to $WEBGAZER_DIR/webgazer.js"
if ! download_first "$WEBGAZER_DIR/webgazer.js" $WEBGAZER_URLS; then
  echo "Failed to download WebGazer from all sources." >&2
  exit 1
fi
safe_copy "$WEBGAZER_DIR/webgazer.js" "$WEBGAZER_MIRROR/webgazer.js"
node - <<'NODE'
const fs = require("fs");
const path = "public/eye-tracking/webgazer.js";
if (!fs.existsSync(path)) {
  process.exit(0);
}
let text = fs.readFileSync(path, "utf8");
const needle = 'faceMeshSolutionPath:"./mediapipe/face_mesh"';
if (text.includes(needle)) {
  text = text.replaceAll(needle, 'faceMeshSolutionPath:"/mediapipe/face_mesh"');
  fs.writeFileSync(path, text, "utf8");
}
NODE
safe_copy "$WEBGAZER_DIR/webgazer.js" "$WEBGAZER_MIRROR/webgazer.js"

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

# Patch loader to:
# 1) Use absolute asset paths
# 2) Version-bust binary assets to avoid stale HTML cache poisoning.
LOADER="$OUT_DIR/face_mesh_solution_packed_assets_loader.js"
if [ -f "$LOADER" ]; then
  ASSET_VERSION="$ASSET_VERSION" LOADER="$LOADER" node - <<'NODE'
const fs = require("fs");
const path = process.env.LOADER;
const version = process.env.ASSET_VERSION || "20260203";
let text = fs.readFileSync(path, "utf8");
const abs = "REMOTE_PACKAGE_BASE = '/mediapipe/face_mesh/face_mesh_solution_packed_assets.data'";
const re1 = /REMOTE_PACKAGE_BASE\s*=\s*'face_mesh_solution_packed_assets\.data[^']*'/;
const re2 = /REMOTE_PACKAGE_BASE\s*=\s*'[^']*face_mesh_solution_packed_assets\.data[^']*'/;
if (re1.test(text)) {
  text = text.replace(re1, abs);
} else if (re2.test(text)) {
  text = text.replace(re2, abs);
}
const bustSnippet = `
      if (typeof window === 'object' && window.__NB_EYE_ASSET_BUST) {
        var bust = window.__NB_EYE_ASSET_BUST;
        REMOTE_PACKAGE_BASE += (REMOTE_PACKAGE_BASE.indexOf('?') === -1 ? '?' : '&') + 'b=' + bust;
      }
`;
if (!text.includes("window.__NB_EYE_ASSET_BUST")) {
  text = text.replace(abs + ";", abs + ";" + bustSnippet);
}
function replace(name, text) {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
  const re = new RegExp(escaped + "(\\\\?v=[^\\\"']+)?", "g");
  return text.replace(re, `${name}?v=${version}`);
}
text = replace("face_mesh_solution_packed_assets.data", text);
text = replace("face_mesh_solution_simd_wasm_bin.wasm", text);
text = replace("face_mesh_solution_wasm_bin.wasm", text);
text = text.replace(
  /face_mesh_solution_packed_assets\.data\?v=[^'"]+\?v=[^'"]+/g,
  `face_mesh_solution_packed_assets.data?v=${version}`
);
const cacheHeaderSnippet = `
        try {
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.setRequestHeader('Pragma', 'no-cache');
          xhr.setRequestHeader('Expires', '0');
        } catch (e) {}
`;
if (!text.includes("Cache-Control")) {
  text = text.replace("xhr.open('GET', packageName, true);", "xhr.open('GET', packageName, true);" + cacheHeaderSnippet);
}
fs.writeFileSync(path, text, "utf8");
NODE
fi

echo "Mirroring assets under $OUT_DIR_ROUTE_MIRROR"
for file in $FILES; do
  safe_copy "$OUT_DIR/$file" "$OUT_DIR_ROUTE_MIRROR/$file"
done

echo "Mirroring assets to root for route-relative lookups"
for file in $FILES; do
  safe_copy "$OUT_DIR/$file" "$OUT_DIR_ROOT_MIRROR/$file"
  safe_copy "$OUT_DIR/$file" "$OUT_DIR_ROUTE_ROOT_MIRROR/$file"
done

echo "Done. Assets are now available under:"
echo "  - /mediapipe/face_mesh/"
echo "  - /path-nodes/mediapipe/face_mesh/"
echo "  - /face_mesh_solution_packed_assets.data (root mirror)"
echo "  - /path-nodes/face_mesh_solution_packed_assets.data (route mirror)"
echo "  - /eye-tracking/webgazer.js"
echo "  - /path-nodes/eye-tracking/webgazer.js"
