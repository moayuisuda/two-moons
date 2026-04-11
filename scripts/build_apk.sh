#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ANDROID_GRADLE_FILE="$ROOT_DIR/android/app/build.gradle"
ANDROID_OUTPUT_METADATA="$ROOT_DIR/android/app/build/outputs/apk/release/output-metadata.json"
CONFIG_REPO_DIR="/Users/anhaohui/Documents/stocks/config"
CONFIG_DB_FILE="$CONFIG_REPO_DIR/db.json"
TARGET_APK="/Users/anhaohui/Documents/stocks/two-moons-release/moonbox-latest.apk"
SOURCE_APK="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
PRODUCTION_SERVER_BASE="https://two-moons.site"

usage() {
  cat <<'EOF'
用法：
  ./scripts/build_apk.sh <version>

示例：
  ./scripts/build_apk.sh 1.4.0

说明：
  - NEXT_PUBLIC_VERSION 是发包单一版本源
  - APK 构建固定使用生产 API：https://two-moons.site
  - Android versionName 会同步为同一版本号
  - Android versionCode 由语义化版本推导：major * 10000 + minor * 100 + patch
  - 远端 latest 对应的本地配置仓库文件会同步更新到相同版本号
EOF
}

if [ $# -ne 1 ]; then
  usage
  exit 1
fi

VERSION="$1"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ 非法版本号：$VERSION"
  echo "   版本号必须是 x.y.z 格式，例如 1.4.0"
  exit 1
fi

IFS="." read -r MAJOR MINOR PATCH <<<"$VERSION"
VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))

if [ "$VERSION_CODE" -le 0 ]; then
  echo "❌ 生成的 versionCode 非法：$VERSION_CODE"
  exit 1
fi

echo "🚀 开始 Android 发包流程"
echo "📌 版本号：$VERSION"
echo "📌 versionCode：$VERSION_CODE"
echo "📌 生产 API：$PRODUCTION_SERVER_BASE"

node - "$ENV_FILE" "$VERSION" <<'NODE'
const fs = require("fs");

const [envFile, version] = process.argv.slice(2);
const content = fs.readFileSync(envFile, "utf8");
const nextLine = `NEXT_PUBLIC_VERSION=${version}`;
const updated = content.match(/^NEXT_PUBLIC_VERSION=.*/m)
  ? content.replace(/^NEXT_PUBLIC_VERSION=.*/m, nextLine)
  : `${content.trimEnd()}\n\n${nextLine}\n`;

fs.writeFileSync(envFile, updated);
NODE

node - "$ANDROID_GRADLE_FILE" "$VERSION" "$VERSION_CODE" <<'NODE'
const fs = require("fs");

const [gradleFile, versionName, versionCode] = process.argv.slice(2);
const content = fs.readFileSync(gradleFile, "utf8");

const next = content
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

if (next === content) {
  throw new Error("未找到可更新的 Android 版本号字段");
}

fs.writeFileSync(gradleFile, next);
NODE

node - "$CONFIG_DB_FILE" "$VERSION" <<'NODE'
const fs = require("fs");

const [dbFile, version] = process.argv.slice(2);
const content = fs.readFileSync(dbFile, "utf8");
const data = JSON.parse(content);

if (!Array.isArray(data.presets)) {
  throw new Error("config/db.json 缺少 presets 数组");
}

const preset = data.presets.find((item) => item.id === "version");
if (!preset) {
  throw new Error("config/db.json 缺少 id=version 的 preset");
}

preset.latest = version;
fs.writeFileSync(dbFile, `${JSON.stringify(data, null, 2)}\n`);
NODE

echo "📝 已同步版本源："
echo "   - $ENV_FILE"
echo "   - $ANDROID_GRADLE_FILE"
echo "   - $CONFIG_DB_FILE"

echo "📦 执行静态导出..."
cd "$ROOT_DIR"
NEXT_PUBLIC_SERVER_BASE="$PRODUCTION_SERVER_BASE" yarn export

echo "🔄 同步 Capacitor Android 资源..."
npx cap sync android

echo "🏗️  构建 release APK..."
cd "$ROOT_DIR/android"
./gradlew assembleRelease

if [ ! -f "$SOURCE_APK" ]; then
  echo "❌ 未找到 APK：$SOURCE_APK"
  exit 1
fi

mkdir -p "$(dirname "$TARGET_APK")"
cp "$SOURCE_APK" "$TARGET_APK"

echo "🔍 校验产物..."
node - "$ANDROID_OUTPUT_METADATA" "$VERSION" "$VERSION_CODE" <<'NODE'
const fs = require("fs");

const [metadataFile, expectedVersion, expectedCode] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const element = data?.elements?.[0];

if (!element) {
  throw new Error("output-metadata.json 缺少 elements[0]");
}

if (String(element.versionName) !== expectedVersion) {
  throw new Error(
    `versionName 不一致：${element.versionName} !== ${expectedVersion}`
  );
}

if (String(element.versionCode) !== String(expectedCode)) {
  throw new Error(
    `versionCode 不一致：${element.versionCode} !== ${expectedCode}`
  );
}
NODE

echo "✅ 发包完成"
echo "📦 APK：$SOURCE_APK"
echo "🚚 发布包：$TARGET_APK"
echo "🌐 APK 内 API：$PRODUCTION_SERVER_BASE"
echo "📌 前端版本：$VERSION"
echo "📌 Android versionName：$VERSION"
echo "📌 Android versionCode：$VERSION_CODE"
echo "📌 远端 latest（本地配置仓库）：$VERSION"
