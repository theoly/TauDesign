# 重试信息复用与弹性重试规范 (Retry Reuse & Resilient Planning Spec)

## 1. 背景与目标 (Background & Goal)

在 TauDesign 的 AI 设计执行流中，生成新页面或进行功能性修改通常分为两个核心阶段：
1. **业务规划阶段 (Functional Planning)**：由 `preparePageTaskPlan` 梳理用户任务、必要信息、交互状态与变更范围，产出 `PageTaskSnapshot` (`plan.features` / `plan.interactions` 等)；
2. **页面组装与生成阶段 (Assembling & Generating)**：基于该规划调用模型生成完整页面 HTML，并经过本地校验、微质感修复与渲染。

### 现状痛点
1. **重复规划与阶段浪费**：若第 2 阶段（或传输流）失败中断，用户点击【直接重试】时，系统丢弃了上一轮已经梳理好的完整功能规划，再次向模型发起规划请求，界面再次显示“梳理功能、信息与交互”，浪费大量 Token 与数十秒等待，并增加了重试再次失败的风险；
2. **规划成果中途丢失**：执行管道中，`onTaskPlan` 生成 `workflowContract.pageTaskPlan` 后，未即时持久化到当次会话消息的响应实体上。若生成 HTML 阶段报错中断，该规划产物在异常处理中被整体冲掉；
3. **死锁式机械重试**：当因模型服务拥堵、冷启动或非视觉模型接收大图等原因导致 `90s` 首包超时（`[timeout] 数据流传输超时: 超过 90s 未收到任何新分片`）时，点击【直接重试】会用完全相同的超时设置、相同的超大 payload（含图片 Base64）重新向同一个假死端点发送，导致“重试也会继续出错”，陷入死循环。

### 核心目标
1. **确定性信息复用**：只要前次任务中已成功生成有效的 `PageTaskSnapshot`，重试时自动复用该规划快照，跳过 Phase 1（规划阶段），不再向大模型重复发送规划请求，界面不再显示“梳理功能、信息与交互”，直接进入页面生成阶段；
2. **规划产物即时留痕**：`PipelineExecutor.execute` 触发 `onTaskPlan` 时，立即更新会话消息状态挂载 `pageTaskPlan` 与 `workflowContract`，即使后续生成流中断或报错，该条消息依然保留完整的规划数据；
3. **弹性重试与自愈路径**：
   - 当遇到超时（`[timeout]`）或网络异常时，重试请求支持弹性放宽首包/流心跳时限（如重试时支持 120s~150s 保护）；
   - 当任务附带参考图且发生超时或网络失败时，除常规重试外，提供【仅重试文字要求（跳过参考图）】的安全降级重试通道，避免因第三方模型无法处理大图或识图假死导致的永久死锁；
   - 界面上清晰提供【直接重试 (复用规划)】与【重新梳理规划】的双轨选项。

---

## 2. 范围边界 (Scope: In Scope / Out of Scope)

### In Scope
- `src/services/ai/engine/react/useAIEngineChat.ts`：
  - `retryTurn` 支持传参指定复用 `PageTaskSnapshot`（`reusedPageTaskPlan`）；
  - `onTaskPlan` 回调时即时将 `taskPlan` 保存到活跃消息上；
  - `sendMessage` 支持消费 `reusedPageTaskPlan` 并作为 `inheritedTaskPlan` 注入 `executor`；
  - 提供 `retryWithoutAttachment` 或带图失败时的降级重试能力；
  - 重试时提供弹性超时时限。
- `src/components/chat/ChatDrawer.tsx`：
  - 在存在可复用规划时，按钮文案优化为明确的【直接重试 (复用规划)】，并提供【重新梳理规划】通道；
  - 在发生超时且包含参考图时，展示【仅重试文字要求】降级操作及针对性的超时诊断提示。
- `src/services/ai/aiService.ts` / `src/services/ai/engine/core/aiEngineCore.ts`：
  - 允许在重试或结构化调用中传递弹性超时参数 `timeoutMs`，避免首包 90s 刚性截断。

### Out of Scope
- 修改画框沙箱底层 iframe 渲染架构；
- 修改历史撤销重做（Undo/Redo）的持久化数据格式；
- 更改已有的白名单与 TokenLint 规则。

---

## 3. 用户故事与业务规则 (User Stories & Business Rules)

### US-1: 已完成规划的任务，重试时直接复用
- **场景**：用户发送修改或新建诉求，AI 顺利完成了“梳理功能、信息与交互”，但在生成完整页面 HTML 时因网络中断或超时失败。
- **行为**：
  - 消息保留已梳理的 `pageTaskPlan`；
  - 错误卡片下方主操作按钮为【直接重试 (复用规划)】；
  - 用户点击后，无需再次调用大模型梳理功能，直接提示“复用已确认的功能规划，正在生成页面…”，跳过规划阶段直接生成 HTML。

### US-2: 规划尚未完成（如规划本身超时）时的重试优化
- **场景**：大模型在第一步“梳理功能、信息与交互”时超过 90s 未返回首包，报错 `[timeout] 数据流传输超时: 超过 90s 未收到任何新分片`。
- **行为**：
  - 由于此时规划尚未产出，重试仍需进行规划；
  - 但重试请求将获得弹性延长的超时保护（如 150s），防止由于大模型思考时间长在 90s 被卡死；
  - 若包含附件图片，额外提供【仅重试文字要求（跳过参考图）】快捷按钮，一键排查是否因图片导致端点假死。

### US-3: 用户期望修改需求并重新梳理规划
- **场景**：用户不希望复用旧的规划，想从头重新梳理。
- **行为**：
  - 提供次级操作【重新梳理规划】，点击后清除该条消息的规划快照，从 Phase 1 重新执行。

---

## 4. 数据流与契约 (Data Flow & Contracts)

### 数据流流转
```mermaid
flowchart TD
    UserReq[用户发送请求 / 重试] --> CheckReuse{是否有可复用的 pageTaskPlan?}
    CheckReuse -->|是，来自重试或前次留存| SkipPlan[跳过 preparePageTaskPlan]
    SkipPlan --> Assemble[进入 Phase 2: 组装与页面生成]
    
    CheckReuse -->|否，或用户选重新梳理| DoPlan[执行 Phase 1: 梳理功能、信息与交互]
    DoPlan --> OnPlan[onTaskPlan 回调]
    OnPlan --> SaveToMsg[即时写入当前 message.pageTaskPlan]
    SaveToMsg --> Assemble
    
    Assemble --> StreamGen[调用模型生成 HTML]
    StreamGen -->|成功| Candidate[生成页面候选并交付]
    StreamGen -->|失败超时/断开| FailCard[展示失败卡片]
    FailCard --> RetainCheck{是否持有已完成的 pageTaskPlan?}
    RetainCheck -->|持有| ShowReusedRetry[显示【直接重试 (复用规划)】]
    RetainCheck -->|未持有| ShowNormalRetry[显示【直接重试 (弹性延时)】+ 针对性排查选项]
```

---

## 5. UI/UX 规范 (UI/UX Spec)

1. **按钮层级与文案**：
   - 含有可复用规划时：主按钮【直接重试 (复用规划)】（带刷新图标），次级按钮【重新梳理规划】；
   - 规划本身失败或无规划时：主按钮【直接重试】；
   - 附带图片且发生超时时：辅助操作【仅重试文字要求（不附参考图）】；
2. **状态提示文案**：
   - 复用规划重试时，顶部进度显示：“已复用先前梳理的功能规划，正在生成页面…”，不出现“正在梳理用户任务、必要信息与交互状态…”。
