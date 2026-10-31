# 本次方案文档验证

日期：2026-10-29。交付对象为完整设计流程、指南规范及实施方案，不是检索功能代码。

## 初版实际完成（修订前快照）

- 对照现有 `guide.md`、固定版本外部 Skill 分析及当前工作流/布局/原重构报告；核对 workflowCatalog、TaskContract、DesignBrief、候选/创建门禁、分区/续写、有限重塑补丁、参考设备及导入代码职责。
- 新增本目录七份方案文档；原指南增加完整方案导航，文档目录允许纳入版本管理。
- 检查本地 Markdown 链接、设计规范 ID、实施任务 ID、验收 ID、计划必需章节及 `git diff --check`。

本地校验已通过：

| 检查 | 结果 |
| --- | --- |
| 方案文件 | 7 份齐全 |
| Markdown 本地链接 | 17 个目标存在 |
| 代码围栏 | 成对闭合 |
| 设计规范 ID | 38 个，全部唯一 |
| 实施任务 ID | 27 个，全部唯一，未勾选 |
| 验收 ID | 26 个，全部唯一，未勾选 |
| 实施方案必需章节 | 架构、模型、检索、预算、接线、检查、界面、里程碑、迁移、评估全部存在 |
| `git diff --check` | 退出码 0 |

链接、围栏、ID 和状态由内联 Python（pathlib/re）检查：解析本目录及原 guide 的 Markdown 本地目标、断言上述 ID 数量/唯一性，并拒绝 task/check 中出现 `[x]`；未执行任何应用运行态验收。任何功能验收方框继续保持未执行。

## 未执行项与证据边界

本次没有业务代码修改，不运行全量应用测试/构建来冒充新功能已实现；没有真实模型请求、用户工程写入、外部数据收集、安装 Skill、浏览器/原生交付验收、Git 推送或打包发布。

前一轮规则更新的 2,214 项单测/类型/构建记录见[原验证报告](../ui-design-guidance/test.md)，只对其源码状态有效。外部仓库继续使用已读取的固定提交，不宣称重新核验了实时 HEAD。

未来实施按 `task.md` 和 `check.md` 逐项执行；所有性能、检索和质量指标目前均为拟定目标，不能视为实测结果。

## 二次审核验证（2026-10-29）

按用户“再次审核方案”重新核对本目录、已有设计指导/外部固定版本审阅，以及 `restylePatches.ts`、`sectionedGeneration.ts`、`boundedContinuation.ts`、`workflowValidation.ts`、`workflowSources.ts`、`candidateValidation.ts`、`pageRepairRecord.ts` 的现有接口与合同。8 类方案缺口和修改映射见 [review.md](./review.md)。

本轮修改仅涉及本目录 Markdown。初版数字保留为历史快照，当前验证结果如下：

| 检查 | 本轮实际结果 |
| --- | --- |
| 文档文件 | 8 份（新增 review.md） |
| 本地 Markdown 链接 | 最终复核 26 个文件目标存在；包括原 guide 的链接；不代表远端链接或锚点均经请求验证 |
| 代码围栏/实施主章节 | 成对闭合；10 个实施主章节齐全 |
| 设计规范 | 38 个 ID 唯一 |
| 任务 | 27 个 ID 唯一，全部未勾选 |
| 验收 | 34 个 ID 唯一，全部未勾选 |
| 审核发现 | R-01～R-08 唯一，均有任务/验收映射 |
| 新增合同要素 | 输出适配、派发回执、父任务预算、required/advisory、依赖失效、评分分母与 24 对实验条款存在 |
| 空白错误 | `git diff --check` 退出码 0 |

使用 Python pathlib/re 重查文件目标、围栏、ID、数量及未执行状态。无业务代码改动，未重跑应用单测/构建或调用模型；这次“审核修正完成”仅代表方案文档已修订，不代表新增能力已通过 AC 验收。

## 首批源码实施（2026-10-29）

本节取代前面“尚无业务代码改动”作为当前状态；前文保留为方案审阅阶段的历史记录。

### 产物与范围

- `designKnowledge/types.ts`：最小只读规则、选择输入/输出合同；当前只支持建议类规则，不创建新的自动阻断注册。
- `catalog.ts`：20 条原创概括规则，记录设备/操作/组件、触发、正反例、例外和来源；没有打包外部 PDF、页面或素材。
- `validation.ts`：数据结构、唯一身份、共享别名、废弃关系、冲突、双档位类名及危险样例检查。来源 CSS 不套原生未知类判断。
- `selector.ts`：中文短语/中英混合、英文完整词、明确 ID、目标范围过滤、冲突及弃答；最多三条、完整规则预算、省略原因与独立选择快照。未增加 BM25、额外模型调用或不相关回退。
- `core.ts` 与原 craft 重导出：四份通用正文只有一个维护位置；实际 PromptBuilder、润色及 Pipeline 的兼容接线未改变。
- 新增 `test/design_knowledge.test.ts`，19 个测试。首次运行发现正文窄列问题被对话页规则排在前面，补具体缺陷短语及匹配优先级后通过；未放宽原有测试。

### 实际验证

| 阶段/命令 | 结果 |
| --- | --- |
| 实施前 `bun test` | 2,214 pass / 0 fail / 14,098 assertions / 199 files，36.13s |
| 实施前 type-check / build | 均退出 0；Vite 2.52s |
| 新目录＋原规则/实际接线定向测试 | 25 pass / 0 fail / 168 assertions / 3 files |
| 实施后 `bun test` | 2,233 pass / 0 fail / 14,183 assertions / 200 files，36.40s |
| 实施后 `bun run type-check` | 退出 0 |
| 实施后 `bun run build` | 退出 0；Vite 2.49s |
| 原有默认提示词预算与生产接线 | 全量套件通过，无提高长度阈值 |
| `git diff --check` | 退出 0 |

原始日志与本轮 13 个相关源码文件 SHA256 清单保存于本地 `evidence/2026-10-29-foundation/`（按既有约定不纳入 Git）。全量测试仍会输出既有 React act 提示，没有测试失败。基线 HEAD 为 `81f40b835707ec9f0af609dffda11e635a4ee11a`，测试包含之前尚未提交的指导规则更新，不能宣称为纯 HEAD 构建。

### 尚未交付

M0 的完整旧工程/评估冻结与 M2–M5 尚未完成。选择器只是可测试基础，不在真实请求中自动启用；没有实际注入/派发回执、DesignBrief 扩展、父任务预算接线、新门禁/界面或模型对照。AC 中 34 个完整流程验收仍全部未勾选，M1 四项代码任务已记录完成，但 M0 前置放行不据此跳过。没有调用 Provider、修改用户设计工程、原生验收、提交或推送。

## 场景选择与简表实施（2026-10-29，当前状态）

本节更新前一批的未完成清单：已冻结评估集，已实现 DesignBrief 扩展与实验 PromptBuilder 适配；尚未接入 Pipeline 默认请求或候选回执。

### 已实现与验证

- `relevance-v1.json`：60 例冻结；40 校准、20 留出。校准为 21 正例、19 负例；留出 10 正例、10 负例。测试校验唯一身份和 family 隔离，不对留出执行检索评分。
- `evaluation.ts`：按正负例分别计算首选正确/回退数；正例弃答算错，禁止规则单独统计。校准实测正例 **21/21**、负例 **19/19**、禁止规则 **0**；只代表该人工样例集，不是总体准确率或留出成绩。
- `selectWithNarrowRetry`：一次本地收窄重试，设备/范围/特征/预算不变；不对导入、未知目标和预算失败重试，不新增网络请求。
- `designBrief.ts`：提供与推断的页面类型分开，主题继承项目，精确/语义义务保留来源且复制输入，套餐/对话有明确布局，未知类型不套营销模板。既有 contextId 继续表示工程风格身份，不把它当整个任务身份。
- `promptAdapter.ts`：仅替换可让位的通用 craft 段，最多使用原段字符空间；失败回退原正文。显式实验参数才生效；HTML/JSON 输出合同、白名单和设备段不被改变。
- 新增 6 项集成测试；既有设计简表 UI/Pipeline 接线测试保持通过。默认请求现在可以携带增强简表，但未默认使用场景规则替换。

### 回归记录

| 检查 | 实际结果 |
| --- | --- |
| 选择/预算/简表/现有渲染接线定向回归 | 32 pass / 0 fail / 199 assertions / 3 files |
| 全量 `bun test` | **2,239 pass / 0 fail / 14,266 assertions / 201 files，39.50s** |
| `bun run type-check` | 退出 0 |
| `bun run build` | 退出 0；Vite 2.62s |
| 原提示词预算/章节/默认 craft 接线 | 既有测试通过，未放宽阈值 |
| `git diff --check` | 退出 0 |

日志、仅校准分区的明细报告和当前相关源码/数据 SHA256 保存在本地 `evidence/2026-10-29-selection/`，不提交运行产物。`baseline-contracts.md` 记录入口与现有预算/门禁，不宣称已经实现父任务共享账本。

### 当前边界

任务累计 **10 项代码/文档任务完成、17 项未完成**，34 个完整流程验收仍未勾选。M0-01 的旧工程快照、M2-05 全协议/检索比较、M3 全入口及实际派发回执、M4 用户界面/验证、M5 独立评估仍需继续。没有真实 Provider 请求、用户工程写入、浏览器/原生实机验收或发布；不能把离线校准通过解释为新机制已提升真实模型交付质量。

## M3 请求与候选回执试点（2026-10-29，当前状态）

### 实际落地

- `receipt.ts` 定义冻结规则包、任务作用域绑定、逐请求回执与恢复校验；语义消息在现有 AIEngineCore 调用边界取指纹，不记录正文、凭证或图片二进制。不将该应用边界描述为网络/Provider 已确认。
- Pipeline 新增内部显式实验参数；新建/明确局部修改按真实 TaskContract 选择规则，设备取工程，局部特征由内部调用方提供。问答/主题不生成包，保真导入保持原转换流程。没有改动用户默认开关。
- 有界续写和分区使用同一现有 core 包装，每次调用有独立 requestId/parentTaskId。completed 等待文字及相关元数据完成；不表示页面质量或实际业务行为通过。
- 实际仅组装、传输抛错、取消、缺少所选规则、正文被改、操作/设备不适用或作用域变化均不能满足新包的交付校验；取消不会被晚到成功改写。包内规则用冻结正文校验，不重新读取当前目录版本。
- 新包随 TaskContract 经现有候选侧车保存重开；旧无包合同兼容。交付时在原工作流门禁入口核对新包，preflight 只检查可在发送前判定的部分；不跳过原有渲染/资源/结构检查。

### 验证结果

新增 `test/design_guidance_receipt.test.ts` **12 项测试**：真实 Pipeline→MockTransport 请求、新建/明确元素范围/问答排除、组装与完成区别、晚到取消、传输失败、元数据/作用域/规则改动、每请求身份、凭证/图片不持久化、保真渐变导入、真实候选仓储保存重开、有界续写双请求。首次导入测试误用了不存在的 result.contract 字段，按实际 workflowContract 接口修正；未修改导入业务来迎合测试。

| 验证 | 当前最终结果 |
| --- | --- |
| 全量 `bun test` | **2,251 pass / 0 fail / 14,315 assertions / 202 files，38.79s** |
| `bun run type-check` | 退出 0 |
| `bun run build` | 退出 0；Vite 2.64s |
| `git diff --check` | 退出 0 |
| 原记录、侧车、工作流门禁、分区回归 | 包含于上述全量测试；不使用旧报告替代 |

原始日志和当前相关源码 SHA256 保存至本地 `evidence/2026-10-29-receipts/`，不纳入 Git。先前的阶段数字保留为历史证据，以本节作为当前版本结果。

### 未覆盖范围

M3 仍在实施，未勾选为整阶段完成：润色/批量/JSON 规划/有限补丁、父任务共享预算、跨所有档案消费者的迁移/失效矩阵、失败草稿的规则包继承仍待完成；没有真实 Provider、浏览器/原生渲染或全链路采纳验收。12 项新增测试不等于全部入口或 34 项验收已完成。任务仍为 10 项完成/17 项待完成，本轮只更新 M3 子步骤进度；用户默认未启用新机制，未提交或推送。

## M3 父预算与失败草稿来源（2026-10-29，当前状态）

### 变更

- taskBudget.ts：同一父账本约束应用级调用数、累计申请输出、在途预留、单次与总时限；单调时钟，失败保守扣账、重复结算幂等、未知 usage 记为未报告上限，已报告量不当作精确费用。取消/超时拒绝晚到结果，元数据失败主动 abort transport。
- streamText 与 generateObject 共用既有 core/解析器。Pipeline 内部场景试点自动创建一次父账本（16 调用/32,768 申请输出/15 分钟），也允许父调用方显式复用实例；不在续写/区块内部创建新账本。现有默认用户路径不自动启用。
- executeRestyleTarget/suggestDraftLabels 增加可选父账本参数。重塑所有有限补丁分组共用它；预算耗尽保留原页，不应用部分分组。
- FailedPageDraft 保存原始 guidanceSource 合同，qualityDraftRepository 保存与重开时校验来源及请求身份；本地补文案按冻结规则选择复核上下文，执行记录只列 historicalGuidanceSource，不新造当前模型发送记录。旧无来源草稿兼容。

### 新增测试与结果

新增 task_budget.test.ts **9 项**、guided_draft_repair.test.ts **4 项**：并发争用、申请额度不回补、缺 usage/网络失败/元数据失败、JSON 同账本、挂起超时、续写不重置、取消晚到、配置校验、带规则草稿本地修复/保存重开/篡改拒绝、分区共享额度及重塑补丁半批拒绝。重塑测试首次误用了不存在的 buildRestyleTaskContract 导出，改为既有 buildRestyleContract 后通过；未修改现有业务合同。

| 检查 | 当前最终结果 |
| --- | --- |
| 预算/草稿继承定向测试（最终版本） | 13 项包含在全量回归中；先前定向运行 12 项/48 assertions 为增加补丁集成例前的记录 |
| 全量 `bun test` | **2,264 pass / 0 fail / 14,369 assertions / 204 files，38.39s** |
| `bun run type-check` | 退出 0 |
| `bun run build` | 退出 0；Vite 2.63s |
| `git diff --check` | 退出 0 |

日志和当前相关源码 SHA256 保存至本地 `evidence/2026-10-29-parent-budget/`，按现有约定不提交产物。所有过去章节按各自版本理解，以本节为当前源码验证结果。

### 仍需继续

账本是内存对象，不跨重启自动恢复；每次用户明确启动的新任务与后台子调用区分。当前统计边界是 core 调用，不能代表调用内部所有物理网络重试。批次 UI 及其它根入口尚未全部持有/传入同一账本，因此 M3-03 仍未勾选。规则注入仍需继续覆盖润色、批量、JSON 规划等入口；其它档案消费者及完整采纳/失效矩阵、UI/真实模型 A/B 仍未交付。本轮没有真实 Provider、用户工程写入、浏览器/原生验收或 Git 推送。

## M3 根调用所有权接线（2026-10-29，当前状态）

### 实际变更

- TaskBudget 增加 close/closed/exhausted：拥有者结束后不能追加调用；配额不足后不尝试给其它子任务重新分配一份预算；正常恰好用完额度不等于已完成结果无效。
- RestylePanel 为试跑/单页创建并关闭账本；executeRestyleBatch 为确认后待生成队列创建一个账本，传给所有 generate 回调。复用试跑不再次调用模型，外部提供的父账本由外部拥有者结束。额度耗尽时保留 remaining，不将全部未请求项逐个记为失败。
- sendMessage 持有 generationBudget，Pipeline 生成与已有支持的一次创建修复共用，在 finally 关闭；文案建议拥有一次请求预算。结构化编辑执行器为元素/区块/补充请求建立有限根预算；纯本地操作不增加请求。
- 修改分析及多页规划的两次 JSON 格式纠正共享规划预算；确认多页生成按确认页数创建预算，逐页生成和一次修复共用并关闭。
- 新增 taskBudgetPolicy.ts 集中计算限额，重塑阈值复用现有常量，范围不会在子流程中扩大。当前用户入口接入预算，场景规则仍未默认启用。

### 测试与修正

新增 task_budget_ownership.test.ts **5 项**：确认批量复用账本/跳过试跑、调用者拥有外部父账本、取消前无请求时结束、规划/页数限额、最后请求恰好耗尽仍成功应用。新测试发现预算检查在生成后过早拒绝了已完成结果，修正为只在下一次生成前检查配额；取消/过期仍在应用前检查，没有放松原应用门禁。

| 检查 | 当前最终结果 |
| --- | --- |
| 原分析/多页/重塑进度定向回归 | 98 pass / 0 fail / 341 assertions / 3 files |
| 新所有权/重塑执行与档案定向回归（加末项边界测试前） | 34 pass / 0 fail / 167 assertions / 3 files |
| 全量 `bun test` | **2,269 pass / 0 fail / 14,392 assertions / 205 files，36.84s** |
| `bun run type-check` | 退出 0 |
| `bun run build` | 退出 0；Vite 2.63s |
| `git diff --check` | 退出 0 |

原始日志及当前变更源码指纹存于本地 `evidence/2026-10-29-budget-owners/`，不纳入 Git。先前阶段的通过数保留为历史；以本节为当前源码验证结果。

### 剩余边界

应用级主要入口预算已接线；底层物理网络重试、其它独立修复根入口与完整失效矩阵仍需审计，因此不勾选整个 M3-03。场景规则的全部入口、历史档案迁移、用户可见依据/预算报告及真实模型对照也未交付。当前仍为 10 项完成/17 项待完成；本轮更新 M3 子步骤证据，不借新测试数量宣称完整方案完成。没有真实 Provider、原生/双浏览器验收或 Git 提交推送。

## 依据/预算界面与遗留旁路（2026-10-29，当前状态）

### 实际变更与范围

- 对话显示 TaskBudgetCard 与按记录存在才显示的 DesignGuidanceCard；候选验收面板共用依据卡。区分仅选择/实际调用、回退/省略/版本、申请上限/已报告用量；预算记录仅当前会话，坏记录提示不可用，旧无记录保持空白。错误结果也保留其实际任务记录，不能仅成功时展示。
- DesignBriefCard 展示页面类型的推断/提供来源及精确/语义要求；不将推断标为确认事实。
- 独立 CandidateRepairControl 以一次 1,800 输出预算调用现有修复服务并关闭账本；仍受原候选资格、一次尝试登记和全部复验约束。
- 审计发现 PropertyInspector 使用正则截取并在 finally 直接写回。已迁到结构化元素操作及副本候选，保留原页、其它节点和采纳前 History；切元素/卸载取消，重复点击只请求一次。未新增宽泛分析步骤。
- AssetModal 图标入口迁至既有 core 与一次有界请求。只发布完整、结束原因合格且经过受限 SVG 校验的结果，不逐片注入宿主。脚本/事件/外部引用/样式/声明等拒绝，切工程/关闭取消；普通程序化 Canvas 图片不伪造 Token 消耗。
- 传输审计结果见 transport-audit.md：未发现显式失败重放；Rust 最多 5 跳重定向，与模型调用统计分开。静态检查不代表依赖/浏览器内部网络行为实测。

### 单测与构建

新增 design_evidence_cards.test.tsx **5 项**、inspector_structured_edit.test.tsx **3 项**、icon_svg_generation.test.ts **13 项**（含参数化正反例），合计 21 项。

| 验证 | 当前最终结果 |
| --- | --- |
| 三个新增套件定向运行 | 21 pass / 0 fail / 50 assertions |
| 卡片/既有候选修复/简表渲染集成回归 | 50 pass / 0 fail / 300 assertions |
| 全量 `bun test` | **2,290 pass / 0 fail / 14,442 assertions / 208 files，37.99s** |
| `bun run type-check` | 退出 0 |
| `bun run build` | 退出 0；Vite 2.70s |
| `git diff --check` | 退出 0 |

### 实际浏览器验证

执行 `python3 scripts/verify-design-evidence.py`，使用独立 HTML 夹具和受控 core，不访问真实 Provider。Chromium/WebKit 均通过：

- 1280px 与 768px 宽度实际 DOM 无横向溢出；预算/规则卡正确展示且无夹具密钥。
- 点击属性微调只调用一次结构化接口，原页完全不变，产生包含加粗样式的副本，授权仍为 element:target01。
- 真实 XML 引擎接受受限 path，拒绝带 onclick 的形状。
- pageErrors=[]、externalRequests=[]；脚本拦截非本机请求，失败时删除旧成功 result.json 并保留失败截图。

结果与四张完整截图位于本地 `evidence/2026-10-29-ui/`；已视觉查看 Chromium 卡片和 WebKit 候选截图。该页面是组件/入口夹具，不是完整用户工程或已安装桌面包；没有 Provider、macOS 原生导出或 Windows/Linux 实机验收。首次沙箱下监听本机端口和 Chromium 进程通信被系统禁止，经既有本地验证授权在沙箱外运行成功，未改业务以绕过失败。

源码/脚本/夹具指纹与最终日志归档于本地 `evidence/2026-10-29-evidence-ui/`。M4-03 独立展示任务已验收，当前 **11 项完成/16 项待完成**；M3 全入口规则来源、其它历史消费者、完整门禁/失效矩阵与 M5 模型对照仍未交付，34 项整体 AC 不据此提前全部通过。未提交、推送或发布。

## 2026-10-30：真实工程基线与元素 JSON 规则试点

范围为 M0-01 和 M3-01/02/03 的元素修改纵向切片。M0-01 已完成；27 个顶层任务目前 12 完成、15 待完成，M3 全入口尚未放行，场景规则仍不默认启用。

### 基线身份与私有工程

- 实施前全量：2,290 pass、0 fail、14,442 断言，208 文件，37.53 秒。实施前源码/目录/冻结样例及 Git 状态/HEAD 已归档；该日志不与实施后源码混用。
- PC 的 pc01（6 页面/20 文件）、mobile 的 smatch（13 页面/45 文件）及 aqmf-app-pub-design（30 页面/105 文件）已复制到本机忽略目录；各文件 SHA256/字节一致，原文件内容、mtime、权限前后及最终复查相同。没有调用模型、改写原工程或上传工程资料。
- 清单及快照：[project-manifest.json](./evidence/2026-10-30-baseline/project-manifest.json)、本地 projects/ 子目录；当前 638 个源码/测试/脚本/配置指纹在 [final-source-sha256.json](./evidence/2026-10-30-baseline/final-source-sha256.json)。这些私有内容留在 Git 忽略目录。
- 复制/身份校验不能替代新版本保存重开、用户工程运行态或原生 PNG；这些继续归于 M5。

### 实现与专项验证

- withGuidanceReceipts 包装原 generateObject，继续使用既有 core 的 JSON 解析、结束原因检查和代理；每次调用记录 Schema/语义消息指纹、协议类型与独立 requestId。凭证、原消息、图片正文不入回执。旧无协议字段仍可读，未知协议值拒绝。
- executeStructuredEdit 的元素模式增加内部可选规则；用完整规则替换既有组件参考窗口，不改变有限操作 Schema、目标 nid、protectedNids、2,048 输出上限或父账本，不额外调用分析/格式修复。完整消息比 baseline 窗口更短或相等。
- 未知目标保留原指导并记录回退；默认关闭及纯本地操作不补造来源；当前区块/补充局部不接受该内部试点参数，避免无适配直接注入。
- 运行前只验包结构/范围，运行后复核实际完成回执；用户指令与冻结合同不同在发送前停止。JSON 完成只证明输入调用已返回：越界、受保护或过期操作即使有 completed 回执仍不能发布候选。
- 新增 test/structured_guidance.test.ts 共 **12 项**。首次 RED 为 6 项预期失败（缺回执/规则）；冻结指令反例 RED 为 ready 而预期 failed。修正过程中纯本地分支受到过宽检查，专项测试打回，已收敛条件后全部通过。日志保留 initial-red.log、request-red.log 和 focused-green.log。

### 最终完整回归

| 顺序 | 命令 | 实际结果 |
| --- | --- | --- |
| 1 | bun test | **2,302 pass / 0 fail / 14,509 assertions / 209 files，37.56 秒** |
| 2 | bun run type-check | exit 0；tsc --noEmit 通过 |
| 3 | bun run build | exit 0；1,878 modules；Vite 构建 2.67 秒 |
| 4 | git diff --check | exit 0 |

日志和本轮代码指纹：[evidence/2026-10-30-structured-guidance/](./evidence/2026-10-30-structured-guidance/)。全量仍有既有 React act 提示；没有将它们写成“日志零警告”，也未把旧提示归为本轮新增失败。

### 双引擎受控浏览器

使用已获授权的 127.0.0.1:5174 开发服务，执行 `python3 scripts/verify-design-evidence.py`。每次清理旧 result.json，失败不保留上一轮通过记录；当前结果和截图在 [2026-10-30-json-ui](./evidence/2026-10-30-json-ui/)。

| 引擎 | 实际 Inspector 入口 | JSON 规则试点 | 其它 |
| --- | --- | --- | --- |
| Chromium | 1 次调用；原页不变；生成 element:target01 副本候选 | 真实 DefaultAIEngineCore＋内存 MockTransport；TY-06；1 个 completed/json-object 回执；response_format=json_schema | 1280/768 无横向溢出；SVG 安全反例拒绝；pageerror 0；外部请求 0 |
| WebKit | 同上 | 同上 | 同上 |

已目视检查最新 WebKit 候选截图，依据卡、预算卡和微调结果正常呈现；长属性面板属于现有夹具布局。浏览器模型为受控内存传输，**没有请求真实 Provider**，不证明生成质量收益。服务在验证后关闭。

JSON-01/02/03、BASE-01 和当前源码 AC-25 通过；AC-10/11/27/32 的全部入口、完整采纳/History/重开、真实模型至少 24 对/双人盲评、macOS 原生导出及 Win/Linux 实机缺口继续明确保留，不改判为通过。未执行 Git 提交、推送、安装包或 Release。

## 2026-10-30：功能、信息与交互优先流程审计

用户要求重新梳理新建及功能修改流程，核对实现是否需要重构/优化。已静态检查设计规范、DesignBrief 默认调用、项目知识、多页/多方案规划、修改分析和分流、有限操作、结构守卫、动作完整性、页面交付检查。

产物：[function-first-audit.md](./function-first-audit.md)；README 增加入口，task/check 记录审计边界。结论为现有语义前置及功能覆盖不足，建议扩展现有简表/合同/验收，复用代理、执行器、候选、History 和仓储。业务层建议没有在本次转为已实现或默认启用。

实际文档检查：本地链接存在、代码围栏配对、git diff --check 通过；原顶层任务仍 12 完成/15 待完成；与上一轮 source-sha256.json 对比，638 个源码/测试/脚本/配置指纹无变化。本次未改业务源码，因此没有重新执行 bun test/type-check/build，也没有把上一轮 2,302 pass 当作一次新的运行。没有真实模型调用、原工程写入或 Git/发布操作。

## 2026-10-30：功能优先首轮实施

用户已确认开始实施 function-first-audit.md 推荐的增量路线。首轮交付结构化规划器、TaskContract 可选快照、共享验证和 Pipeline 显式纵向试点，以及对话/候选规划卡片。**普通对话默认入口尚未启用该参数**；功能修改路由、实际恢复接线和需求覆盖检查不在本轮冒充完成。专项任务及完整验收见 [function-first-implementation.md](./function-first-implementation.md)。

### 实现与协议证据

- pageTaskPlan.ts 用既有 core.generateObject，一次请求申请 3,072 输出，接收调用者现有父预算，不重试或另建子账本。结构为任务目标/使用者/完成条件，以及功能的差量、信息项、操作前提/结果/目标、状态条件/反馈、归属及待确认项。
- 规划后才构造用于 HTML 生成的系统消息；新建无权规划删除，修改必须有相同原页基线，删除需明确对应本次指令。已知来源 ID 只是规划归属，不证明语义事实；未知来源/目标拒绝。
- 快照同时绑定当前输入、功能正文和规划请求元数据；保存的计划可复用而不额外请求，变更输入或合法格式的正文也会失效。散列为非安全用途身份，不是对抗本地恶意篡改的签名。
- 待确认项不仅在 Pipeline 停止生成，共享 WorkflowValidation 也拒绝应用；旧无计划合同保持兼容。新字段缺失时保持旧 guidanceBinding 的原始字节布局，避免历史回执被新可选字段误判过期。
- PageTaskPlanCard 展示用户任务、输入/展示信息、交互前提和结果、状态条件/反馈及差量。旧记录静默，坏数据提示，引用文本通过 React 转义，不把图片/脚本字符串注入宿主 DOM。

### 单测与打回记录

新增 page_task_plan.test.ts 13 项、page_task_pipeline.test.ts 3 项、page_task_plan_card.test.tsx 1 项；原卡片及规则回执各增 1 项，共新增 19 项。

初始缺模块/缺 Pipeline 接线的 RED、来源/元数据边界 RED、正文指纹 RED、历史绑定 RED 和待确认合同仍可通过共享入口的 RED 均已保留。发现的两个关键打回点是新可选字段使旧绑定变化，以及 pending 计划只能在生成处停止但仍可通过共享合同检查；修复后当前完整测试通过。中间 RED/局部 GREEN 是开发历史，最终源码身份对应最终全量日志。

| 命令 | 当前结果 |
| --- | --- |
| bun test | **2,321 pass / 0 fail / 14,572 assertions / 212 files / 36.05 秒** |
| bun run type-check | exit 0；tsc --noEmit |
| bun run build | exit 0；Vite 2.56 秒 |
| git diff --check | exit 0 |

日志和 644 个源码/测试/脚本/配置 SHA256：[2026-10-30-function-first](./evidence/2026-10-30-function-first/)。全量仍有既有 React act 提示，未声称日志零警告。规划的 generateObject 用量缺少可用返回值时由父账本保守记录未报告申请额度，不伪造精确 Token 费用。

### 实际浏览器

执行 `python3 scripts/verify-design-evidence.py --output doc/ui-design-workflow/evidence/2026-10-30-function-first-ui`，Chromium/WebKit 均通过。新夹具为 [function-first.html](../../test/fixtures/function-first.html)，使用真实 DefaultAIEngineCore＋内存 MockTransport：第一个请求含 JSON Schema，第二个为 HTML 且实际系统消息含冻结 PAGE TASK PLAN；父预算请求数为 2；原内容保持；卡片展示输入、操作前提/结果和状态；无横向溢出。已有局部候选/安全 SVG/JSON 规则试点也一起回归。两引擎 pageerror 和外部请求均为 0。

结果、卡片和候选截图：[2026-10-30-function-first-ui](./evidence/2026-10-30-function-first-ui/)。已目视检查 WebKit 功能卡片截图；服务验证后关闭。本轮无真实 Provider、用户原工程写入、原生保存重开/PNG、Git 或发布操作。

FP-01 完成；FP-02/03 为局部试点，FP-04 未实现，FP-05 有界面及受控回归而未全体验收。普通入口自动开启、功能改动能力分流、续写/失败草稿、完整存储恢复和逐项业务覆盖仍是必要后续工作。原 UI 工作流 27 项计数不因新增专项而变化。


## 2026-10-30：功能优先第二轮——普通文字新建与恢复接线

本轮将 pageTaskPlanning 接到普通文字新建单页和同页分区。真实规划先于 HTML，已冻结计划随原上下文续写；失败草稿新增 pageTaskSource 原合同，保存重开校验来源/正文/请求，定点修复零新增模型请求并保留历史来源。实际上传文本正文及指纹交给规划器，文件变化不能沿用旧计划。关键问题停止生成；Provider/模型、范围/原页变化拒绝继续。

规划任务的阶段不再由时间推进；复用计划与本地修复分别使用复核/修复文案。未知规划用量单独标明统计不含该部分，根账本仍扣一次 3,072 申请输出；规划阶段停下时不伪造 HTML 用量（显示 0，规划用量未知）。普通请求仍最多 4 次，分区 14 次，累计申请输出仍为 34,568。

### 验收与打回

- page_creation_chat：实际普通新建带计划进入创建证据、保留原页；关键问题只规划不输出 HTML，不新增 History。
- large_page_chat：截断继续仅续生成，规划只请求一次；上下文和模型变化阻断。
- sectioned_chat：同页分区和区块继续复用原业务规划，保留撤销重做。
- failed_design_drafts_ui：失败保存、AI建议后用户确认、真实创建管道；重挂载手填修复无新请求且继承原计划；实际渲染失败仍不可交付。
- page_task_pipeline 新增来源文件正文、模型/过期重放阻断、规划草稿仓储/定点修复/篡改拒绝。
- 首次普通入口 RED 因缺接线失败；全量首次另发现 2 项旧画框挂载测试只返回 HTML，无法满足新前置 JSON。已改为按真实规划/生成阶段分别提供响应，保留挂载、定位与历史补挂断言；未通过关闭规划来适配测试。

| 命令 | 本轮最终结果 |
| --- | --- |
| bun test | **2,326 pass / 0 fail / 14,611 assertions / 212 files / 39.64 秒** |
| bun run type-check | exit 0；tsc --noEmit |
| bun run build | exit 0；Vite 2.81 秒 |
| git diff --check | exit 0 |
| python3 -m py_compile scripts/verify-design-evidence.py | exit 0，仅语法检查 |

全量仍有既有 React act 提示，未声称日志零警告。日志及 566 个源码/测试/脚本/配置文件 SHA256（排除缓存及位图）归档到 [2026-10-30-function-chat](./evidence/2026-10-30-function-chat/)。本轮新增 5 项断言测试；既有 2,321 项对应测试桩随入口更新，未将新规划排除出验收。

### 浏览器与环境限制

新增 function-first-chat.html 使用真实 ChatDrawer/Hook/Pipeline/DefaultAIEngineCore 和内存 MockTransport，脚本验证普通发送、规划完成前阶段保持、JSON→HTML、实际创建证据和原页不变；没有关闭普通入口或绕过渲染检查。**该新增双浏览器回归尚未运行**：默认沙箱启动服务返回 listen EPERM；随后两次 require_escalated 启动 127.0.0.1:5174 的自动审批均因 deadline 未完成而拒绝创建进程，按提示只重试一次，服务未启动。不是浏览器通过，也不是产品运行报错；现有授权仍保留，无需重复向用户索取同一授权。上一轮 Chromium/WebKit 证据仅代表上一轮源码。

本轮无真实 Provider、用户工程改写、原生桌面/导出、Git 或发布。FP-02/03 仅完成上述文字新建与恢复切片；参考图片、多页、功能修改、成功会话完整规划历史恢复及 FP-04 业务覆盖仍待完成。原任务计数仍 12/15。

## 2026-10-30：功能优先第三轮——页面级功能分流与覆盖线索

普通文字页面级明确功能调整接入规划：新增/删除字段、表单、操作、模块，或明确操作后反馈。规划读取匹配原页，先 JSON 再 HTML，保留原页、存入副本候选；已指定细节不重复展示建议选择。纯视觉与文案修改无额外规划；混合新增功能/调整背景按子句识别。宽泛优化/主动要求先分析仍走原选择流程，元素引用不扩大范围。

覆盖报告在对话结果与候选验收记录展示；每次按当前 HTML 和冻结规划重算。输入项在输入控件及关联标签/可访问名称定位，操作在按钮/链接等控件定位，普通文字不能替代它们。排除 script/style/template、显式隐藏等非内容资料；超出 500,000 字符或 10,000 节点提示无法检查。状态以场景列出，不把全部互斥状态强迫放进当前设计。

所有线索的业务语义始终未验证。未定位可能来自遗漏或不同措辞，需要结合预览核对；不作自动业务通过/失败门禁，不增加模型调用，不修改页面内容。现有安全/结构/资源/实际渲染门禁继续约束候选。

### 开发与验证

新增 8 项测试（3 个文件）：functional_modification 的明确功能/视觉/保护条件/混合请求分流；functional_modification_chat 的真实 Hook→Pipeline→规划→候选和视觉跳过规划；page_task_coverage 的实际控件、非内容排除、重新计算、旧/坏快照、React 卡片。初始缺模块 RED 为开发历史；另发现“删除推荐模块”仍进宽泛分析，定向检查后补入明确模块目标，回归通过。单测不通过关闭规划来适配。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,334 pass / 0 fail / 14,663 assertions / 215 files / 38.40 秒** |
| bun run type-check | exit 0；tsc --noEmit |
| bun run build | exit 0；Vite 2.57 秒 |
| git diff --check | exit 0 |
| Chromium / WebKit | 普通文字新建、页面功能修改、覆盖卡片均通过；页面错误 0、外部请求 0 |

本轮仍有既有 React act 提示，不声称全量日志零警告。最终日志/源码指纹见 [2026-10-30-function-third](./evidence/2026-10-30-function-third/)。

### 浏览器证据与上一轮缺口关闭

本轮成功启动已授权本地 127.0.0.1:5174 服务。先执行上一轮普通入口回归，两引擎均通过，结果在 [function-chat-ui](./evidence/2026-10-30-function-chat-ui/)；因此上一轮记录的浏览器环境缺口已补跑关闭。该旧段落保留为当时的实际状态。

更新后的脚本在最终源码上重跑，两引擎均确认：第一请求真实 JSON Schema、第二请求 HTML 且含冻结规划；普通创建 workflow ready、原页不变；页面级功能修改只暂存候选且原页/页面数量不变；覆盖卡片展示“源码线索/场景待核对/语义未验证”，当前示例无未定位项。截图与 result.json 在 [function-third-ui](./evidence/2026-10-30-function-third-ui/)。实际使用 ChatDrawer/Hook/Pipeline/DefaultAIEngineCore；模型为内存 MockTransport；普通创建执行既有实际 iframe 渲染检查，功能修改在本测试仅证明候选暂存，不声称已完成采纳。目视复核 WebKit 功能修改、Chromium 创建覆盖截图，文字可读且未溢出。

本轮无真实 Provider、用户原工程写入、原生安装包/导出、Git 或发布。FP-02a/04a/05a 本切片完成，FP-04 覆盖报告完成；FP-02/03/05 整体仍保留未完成。参考图、多页、元素结构修改/已选择局部区块规划、成功会话完整规划历史恢复等仍待实施，原 27 项计数仍为 12/15。


## 2026-10-30：功能优先第四轮——成功会话规划回溯

成功创建/页面功能修改的 JSONL 助手记录增加可选 pageTaskHistory，保存绑定所需的冻结合同和规划，限制 80,000 字符；既有 HTML 回复继续按原格式保存，不另存页面或图片。恢复校验原用户请求及规划绑定；错误记录不阻断原文。历史卡片走独立只读字段，不恢复 workflowContract、原执行决策、续写权限，不读取当前画框规划或生成当前页面覆盖报告。旧记录不伪造，旧分片摘要压缩按原策略去除详细规划。

### 自动化与构建

新增 6 项测试：page_task_history 3 项，functional_modification_chat 新增 2 项，page_creation_chat 新增 1 项。验证独立冻结/敏感配置及无关字段未收录、绑定篡改/不同请求/坏格式/旧记录、两轮 JSONL 重开和摘要压缩、实际 Hook 保存恢复，以及真实 ChatDrawer 的只读历史显示。专项 11 项通过；没有增加 Provider 请求或改用当前画框合同来让测试通过。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,340 pass / 0 fail / 14,707 assertions / 216 files / 39.94 秒** |
| bun run type-check | exit 0；tsc --noEmit |
| bun run build | exit 0；Vite 2.65 秒 |
| git diff --check | exit 0 |
| Chromium / WebKit | 创建/功能修改重开均通过；页面错误 0、外部请求 0 |

全量日志仍有 React act 提示，不声称零警告。日志及 574 个源码/测试/脚本/配置 SHA256 在 [function-fourth](./evidence/2026-10-30-function-fourth/)。

### 浏览器与范围

先按默认沙箱启动服务遇 listen EPERM，浏览器启动遇 MachPort Permission denied；沿用已有授权通过 require_escalated 后均成功，不是产品故障或最终未验证。脚本使用真实 ChatDrawer/Hook/Pipeline/DefaultAIEngineCore + MockTransport，创建执行现有 iframe 预检；修改仅暂存副本。随后通过现有 store 动作修改当前页面，再卸载/重新挂载对话，验证历史原规划保留、无当前需求覆盖、请求仍为原 JSON+HTML 两次，且无密钥展示/横向溢出。WebKit 创建历史截图已目视检查，卡片可读。

证据：[function-fourth-ui/result.json](./evidence/2026-10-30-function-fourth-ui/result.json)，两引擎创建/修改历史截图同目录。该验证是本地受控会话持久化和组件重开，不冒充原生桌面整个进程重启、真实 Provider、用户原工程或 Windows/Linux 实机验收。

FP-03b/05b 当前切片完成；参考图、多页、元素结构及已选择局部/区块功能规划仍待接入，FP-02/03/05 及原顶层 12/15 计数不变。未执行 Git/发布。


## 2026-10-30：功能优先第五轮——参考图创建

普通参考图新建单页/同页分区默认先业务规划。preparePageTaskPlan 验证实际图片/裁剪身份及视觉模型能力，再通过原 core.generateObject 发出 JSON Schema + 实际图像；HTML 也发送同图，独立保留原参考图输入回执。规划增加 image 归属和 request.imageFingerprint，仍只保存有限元数据。用户/项目规则优先；不确定图中行为按推断或关键问题处理，移动端微信默认/自定义导航策略进入规划。

### 开发与专项回归

新增 11 项（2 文件）：page_task_reference 8 项验证实际协议图像、图片来源和历史、缺图/错图/错选区/纯文本模型、导航开关、旧快照重放与变化拒绝、待确认/过期/二进制回显拒绝、输出续写、失败草稿保存与零请求修复、同页分区；page_reference_chat 3 项验证真实 Hook 的 Vision fallback、主力视觉沿用、错误配置拒绝及附件落盘路径。首次专项 1 失败为夹具原页未显式 nid 导致与 addScreen 注入后的页面比较错误；已明确 nid 并重验，不修改生产 nid 注入行为、不关闭新入口。首次日志留档 first-check.log。随后专项 32 项通过（后新增导航专项也随最终全量通过）。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,351 pass / 0 fail / 14,792 assertions / 218 files / 41.39 秒** |
| bun run type-check | exit 0；tsc --noEmit |
| bun run build | exit 0；Vite 2.59 秒 |
| git diff --check | exit 0 |
| Chromium / WebKit | 参考图上传→规划→实际创建→会话重开均通过；页面错误 0、外部请求 0 |

日志存在既有 React act 提示，不声称零警告。日志及 576 个源码/测试/脚本/配置 SHA256 见 [function-fifth](./evidence/2026-10-30-function-fifth/)。

### 浏览器证据

[function-fifth-ui/result.json](./evidence/2026-10-30-function-fifth-ui/result.json) 和两引擎 reference-creation/reference-history 截图同目录。通过真实文件上传控件上传测试 PNG，主力纯文本、Vision 绑定支持视觉的模型；真实 ChatDrawer/Hook/Pipeline/DefaultAIEngineCore + MockTransport 发出 JSON 然后 HTML，两次图像指纹相同、模型相同；普通创建执行真实 iframe 预检，workflow ready、原页不变、合同无图片正文。规划卡片有“参考图观察”，会话重开仍保留，且不冒充当前页覆盖复验或新增请求。目视核对 WebKit 参考创建截图，卡片可读且无横向溢出。原先文字创建、功能修改、历史、依据/预算、局部 JSON 和 SVG 回归也通过。验证使用已授权本地服务和测试浏览器，未访问外部 Provider；验证后关闭服务。

### 兼容与边界

旧文字规划保持兼容。带图快照现在必须含匹配的 imageFingerprint；历史内部实验中未实际给规划器发送图像的快照不能继续当作识图完成，应重新生成。图像 base64 大于 16,000,000 字符会提前拒绝；输出计划回显图片二进制同样拒绝。规划追加一次 3,072 申请输出但不增加原父任务总上限。保存的失败草稿与会话只保存身份/规划/附件路径，不保存图片二进制；续写与定点修复不重新规划。

本轮受控结果只证明输入身份、协议、流程/权限、预算和保存恢复；不证明真实模型看懂参考图、视觉相似度或功能语义质量。参考图修改、多页、元素结构及已选择局部/区块功能修改仍待接入。FP-02c/03c/05c 本切片完成，顶层专项及原 12/15 计数不变。未改用户原工程、未做原生进程重启/安装包/导出实机/真实 Provider/Git/发布。


## 2026-10-30：功能优先第六轮——多页/同页方案规划

首次多页规划JSON Schema新增逐页task：目标/角色/完成条件/功能、信息、操作前提/结果、状态与关键疑问；确认卡片展示，仍通过本页要求和关联补充。未改页使用原规划投影，PageTaskSnapshot记录原始JSON请求指纹、确认计划/项/指纹并映射为最终screenId；Pipeline校验后复用，无第二次逐页规划请求。改要求/关联的页面在原批次预算内重新规划，并把实际新快照保存到creationEvidence，不再用旧task冒充已确认的新要求。

### 开发与专项

开发类型检查先发现JSON Schema动态属性为unknown，已为已知maxItems数组字段明确形状；日志dev-types.log保留为打回历史，最终类型检查通过。6个相关套件首次197项通过；最终多页专项97项通过。既有6个测试文件的模型桩更新为真实新schema的task，不通过关闭默认业务规划适配；修复/实体/模板/拆页及UI原语义断言保留。

新增12项测试：文本/参考图的DefaultAIEngineCore+MockTransport实际JSON协议与零重复规划、最终screenId映射及来源；规划length结束拒绝；要求/关联变动只重规划对应页；已知第二页疑问在任何HTML前阻断且不能清空task绕过；缺task/未知来源/未选择目标纠正一次仍拒绝；新交付task验证和旧记录兼容；确认卡片信息/前提/状态展示、变动提示、疑问禁用/补充后解锁，以及页面创建记录来源/覆盖显示。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,363 pass / 0 fail / 14,885 assertions / 218 files / 40.19秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；Vite 2.54秒 |
| git diff --check | exit0 |
| Chromium / WebKit | 多页未改/改要求两条真实UI路径通过，页面错误0、外部请求0 |

全量仍有既有React act提示，不声称日志零警告。日志及578个源码/测试/脚本/配置SHA256在[function-sixth](./evidence/2026-10-30-function-sixth/)。

### 浏览器

[function-sixth-ui/result.json](./evidence/2026-10-30-function-sixth-ui/result.json)。新multi-page-functions.html夹具使用真实ChatDrawer/Hook/prepareMultiPagePlan/Pipeline/DefaultAIEngineCore/现有iframe预检，传输为MockTransport，无外部Provider。首次确认前可展开目标、信息、操作、反馈。未改时请求序列为batch-plan→HTML→HTML，要求变动时为batch-plan→该页page-plan→HTML→HTML；两种流程均新增2页、原页不变、History仅增加1条。修改页有新的规划，另一页保留planSource；页面创建记录可查看原JSON来源和需求线索。Chromium/WebKit截图同目录，已目视复核WebKit编辑卡片与Chromium交付来源。原文字、参考图、修改、历史恢复、依据/预算/局部JSON/SVG浏览器回归也通过。

### 范围

父规划最多2次/每次4096，批次仍每页4次及34,568申请输出；无额度扩大。首次结构更丰富，大需求规划若截断仍拒绝，不假装部分页成功，需缩小批次。旧无task交付不被伪造规划；新交付保存实际来源。现有取消/过期、第二页失败整批不写、实体/模板/资源/渲染门禁、一次受控修复、撤销重做和保存重开测试继续通过。

共同功能的语义一致仍是待审阅事实，受控模型不证明真实模型的设计理解/视觉质量。当前切片FP-02d/03d/05d完成；参考图修改、元素结构/已选择局部区块功能修改、全入口场景规则与M5仍待完成。原顶层12/15不变。未改用户原工程，未执行真实Provider/原生安装包或跨系统验收/Git/发布。验证服务已关闭。


## 2026-10-30：功能优先第七轮——已确认区块修改

executeStructuredEdit在明确功能区块中先规划再调用原区块生成器。确切根范围、存在性/唯一性、保护与60%限制在规划前检查。规划仅用授权区块作baseline输入，全页原文仅程序指纹核验；项目只读知识仍沿用。参考图/裁剪身份验证且规划/替换同图，冻结规划换图或缺图拒绝；模型改变或过期、取消不进入下一请求。

视觉区块仍一次JSON/块；有限局部/元素模式新增结构要求明确拒绝，纯本地仍零请求。功能区块复用对话根4次/34,568，规划3,072+每块4,096；外部父预算不能被关闭/重置来绕过耗尽。返回合同和预算进入候选/消息，避免输入合同丢失规划。重试绑定原review/选项/补充/模式和原基线，每次消息/JSONL唯一；不经通用整页入口。会话保存精确确认scope及reviewRequest原宽泛请求，恢复只读，旧记录兼容。

### 打回与回归

第一次4套专项63项中1项失败：统一身份校验误覆盖零模型纯本地操作；已限定到实际派发/功能规划路径，旧纯本地语义保留，first.log含原失败。浏览器首轮因脚本误将既有“请求2/4”断言为“2 / 4”失败，未标通过；修正脚本后重跑，并在最终根范围/缺图保护代码上再次运行。首失败截图保留browser-first-failed.png。没有通过改产品格式、放松门禁或关闭新入口来适配。

新增16项：region_function_plan 11项覆盖实际JSON协议、仅授权baseline、原外部DOM及旧操作保持、参考图实际输入/历史元数据、视觉单次、待确认、范围/保护/整页/缺失/请求不匹配、取消/过期、外部父预算耗尽不重置、有限模式拒绝、冻结换图/缺图和后续块失败；region_modification_flow新增5项覆盖真实Hook合同/预算/JSONL恢复、重试仍原根且唯一ID、待确认显示、模型切换、参考图两次实际消息与附件路径。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,379 pass / 0 fail / 15,000 assertions / 219 files / 41.90秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；Vite 2.83秒 |
| git diff --check | exit0 |
| Chromium / WebKit | 文字及参考图区块确认→规划→候选→会话重开通过；页面错误0/外部请求0 |

全量仍有既有React act提示，不声称日志零警告。日志及580个源码/测试/脚本/配置SHA256在[function-seventh](./evidence/2026-10-30-function-seventh/)。最后补入功能根集合/冻结缺图保护后已重跑完整单测、类型、构建和两引擎，最终记录对应当前源码。

### 浏览器证据与范围

[function-seventh-ui/result.json](./evidence/2026-10-30-function-seventh-ui/result.json)及region-text/reference/history截图同目录。region-functions.html使用真实ChatDrawer/Hook/analyzeScreenModification/executeStructuredEdit/DefaultAIEngineCore，传输为MockTransport。真实选择区块、补充新增邮箱要求后，请求顺序为分析→功能规划→区块JSON；替换包含冻结规划，原页/区块外aside保持，通用页面Pipeline调用0，暂存未增加History。确认后预算记录为2/4，规划基线只有region01，成功合同不含图片正文；参考图各阶段指纹一致。成功消息只展示一份规划/覆盖/预算；会话重开恢复历史规划，未再请求、未恢复执行权限/当前覆盖。目视复核WebKit参考图区块截图，可读且无横向溢出。旧单页/多页/参考/历史/依据/预算/元素JSON/SVG浏览器检查一并通过。

此处浏览器只证明候选暂存，没有绕过共享渲染/文件/结构等采纳门禁；现有区块采纳/撤销及完整仓储回归仍通过，不冒称本轮原生桌面/用户原工程/导出/跨系统实机验收。生成和规划的业务语义、真实模型视觉质量仍未被这些受控结果证实。明确元素结构修改、整页参考图功能规划、场景规则全入口及M5仍待完成，FP-02/03/05及原12/15不变。未执行真实Provider、Git或发布；验证服务完成后关闭。

## 2026-10-30：功能优先第八轮——明确元素结构副本

明确元素+具体结构要求由executeStructuredEdit选择单根片段协议，聊天与PropertyInspector共用。功能请求先规划，再生成；装饰结构一次JSON，纯样式/引用中出现“新增字段”的文案仍沿旧有限操作。有限局部模式不因此升级为结构修改。规划仅接收授权片段作为baseline，不能引用其它区域身份；原根tag/nid、交互控件链接及非样式属性受保护。原控件/文案/元数据及60%限制继续执行；anchor/button内非法嵌套交互控件拒绝。当前路径不支持以新增结构为由删除受保护控件或修改原行为属性。

### 打回与专项验证

第一次4套专项35通过/1失败：旧用例假定所有元素功能修改都拒绝，缺少确切根时错误信息已变；已保留该零请求缺根负例，修正错误预期，另增合法根正例。不通过禁用新功能解决测试。first.log保留。最终5套专项23项/181断言通过，开发和最终类型检查均通过。

新增15项：element_structure的8项覆盖文字/参考图真实JSON协议、确切scope、仅片段baseline、预算、根/保护/大范围、旧链接/aria/type/disabled保护、非法嵌套、文案引用负例、待确认与内部试点协议冲突；functional_modification新增装饰/样式/引用/否定分类；element_structure_chat的5项覆盖直达候选、受控采纳/History撤销、普通及包装引用历史、选项引用重试、疑问/模型变化；inspector新增确切容器功能结构正例。现有区块测试继续覆盖共享取消、过期、借用父预算耗尽与附件/模型绑定防护。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,394 pass / 0 fail / 15,126 assertions / 221 files / 43.11秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；Vite 2.74秒 |
| git diff --check | exit0 |
| Chromium / WebKit | 明确元素文字/参考图/装饰结构、历史恢复及既有全流程浏览器回归通过；页面错误0/外部请求0 |

全量仍有既有React act提示及主动错误边界测试日志，不声称测试日志零警告。原始日志、截图、result.json和584个源码/测试/脚本/配置SHA256见[function-eighth](./evidence/2026-10-30-function-eighth/)。

### 浏览器证据与边界

[result.json](./evidence/2026-10-30-function-eighth/result.json)含两引擎各三条新路径；element-functions.html使用真实ChatDrawer/Hook/executeStructuredEdit/DefaultAIEngineCore和MockTransport，不发外部Provider请求。明确引用没有modification-review；功能请求序列plan→region，装饰仅region。elementNid和allowedChanges为唯一region01；原页、aside、链接及按钮保持，页面Pipeline调用0、暂存History新增0。功能请求2/4、7,168/34,568；装饰1/1、4,096。实际参考图两次请求同指纹，合同不含图片正文。

成功消息展开规划/源码覆盖/预算；语义仍标未验证，重开ChatDrawer恢复独立只读规划且零新增请求，不复用当前需求覆盖。目视复核WebKit参考图规划/覆盖/预算和Chromium历史引用截图，文字可读，无横向溢出。旧单页/分区、多页、参考图创建、区块确认、历史、依据/预算、有限JSON和SVG回归同批执行通过。

这里只是浏览器候选暂存及同进程组件重开；采纳/撤销单测使用受控渲染报告，不作为本轮原生桌面/用户原工程/安装包/跨系统实机验收。未修改用户原工程、未发送真实Provider、未执行Git或发布。验证服务已关闭。真实模型语义和设计质量不由受控模型结果证明。整页参考图功能规划、全入口场景规则默认放行及M5仍待完成，FP-02/03/05和原27项12/15保持。

## 2026-10-30：功能优先第九轮——整页参考图功能修改

普通对话对已授权整页、由有界规则识别的明确功能请求不再因附图跳过业务规划。合同保存referenceImage/选区与知识来源；preparePageTaskPlan只接受无elementNid、唯一screen:目标的整页授权，区块/元素仍必须使用确切根。JSON规划同时读取匹配的原页和实际图片；用户/项目约束优先，图中文字只作资料，不确定业务规则仍待确认。生成沿同一视觉模型/图片，原消息输入回执保存到合同，不能称为Provider理解或视觉质量通过。

### 打回与专项验证

1. 第一批原参考图/页面功能/聊天回归15项通过。新增修改专项首次3通过/5失败：夹具的第二功能ID非法且页面来源未声明，生产规划校验正确拒绝；修正为f2并声明页面来源，不降低校验标准（modify-first.log）。8项重验通过。
2. 新聊天专项首次12通过/3失败：addScreen为缺nid的其它页自动注入身份导致原文比较失败；分析路径直接调用core未被Pipeline替换而尝试本地dev代理；缺目标负例仍有activeScreen。补稳定nid、替换实际分析core并显式取消active引用，生产目标裁决不变（focused-first.log）。未向真实Provider发送请求。
3. 扩展专项首次78通过/2失败：旧区块断言把提示词中出现baselineHtml字段名当作发送整页内容。改为解析实际user JSON断言无baselineHtml，保留所有消息不含区块外正文的断言。first完整回归中止且不作为通过证据；修复后重跑完整回归（expanded-first.log、full-interrupted.log）。

最终扩展7套**80 pass / 0 fail / 498 assertions / 2.40秒**。新增16项：8项真实DefaultAIEngineCore+MockTransport覆盖整页基线/图像双输入、保留/新增差量、只读其它页、唯一screen授权、快照变化拒绝、疑问/截断/取消/过期、父预算耗尽、续写、草稿保存重开/零请求修复和输入回执负例；8项真实Hook覆盖Vision路由/原视觉主模型、纯视觉不规划、宽泛与主动先分析、缺目标/纯文本Vision拒绝、疑问/模型变化及成功历史附件读取。旧元素/区块、来源/快照与历史回归继续通过。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,410 pass / 0 fail / 15,253 assertions / 223 files / 43.06秒** |
| bun run type-check | exit0；tsc --noEmit，最终在完整测试后执行 |
| bun run build | exit0；Vite 2.56秒 |
| git diff --check | exit0 |
| Chromium / WebKit | 整页参考图功能修改/历史及既有创建、多页、元素、区块等UI回归通过，页面错误0/外部请求0 |

完整日志及586个源码/测试/脚本/配置SHA256见[function-ninth](./evidence/2026-10-30-function-ninth/)。测试日志仍有既有React act和主动错误边界输出，不声明日志零警告。

### 浏览器与交付边界

[function-ninth-ui/result.json](./evidence/2026-10-30-function-ninth-ui/result.json)。扩展原function-first-chat.html夹具的reference-modify模式，真实ChatDrawer/Hook/Pipeline/DefaultAIEngineCore发送由MockTransport响应的JSON规划→HTML；两次同图指纹、同gpt-4o，规划baseline等于旧页，目标old且scope仅screen:old。原页保持、画框数仍1、候选暂存History新增0，无建议清单；本轮预算2/4、11,264/34,568。合同无图片正文，实际生成消息有对应输入回执。规划归属为参考图观察，覆盖仍标语义未验证，预算统计未报告用量单列。

成功JSONL保存附件路径，重开ChatDrawer后恢复只读规划与参考图展示，不再请求或展示当前页面覆盖，未恢复执行合同/续写授权。目视复核WebKit参考图修改规划/覆盖/预算和Chromium历史截图，内容可读、无横向溢出。既有参考图创建、普通文字、分区、多页、元素/区块、历史、依据/预算、有限JSON与SVG检查同批通过。

这里验证的是候选暂存及同进程组件重开；未冒充本轮原生桌面重启/真实用户工程/导出/跨系统验收或最终采纳。未修改用户原工程、未发真实Provider、未执行Git/发布；验证服务已停止。规划/HTML共享既有根4次/34,568额度，未新增自动重试。真实模型的功能理解、视觉质量和自然语言调整意图的完整覆盖仍待评估。全入口规则放行/采纳矩阵及M5未完成，FP-02/03/05及原27项12/15保持。

## 2026-10-30：功能优先第十轮——已有表单规则与精确属性许可

formBehaviorChanges.ts把原生必填/可选、只读/可编辑、启用/禁用、单选/多选的明确规则转换为有界的应用侧许可；functionalModification和modificationEntry接入业务规划，用户主动先分析仍优先。引用包装中的旧HTML和代码示例不作为命令；纯装饰、文案与否定保护保持不规划。不是全语言意图分类器，定制控件与任意复杂联动/权限仍未冒充支持。

许可从匹配原DOM计算，区块/元素只使用确切根，可定位的label/aria-label/name/id及原按钮文案。单个指代目标必须无歧义；同名多字段、未知名称、无稳定nid、缺组name、仅部分选择组拒绝。radio/checkbox大小写归一，允许组内type转换但保留value/name/checked等；多项已选转单选先停下要求明确默认项。原有对应ARIA布尔属性、同类role同步；没有声明的其它语义属性仍保护。JSON片段包含应用计算的authorizedFormChanges，合并不采信模型自报许可，必须落实期望值。

checkGenerationQuality新增form_rule_not_applied，仅对本次明确规则请求+原页基线生效。整页遗漏、反向状态、目标身份丢失/重复、未同步ARIA会阻断；局部按合同根复验，外部同名字段不导致误失败。候选采纳、证据保存与受控修复复用检查；仅证明静态原生属性，不将源码状态冒充后台/视觉质量。

### 打回与回归

- 第一次新增专项4项失败，定位出按钮文案未纳入名称、大小写radio顺序及颜色字段误排除；补语义定位、稳定DOM顺序和明确状态优先，未降低范围/保护要求。
- 第二次1项失败，select的label混入option文案；在只读克隆中排除控件子树后读取label，保留原DOM。第三次32项通过。
- 浏览器首次原生预览夹具放置x420+390，超过前序测试缩至768的宿主宽度；修正夹具x360，保留390设备与溢出断言。首失败日志与截图保留。
- ARIA补齐前完整2,423项通过；最终增加一致性用例后重跑完整单测、类型、构建与全部浏览器回归，最终19项新功能专项/147断言通过。

新增14项：form_behavior_changes的13项涵盖中英文与否定/装饰/引文、唯一/指代/歧义/稳定身份、长标签优先、选择组完整、反向布尔值/冲突、多授权区块、合并越权/错误值、真实JSON规划→片段、请求前拒绝、共享质量复验、整页遗漏拒绝、ARIA/多项选择保护；element_structure_chat新增1项真实Hook的同名外部字段与History采纳/撤销。旧页面/参考图、元素、区块、来源/候选等全量回归保留。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,424 pass / 0 fail / 15,366 assertions / 224 files / 45.18秒** |
| bun run type-check | exit0；tsc --noEmit，完整单测后执行 |
| bun run build | exit0；Vite 2.82秒 |
| git diff --check | exit0 |
| Chromium / WebKit | 真实ScreenFrame/iframe required状态、真实门禁后点击采纳、撤销/重做及既有全流程UI通过；页面错误0/外部请求0 |

日志、首失败截图及588个源码/测试/脚本/配置SHA256见[function-tenth](./evidence/2026-10-30-function-tenth/)。既有React act及主动错误边界日志仍存在，不声明日志零警告。

### 浏览器与证据范围

[function-tenth-ui/result.json](./evidence/2026-10-30-function-tenth-ui/result.json)的elementForm记录本次exact scope=element:region01、应用计算email001.required许可、原页/aside/链接/按钮保持、暂存History增加0。真实ScreenFrame按390设备、srcdoc与Token渲染；读取浏览器原生required属性为true，原页为false。onRenderQuality真实观测报告进入原候选门禁后才点击ChatDrawer采纳按钮，成功后History仅1条，撤销逐字恢复原页，重做恢复必填状态，未伪造渲染报告。

规划/覆盖/预算可查看，仍标语义未验证；功能模式预算2/4、7,168/34,568，无额外请求。会话同进程重开恢复只读规划/引用，未再请求或复用当前覆盖。已目视复核WebKit原生字段截图；旧文字/图像单页、多页、元素、区块、历史、依据/预算、有限JSON与SVG同批通过。

未改用户原工程、未发送真实Provider、未执行Git/打包/发布；浏览器不等于本轮Tauri进程重启或跨系统实机。Windows/Linux缺口仍按此前用户决定保留。原27项12完成/15待完成，FP-02/03/05及M2-05/全入口/M5尚未整体验收；后续按完整目标继续推进，不将本切片重定义为整体完成。

## 2026-10-30：M2-05 校准报告与简单别名基线

增加scripts/evaluate-design-calibration.ts及calibration.ts，使用原冻结40例校准（21正/19负），只检查20例留出的分组元数据，绝不评分留出query。测试以getter抛错证明开发报告不会访问该query。CLI保存目录/选择器/评估器/脚本/原样例SHA256、运行环境与完整行结果，可使用`bun scripts/evaluate-design-calibration.ts --output <报告路径>`重算；未知参数拒绝，不提供开发期隐式留出评分。

对照为同一适用性、共享别名/词边界、状态/设备/操作/目标与字符预算的简单目录顺序首项方案；现有方案是确定性加权排序。baseline只返回首项，P@1分母相同；不称为复杂BM25或真实模型对照。未更改原冻结样例，未因结果调整门槛或排除困难例。

| 校准指标 | 现有选择器 | 简单目录顺序别名基线 |
| --- | --- | --- |
| 正例首项正确 | 21/21 | 20/21 |
| 负例正确回退 | 19/19 | 19/19 |
| 禁止规则命中 | 0 | 0 |
| 留出 | 20例未评分 | 20例未评分 |

唯一baseline正例差异为cal-form-1；这是一套人工工程校准数据，不能推断总体收益或统计显著性。现有目录仍采用简单别名排序，没有引入新检索依赖。P@1、负例率、禁止项及全部校准正确的报告门槛通过，不等于完整M2-05放行。

### 打回与验证

首次脚本使用Bun globals/import.meta.dir，工程TypeScript没有Bun类型，开发type-check失败；改用fileURLToPath/process.argv/process.versions标准Node接口，不新增类型依赖或跳过检查。首类型日志保留。CLI修正后已重新运行并在最终当前源码上顺序执行完整测试、类型检查和构建。

新增3项测试：留出query不被读取/正负分母、简单基线的范围/排除/设备/废弃/词边界/预算，以及校准错例保留分母并失败、分组隔离破坏拒绝。专项28项/187断言通过。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,427 pass / 0 fail / 15,385 assertions / 225 files / 45.07秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；生产构建成功，具体耗时见build.log |
| CLI smoke | exit0；JSON报告及7个运行来源SHA256已生成 |
| Chromium / WebKit | 当前代码全流程受控回归通过，含真实iframe控件采纳/撤销/重做；页面错误0、外部请求0 |
| git diff --check | exit0 |

[report.json](./evidence/2026-10-30-calibration/report.json)、原始日志与591个源码/测试/脚本/配置指纹位于[calibration](./evidence/2026-10-30-calibration/)；[calibration-ui/result.json](./evidence/2026-10-30-calibration-ui/result.json)记录当前双引擎实际请求与门禁结果。测试仍有既有React act及主动异常日志，不声明日志零警告。

本次完整回归覆盖第十轮原生规则新增功能与旧工作流。校准报告没有执行正式留出、生成A/B、独立盲评或全部协议预算干跑，也不证明真实模型语义/视觉质量；这些项继续保留。原27项仍12完成/15待完成，M2-05未因校准子项而勾选。验证服务完成后停止；未发真实Provider、未改用户原工程、未执行Git或发布。

## 2026-10-30 M2协议干跑与M3内部输出适配

本轮对应[protocol-integration.md](./protocol-integration.md)。M2-05的校准检索与原预算/协议干跑已验收，顶层更新为13完成/14待完成；M3全入口及M4/M5没有据此整体放行。

实现：workflowCatalog为各工作流声明协议适用策略；规则包增加可选语义协议绑定，兼容旧无字段数据。区块/结构元素使用fragment-json、有限修改使用finite-json、大页重塑使用style-patch-json，小页保留HTML；这些字段与回执的真实core API stream-text/json-object分开。功能规划完成后冻结规则，避免规划加入后输入绑定变化。子调用继续原core/父预算，失败或取消不交付部分页面。

JSON/补丁输入只从生成Token CSS的缩进/换行中回收字符窗口，不删除变量、白名单、HTML或来源。扫描器保留引号、转义、注释与值；所有真实预设/明暗模式/设备的CSSOM解析结果相同。选择整条建议、检查最终序列化长度；没有空间就完全回退。字符数量不等于真实输入Token费用。

### 可复跑报告

- `bun scripts/evaluate-design-calibration.ts --output doc/ui-design-workflow/evidence/2026-10-30-protocols/calibration.json`：当前源码21/21正例、19/19负例，简单同约束标签基线20/21、19/19；20例留出未评分，禁止项0。
- `bun scripts/verify-design-protocols.ts`：[report.json](./evidence/2026-10-30-protocols/report.json)保存16/16行PC/mobile×8协议的全部基线/可选结果。每行验证真实core请求的Schema/输出上限、调用总数、累计申请输出相同和全部消息字符不增大；每个实际补丁/续写请求有独立完成回执，同任务规则相同。报告保存消息/Schema及12个运行源文件的SHA256，不保存Provider header/key或完整消息。
- 8类为HTML、自动续写、有限元素JSON、区块片段JSON、补充局部JSON、小页重塑HTML、原生样式补丁、导入CSS变量补丁。HTML含事实规划共2请求/11,264申请输出，续写共3请求/19,456；有限元素2,048、片段4,096、局部补充1,800；原生两组补丁累计4,096，导入一组2,048。规则回执只覆盖适用视觉请求，不冒充事实规划已注入。

### 打回记录与修正

原失败日志均保留在[protocols证据目录](./evidence/2026-10-30-protocols/)：旧结构负例错误地拒绝全部可选规则、Token夹具字符串转义/预设容器字段、MockTransport夹具方法及重塑合同参数错误分别修正后重验；不放松真实作用域或保护检查。首轮报告散列器无法处理合法缺省response_format，保留16行及失败分母后修正；Schema缺省与null分别编码。开发类型检查发现可缺省body及Provider必填字段，增加运行边界检查并补合成Provider字段，未跳过类型检查。

WebKit首轮在全页截图后触发iframe重新测量，测试采纳时渲染pending，真实门禁正确拒绝。保留[首轮截图/日志](./evidence/2026-10-30-protocol-ui/)及诊断日志；将夹具采纳按钮置于预览前并重新等待真实门禁ready后完整重跑。没有伪造渲染报告或使用强制采纳。

### 最终验证

| 检查 | 结果 |
| --- | --- |
| 新增专项 | 19项；聚合6套专项44 pass / 529 assertions |
| bun test | **2,446 pass / 0 fail / 15,797 assertions / 229 files / 46.62秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；Vite 1,887模块，2.64秒 |
| 校准/协议CLI | exit0；40例校准及16行协议全部通过，未评分留出 |
| Chromium / WebKit | 两引擎全套受控验证通过；新增PC1440/mobile390真实ScreenFrame片段规则渲染、门禁采纳、一次History及撤销/重做通过；无宿主/画框横向溢出；页面错误0、外部请求0 |
| git diff --check | exit0 |

最终原始日志、报告和599文件指纹见[protocols](./evidence/2026-10-30-protocols/)；浏览器结果/截图见[protocol-final-ui/result.json](./evidence/2026-10-30-protocol-final-ui/result.json)。全量有既有React act和主动异常日志，不声称日志零警告。

范围：以上全部使用合成夹具和MockTransport，证明适配、门禁与历史行为，不证明模型遵从、美感或业务语义。内部参数尚未覆盖根UI控制、分析入口和手动续写冻结快照/父额度；目录/环境/安全撤回、真实项目/模型对照和独立双人盲评仍是后续任务。默认规则保持关闭，未改用户原工程，未提交/打包/发布。

## 2026-10-31 手动续写：原任务、规则与预算继承

对应[manual-continuation.md](./manual-continuation.md)，开始实现于2026-10-30，验收归档日期2026-10-31。完整目标仍为原27项，当前13完成/14待完成；本轮不据此勾整个M3。

### 实现和实际行为

- 原会话保留TaskBudget对象和完整TaskContract；暂停等待计入原总时限。继续时不创建新账本、不扩大4次/34,568等现有根额度。`canReserve`只读检查下一次请求，不预留/退款/重置。
- 原账本登记taskId并保存检查点/合同的精确内存凭据，当前范围核对后一次性消费。缺父合同、不同账本、已消费、篡改后重算自指纹、不同模型/目标/来源/保护或过期均零请求拒绝。关闭时清理凭据。
- 冻结任务ID、功能规划、规则选择和已发生请求回执，后续实际请求追加回执。PromptBuilder接受已验证的冻结选择，恢复不重新选择目录。旧无规则任务的整页与同页分区仍走原通用指导，当前开关参数不能添加新规则。
- 余额不足下一次整页8,192/分区4,096申请输出时不保留可执行继续；提示拆分或显式重新生成。已消耗到最后一笔额度的完整合格结果仍可交付，不因预算exhausted丢弃成功页面。
- 任务/检查点仅当前会话内存有效。切工程或卸载关闭账本；重开历史只读，不伪造可继续或真实已发送。现有保存格式没有新增持久化预算对象、凭证或原始模型消息。

### 测试与打回

新增14项：11项服务/账本正反例（双档位、同任务规则及回执、修改/篡改/新账本/过期/关闭/取消、一次性并发重放、有/无规则的分区恢复、只读额度探针），以及3项实际聊天恢复/双击和项目切换/卸载测试。既有3个旧场景调整为有余额的恢复，原“预算耗尽后点击继续”改为原额度拒绝，不提升额度掩盖预算重置。专项5文件47项/309断言通过。

首次专项4个旧用例依赖原预算漏洞或无合同恢复，保留[first.log](./evidence/2026-10-30-manual/first.log)并按新合同修正：Pipeline继续必须传初次调用的账本和合同，低层独立续写测试仍维持原机制。代码复核发现只禁止创建新规则包不足以保护旧无规则分区消息，增加guidanceQuery新任务限定和实际消息断言。

浏览器首轮WebKit的协议夹具采纳状态断言早于React提交，旧ready与诊断已采纳竞态；保留[browser-first.log](./evidence/2026-10-30-manual/browser-first.log)及首轮失败截图。等待明确UI终态、让截图ResizeObserver调度后等待真实门禁，不更改生产报告或采纳底线。最终在全部修正的当前源码重新完整运行，不用首轮结果冒充最终验证。

### 最终验证

| 检查 | 当前结果 |
| --- | --- |
| bun test | **2,460 pass / 0 fail / 15,929 assertions / 230 files / 47.96秒** |
| bun run type-check | exit0，tsc --noEmit |
| bun run build | exit0，1,888模块，2.61秒 |
| 协议CLI | 16/16行通过，原Schema/消息字符/调用与申请输出预算保持 |
| 校准CLI | 21/21正例、19/19负例；简单基线20/21、19/19；20例留出未评分 |
| Chromium / WebKit | 当前源码全套受控入口通过；新聊天有余额恢复同账本/同task/同选择、4次总请求/27,648申请输出、只规划一次、只新增一页及1次History；耗尽时无继续按钮、无页面/History写入；页面错误0、外部请求0 |
| git diff --check | exit0 |

日志/协议和校准报告及602文件源码指纹位于[manual](./evidence/2026-10-30-manual/)；最终双引擎结果/截图见[manual-current-ui/result.json](./evidence/2026-10-30-manual-current-ui/result.json)。旧中间2456/2459测试日志保留，最终2460为当前验收。已有React act及主动异常日志继续明确保留，不称日志零警告。

本轮均为合成夹具及MockTransport，不发送真实Provider或用户工程内容，不证明真实模型设计质量。core失败回执不会改为完成，存在不完整必要来源时仍不交付；全入口恢复、传输物理重试、环境/安全失效和M4/M5仍继续。默认规则保持关闭，未执行Git、安装包或发布。

## 2026-10-31 用户控制与根入口规则接线（M3-01）

对应[root-entry-integration.md](./root-entry-integration.md)。M3-01根策略/输出适配及调用方接线已验收，顶层当前**14完成/13待完成**；其它M3、M4/M5没有据此整体放行。

### 产品和协议

设置→AI模型与Provider新增默认关闭的应用级“自动参考设计规则（试用）”，旧配置缺值/非布尔true一律关闭。Provider增删改和角色保存保留偏好，开关不改变项目对象、History、设备、Token或已采纳页面。进行中、等待确认、多页/方案批次、重塑面板和续写保留原选择；新的显式请求才按新值选择。中英文README同步使用方式及续写累计预算说明。

所有实际根调用方已按[调用清单](./root-entry-integration.md#根入口调用清单与验收范围)接通。精确授权DOM内提取原生按钮/角标/表单/媒体/长正文等已知语义，缺失/重复/未知根弃答，不从外部节点或请求词发明目标；整页修改、分析和重塑使用该页已知结构。新建不从仅供风格参考的旧页推断新功能。

分析采用analysis-json，利用原Token CSS排版空白保持完整最终消息字符窗口，原HTML、上下文、Schema及4,096每次/两次格式上限不变。规则包绑定协议和当前分析合同；返回与UI取消/失败回调均提供真实请求状态。无新字段的旧分析仍可读。

实际JSON解析失败保留failed；只有本分析后续实际Schema校验成功的纠正请求可作为前向替代。链接必须指向后续completed JSON请求、同provider/model，取消不能替代，其他生成协议不允许该例外。UI显示“调用失败（由后续格式纠正替代）”，不改写失败历史或当作所有模型响应均合格。源安全/渲染/候选门禁继续独立执行。

### 本轮27项新增与原问题修正

- 应用控制3项：真实设置控件/项目及历史不变、Provider/角色变动保留偏好、实际模块初始化覆盖旧/非法/显式true。
- 授权DOM语义3项：局部及整页已知结构、空/缺失/重复根与区块外排除、类名子串和可见词不伪造目标。
- 分析5项：PC/mobile同窗口/Schema和实际JSON请求、纠正前向链接与损坏关系拒绝、网络/取消无纠正，以及默认无来源/错误协议零新增请求；来源JSON往返和篡改后拒绝。
- 普通根对话13项：默认/开启新建，生成中关闭仍保留原偏好，实际Vision消息及图片、元素直接有限JSON、分析后局部/区块、纯本地零额外调用、多页及同页方案等待期冻结、整页确认true→false/false→true、问答/主题排除、真实挂起分析停止后cancelled回执。
- 检查器1项、重塑React UI试跑及全批次偏好冻结1项、程序标签不误判功能/结构新增1项。既有保真渐变导入用例改为打开应用开关时执行，确认仍保留来源CSS且无规则回执。

专项当前8文件**62 pass / 355 assertions / 2.80秒**；取消与旧分析生命周期另有4文件67项通过。

打回证据完整保留：首次原unknown-target用例实际含原生按钮/SVG/角标，新语义提取已能识别，改为显式未知并补真实未知根负例。新根夹具4次路由诉求不明确，改为明确修改授权/两个页面/疑问句，未为测试改全局意图器。随后发现真实程序标签“用户补充：主按钮内边距增大”被当成新增按钮，修正为去掉行首元标签后分析正文，新增按钮/字段/结构和原生规则仍进原保护规划。诊断日志保留，最终删除临时console输出。

浏览器首轮新页面已成功建立，但脚本等待空输入发送按钮启用，产品正确禁用而测试超时；移除此错误条件，让下一次真实输入和按钮执行性等待生效，不修改产品锁。首轮截图和日志保留；最终在当前冻结偏好/取消回调源码重新运行全套。

### 最终当前源码验证

| 检查 | 结果 |
| --- | --- |
| bun test | **2,487 pass / 0 fail / 16,110 assertions / 234 files / 50.22秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；1,889模块，2.62秒 |
| 协议CLI | 16/16行通过，原Schema、字符窗口、调用/累计申请输出不增大 |
| 校准CLI | 正例21/21、负例19/19；同约束简单基线20/21、19/19；20例留出未评分 |
| Chromium / WebKit | 当前全套通过；PC/mobile实际设置持久化、关闭后新任务回退/旧来源保留、分析failed→完成纠正、确认前关闭仍冻结、真实iframe采纳/一次History/撤销重做；挂起分析停止后仅1次请求、无候选/原页/History改变；页面错误0、外部请求0 |
| git diff --check | exit0 |

日志/两份CLI报告及608文件SHA256位于[roots](./evidence/2026-10-31-roots/)；最终结果和截图见[roots-release-ui/result.json](./evidence/2026-10-31-roots-release-ui/result.json)。中间2482/2484/2485等回归保留为历史，当前2487才是最终证据。既有React act及主动异常日志仍存在，不宣称日志零警告。

根UI/组件单测、服务MockTransport和双浏览器覆盖分别列明，不将一项替代全部原生入口。M3-02/03仍需预算拒绝的派发语义、修复/物理重试和全部侧车消费者；M3-04/05仍需保存重开/检查依赖/安全撤回/授权变化完整矩阵。M4/M5真实模型对照、独立双人盲评及实际工程/原生导出继续。默认规则保持关闭，未改用户原工程，未执行Git/安装包/发布。


## 2026-10-31 请求来源与受控修复继承（RT-01..04）

本轮修复Pipeline/重塑预算检查在回执内侧的错误顺序，并将原自动预算显式传入一次修复服务。修复从父任务冻结选择按原顺序在现有CSS排版空白内适配，不检索新规则；记录父来源、实际注入/空间省略和独立调用，原任务包不变。新页、候选、交付归档与只读界面同步校验，旧无来源记录继续兼容。

新增17项覆盖耗尽/取消/关闭零伪造调用、修复原预算/原范围/原字符窗口、来源篡改/缺失/取消迟到、候选保存恢复/门禁/采纳撤销、真实AIService的fetch错误及模拟原生代理错误无回退。传输专项首次挂起是测试先等待Bun拒绝断言再投递IPC事件；中断exit130，改为普通Promise观察→投递Ready/Error→断言，第二轮24项通过。未修改代理来迎合测试；transport-first.log保留。

| 检查 | 当前结果 |
| --- | --- |
| bun test | **2,504 pass / 0 fail / 16,220 assertions / 234 files / 47.77秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；1,890模块，2.52秒 |
| 传输专项 | 24 pass / 0 fail / 61 assertions / 272ms；错误无应用层自动重试，Rust IPC不回退fetch |
| 协议CLI | 16/16行通过，原Schema/字符窗口/输出额度保持 |
| 校准CLI | 正例21/21、负例19/19；简单基线20/21、19/19；20例留出未评分 |
| Chromium / WebKit | 当前全套通过；移动端390/PC1440实际自动修复（规划→生成→修复三次调用），真实iframe完整复验、只读来源、创建History一次提交及撤销重做；页面错误0、外部请求0 |
| git diff --check | exit0 |

[日志与609文件指纹](./evidence/2026-10-31-trace/)、[浏览器结果](./evidence/2026-10-31-trace-ui/result.json)和截图已归档；WebKit移动端来源展示截图已人工查看。首次2500项回归是增加4项传输用例前的中间记录；最终2504项才是本轮全量证据。既有React act/主动异常日志仍存在，不声称日志零警告。

原生传输为模拟IPC边界，未真实连接Provider；Rust的HTTP重定向loop按源码审计，未验证逐跳真实收包或库内部重试。未执行真实模型对照/独立双人盲评/用户工程原生导出，未执行Git/安装包/发布。原27项继续14完成/13待完成，不把RT切片当M3-02/03或整次重构已完成。


## 2026-10-31 规则来源持久化与档案读取（PP-01..04）

补任务合同形状检查/null fail-closed、成功会话独立只读设计来源、JSONL保存恢复、历史规则界面，以及单页/重塑归档的来源/原基线/候选与最终HTML绑定，prepare/get/list/finish一致检查。新合同按类型白名单提取主题/来源/知识摘要；旧已冻结全主题/无规则档案不重写、不重新检索。恢复来源不会赋予执行/引用/续写能力。

新增41项覆盖：脱敏/快照独立性、绑定/正文/回执/工作流污染、取消只读非完成、分片重开/压缩旧字段、null/坏合同与旧无合同、真实根新建/元素恢复与损坏来源提示、两类交付保存恢复/前后页/目标/调用取消篡改、准备和状态更新写入拒绝、旧全主题来源兼容，以及稳定nid注入与既有nid保护。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,545 pass / 0 fail / 16,438 assertions / 236 files / 49.73秒** |
| bun run type-check | exit0；tsc --noEmit |
| bun run build | exit0；1,893模块，2.57秒 |
| 协议CLI | 16/16行通过，输出Schema/消息字符窗口/父额度保持 |
| 校准CLI | 正例21/21、负例19/19；简单基线20/21、19/19；20例留出未评分 |
| Chromium / WebKit | 最终全套通过；PC/mobile实际ChatDrawer重开显示历史规则和原回执，调用/History/页面数量不变；真实DeliveryHistoryPanel读取单页档案并展示冻结规则；既有采纳/撤销重做/功能/参考/分区/续写/修复回归通过；页面错误0、外部请求0 |
| git diff --check | exit0 |

打回全部保留：history-first（冻结后污染设备正例错误）；archive-first/second（夹具后台旧状态覆写/读Zustand旧快照）；roots-first/diagnostic（发现真实builder误收全主题Token和origin.updatedAt，白名单投影使旧错误身份不匹配）；dev-types-fourth（Object.fromEntries无法证明必需kind）；full-release（2542 pass/1 fail，旧资源测试仅改after未改候选，与新绑定冲突）。对应修复后专项及最终全量通过，未放松绑定或删除资源缺失/字节变化负例。

中间2538项全量、provenance-ui及provenance-release-ui属于中间源码记录；最终证据为full-final/types-final/build-final、[614文件指纹及日志](./evidence/2026-10-31-provenance/)和[provenance-final-ui/result.json](./evidence/2026-10-31-provenance-final-ui/result.json)。WebKit移动端历史/交付截图已人工查看。既有React act及主动异常日志仍存在，不宣称日志零警告。

当前只关闭PP切片，原27项14完成/13待完成保持。全部运行时消费者/嵌套报告语义、坏JSONL基础字段隔离、失效/安全撤回和M4/M5继续；未进行真实Provider A/B、双人盲评、用户工程原生导出或Git/安装包/发布。没有改写用户原工程。


## 2026-10-31 运行时证据与损坏记录隔离（RE-01..04）

35项前端新增、2项Rust新增。会话基本形状/可选字段隔离、合法真实月份索引恢复、跨实例同工程追加与索引/压缩协调、尾部坏行补读、原生逐行UTF-8解码隔离及小起始容量；质量/渲染报告与候选聚合状态/必需证据一致性、冻结检查计划绑定；草稿修复历史来源验证、零请求说明和创建/候选/交付消费完成。创建null合同拒绝，普通本地修复不再丢execution来源。

| 检查 | 最终结果 |
| --- | --- |
| bun test | **2,580 pass / 0 fail / 16,577 assertions / 238 files / 51.46秒** |
| bun run type-check | exit0，tsc --noEmit |
| bun run build | exit0，1,897模块/2.70秒 |
| cargo test --offline --lib | **26 pass / 0 fail**；文件存储专项7项包含真实临时文件的坏UTF-8/截断尾行、零/usize::MAX限制及I/O错误 |
| 协议CLI | 16/16行通过 |
| 校准CLI | 正例21/21、负例19/19；简单基线20/21、19/19；留出20例未评分 |
| Chromium / WebKit | 最终全套通过；移动端390/PC1440损坏基础行/可选字段/索引恢复，原规则显示且调用/History/页面数不变；真实失败草稿确认文字后零追加模型调用，新页实际iframe完整门禁、历史来源与撤销重做通过；页面错误0、外部请求0 |
| README / git diff --check | 中英文内容同步，所有相对链接存在；diff检查通过 |

首次evidence-first专项打回为测试夹具的共享计划对象别名，structuredClone未模拟文件中的独立对象；改为JSON恢复后只篡改报告，生产绑定未放松。原日志保留。前端full-first是中间记录，最终full-final日志才是发布本轮源代码的回归证据；Rust源码格式化后清理了无关旧函数格式改动，rust-release重新验证26项。

[620文件指纹与日志](./evidence/2026-10-31-runtime/)、[两引擎结果与截图](./evidence/2026-10-31-runtime-ui/result.json)仅本地保存，Git忽略原始截图/工程快照/日志。已人工查看WebKit移动端本地修复来源截图；既有React act及主动错误日志仍存在，不声称控制台零警告。

中英文README按用户新请求更新并检查链接，Git提交/推送以实际记录为准。原27项14完成/13待完成保持，未将本轮Rust存储单测等同完整桌面工程/PNG验收，也未执行真实模型A/B、独立双人盲评、Win/Linux实机或新版本打包发布。
