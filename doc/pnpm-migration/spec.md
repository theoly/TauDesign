# 包管理器与工程脚本全面切换至 pnpm 规范 (PNPM Migration Spec)

## 1. 背景与目标 (Background & Goal)

根据团队工程环境演进与用户决策，将 TauDesign 的包管理器由原 Bun 切换为 **pnpm**。
- **目标**：
  1. 使用 **pnpm** 作为官方指定的依赖管理工具与项目脚本执行入口；
  2. 生成并更新权威的 `pnpm-lock.yaml`，保障在 Node.js / pnpm 环境下的依赖解析与安装确定性；
  3. 在 `package.json` 中声明 `packageManager: "pnpm@12.14.0"`；
  4. 规范所有开发生命周期命令为 `pnpm`（如 `pnpm dev`, `pnpm build`, `pnpm run type-check`, `pnpm test`）；
  5. 更新桌面打包脚本 `scripts/package-desktop.sh` 及项目准则 `AGENTS.md`，使智能体协作与开发者体验保持一致；
  6. 底层单测运行仍由 `pnpm test` 透传驱动已有的 308 个测试套件，确保全量 3,693+ 单元测试 100% 毫秒级通过。

## 2. 范围边界 (Scope: In Scope / Out of Scope)

### In Scope
- `package.json`: 增加 `packageManager`，确保 scripts 支持 pnpm 驱动；
- `pnpm-lock.yaml`: 通过 `pnpm install` 刷新与锁定依赖树；
- `scripts/package-desktop.sh`: 将 `bun run tauri build` 调整为 `pnpm exec tauri build`（或 `pnpm run tauri:build`）；
- `AGENTS.md`: 更新构建环境说明与必备开发验证命令规范；
- `.gitignore`: 登记相关文档与依赖目录规则；
- 验证 `pnpm install`、`pnpm run type-check`、`pnpm run build`、`pnpm test` 全量通过。

### Out of Scope
- 重写已有的 308 个单测文件（保持现有测试套件原样，由 `pnpm test` 统一驱动）。

## 3. 命令映射规范 (Command Mapping)

| 操作 | 既有命令 (Bun) | 新规范命令 (pnpm) |
| :--- | :--- | :--- |
| 安装依赖 | `bun install` | `pnpm install` |
| 启动开发环境 | `bun run dev` | `pnpm dev` |
| 生产构建 | `bun run build` | `pnpm build` |
| 类型静态检查 | `bun run type-check` | `pnpm run type-check` |
| 执行全部单测 | `bun test` | `pnpm test` |
| Tauri 原生命令 | `bunx tauri dev` | `pnpm tauri dev` / `pnpm exec tauri dev` |
