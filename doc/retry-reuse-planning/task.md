# 重试信息复用与弹性重试 任务清单 (Task Breakdown)
> 创建时间: 2026-11-11 | 负责人: Agent

| 任务 ID | 任务描述 | 涉及文件/模块 | 潜在影响/波及范围 | 前置依赖 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-RRP-01 | 在规划阶段即时保存 `pageTaskPlan` 到消息状态，并在失败时完整保留已梳理规划 | `src/services/ai/engine/react/useAIEngineChat.ts` | 消息状态更新、会话展示 | 无 | [x] ✅ 已完成 (2026-11-11) |
| T-RRP-02 | `retryTurn` 支持提取并传入 `reusedPageTaskPlan`，`sendMessage` 优先将其作为 `inheritedTaskPlan` 注入执行管道，跳过规划阶段 | `src/services/ai/engine/react/useAIEngineChat.ts`, `src/services/ai/engine/pipeline/executor.ts` | 任务执行管道、进度文案 | T-RRP-01 | [x] ✅ 已完成 (2026-11-11) |
| T-RRP-03 | 支持弹性超时与无图降级重试选项（超时诊断提示、仅重试文字需求、重新梳理规划通道） | `src/components/chat/ChatDrawer.tsx`, `src/services/ai/engine/react/useAIEngineChat.ts` | ChatDrawer 错误卡片操作栏 | T-RRP-02 | [x] ✅ 已完成 (2026-11-11) |
| T-RRP-04 | 编写针对性单元测试与回归测试，验证规划复用、跳过规划阶段及带图降级重试链路 | `test/retry_reuse_planning.test.tsx` | 测试套件 | T-RRP-03 | [x] ✅ 已完成 (2026-11-11) |

状态标记: `[ ] 待开始` | `[>] 进行中` | `[x] ✅ 已完成` | `[!] ❌ 打回`
