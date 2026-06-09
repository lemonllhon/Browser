#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/publish/output"
STAGING_ROOT="$ROOT_DIR/publish/staging/mac"
ARCH=""
VERSION=""
SKIP_BUILD=0
SKIP_RUNTIME_VERIFY=0
KEEP_STAGING=0

usage() {
  cat <<'EOF'
Usage:
  publish/mac/publish-mac.sh --arch <arm64|amd64> [options]

Options:
  --arch <arm64|amd64>   Target architecture (required)
  --version <ver>        Package version (default: read from build/config.yml)
  --skip-build           Skip frontend and Wails build steps
  --skip-runtime-verify  Skip runtime hash verification
  --keep-staging         Keep assembled .app bundle in publish/staging/mac
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-runtime-verify)
      SKIP_RUNTIME_VERIFY=1
      shift
      ;;
    --keep-staging)
      KEEP_STAGING=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$ARCH" ]]; then
  echo "[ERROR] --arch is required" >&2
  usage
  exit 1
fi

if [[ "$ARCH" != "amd64" && "$ARCH" != "arm64" ]]; then
  echo "[ERROR] unsupported arch: $ARCH (expected amd64 or arm64)" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] this script must run on macOS host" >&2
  exit 1
fi

host_arch_raw="$(uname -m)"
case "$host_arch_raw" in
  x86_64) HOST_ARCH="amd64" ;;
  arm64) HOST_ARCH="arm64" ;;
  *)
    echo "[ERROR] unsupported host architecture: $host_arch_raw" >&2
    exit 1
    ;;
esac

if [[ "$HOST_ARCH" != "$ARCH" ]]; then
  echo "[ERROR] host arch is $HOST_ARCH but target arch is $ARCH." >&2
  echo "        Build the first macOS package on a native runner for the same architecture." >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] required command not found: $1" >&2
    exit 1
  fi
}

require_cmd python3
require_cmd ditto
require_cmd wails3

if [[ -z "$VERSION" ]]; then
  VERSION="$(python3 - "$ROOT_DIR/build/config.yml" <<'PY'
import re
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()
match = re.search(r'(?m)^\s{2}version:\s*["\']?([^"\'\r\n]+)', text)
version = (match.group(1).strip() if match else "")
if not version:
    raise SystemExit("info.version missing in build/config.yml")
print(version)
PY
)"
fi

TARGET="darwin-$ARCH"
APP_BIN_DIR="$ROOT_DIR/build/bin"
CHROME_README_SRC="$ROOT_DIR/chrome/README.md"
CONFIG_INIT_SRC="$ROOT_DIR/publish/config.init.mac.yaml"
ZIP_NAME="TraceBrowser-${VERSION}-macos-${ARCH}.zip"
APP_EXPORT="$OUTPUT_DIR/TraceBrowser-${VERSION}-macos-${ARCH}.app"
STAGE_DIR="$STAGING_ROOT/$TARGET"
APP_STAGE="$STAGE_DIR/Trace Browser.app"

find_built_app_bundle() {
  python3 - "$APP_BIN_DIR" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
if not root.is_dir():
    sys.exit(0)

candidates = [p for p in root.iterdir() if p.is_dir() and p.suffix == ".app"]
if not candidates:
    sys.exit(0)

candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
print(candidates[0])
PY
}

manifest_has_target() {
  python3 - "$ROOT_DIR/publish/runtime-manifest.json" "$TARGET" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
target = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as f:
    data = json.load(f)

for item in data.get("files", []):
    if target in (item.get("targets") or []):
        print("yes")
        raise SystemExit(0)

raise SystemExit(1)
PY
}

runtime_entries_for_target() {
  python3 - "$ROOT_DIR/publish/runtime-manifest.json" "$TARGET" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
target = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as f:
    data = json.load(f)

found = False
for item in data.get("files", []):
    if target in (item.get("targets") or []):
        rel = str(item.get("path", "")).strip()
        if rel:
            print(rel)
            found = True

raise SystemExit(0 if found else 1)
PY
}

assert_runtime_files_for_target() {
  local found=0
  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    found=1
    if [[ ! -f "$ROOT_DIR/$rel_path" ]]; then
      echo "[ERROR] runtime file missing for $TARGET: $ROOT_DIR/$rel_path" >&2
      exit 1
    fi
  done < <(runtime_entries_for_target)

  if [[ "$found" -ne 1 ]]; then
    echo "[ERROR] runtime manifest has no entries for $TARGET" >&2
    exit 1
  fi
}

copy_runtime_files_for_target() {
  local dest_dir="$1"
  mkdir -p "$dest_dir"
  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    local src="$ROOT_DIR/$rel_path"
    local dest="$dest_dir/$(basename "$rel_path")"
    if [[ ! -f "$src" ]]; then
      echo "[ERROR] runtime file missing for $TARGET: $src" >&2
      exit 1
    fi
    cp "$src" "$dest"
    chmod +x "$dest"
  done < <(runtime_entries_for_target)
}

echo "========================================"
echo "  Trace Browser macOS Publish"
echo "========================================"
echo "Target : $TARGET"
echo "Version: $VERSION"
echo "Root   : $ROOT_DIR"
echo

assert_runtime_files_for_target

if [[ ! -f "$CONFIG_INIT_SRC" ]]; then
  echo "[ERROR] mac config template missing: $CONFIG_INIT_SRC" >&2
  exit 1
fi

if [[ "$SKIP_RUNTIME_VERIFY" -ne 1 ]]; then
  if manifest_has_target >/dev/null 2>&1; then
    bash "$ROOT_DIR/tools/runtime/verify-runtime.sh" "$TARGET"
  else
    echo "[WARN] runtime manifest does not yet define $TARGET, skipping hash verification"
  fi
else
  echo "[WARN] runtime verification skipped"
fi

if [[ "$SKIP_BUILD" -ne 1 ]]; then
  echo "[1/4] Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && npm ci --prefer-offline --no-audit --no-fund)

  echo "[2/4] Building frontend assets..."
  (cd "$ROOT_DIR/frontend" && npm run build)

  echo "[3/4] Building macOS app bundle with Wails3..."
  (
    cd "$ROOT_DIR"
    TRACE_BROWSER_VERSION="$VERSION" VERSION="$VERSION" wails3 build
  )
else
  echo "[WARN] skipping build step"
fi

APP_SOURCE="$(find_built_app_bundle)"
if [[ -z "$APP_SOURCE" || ! -d "$APP_SOURCE" ]]; then
  echo "[ERROR] failed to locate built .app bundle under $APP_BIN_DIR" >&2
  exit 1
fi

echo "[4/4] Assembling macOS app bundle..."
rm -rf "$APP_STAGE" "$APP_EXPORT"
mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"
ditto "$APP_SOURCE" "$APP_STAGE"

APP_MACOS_DIR="$APP_STAGE/Contents/MacOS"
if [[ ! -d "$APP_MACOS_DIR" ]]; then
  echo "[ERROR] invalid app bundle layout, missing: $APP_MACOS_DIR" >&2
  exit 1
fi

mkdir -p "$APP_MACOS_DIR/bin"
copy_runtime_files_for_target "$APP_MACOS_DIR/bin/$TARGET"
copy_runtime_files_for_target "$APP_MACOS_DIR/bin"
cp "$CONFIG_INIT_SRC" "$APP_MACOS_DIR/config.yaml"

if [[ -f "$CHROME_README_SRC" ]]; then
  mkdir -p "$APP_MACOS_DIR/chrome"
  cp "$CHROME_README_SRC" "$APP_MACOS_DIR/chrome/README.md"
fi

ditto "$APP_STAGE" "$APP_EXPORT"
rm -f "$OUTPUT_DIR/$ZIP_NAME"
ditto -c -k --sequesterRsrc --keepParent "$APP_EXPORT" "$OUTPUT_DIR/$ZIP_NAME"

echo "Artifacts generated:"
echo "  - $APP_EXPORT"
echo "  - $OUTPUT_DIR/$ZIP_NAME"

if [[ "$KEEP_STAGING" -ne 1 ]]; then
  rm -rf "$APP_STAGE"
fi

echo "Done."
