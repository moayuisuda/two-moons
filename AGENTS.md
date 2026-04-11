# 协作规则

## 通用

- always 使用中文回答
- 代码必须清晰简洁
- 高内聚、低耦合，不写面条代码
- 保证可维护性、可测试性
- 必要处补充逻辑注释
- 不做兼容存量数据逻辑
- 不做冗余兜底
- 单一数据源，不重复实现同一功能
- 优先复用现有技术栈
- 不做降级实现，不做模拟实现，代码必须可直接用于生产
- 可复用能力优先抽成通用组件
- 不把开发心智暴露到用户界面

## Android 发包

- 发包单一版本源：`/Users/anhaohui/twomoons/.env.local` 中的 `NEXT_PUBLIC_VERSION`
- 应用内更新检测读取 `NEXT_PUBLIC_VERSION`
- 远端版本源：`/Users/anhaohui/Documents/stocks/config/db.json` 中 `presets[id=version].latest`
- 上面两处版本号必须一致
- Android 发包时，APK 内 API 地址必须使用生产域名 `https://two-moons.site`
- 本地开发地址 `https://two-moons:3000` 不能打进发布包

- `android/app/build.gradle` 中：
  - `versionName` 必须等于 `NEXT_PUBLIC_VERSION`
  - `versionCode` 规则：`major * 10000 + minor * 100 + patch`

- 发布新版本时，禁止只改 Android 原生版本号
- 发布新版本时，禁止只改 `.env.local` 不改远端 `latest`

## 发包命令

- 统一使用：

```bash
./scripts/build_apk.sh <version>
```

- 示例：

```bash
./scripts/build_apk.sh 1.4.0
```

- 该命令必须完成：
  - 更新 `.env.local`
  - 更新 `android/app/build.gradle`
  - 更新 `/Users/anhaohui/Documents/stocks/config/db.json`
  - 执行 `yarn export`
  - 执行 `npx cap sync android`
  - 执行 `./gradlew assembleRelease`
  - 覆盖 `/Users/anhaohui/Documents/stocks/two-moons-release/moonbox-latest.apk`
  - 提交并推送 `/Users/anhaohui/Documents/stocks/config`
  - 提交并推送 `/Users/anhaohui/Documents/stocks/two-moons-release`

## 产物路径

- 构建产物：
  `/Users/anhaohui/twomoons/android/app/build/outputs/apk/release/app-release.apk`
- 发布产物：
  `/Users/anhaohui/Documents/stocks/two-moons-release/moonbox-latest.apk`

## 发布后校验

- 校验 APK 路径、大小、修改时间、SHA-256
- 校验 `NEXT_PUBLIC_VERSION`、`versionName`、`versionCode`、远端 `latest` 全部一致
- 校验 `config` 与 `two-moons-release` 两个仓库都已推送且工作区干净
