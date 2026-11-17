# 历史任务持久化（无数量硬顶）

## 目标

- 取消 `tasks/` 下设计任务**文件夹数量硬顶**。
- 以轻量索引 + 分页保证任务记录列表的响应速度。
- 以**体积软预算**约束两端（桌面文件夹 / 浏览器 localStorage）增长。
- **保留完整任务产物**（manifest 引用的 HTML / tree / journal）；不采用裸裁剪 artifacts。

## 为何不做裸裁剪（1A）

直接删除已交付任务的 `artifacts/` 而保留旧 manifest，会被 `readDesignTask` 判为损坏，并阻断交付状态同步、产物核对与迁移完整性检查。画布 `screens/`、撤销历史虽可独立存活，但任务层对工程有影响，故本特性采用完整产物策略（1B）。

## 索引契约

- 路径：`tasks/index.json`（原子写；非任务目录，不受任务事务路径拦截）。
- 版本：`{ version: 1, updatedAt, totalBytes, entries[], invalid[] }`。
- 每条 `entries[]` 仅含列表/背填所需摘要：`id/state/timestamps/requestPreview/errorPreview?/bytes/artifactCount/hasTree/publication?/recoveryClaimed?/originTaskId?`。
- 缺失或损坏时扫描重建：只读各任务 `manifest.json`（不强制加载 HTML）；无法校验的目录进入 `invalid`。
- `saveDesignTask` / 状态同步 / 删除 / 显式清理后 upsert 或移除索引项。

## 分页 API

- `listDesignTaskPage({ cursor, limit=50, includeCompleted })`：按 `updatedAt` 降序分页。
- `listDesignTaskIndex`：首屏等价于第一页；`hasMore` 表示还有下一页；`totalMatching` 为过滤后总数。
- 点选任务再 `readDesignTask` 全量加载产物。

## 体积软预算

| 后端 | 默认软顶 |
|------|----------|
| `folder` | 2 GiB |
| `localStorage` | 8 MiB |

- 仅在**新建**任务目录 / import 新 id 时检查；覆盖同一 id 允许。
- 超限错误引导在任务记录中清理整条任务（`removeDesignTask`）；不静默删产物。
- Tombstone（`.locks/*.deleted`）不计入 live 体积。

## 不变量

- CAS / `publishTaskManifest` / recovery-claim / tombstone / attempts append 语义不变。
- 失败会话背填只依赖索引摘要 + 必要时轻量 manifest，打开聊天时不全量拉 HTML。
- 迁移后重建或携带 `tasks/index.json`。
