# pnpm 全面去 Bun 化任务清单 (Task Breakdown)
> 创建时间: 2026-11-11 | 负责人: Agent

| 任务 ID | 任务描述 | 涉及文件/模块 | 潜在影响/波及范围 | 前置依赖 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-PFM-01 | 修改 Tauri 配置：将 `beforeDevCommand` 和 `beforeBuildCommand` 替换为 `pnpm run` | `src-tauri/tauri.conf.json` | 桌面端开发与打包流程 | 无 | [x] ✅ 已完成 (2026-11-11, 修改为 pnpm run dev / pnpm run build) |
| T-PFM-02 | 修改 CI 流水线：将 GitHub Actions 中的 Bun 设置全面迁移为 `pnpm` + `node` | `.github/workflows/release.yml` | 自动化打包发布与测试流水线 | 无 | [x] ✅ 已完成 (2026-11-11, 引入 pnpm/action-setup@v4，移除 setup-bun) |
| T-PFM-03 | 更新中英文说明文档：将运行环境准备与所有命令替换为 `pnpm` | `README.CN.md`, `README.md` | 新用户与开发者文档指引 | 无 | [x] ✅ 已完成 (2026-11-11, 文档内所有 bun 安装与运行命令对齐为 pnpm) |
| T-PFM-04 | 改造 scripts 辅助脚本：将 Python 脚本中硬编码的 `bun` 调用调整为 `node` / `pnpm` | `scripts/` 相关脚本 | 自动化校验脚本 | 无 | [x] ✅ 已完成 (2026-11-11, 引入 tsx 支持，全量适配 pnpm exec tsx) |
| T-PFM-05 | 清理残留文件：移除废弃的 `bun.lock`，清理不再需要的依赖 | 根目录文件 | 依赖锁与工程文件清洁度 | 无 | [x] ✅ 已完成 (2026-11-11, 物理删除废弃 bun.lock) |
| T-PFM-06 | 全链路质量门禁验证：类型检查、打包构建、单测验证与全量回归 | 全工程 | 静态检查、构建与测试套件 | T-PFM-01~05 | [x] ✅ 已完成 (2026-11-11, type-check 0 错，build 3.50s，308 套件 3693 用例 100% Pass) |

状态标记: `[ ] 待开始` | `[>] 进行中` | `[x] ✅ 已完成` | `[!] ❌ 打回`
