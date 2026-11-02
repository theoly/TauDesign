# M3-03 子请求继承与父预算审计

2026-11-01。范围沿用原 M3-03：分区、自动/手动续写、语义格式重试、受控修复、有限补丁的规则与内容合同继承，以及请求/输出/时限和取消后应用防护。原 M3-03 当前范围已逐项审计通过，不放行 M3-04/05、M4 或 M5。

## 本轮任务与验收

- [x] CE-01 审计各子请求生产调用方、冻结规则/内容来源、父账本所有者与关闭时机；区分设计来源父身份和用户另行发起的独立操作额度。
- [x] CE-02 补业务规划→同页分区→失败检查点→手动续写的真实 Pipeline/Core 组合回归；在两个设备档位核对功能/信息/交互合同、原规则、独立子请求身份和精确累计额度。拒绝改变业务规划或用新账本恢复，且不消耗合法检查点。
- [x] CE-03 补业务规划→自动续写组合回归：规划和每次实际生成均计入同一父预算，原业务内容与规则进入各次生成消息；恰好耗完额度的完整结果仍可验收。
- [x] CE-04 复核原协议/修复/重试/传输/时限测试的实际断言，运行专项与全量测试、类型检查及构建后记录结果；仅证据覆盖原范围才关闭 M3-03。

## 证据边界

预算记录的是应用 Core 调用及申请的输出上限，已失败请求不退款；不是物理 HTTP 数或费用账单。aiService 错误不会自动再次请求，原生重定向仍按既有受控逐跳策略处理，不把它伪装成语义重试。确定性本地文字修复没有模型调用；用户另行确认的候选一次修复使用明确独立预算，不能续期原生成额度。

业务规划定义功能、信息、操作与静态界面状态，并不实现后台或可点击原型。子请求继承其冻结输入不等于已证明模型遵从；最终内容/渲染与 required/advisory 的完整门禁仍按 M4 验收。

## 生产链路逐项核对

| 子流程 | 当前源码合同和预算所有权 | 已核对的实际验证 |
| --- | --- | --- |
| 事实/业务规划→普通页面 | pageTaskPlan.preparePageTaskPlan 在传入原账本上 generateObject；Pipeline 冻结 pageTaskPlan 后构建规则包，再用 withTaskBudget(withGuidanceReceipts(core)) 生成。事实规划不注入视觉规则，也不伪造视觉调用回执；请求仍计入父账本。 | page_task_pipeline/page_task_plan；本轮两档位规划+两次自动续写共4调用、3视觉回执、27648申请输出，功能/必要信息/操作前提与冻结规则进入所有生成消息，精确耗尽仍通过。 |
| 同页分区、区块内自动续写 | sectionedGeneration.instruct 从原消息深拷贝，只增加当前输出协议和区块数据；公共骨架、当前区块职责及原任务规则并存。plan/各区块及一次有界接续都调用相同 requestCore；未合格的区块不合并。 | sectioned_chat、guided_draft_repair、manual_continuation；本轮业务规划+分区计划+失败/恢复组合两档位共5调用、19456输出，保持已完成区块、操作文案与独立回执。 |
| 手动续写 | useAIEngineChat.continuationSessionsRef 保留原账本、TaskContract、业务规划和检查点；Pipeline 校验账本归属及内存精确证明，inheritContinuationTask 比较所有授权/来源，再消费一次检查点。不得读取当前开关重新选规则。 | manual_continuation 的原/新账本、截止、取消、重放、并发、重算哈希及无规则旧来源；本轮缺失/改变业务规划或替换账本均0新增调用/0预留，之后原检查点仍正常完成。 |
| 分析/多页规划格式纠正 | modificationReview 和 multiPageService 各拥有一次明确规划预算并 finally close；最多2次，只有 JSON/格式错误可以纠正，原始输入与规则保留。网络/授权错误不重试。多页确认生成是用户确认后的独立批次，不伪装成原规划继续。 | analysis_guidance 的失败/成功替代、错误类型、取消和原上下文；multi_page 的格式重试、确认来源、编辑后重规划、整批失败不写；task_budget_ownership 验证预算策略。 |
| 元素有限JSON、区块JSON与补充局部修改 | structuredEditExecutor 深拷贝任务数据，业务规划先执行；规则只选择一次并按 finite-json/fragment-json 绑定。所有区域经 guardedCore，在同一账本预留并前后检查当前性；一处失败不返回部分页面。生产调用来自聊天、检查器、润色面板。 | design_protocol_integration、structured_guidance、structured_edit_executor、functional_modification_chat 与 independent_progress_lifecycle；各档位协议/消息窗口/只读区外/预算、跨区失败与迟到结果断言。 |
| 单页/批量重塑与有限分组补丁 | RestylePanel.runOne 自有单目标预算或接收批次原账本，executeRestyleBatch 对确认队列只创建一次、试跑复用不再请求；executeRestyleTarget 在同一 frozen selection 上包装原账本。restylePatches 每组2048，仅修改库存类/变量；不重新检索或按组重置。 | design_protocol_dry_run 两档位样式补丁，restyle_guidance_protocol 原生/导入语义、guided_draft_repair 中第二组拒绝后全不应用、task_budget_ownership 精确额度/外部所有者、restyle_delivery 时限与实际 History 提交。 |
| 自动控件修复 | CanvasToolExecutor 与 multiPageService 传入原 generation/batch 账本，controlledStyleRepair 使用原任务冻结选择，原1800 JSON窗口内放入可容纳规则并显式记录省略；不能改变文本/结构/授权，最多1次后重验所有门禁。 | page_creation_repair、page_creation_repair_chat：原账本已有生成消耗，修复累计、预算拒绝0回执、冻结输入、失败/取消不能成功，实际页面/History及新页保存证据。 |
| 用户另行候选修复/草稿建议 | useProjectStore.repairStagedCandidate 接收显式单次预算，qualification/model/verification 属一个窗口；proposeStyleRepair 回指原设计输入身份而非续期额度。草稿建议另有1800单请求窗口；本地确认文案修复为0调用、仅历史来源。 | candidate_repair、failed_design_drafts_ui、guided_draft_repair；资格已保存而0调用、到期/停止/重开不能多次请求、原页不变、手填竞争及原生成预算不改变。 |
| 传输异常及协议透传 | aiEngineCore 每次语义调用只创建一次 transport；AIService 的 Rust 异常分支返回，浏览器 fetch 一次。Rust 的循环用于受控重定向，send 失败不自动重发。正文上限/temperature/思考选项经过 prepareModelRequest→AIService/Rust options，不在底层放宽。 | action_output_budget：四协议的实际 Mock fetch 出站值及 network/429/500 每种仅1调用且失败仍扣额度；native_proxy_cancellation 的模拟 Rust IPC 失败和 restyle_bounded 的选项透传。不是实机网络验收。 |
| 取消、到期与最终应用 | taskBudget 预留时冻结单调截止时间，结算再核对；run 覆盖资源/iframe/存储等非模型等待。根调用持有原账本，最终写入/暂存前 assertActive；关闭不会退还额度，已合法提交History与未提交分开报告。 | task_budget、page_creation、multi_page、candidate_repair、structured_edit_executor 与 progress-audit.md 的真实两引擎/两设备12项重塑提交窗口；取消后迟到不能写，恰好耗完预算的合法结果可交付。 |
| 应用所有权与关闭 | 聊天在 finally 关闭，只有内存可恢复检查点保留原账本；结构化 ownsBudget 仅关闭自建账本；批次只关闭自建而不关闭传入账本。终止、工程/模型改变或卸载清理原任务，候选就绪后的人工采纳按原任务授权及实时证据检查，不用新预算续期原生成。 | task_budget_ownership、manual_continuation、independent_progress_lifecycle、restyle_owner；progress-audit.md 已验收 M4-04，不将可见阶段当作内容或交付通过。 |

以上继承的是冻结的原始业务/规则输入和有限输出合同；不是承诺每个模型会遵从，也不把可编辑本地记录当密码学证明。未有新生产行为变更，CE阶段补齐真实组合回归及原 M3-03 的逐路径审计，后续RC生产校验另在runtime-compatibility-audit.md验收；完整 schema/兼容和失效/采纳矩阵仍由 M3-04/05负责。

## 最终验收（2026-11-01）

- 新增6项真实组合回归：两设备各覆盖业务规划/自动续写、业务规划/分区失败/手动恢复，以及改变或缺失业务规划/替换账本拒绝且不消耗合法检查点。首次12/0（原6+新增6），没有产品失败或放宽断言。
- 19文件协议/预算/分区/续写/修复专项376/0、2266断言；原生代理模拟专项8/0、19断言。
- 全量 `bun test`：2785 pass / 0 fail / 18009 assertions / 245 files / 62.65秒。`bun run type-check` exit0，`bun run build` exit0，Vite2.63秒；`git diff --check`通过。
- CE验收时生产代码、脚本和构建输入与bc1654f完全相同；与既有浏览器源码清单比较的366个非测试文件均一致。保留 `2026-11-01-provenance-visible-ui` 两引擎两设备完整结果及 `2026-11-01-remaining-restyle-lifetime` 的12项实际渲染/提交窗口，不冒充本轮重跑浏览器。
- 日志及716文件源码SHA256归档到 `evidence/2026-11-01-child-execution/`，原始证据按工程规范Git忽略。无真实Provider调用/盲评、无新增原生实机/打包/发布或Git操作；模拟Rust IPC不是原生网络验收。

至此关闭原M3-03。当前顶层17完成/10待完成；M3-04全部schema/旧工程兼容、M3-05完整失效矩阵、M4剩余门禁及M5对照仍有独立要求。自动参考设计规则保持默认关闭。
