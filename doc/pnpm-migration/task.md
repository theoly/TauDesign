# pnpm 迁移任务清单 (Task Breakdown)
> 创建时间: 2026-11-11 | 负责人: Agent

| 任务 ID | 任务描述 | 涉及文件/模块 | 潜在影响/波及范围 | 前置依赖 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-PM-01 | 更新 `package.json`，声明 `packageManager: "pnpm@12.14.0"` 并优化 scripts | `package.json` | 依赖管理与构建流程 | 无 | [x] ✅ 已完成 (2026-11-11, package.json 声明 pnpm@12.14.0) |
| T-PM-02 | 运行 `pnpm install` 刷新 `pnpm-lock.yaml`，验证依赖安装完整性 | `pnpm-lock.yaml` | `node_modules` 依赖树 | T-PM-01 | [x] ✅ 已完成 (2026-11-11, 生成 pnpm-lock.yaml，211 依赖解析成功) |
| T-PM-03 | 更新桌面打包脚本中的调用命令为 pnpm | `scripts/package-desktop.sh` | 桌面打包发布流程 | T-PM-01 | [x] ✅ 已完成 (2026-11-11, 统一为 pnpm exec tauri build) |
| T-PM-04 | 更新项目协作规范 `AGENTS.md`，推荐与统一命令入口为 pnpm | `AGENTS.md`, `README.md` | 团队与智能体协作标准 | T-PM-01 | [x] ✅ 已完成 (2026-11-11, 替换全局开发构建命令文档) |
| T-PM-05 | 运行 `pnpm` 全链路校验（安装、构建、类型检查与全量单测） | 全工程 | 静态检查、构建与测试套件 | T-PM-02 | [x] ✅ 已完成 (2026-11-11, type-check 0 错，build 3.97s，308 套件 3693 用例 100% Pass) |

状态标记: `[ ] 待开始` | `[>] 进行中` | `[x] ✅ 已完成` | `[!] ❌ 打回`
