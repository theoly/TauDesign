# pnpm 迁移验收标准 (Acceptance Checklist)

## 功能验收 (Functional Checks) — 里程碑增量验收（任务完成时执行）
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-PM-01 | `package.json` 中已正确声明 `packageManager: "pnpm@12.14.0"`，脚本声明规范 | 文件核验 | [x] ✅ 验收通过 (`packageManager: "pnpm@12.14.0"`) |
| CHK-F-02 | T-PM-02 | `pnpm install` 正常执行，成功生成并更新 `pnpm-lock.yaml`，依赖完整无冲突 | `pnpm install` 执行日志 | [x] ✅ 验收通过 (`pnpm-lock.yaml` 锁定 211 packages，安装耗时 28.9s) |
| CHK-F-03 | T-PM-03 | `scripts/package-desktop.sh` 中的构建指令已调整为 `pnpm exec tauri build` | 脚本代码审查 | [x] ✅ 验收通过 (第 23 行已更新为 `pnpm exec tauri build`) |
| CHK-F-04 | T-PM-04 | `AGENTS.md` 中的构建环境与命令指南已全面更新为 pnpm | 文档审查 | [x] ✅ 验收通过 (AGENTS.md §1 & §5 及 README.md 均已切换为 pnpm) |

## 非功能验收 (Non-Functional Checks) — 全量验收（步骤四统一执行）
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- |
| CHK-N-01 | 静态类型检查 0 错误 | `pnpm run type-check` | [x] ✅ 验收通过 (0 errors, 0 warnings) |
| CHK-N-02 | 生产构建打包成功无报错 | `pnpm build` | [x] ✅ 验收通过 (tsc + vite build 耗时 3.97s，dist 产物完整) |
| CHK-N-03 | 全量回归测试 100% Pass，0 新增失败 | `pnpm test` | [x] ✅ 验收通过 (308 files, 3693 tests passed, 0 failed, 7.39s) |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`
