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
  VERSION="$(python3 -c 'import sys; from pathlib import Path; lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines(); line = next((line for line in lines if line.startswith("  version:")), ""); sys.exit("info.version missing in build/config.yml") if not line else print(line.split(":", 1)[1].strip().strip(chr(34)).strip(chr(39)))' "$ROOT_DIR/build/config.yml")"
fi

TARGET="darwin-$ARCH"
APP_BIN_DIR="$ROOT_DIR/build/bin"
APP_BINARY="$APP_BIN_DIR/trace-browser"
APP_ICON_SRC="$ROOT_DIR/build/appicon.png"
CHROME_README_SRC="$ROOT_DIR/chrome/README.md"
CONFIG_INIT_SRC="$ROOT_DIR/publish/config.init.mac.yaml"
ZIP_NAME="TraceBrowser-${VERSION}-macos-${ARCH}.zip"
APP_EXPORT="$OUTPUT_DIR/TraceBrowser-${VERSION}-macos-${ARCH}.app"
STAGE_DIR="$STAGING_ROOT/$TARGET"
APP_STAGE="$STAGE_DIR/Trace Browser.app"

find_built_app_bundle() {
  python3 -c 'from pathlib import Path; import sys; roots = [Path(arg) for arg in sys.argv[1:]]; candidates = []; seen = set(); [candidates.append(p) for root in roots if root.is_dir() for p in root.rglob("*.app") if p.is_dir() and not (str(p) in seen or seen.add(str(p)))]; candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True); print(candidates[0] if candidates else "")' "$APP_BIN_DIR" "$ROOT_DIR/build"
}

config_info_value() {
  local key="$1"
  local fallback="$2"
  python3 -c 'import sys; from pathlib import Path; path, key, fallback = sys.argv[1:4]; prefix = "  " + key + ":"; lines = Path(path).read_text(encoding="utf-8").splitlines(); line = next((line for line in lines if line.startswith(prefix)), ""); print(fallback if not line else line.split(":", 1)[1].strip().strip(chr(34)).strip(chr(39)))' "$ROOT_DIR/build/config.yml" "$key" "$fallback"
}

config_protocol_scheme() {
  python3 -c 'import sys; from pathlib import Path; lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines(); idx = next((i for i, line in enumerate(lines) if line.startswith("protocols:")), -1); section = [] if idx < 0 else lines[idx + 1:]; scheme = next((line.split(":", 1)[1].strip().strip(chr(34)).strip(chr(39)) for line in section if line.strip().startswith("- scheme:")), "trace-browser"); print(scheme or "trace-browser")' "$ROOT_DIR/build/config.yml"
}

xml_escape() {
  python3 -c 'import html, sys; print(html.escape(sys.argv[1], quote=True))' "$1"
}

write_manual_info_plist() {
  local plist_path="$1"
  local product_name product_identifier product_version product_comments product_copyright protocol_scheme
  local product_name_xml product_identifier_xml product_version_xml product_comments_xml product_copyright_xml protocol_scheme_xml

  product_name="$(config_info_value productName "Trace Browser")"
  product_identifier="$(config_info_value productIdentifier "com.tracebrowser.app")"
  product_version="$VERSION"
  product_comments="$(config_info_value comments "Trace Browser desktop application")"
  product_copyright="$(config_info_value copyright "Copyright (c) 2026")"
  protocol_scheme="$(config_protocol_scheme)"

  product_name_xml="$(xml_escape "$product_name")"
  product_identifier_xml="$(xml_escape "$product_identifier")"
  product_version_xml="$(xml_escape "$product_version")"
  product_comments_xml="$(xml_escape "$product_comments")"
  product_copyright_xml="$(xml_escape "$product_copyright")"
  protocol_scheme_xml="$(xml_escape "$protocol_scheme")"

  cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleName</key>
  <string>$product_name_xml</string>
  <key>CFBundleDisplayName</key>
  <string>$product_name_xml</string>
  <key>CFBundleExecutable</key>
  <string>trace-browser</string>
  <key>CFBundleIdentifier</key>
  <string>$product_identifier_xml</string>
  <key>CFBundleVersion</key>
  <string>$product_version_xml</string>
  <key>CFBundleShortVersionString</key>
  <string>$product_version_xml</string>
  <key>CFBundleGetInfoString</key>
  <string>$product_comments_xml</string>
  <key>CFBundleIconFile</key>
  <string>iconfile</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>$product_copyright_xml</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>wails.com.$protocol_scheme_xml</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>$protocol_scheme_xml</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
EOF
}

create_icon_resource() {
  local resources_dir="$1"
  if [[ ! -f "$APP_ICON_SRC" ]]; then
    return 0
  fi

  if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    local iconset="$STAGE_DIR/icon.iconset"
    rm -rf "$iconset"
    mkdir -p "$iconset"
    if sips -z 16 16 "$APP_ICON_SRC" --out "$iconset/icon_16x16.png" >/dev/null \
      && sips -z 32 32 "$APP_ICON_SRC" --out "$iconset/icon_16x16@2x.png" >/dev/null \
      && sips -z 32 32 "$APP_ICON_SRC" --out "$iconset/icon_32x32.png" >/dev/null \
      && sips -z 64 64 "$APP_ICON_SRC" --out "$iconset/icon_32x32@2x.png" >/dev/null \
      && sips -z 128 128 "$APP_ICON_SRC" --out "$iconset/icon_128x128.png" >/dev/null \
      && sips -z 256 256 "$APP_ICON_SRC" --out "$iconset/icon_128x128@2x.png" >/dev/null \
      && sips -z 256 256 "$APP_ICON_SRC" --out "$iconset/icon_256x256.png" >/dev/null \
      && sips -z 512 512 "$APP_ICON_SRC" --out "$iconset/icon_256x256@2x.png" >/dev/null \
      && sips -z 512 512 "$APP_ICON_SRC" --out "$iconset/icon_512x512.png" >/dev/null \
      && sips -z 1024 1024 "$APP_ICON_SRC" --out "$iconset/icon_512x512@2x.png" >/dev/null \
      && iconutil -c icns "$iconset" -o "$resources_dir/iconfile.icns" >/dev/null; then
      rm -rf "$iconset"
      return 0
    fi
    rm -rf "$iconset"
    echo "[WARN] failed to generate macOS .icns icon, continuing without bundle icon" >&2
  fi
}

create_app_bundle_from_binary() {
  local app_dir="$1"
  if [[ ! -f "$APP_BINARY" ]]; then
    echo "[ERROR] failed to locate built .app bundle or fallback binary." >&2
    echo "        Expected binary: $APP_BINARY" >&2
    echo "        Build outputs:" >&2
    find "$ROOT_DIR/build" -maxdepth 4 -type f -o -type d 2>/dev/null | sed 's#^#        - #' >&2 || true
    exit 1
  fi

  echo "[INFO] no .app bundle found; assembling macOS .app from $APP_BINARY"
  mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
  cp "$APP_BINARY" "$app_dir/Contents/MacOS/trace-browser"
  chmod +x "$app_dir/Contents/MacOS/trace-browser"
  write_manual_info_plist "$app_dir/Contents/Info.plist"
  create_icon_resource "$app_dir/Contents/Resources"
}

manifest_has_target() {
  python3 -c 'import json, sys; data = json.load(open(sys.argv[1], encoding="utf-8")); target = sys.argv[2]; ok = any(target in (item.get("targets") or []) for item in data.get("files", [])); print("yes") if ok else None; sys.exit(0 if ok else 1)' "$ROOT_DIR/publish/runtime-manifest.json" "$TARGET"
}

runtime_entries_for_target() {
  python3 -c 'import json, sys; data = json.load(open(sys.argv[1], encoding="utf-8")); target = sys.argv[2]; entries = [str(item.get("path", "")).strip() for item in data.get("files", []) if target in (item.get("targets") or []) and str(item.get("path", "")).strip()]; print("\n".join(entries)); sys.exit(0 if entries else 1)' "$ROOT_DIR/publish/runtime-manifest.json" "$TARGET"
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

echo "[4/4] Assembling macOS app bundle..."
rm -rf "$APP_STAGE" "$APP_EXPORT"
mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"
if [[ -n "$APP_SOURCE" && -d "$APP_SOURCE" ]]; then
  echo "[INFO] found Wails .app bundle: $APP_SOURCE"
  ditto "$APP_SOURCE" "$APP_STAGE"
else
  create_app_bundle_from_binary "$APP_STAGE"
fi

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
