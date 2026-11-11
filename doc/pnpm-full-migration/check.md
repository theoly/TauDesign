# pnpm 全面去 Bun 化验收标准 (Acceptance Checklist)

## 功能验收 (Functional Checks) — 里程碑增量验收（任务完成时执行）
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-PFM-01 | `tauri.conf.json` 中已配置 `beforeDevCommand: "pnpm run dev"` 与 `beforeBuildCommand: "pnpm run build"` | 源码检查与 JSON 验证 | [x] ✅ 验收通过 (`src-tauri/tauri.conf.json` 第 9-10 行成功切换为 pnpm) |
| CHK-F-02 | T-PFM-02 | `.github/workflows/release.yml` 不再包含 `oven-sh/setup-bun` 与 `bun` 指令，使用 `pnpm/action-setup` 与 `pnpm` | 工作流文件审查 | [x] ✅ 验收通过 (引入 `pnpm/action-setup@v4`，构建/脚本对齐为 `pnpm` / `node`) |
| CHK-F-03 | T-PFM-03 | `README.CN.md` 和 `README.md` 中所有命令（安装、启动、测试、构建、打包）均更新为 `pnpm` | 文档内容审查 | [x] ✅ 验收通过 (两份 README 均彻底清除 bun 安装与运行说明，统一为 pnpm) |
| CHK-F-04 | T-PFM-04 | `scripts/` 相关脚本中的 `bun` 调用均已适配为 `node` 或 `pnpm` | 脚本代码审查与运行 | [x] ✅ 验收通过 (安装 `tsx` 并将 Python 工具中的命令对齐为 `['pnpm', 'exec', 'tsx', ...]`) |
| CHK-F-05 | T-PFM-05 | 根目录下 `bun.lock` 已被移除，仅保留 `pnpm-lock.yaml` | 目录文件检查 | [x] ✅ 验收通过 (`bun.lock` 已执行 `git rm` 物理移除) |

## 非功能验收 (Non-Functional Checks) — 全量验收（步骤四统一执行）
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- |
| CHK-N-01 | 静态类型检查 0 错误 | `pnpm run type-check` | [x] ✅ 验收通过 (`tsc --noEmit` 0 errors, 0 warnings) |
| CHK-N-02 | 生产构建打包成功无报错 | `pnpm build` | [x] ✅ 验收通过 (`tsc && vite build` 耗时 3.50s，产物正常输出至 `dist/`) |
| CHK-N-03 | 全量回归测试 100% Pass，0 新增失败 | `pnpm test` | [x] ✅ 验收通过 (308 files, 3693 tests passed, 0 failed, 22682 expect calls) |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`
