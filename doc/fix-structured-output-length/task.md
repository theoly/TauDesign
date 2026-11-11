# 结构化输出达到输出上限修复任务清单 (Task Breakdown)
> 创建时间: 2026-11-11 | 负责人: Agent

| 任务 ID | 任务描述 | 涉及文件/模块 | 潜在影响/波及范围 | 前置依赖 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-SOL-01 | 扩展思考控制策略：使自定义 Provider 上的 DeepSeek/兼容模型在结构化阶段可安全关闭 thinking | `src/services/ai/structuredRequestPolicy.ts`, `src/services/ai/modelRequestCodec.ts` | 模型请求体构造与 token 消耗 | 无 | [x] ✅ 已完成 (2026-11-11, 支持 isDeepSeekModel 通用 thinking 控制) |
| T-SOL-02 | 提升 `preparePageTaskPlan` 规划 Token 预算至 8192 并显式传递 `enableThinking: false` | `src/services/ai/pageTaskPlan.ts`, `src/services/ai/engine/pipeline/executor.ts` | 规划阶段模型请求 | T-SOL-01 | [x] ✅ 已完成 (2026-11-11, 显式关闭思考并支持预算上限) |
| T-SOL-03 | 实现规划阶段针对「达到输出上限」的紧凑自愈重试机制 | `src/services/ai/pageTaskPlan.ts` | 规划纠错重试链路 | T-SOL-02 | [x] ✅ 已完成 (2026-11-11, 捕获 isLengthError 注入紧凑指令并重试自愈) |
| T-SOL-04 | 修复 `observeRequestActivity` 在 `generateObject` 异常时的字符统计断层 | `src/services/ai/requestActivity.ts` | 进度状态面板展示 | 无 | [x] ✅ 已完成 (2026-11-11, 拦截 onUsage 与 onTransportEvidence 累计字符) |
| T-SOL-05 | 优化 ChatDrawer 错误呈现卡片：针对输出上限给出明确自愈重试提示 | `src/components/chat/ChatDrawer.tsx` | 前端对话交互抽屉 | 无 | [x] ✅ 已完成 (2026-11-11, 增加诊断说明与直接重试(紧凑自愈)按钮) |
| T-SOL-06 | 编写自动化测试（CHK-F-01 ~ CHK-F-05）并执行全量回归 | `test/structured_output_length_fix.test.tsx`, 全工程 | 质量门禁与回归保障 | T-SOL-01~05 | [x] ✅ 已完成 (2026-11-11, 5 项单测 100% Pass，类型检查 0 错，构建成功) |

状态标记: `[ ] 待开始` | `[>] 进行中` | `[x] ✅ 已完成` | `[!] ❌ 打回`
