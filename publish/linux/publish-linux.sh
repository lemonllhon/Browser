#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/publish/output"
STAGING_ROOT="$ROOT_DIR/publish/staging/linux"
ARCH=""
VERSION=""
SKIP_BUILD=0
SKIP_RUNTIME_VERIFY=0
KEEP_STAGING=0
ALLOW_CROSS=0

usage() {
  cat <<'EOF'
Usage:
  publish/linux/publish-linux.sh --arch <amd64|arm64> [options]

Options:
  --arch <amd64|arm64>   Target architecture (required)
  --version <ver>        Package version (default: read from build/config.yml)
  --skip-build           Skip wails3 build step
  --skip-runtime-verify  Skip runtime hash verification (not recommended)
  --keep-staging         Keep staging directory after packaging
  --allow-cross          Allow building target arch different from host arch
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
    --allow-cross)
      ALLOW_CROSS=1
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

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[ERROR] this script must run on Linux host" >&2
  exit 1
fi

host_arch_raw="$(uname -m)"
case "$host_arch_raw" in
  x86_64) HOST_ARCH="amd64" ;;
  aarch64|arm64) HOST_ARCH="arm64" ;;
  *)
    echo "[ERROR] unsupported host architecture: $host_arch_raw" >&2
    exit 1
    ;;
esac

if [[ "$ALLOW_CROSS" -ne 1 && "$HOST_ARCH" != "$ARCH" ]]; then
  echo "[ERROR] host arch is $HOST_ARCH but target arch is $ARCH." >&2
  echo "        For stable builds, run this script on native runner, or pass --allow-cross if you know the toolchain is ready." >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] required command not found: $1" >&2
    exit 1
  fi
}

require_cmd python3
require_cmd tar
require_cmd dpkg-deb
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

TARGET="linux-$ARCH"
APP_ICON_SRC="$ROOT_DIR/build/appicon.png"
APP_BIN="$ROOT_DIR/build/bin/trace-browser"
BUILD_CONFIG="$ROOT_DIR/build/config.yml"
CHROME_README_SRC="$ROOT_DIR/chrome/README.md"
APP_PACKAGE_NAME="trace-browser"
APP_BINARY_NAME="trace-browser"
APP_ICON_NAME="trace-browser"
APP_DESKTOP_ID="trace-browser.desktop"
APPSTREAM_ID="trace-browser"
APP_NAME="Trace Browser"
APP_SUMMARY="Multi-profile browser launcher with proxy-pool management"
APP_MAINTAINER="Trace Browser Team"
APP_MAINTAINER_EMAIL="lemon@lemon.vin"
APP_HOMEPAGE="https://github.com/black-ant/Ant-Browser"
BUILD_DATE_UTC="$(date -u +%F)"
ICON_SIZES=(16 24 32 48 64 128 256 512)

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
echo "  Trace Browser Linux Publish"
echo "========================================"
echo "Target : $TARGET"
echo "Version: $VERSION"
echo "Root   : $ROOT_DIR"
echo

if [[ "$SKIP_RUNTIME_VERIFY" -ne 1 ]]; then
  bash "$ROOT_DIR/tools/runtime/verify-runtime.sh" "$TARGET"
else
  echo "[WARN] runtime verification skipped"
fi

assert_runtime_files_for_target

if [[ ! -f "$APP_ICON_SRC" ]]; then
  echo "[ERROR] app icon missing: $APP_ICON_SRC" >&2
  exit 1
fi

if [[ ! -f "$BUILD_CONFIG" ]]; then
  echo "[ERROR] build/config.yml missing: $BUILD_CONFIG" >&2
  echo "        This development branch must keep a complete Wails3 source tree." >&2
  exit 1
fi

if [[ "$SKIP_BUILD" -ne 1 ]]; then
  echo "[1/6] Syncing Wails3 product version..."
  python3 - "$BUILD_CONFIG" "$VERSION" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
version = sys.argv[2].strip()
text = path.read_text(encoding="utf-8")
pattern = re.compile(r'(?m)^(\s{2}version:\s*["\']?)([^"\'\r\n]+)(["\']?)\s*$')
match = pattern.search(text)
if not match:
    raise SystemExit("info.version missing in build/config.yml")
old_version = match.group(2).strip()
text = pattern.sub(lambda m: f"{m.group(1)}{version}{m.group(3)}", text, count=1)
path.write_text(text, encoding="utf-8")
print(f"build/config.yml info.version: {old_version} -> {version}")
PY

  echo "[2/6] Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && BROWSERSLIST_IGNORE_OLD_DATA=1 npm ci --prefer-offline --no-audit --no-fund)

  echo "[3/6] Building frontend assets..."
  (cd "$ROOT_DIR/frontend" && BROWSERSLIST_IGNORE_OLD_DATA=1 npm run build)

  echo "[4/6] Building app binary with Wails3..."
  rm -f "$APP_BIN"
  (
    cd "$ROOT_DIR"
    TRACE_BROWSER_VERSION="$VERSION" VERSION="$VERSION" wails3 build -s -platform "linux/$ARCH" -o trace-browser
  )
else
  echo "[WARN] skipping build step"
fi

if [[ ! -f "$APP_BIN" ]]; then
  echo "[ERROR] app binary not found: $APP_BIN" >&2
  exit 1
fi

echo "[5/6] Assembling staging files..."
APP_STAGE="$STAGING_ROOT/$TARGET/app"
DEB_STAGE="$STAGING_ROOT/$TARGET/deb"
rm -rf "$APP_STAGE" "$DEB_STAGE"
mkdir -p "$APP_STAGE/bin" "$APP_STAGE/data" "$DEB_STAGE"

cp "$APP_BIN" "$APP_STAGE/trace-browser"
cp "$ROOT_DIR/publish/config.init.linux.yaml" "$APP_STAGE/config.yaml"
copy_runtime_files_for_target "$APP_STAGE/bin"
chmod +x "$APP_STAGE/trace-browser"

if [[ -f "$CHROME_README_SRC" ]]; then
  mkdir -p "$APP_STAGE/chrome"
  cp "$CHROME_README_SRC" "$APP_STAGE/chrome/README.md"
fi

mkdir -p "$OUTPUT_DIR"
TAR_NAME="TraceBrowser-${VERSION}-linux-${ARCH}.tar.gz"
tar -C "$APP_STAGE" -czf "$OUTPUT_DIR/$TAR_NAME" .

PKG_ROOT="$DEB_STAGE/${APP_PACKAGE_NAME}_${VERSION}_${ARCH}"
INSTALL_ROOT="$PKG_ROOT/opt/trace-browser"
DESKTOP_ROOT="$PKG_ROOT/usr/share/applications"
ICON_THEME_ROOT="$PKG_ROOT/usr/share/icons/hicolor"
PIXMAPS_ROOT="$PKG_ROOT/usr/share/pixmaps"
METAINFO_ROOT="$PKG_ROOT/usr/share/metainfo"
mkdir -p "$INSTALL_ROOT/bin" "$INSTALL_ROOT/data" "$PKG_ROOT/DEBIAN" "$DESKTOP_ROOT" "$PIXMAPS_ROOT" "$METAINFO_ROOT"

for size in "${ICON_SIZES[@]}"; do
  mkdir -p "$ICON_THEME_ROOT/${size}x${size}/apps"
done

cp "$APP_STAGE/trace-browser" "$INSTALL_ROOT/trace-browser"
cp "$APP_STAGE/config.yaml" "$INSTALL_ROOT/config.yaml"
cp "$APP_STAGE/bin/"* "$INSTALL_ROOT/bin/"
if [[ -f "$APP_STAGE/chrome/README.md" ]]; then
  mkdir -p "$INSTALL_ROOT/chrome"
  cp "$APP_STAGE/chrome/README.md" "$INSTALL_ROOT/chrome/README.md"
fi
cp "$APP_ICON_SRC" "$ICON_THEME_ROOT/512x512/apps/${APP_ICON_NAME}.png"
for size in "${ICON_SIZES[@]}"; do
  if [[ "$size" != "512" ]]; then
    ln -sf "../../512x512/apps/${APP_ICON_NAME}.png" "$ICON_THEME_ROOT/${size}x${size}/apps/${APP_ICON_NAME}.png"
  fi
done
ln -sf "../icons/hicolor/512x512/apps/${APP_ICON_NAME}.png" "$PIXMAPS_ROOT/${APP_ICON_NAME}.png"
touch "$INSTALL_ROOT/data/.keep"
chmod +x "$INSTALL_ROOT/trace-browser" "$INSTALL_ROOT/bin/"*

cat > "$DESKTOP_ROOT/$APP_DESKTOP_ID" <<EOF
[Desktop Entry]
Version=1.0
Name=${APP_NAME}
Comment=${APP_SUMMARY}
Exec=/opt/trace-browser/${APP_BINARY_NAME}
TryExec=/opt/trace-browser/${APP_BINARY_NAME}
Icon=${APP_ICON_NAME}
StartupWMClass=trace-browser
Terminal=false
Type=Application
StartupNotify=true
Categories=Network;Utility;
Keywords=browser;profile;proxy;launcher;
EOF

cat > "$METAINFO_ROOT/${APP_PACKAGE_NAME}.metainfo.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${APPSTREAM_ID}</id>
  <name>${APP_NAME}</name>
  <summary>${APP_SUMMARY}</summary>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>NOASSERTION</project_license>
  <developer_name>${APP_MAINTAINER}</developer_name>
  <launchable type="desktop-id">${APP_DESKTOP_ID}</launchable>
  <icon type="stock">${APP_ICON_NAME}</icon>
  <provides>
    <binary>${APP_BINARY_NAME}</binary>
  </provides>
  <description>
    <p>Trace Browser manages isolated browser profiles, proxy binding, and local environment configuration for multi-account workflows.</p>
    <p>The Debian package installs a launcher, theme icons, and runtime helpers for standard Linux desktop environments.</p>
  </description>
  <categories>
    <category>Network</category>
    <category>Utility</category>
  </categories>
  <keywords>
    <keyword>browser</keyword>
    <keyword>profile</keyword>
    <keyword>proxy</keyword>
    <keyword>launcher</keyword>
  </keywords>
  <url type="homepage">${APP_HOMEPAGE}</url>
  <releases>
    <release version="${VERSION}" date="${BUILD_DATE_UTC}" />
  </releases>
</component>
EOF

chmod 0644 "$DESKTOP_ROOT/$APP_DESKTOP_ID" "$METAINFO_ROOT/${APP_PACKAGE_NAME}.metainfo.xml" "$ICON_THEME_ROOT/512x512/apps/${APP_ICON_NAME}.png"

INSTALLED_SIZE_KB="$(
  du -sk "$INSTALL_ROOT" "$DESKTOP_ROOT" "$ICON_THEME_ROOT" "$PIXMAPS_ROOT" "$METAINFO_ROOT" \
    | awk '{sum += $1} END {print sum}'
)"

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: ${APP_PACKAGE_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: ${APP_MAINTAINER} <${APP_MAINTAINER_EMAIL}>
Homepage: ${APP_HOMEPAGE}
Installed-Size: ${INSTALLED_SIZE_KB}
Depends: libc6 (>= 2.31), libgtk-3-0, libglib2.0-0, libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37
Description: ${APP_NAME} desktop app
 Multi-profile browser launcher with proxy-pool management.
 Trace Browser manages isolated browser profiles, proxy binding, and
 local environment configuration for multi-account workflows.
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
ln -sf /opt/trace-browser/trace-browser /usr/bin/trace-browser
chmod +x /opt/trace-browser/trace-browser /opt/trace-browser/bin/* || true
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli refresh-cache --force >/dev/null 2>&1 || true
fi
if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
fi
exit 0
EOF

cat > "$PKG_ROOT/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  rm -f /usr/bin/trace-browser
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli refresh-cache --force >/dev/null 2>&1 || true
fi
if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
fi
exit 0
EOF

chmod 0755 "$PKG_ROOT/DEBIAN/postinst" "$PKG_ROOT/DEBIAN/postrm"

DEB_NAME="${APP_PACKAGE_NAME}_${VERSION}_${ARCH}.deb"
if dpkg-deb --help 2>/dev/null | grep -q -- '--root-owner-group'; then
  dpkg-deb --root-owner-group --build "$PKG_ROOT" "$OUTPUT_DIR/$DEB_NAME" >/dev/null
else
  dpkg-deb --build "$PKG_ROOT" "$OUTPUT_DIR/$DEB_NAME" >/dev/null
fi

echo "[6/6] Artifacts generated:"
echo "  - $OUTPUT_DIR/$TAR_NAME"
echo "  - $OUTPUT_DIR/$DEB_NAME"

if [[ "$KEEP_STAGING" -ne 1 ]]; then
  rm -rf "$APP_STAGE" "$DEB_STAGE"
fi

echo "Done."
