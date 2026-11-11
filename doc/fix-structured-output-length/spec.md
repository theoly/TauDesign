# 结构化输出达到输出上限 (Length Limit) 缺陷修复规范

## 1. 背景与问题表现 (Background & Issue)
用户在输入包含较长表单需求（“将基础资料、择偶要求的表单集成到本页，类似附件图片样式... 基础资料... 14个字段...”）并引用画框 `@完善资料弹窗` 时，调用 `prov-custom-1794361625648 / deepseek/deepseek-flash` 模型发生错误：
- **错误信息**: `生成失败: 结构化输出达到输出上限，未应用部分结果。请缩小修改范围或提高输出预算后重试。`
- **调用状态**: `HTTP 200·结束: length`；`已观察正文 0 字符·推理 0 字符·JSON 结果 0 字符`；耗时 15 秒；
- **重试表现**: 用户点击【直接重试】，继续报相同错误，无法推进页面生成。

## 2. 根因全链路剖析 (Root Cause Analysis)

1. **`preparePageTaskPlan` 写死过低的 `maxTokens: 3072`**：
   - 复杂页面的业务功能规划（包含 1~8 个 features，每个 feature 下有 information、interactions、states 以及顶层 questions 等）体积较大；
   - 早期代码将规划阶段写死为 `maxTokens: 3072`，在复杂业务表单或字段较多的场景下，生成的完整规划很容易达到并突破 3072 tokens，被服务端截断并返回 `finish_reason: "length"`。
2. **第三方 Provider 上思考模型（如 deepseek-flash / R1）未被正确关闭 thinking**：
   - 现有的 `supportsDeepSeekThinking` 强行锁定了 `officialHost(..., 'api.deepseek.com')`，自定义 Provider（如聚合服务、OpenRouter、本地代理等）无法匹配；
   - 在未显式传参关闭思考时，这类模型在输出正文 JSON 前会消耗大量甚至数千 tokens 进行思考，导致在 3072 tokens 内根本无法输出完整的 JSON 闭环。
3. **规划阶段缺少针对「输出上限」的格式纠错与自愈机制**：
   - `preparePageTaskPlan` 中的重试捕获仅限定了 `error instanceof SyntaxError || error instanceof PageTaskPlanFormatError`；
   - 当收到 `结构化输出达到输出上限` 错误时，重试循环直接将其抛出终结，不提供任何纠错机会。
4. **`observeRequestActivity` 在 `generateObject` 异常时统计归零**：
   - `generateObject` 在 `observeRequestActivity` 中未将底层接收到的流式文本/推理片段同步到活动计数器，导致在报错中断时，UI 界面错误展示为“已观察正文 0 字符·推理 0 字符”，给用户排查带来误导。

## 3. 修复方案 (Solution)

1. **充足预算保障**:
   - 将 `preparePageTaskPlan` 的请求上限从 3072 提升至 `8192`（结合 `requestOutputCap` 与父账本充裕预算），给长表单规划提供充足的 Token 空间。
2. **通用深度思考控制**:
   - 扩展 `supportsDeepSeekThinking` 与 `structuredChatOptions`，在 OpenAI 兼容模式下，对包含 `deepseek` 的模型支持通用 thinking 控制；并在结构化输出中显式传入 `enableThinking: false`，避免非必要的深度思考耗尽 token。
3. **结构化输出上限自愈重试 (Self-Healing Loop)**:
   - 在 `preparePageTaskPlan` 的纠错重试中，将“输出上限超限”纳入第 2 次自愈范围；第二次请求自动注入“上次响应达到输出上限，请以更紧凑简洁的格式输出，精炼各功能组与字段”的紧凑指令。
4. **活动观察字符统计对齐**:
   - 优化 `observeRequestActivity`，在 `generateObject` 执行期间实时传递流式分片给 `request.chunk`，失败时真实反映已接收的正文/推理字符量。
5. **UI 容灾提示与重试体验**:
   - `ChatDrawer` 针对输出上限错误提供清晰的提示，并允许用户以更充足的预算和紧凑模式重试。

## 4. 范围边界 (Scope)
- **In Scope**:
  - `src/services/ai/pageTaskPlan.ts`
  - `src/services/ai/structuredRequestPolicy.ts`
  - `src/services/ai/modelRequestCodec.ts`
  - `src/services/ai/requestActivity.ts`
  - `src/components/chat/ChatDrawer.tsx`
  - 自动化回归测试编写
- **Out of Scope**:
  - 不修改任何核心 base CSS 样式规则或破坏已有契约。
