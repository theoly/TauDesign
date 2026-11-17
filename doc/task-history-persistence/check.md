# 验收标准 · 历史任务持久化

- [x] 打开任务记录首屏不读取全部 HTML；inspect 才全量读 — `listDesignTaskPage` / DesignTaskRecords
- [x] 任务数超过原 100 在未超体积软顶时可新建 — 空目录 120+ import；Rust/TS 无数量门禁
- [x] 超软顶时错误明确，清理整条任务后可继续 — `体积预算` 文案与事务/迁移测试
- [x] 已交付任务的 screens / 撤销 / 导出不受影响 — delivery / records UI 回归
- [x] 损坏/篡改产物仍被 `readDesignTask` 判无效 — `design_task_repository` 篡改用例
- [x] `pnpm test`（相关）/ `type-check` / `build` 与 Rust 相关单测通过 — 见 [test.md](./test.md)
