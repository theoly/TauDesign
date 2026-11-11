# 重试信息复用与弹性重试 验收标准 (Acceptance Checklist)

## 功能验收 (Functional Checks) — 里程碑增量验收（任务完成时执行）
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-RRP-01 | 规划完成触发 `onTaskPlan` 时，当前正在生成的消息即时挂载 `pageTaskPlan` 和 `workflowContract.pageTaskPlan`，若后续生成流发生错误中断，该规划不丢失 | 单元测试断言消息状态 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-01 Pass) |
| CHK-F-02 | T-RRP-02 | 当消息中已有 `pageTaskPlan` 时，点击重试调用 `retryTurn`，`sendMessage` 自动复用该规划，执行时跳过 `preparePageTaskPlan`，不再调用模型进行功能梳理，进度提示明确展示复用状态 | 单元测试模拟重试执行并断言不调用规划 LLM | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-02 Pass) |
| CHK-F-03 | T-RRP-02 | 用户选择【重新梳理规划】时，忽略旧规划，重新调用规划大模型并展示“正在梳理用户任务、必要信息与交互状态…” | 单元测试断言清空复用标志重新规划 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-03 Pass) |
| CHK-F-04 | T-RRP-03 | 当发生超时且请求带有图片时，界面呈现针对性超时提示，并提供【仅重试文字要求（跳过参考图）】操作，点击后不带图片发起重试 | 单元测试与组件测试 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-04 & CHK-F-05 Pass) |

## 非功能验收 (Non-Functional Checks) — 全量验收（步骤四统一执行）
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- |
| CHK-N-01 | 静态类型/lint 检查 0 错误 | `bun run type-check` | [ ] 待核验 |
| CHK-N-02 | 全量回归测试 100% Pass，0 新增失败 | `bun test` | [ ] 待核验 |
| CHK-N-03 | 生产构建/编译成功无报错 | `bun run build` | [ ] 待核验 |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`
