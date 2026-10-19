#!/usr/bin/env bash
#
# 桌面端打包 —— macOS / Linux / Windows。
#
# 两条原则：
#   1. 产品名与版本一律从 src-tauri/tauri.conf.json 读取，不在脚本里硬编码。
#      此前正是硬编码导致产品改名后 bundle 路径失配，报「App bundle not found」。
#   2. 打包目标由本脚本按运行平台显式指定（--bundles），不依赖配置里的 targets，
#      避免在某个平台上悄悄产出空结果。
#
# 环境变量：
#   PACKAGE_PLATFORM=macos|linux|windows   覆盖平台探测（交叉核对脚本逻辑时用）
#   SKIP_BUILD=1                           跳过构建，只收集已有产物
#   PACKAGE_DMG=1                          macOS 额外生成 DMG（默认关闭）
#   PACKAGE_ZIP=1                          macOS 额外生成 ZIP（默认关闭）
set -euo pipefail

cd "$(dirname "$0")/.."

CONF="src-tauri/tauri.conf.json"
OUT_DIR="dist-desktop"
BUNDLE_ROOT="src-tauri/target/release/bundle"

# ── 前置检查 ────────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "❌ 需要 jq 来读取 $CONF"
  echo "   macOS: brew install jq ｜ Debian/Ubuntu: apt install jq ｜ Windows: winget install jqlang.jq"
  exit 1
fi

APP_NAME="$(jq -r '.productName' "$CONF")"
VERSION="$(jq -r '.version' "$CONF")"

if [ -z "$APP_NAME" ] || [ "$APP_NAME" = "null" ]; then
  echo "❌ 未能从 $CONF 读到 productName"
  exit 1
fi

# 文件名里把空格换成连字符
SLUG="${APP_NAME// /-}"

# ── 平台探测 ────────────────────────────────────────────────────────────
detect_platform() {
  if [ -n "${PACKAGE_PLATFORM:-}" ]; then
    echo "$PACKAGE_PLATFORM"
    return
  fi
  case "$(uname -s)" in
    Darwin) echo macos ;;
    Linux)  echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *)      echo unsupported ;;
  esac
}

PLATFORM="$(detect_platform)"

case "$PLATFORM" in
  macos)
    BUNDLES="app"
    ;;
  linux)
    # rpm 需要 rpmbuild，缺了就不要它，免得整次构建失败
    if command -v rpmbuild >/dev/null 2>&1; then
      BUNDLES="deb,rpm,appimage"
    else
      BUNDLES="deb,appimage"
      echo "ℹ️  未检测到 rpmbuild，跳过 rpm 目标"
    fi
    ;;
  windows)
    BUNDLES="msi,nsis"
    ;;
  *)
    echo "❌ 不支持的平台: $(uname -s)"
    echo "   可用 PACKAGE_PLATFORM=macos|linux|windows 强制指定。"
    exit 1
    ;;
esac

echo "🖥️  平台: $PLATFORM ｜ 目标: $BUNDLES"
echo "🚀 Step 1: 构建 ${APP_NAME} ${VERSION} ..."

if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "   (SKIP_BUILD=1，跳过构建)"
else
  bun run tauri build --bundles "$BUNDLES"
fi

mkdir -p "$OUT_DIR"

COLLECTED=()

# 复制单个产物到 dist-desktop，并规范化文件名
# $1 源文件  $2 目标文件名
collect() {
  local src="$1" dest="$OUT_DIR/$2"
  rm -rf "$dest"
  cp -R "$src" "$dest"
  COLLECTED+=("$2")
  echo "   ✓ $2"
}

# 取某个 bundle 子目录里第一个匹配的产物；找不到返回非零
first_match() {
  local dir="$1" pattern="$2"
  [ -d "$dir" ] || return 1
  local hit
  hit="$(find "$dir" -maxdepth 1 -name "$pattern" -print -quit 2>/dev/null)"
  [ -n "$hit" ] || return 1
  echo "$hit"
}

echo "📦 Step 2: 收集产物到 $OUT_DIR ..."

case "$PLATFORM" in

  macos)
    APP_SRC="$BUNDLE_ROOT/macos/${APP_NAME}.app"
    if [ ! -d "$APP_SRC" ]; then
      echo "❌ 未找到应用包: $APP_SRC"
      echo "   $BUNDLE_ROOT/macos 下现有:"
      if [ -d "$BUNDLE_ROOT/macos" ]; then
        ls -1 "$BUNDLE_ROOT/macos" | sed 's/^/     /'
      else
        echo "     (目录不存在)"
      fi
      echo "   名称对不上时核对 $CONF 的 productName；"
      echo "   若整个 bundle 目录都没有，检查 $CONF 的 bundle.active 是否为 true"
      echo "   —— Tauri v2 该字段默认 false，关闭时只产出裸可执行文件。"
      exit 1
    fi

    collect "$APP_SRC" "${APP_NAME}.app"

    if [ "${PACKAGE_DMG:-}" = "1" ]; then
      STAGE="$OUT_DIR/dmg-stage"
      DMG="$OUT_DIR/${SLUG}-${VERSION}-macos.dmg"

      echo "💿 生成 DMG ..."
      # 先清干净，避免同名目录嵌套或已有软链导致失败
      rm -rf "$STAGE" "$DMG"
      mkdir -p "$STAGE"
      cp -R "$APP_SRC" "$STAGE/"
      ln -s /Applications "$STAGE/Applications"
      hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
      rm -rf "$STAGE"
      COLLECTED+=("$(basename "$DMG")")
      echo "   ✓ $(basename "$DMG")"
    fi

    if [ "${PACKAGE_ZIP:-}" = "1" ]; then
      ZIP="$OUT_DIR/${SLUG}-${VERSION}-macos.zip"
      echo "🗜️  生成 Zip ..."
      rm -f "$ZIP"
      (cd "$OUT_DIR" && zip -r -q "$(basename "$ZIP")" "${APP_NAME}.app")
      COLLECTED+=("$(basename "$ZIP")")
      echo "   ✓ $(basename "$ZIP")"
    fi
    ;;

  linux)
    if hit="$(first_match "$BUNDLE_ROOT/deb" '*.deb')"; then
      collect "$hit" "${SLUG}-${VERSION}-linux-amd64.deb"
    fi
    if hit="$(first_match "$BUNDLE_ROOT/rpm" '*.rpm')"; then
      collect "$hit" "${SLUG}-${VERSION}-linux-x86_64.rpm"
    fi
    if hit="$(first_match "$BUNDLE_ROOT/appimage" '*.AppImage')"; then
      collect "$hit" "${SLUG}-${VERSION}-linux-x86_64.AppImage"
      chmod +x "$OUT_DIR/${SLUG}-${VERSION}-linux-x86_64.AppImage"
    fi
    ;;

  windows)
    if hit="$(first_match "$BUNDLE_ROOT/msi" '*.msi')"; then
      collect "$hit" "${SLUG}-${VERSION}-windows-x64.msi"
    fi
    if hit="$(first_match "$BUNDLE_ROOT/nsis" '*.exe')"; then
      collect "$hit" "${SLUG}-${VERSION}-windows-x64-setup.exe"
    fi
    ;;

esac

# ── 交付门禁：一件产物都没有就是失败，绝不静默「成功」 ──────────────────
if [ ${#COLLECTED[@]} -eq 0 ]; then
  echo "❌ 未收集到任何产物。$BUNDLE_ROOT 下现有:"
  if [ -d "$BUNDLE_ROOT" ]; then
    find "$BUNDLE_ROOT" -maxdepth 2 -mindepth 1 | sed 's/^/     /'
  else
    echo "     (目录不存在 —— 检查 $CONF 的 bundle.active 是否为 true)"
  fi
  exit 1
fi

echo "✅ 打包完成：${APP_NAME} ${VERSION} (${PLATFORM})"
for f in "${COLLECTED[@]}"; do
  printf '   %-46s %s\n' "$f" "$(du -sh "$OUT_DIR/$f" 2>/dev/null | cut -f1)"
done
