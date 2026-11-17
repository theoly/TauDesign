# 测试记录 · 历史任务持久化

日期：2026-11-17

## 命令与结果

- `pnpm test` 相关：`design_task_*`、`task_archive_migration`、`project_bundle_migration`、`failure_conversation_archive`、`unfinished_design_notice`、`multi_page` — 通过（共享树迁移偶发单独重跑通过）
- `pnpm run type-check` — 通过
- `pnpm build` — 通过
- Rust：`project_task_byte_budget_blocks_new_folders_when_full`、`archive_import_preserves_empty_directories…` — 通过

## 验收对照

- 列表走 `tasks/index.json` + `listDesignTaskPage`，inspect 才 `readDesignTask` 全量产物
- 取消数量硬顶；localStorage 8 MiB / folder 2 GiB 软预算拦截新建
- 迁移允许 `tasks/index.json`；删除标记任务不计入未完成列表
- 未引入 artifacts 裸裁剪；篡改产物仍使 `readDesignTask` 返回无效
