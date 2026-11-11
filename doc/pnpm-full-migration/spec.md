# pnpm 全面去 Bun 化迁移规范 (Full pnpm Migration Spec)

## 1. 背景与目标 (Background & Goal)
在初步引入 `pnpm` 作为工程包管理器后，项目中依然存在多处与 Bun 深度耦合或遗留的配置与文档，包括：
- 桌面配置文件 `src-tauri/tauri.conf.json` 仍配置 `bun run dev` 与 `bun run build` 作为 Tauri 构建前置钩子；
- 持续集成发布工作流 `.github/workflows/release.yml` 仍使用 `oven-sh/setup-bun` 及大量 `bun` 脚本指令；
- 中英文根文档（`README.CN.md`、`README.md`）仍将 Bun 列为首选环境和安装命令；
- 自动化辅助脚本与验证工具（如 `scripts/` 下的 Python / Shell 脚本）仍以 `bun` 作为执行器；
- 根目录仍残留废弃的 `bun.lock`。

本特性的目标是：**全面清理和替换项目中所有遗留的 Bun 配置、脚本和文档，使工程的桌面构建、CI 发布流水线、开发指南与自动化运维工具完全统一在 pnpm / Node.js 体系下**。

## 2. 范围边界 (Scope)

### In Scope
1. **Tauri 桌面配置**:
   - `src-tauri/tauri.conf.json`: `beforeDevCommand` -> `pnpm run dev`, `beforeBuildCommand` -> `pnpm run build`。
2. **GitHub Actions 持续集成**:
   - `.github/workflows/release.yml`:
     - 移除 `oven-sh/setup-bun` 与 `BUN_VERSION`；
     - 引入 `pnpm/action-setup@v4` (pnpm 12.x) 与 `actions/setup-node@v4` (Node 22)；
     - 全量替换 `bun install` -> `pnpm install --frozen-lockfile`；
     - 全量替换 `bun run ...` -> `pnpm run ...`；
     - 全量替换 `bun scripts/release.mjs` -> `node scripts/release.mjs`。
3. **项目使用文档**:
   - `README.CN.md` & `README.md`:
     - 运行环境安装要求更新为 Node.js 22 + pnpm，移除对安装 Bun 的前置依赖说明；
     - 快速上手与常用脚本示例全部更新为 `pnpm`。
4. **工程脚本对齐**:
   - `scripts/verify-design-delivery.py` 等调用 `bun` 的 Python/Shell 脚本，统一替换为基于环境的 `node` / `pnpm` 执行。
5. **残留文件清理**:
   - 移除已废弃的 `bun.lock`。

### Out of Scope
- 修改 308 个测试文件（3693 个用例）的内部断言结构；测试统一由 `pnpm test` 透传驱动。

## 3. 验收标准概览 (Summary Acceptance)
- `pnpm tauri dev` / `pnpm tauri build` 前置钩子正常拉起 pnpm；
- GitHub Actions CI 语法与 action 正确；
- 全量自动化测试、类型检查 `pnpm run type-check` 和生产构建 `pnpm build` 100% 通过；
- 仓库内除特意保留的兼容性代码（如 `md5.ts` 环境注释）外，无遗留 bun 构建或命令调用。
