# M3-04 运行时结构与旧记录兼容审计

2026-11-02完成原M3-04逐项审计：新增来源数据的运行时schema、全部持久化消费者及旧工程/候选兼容已按下列矩阵验收，无回执不补造已使用或通过。保留此前分步与失败记录；不据此放行M3-05/M4/M5。

## 本轮复核与验收

- [x] RC-01 验证TaskContract根结构的枚举字段必须为JSON字符串，不能靠String强转把数组当枚举；故障来源在实际会话读回时隔离，但保留会话正文。
- [x] RC-02 直接规则来源校验也检查TaskContract根结构；即使重新计算包指纹和匹配子ID，数字/对象任务身份或非法根字段仍不能成为有效来源。合法无包旧合同、缺输出协议旧回执和全部历史状态保持兼容，不补回执。
- [x] RC-03 先记录负例，修复后运行来源/历史/仓储专项、全量测试、类型和构建；改变生产校验时重新运行实际浏览器消费者。

这里校验本地记录的数据结构与内部一致性，不证明记录未被人工编辑。旧完整主题负载及未知附加字段的投影/指纹兼容、所有仓储入口和迁移矩阵仍需逐项核对；不能用本轮几个旧记录正例宣布全部旧工程兼容。

首轮负例：`design_provenance_persistence.test.ts` 19 pass / 10 fail，日志 `/private/tmp/taudesign-runtime-shape-negative.log`。真实会话月分片可复现坏knowledge kind被读为有效历史来源；其它应用执行入口已有更深身份校验，当前证据不说明坏记录曾被采纳。

## 修复与最终结果

- taskContractShape 的五类枚举改为先检查原始JSON字符串类型再校验成员，不再对数组作String转换；未新增字段、默认值或迁移。
- guidancePacketIssue 在读取包前检查TaskContract根结构；数字/对象/数组/null任务ID及坏根枚举，即使重新计算包和子ID也被拒绝。无规则的合法旧合同不补造来源，坏来源仍可在原会话中诊断，不删除正文。
- 初轮10负例复现后，来源/档案/历史/规则安全专项125/0（626断言、5文件）通过。
- 首次全量2794/1；失败为restyle_progress旧测试用`{} as any`表示合法成功合同。已换真实buildRestyleContract，原成功/阶段/精确计数断言全部保留，2文件35/0通过，没有放宽生产校验。
- 最终 `bun test`：2795 pass / 0 fail / 18044 assertions / 245 files / 66.76秒。类型检查exit0，生产构建exit0、Vite2.50秒，diff检查通过。现有React act/预期错误日志保留，不声称零警告。
- 生产校验变更后完整重跑浏览器：Chromium/WebKit各覆盖mobile390和PC1440，来源历史、事实规划、功能修改、候选/资源、修复/采纳/撤销/重开及零调用状态等现有矩阵均通过，每引擎pageErrors0/externalRequests0。证据 `evidence/2026-11-01-runtime-shape-ui/result.json`，受控模型响应；不是实机/真实模型验收。
- 失败与最终日志、716文件源码SHA256归档 `evidence/2026-11-01-runtime-shape/`，原始证据Git忽略；未进行真实Provider/人评、原生实机、打包、发布或Git提交。

RC-01/02/03当前切片通过；原M3-04仍开放，旧完整主题负载/附加字段与所有仓储迁移矩阵继续审计。该范围不得缩成“根枚举通过即全部兼容”。顶层保持17完成/10待完成，默认规则保持关闭。

## 2026-11-02 完整主题来源与共享渲染结构

- [x] LC-01 补旧完整主题/updatedAt来源进入会话的负例：保留原冻结结构、字段顺序与绑定，不重算绑定假装旧记录通过。仅保留声明过的主题数据字段；未知凭证/原文/执行字段拒绝，不传播到会话。不把只读历史恢复成执行权限。
- [x] LC-02 统一修复回执initialRender与共享渲染报告schema，拒绝负数/小数计数和坏资源快照；新页与候选交付侧车同时拒绝，合法旧无资源快照保留。
- [x] LC-03 补真实ProjectRepository、候选/交付仓储、会话月分片及Bundle迁移的组合验证，核对旧无来源、旧无协议、完整主题、正常及损坏来源的读写隔离；迁移保持原字节，不把旧验收变成新采纳权限。
- [x] LC-04 对所有新增来源/规则字段的schema与持久化消费者列出逐项矩阵，运行专项、全量、类型、构建和实际浏览器；证据覆盖全部原范围才关闭M3-04。

只读完整主题恢复属于旧源合同兼容。历史主题值仅作为绑定数据保存，不用于修改当前工程、执行模型或跳过渲染；不能为方便展示重写旧包指纹。原始坏数据继续保存在原档案，无法安全投影则保留正文并显示来源不可用。

LC-01 消费者补查：pageTaskHistory原投影仅选择外层合同，设备/主题/来源仍按原对象复制；需与规则历史共用字段投影，已绑定的未知嵌套字段不能静默删除后假称原来源有效。读回还需去掉外部插入的未绑定HTML/规则包/凭证字段，并保留合法旧完整主题和原业务规划绑定。

## 原M3-04逐消费者核验矩阵（2026-11-02）

| 类型/持久化消费者 | 当前读写规则与旧数据边界 | 直接证据 |
| --- | --- | --- |
| DesignTaskContract及工作流计划 | taskContractShape校验JSON真实类型；resolveWorkflowValidation执行前检查已知工作流、必要范围、来源及现有验收计划。历史taskProvenance独立核对身份，旧缺validationPlan可读，显式null不能退回无合同。 | design_provenance_persistence、workflow_validation、guidance_archive_integrity的根结构/外来任务/null/旧字段正负例；旧记录无包仍需实时门禁。 |
| Rule目录/RuleSelection | validation.ts及receipt.ts核对规则结构、冻结正文、版本/哈希/适用性/冲突与选择/省略；历史用冻结快照而非今日重选。不以人工建议升级自动required门禁。 | design_knowledge、design_guidance_receipt、rule_safety、design_token_window及协议干跑；废弃/撤回的历史与执行边界分开。 |
| GuidancePacket与逐请求回执 | root形状、输出协议、父子ID/顺序、Core状态、规则输入及分析纠正替代关系校验；旧缺outputProtocol保持缺失，缺包/缺回执不补造。 | design_guidance_receipt、structured_guidance、analysis_guidance、guidance_archive_integrity；全部历史状态只读显示与执行拒绝矩阵。 |
| 规则会话历史 | read/captureDesignGuidanceHistory采用共享字段投影；旧完整主题/updatedAt按声明数据白名单保留原绑定，不重算；未知嵌套/二进制负载拒绝，未绑定根附加字段不进入会话。 | 本轮旧主题投影正负例、渐变/语义颜色/早期阴影与省略字段正例、未知字段/类型/内联图片负例；JSONL保存重开及实际聊天重挂载。 |
| PageTaskSnapshot及会话规划 | pageTaskPlanIssue核对原业务结构、来源、模型/图片及页面关联；pageTaskHistory与规则历史共用投影，只保留规划输入，不存规则包/执行信息/任意附加数据；合法旧完整主题保持原绑定。 | page_task_plan/page_task_history；本轮3嵌套凭证与外部HTML/规则包负例、旧主题JSONL正例；原功能/区域/参考图/多页来源回归。 |
| 源知识、参考图和设计库身份 | 原TaskContract中的来源引用/版本按冻结值保留，workflowSources、referenceImage、库绑定验证器独立核对；历史不携带实际图片像素或库执行权限。保真导入仍不补模型来源。 | workflow_sources、page_task_reference/page_task_reference_modify、design_library相关套件、design_guidance_receipt保真导入、完整浏览器参考图/库来源消费者；新主题投影不编译或应用历史Token。 |
| SavedQualityDraft及零请求修复 | qualityDraftRepository验证guidanceSource/pageTaskSource/父taskId与请求，draftExecutionSource仅允许历史输入；aiAttempted跨保存/迁移保留，不续期原预算。独立坏草稿不损坏工程。 | guided_draft_repair、failed_design_drafts及候选修复套件；本轮8个实际迁移组合包含完整来源失败草稿，读回相等且已用资格再次claim=false。 |
| 候选仓储与恢复 | candidateRepository保留安全HTML及损坏来源供诊断，坏可选验收去除，不伪造通过；restoreStagedCandidate清空实时渲染状态。旧无candidateId/validationEvidence/合同保持缺失，恢复不能直接采纳。 | staged_candidate_persistence、candidate_validation_evidence、guidance_archive_integrity；本轮两设备旧/新格式迁移，旧可选字段缺失仍缺失、旧source-less仍无包、即时adopt=false且History不增加。 |
| 普通交付仓储 | DeliveryRepository.prepare执行门禁，finish/get/list复核来源与页面/基线/结果指纹；历史旧完整主题原样保留。坏预览只降级预览，坏来源档案计invalid。 | delivery_archive、delivery_preview、guidance_archive_integrity；本轮candidate_repair三坏initialRender侧车get/list/finish均拒绝。 |
| 重塑交付仓储 | RestyleDeliveryRepository验证目标与完整页面/组件写集、来源/结果/验收；旧缺新可选字段保持缺失，历史读取不恢复执行授权。 | restyle_delivery、guidance_archive_integrity旧完整主题与坏ID/基线/结果；本轮普通/重塑×两设备×旧/新主题8个档案迁移组合。 |
| 新页元数据与创建证据 | isPageCreationEvidence复核合同/规则/业务来源、工作流与共享质量/渲染schema；坏旧metadata为诊断，不成为新建或采纳授权。ProjectRepository不删除历史metadata。 | page_creation_evidence/page_creation、guidance_archive_integrity；本轮实际CanvasToolExecutor生成新页，经ProjectRepository及Bundle重开证据相等、仍可校验。 |
| 修复回执及规则trace | pageRepairRecord复用共享isRenderedQualityReport验证原渲染；repairTrace旧无guidance不补，完整trace的父选择/允许规则和实际单次调用必须一致。 | page_creation_repair、candidate_repair新增负数/小数/坏资源快照在原回执、新页、候选、交付档案同时拒绝；旧无resourceFiles的正常记录通过。 |
| 工程根文档/页面文件 | ProjectRepository保留v1来源metadata和当前本地页面/CSS/文档；load不将旧创建证据当实时验收。现有旧主题/导航/viewport缺省迁移保持原兼容策略。 | migration_integrity/project_bundle_migration既有原字段、CSS、文档、资源及失败回读；本轮8组合包含新页来源metadata，完整工程保存重开比较。 |
| JSONL月分片与坏行 | ConversationStore/readConversationTurn隔离坏必需行，保留坏可选来源的正文供UI解释；按月原字节迁移，缺索引恢复和compaction不制造来源。 | design_provenance_persistence、page_task_history、conversation恢复套件；真实Chromium/WebKit旧来源与坏来源同屏，第二次重挂载调用/页面/History不增长。 |
| History撤销重做 | 保存的已提交页面/metadata原值传递，不将历史来源转为新执行合同；通用History不是新的AI候选授权。 | history_persistence；本轮真实新页经历史序列化→迁移→parse/restore→undo移除→redo恢复同一creationEvidence；迁移前后history.json字节相同。 |
| 外部视觉证据侧车 | visualEvidence只保存任务/文档/环境/图片摘要及原交付owner，不复制规则包或产生新模型回执；其原交付来源仍由普通/重塑仓储校验，旧无外部报告保持缺失。 | visual_evidence的真实档案任务、异常报告/图片、旧无报告面板及视觉目录整包迁移测试；不将外部报告作为M4必需自动检查的替代。 |
| 整包迁移与异常恢复 | projectBundleMigration复制工程/候选/草稿/普通与重塑档案/JSONL/历史和资源原文，已损坏数据保持原文并诊断；新schema不借迁移补回执或授权。 | 本轮8组合对每个来源侧车逐字比较源/目标，原工程不变；既有project_bundle_migration覆盖坏JSON/写读错误/缺资源/路径/源变化/不覆盖目标及位置提交失败。 |

此矩阵覆盖本次重构新增来源数据的全部已知v1格式与生产消费者；不承诺未来未知schema能执行，也不把一般外部编辑的任意History补丁当可信签名。旧不受支持附加字段仍保留原档案/正文，安全投影不可得时显示来源不可用，不重写原绑定。独立的完整失效/授权矩阵属于M3-05，required/advisory与内容/渲染门禁属于M4，真实Provider/人评与原生平台验收属于M5。上述原任务不据本矩阵替代。

## M3-04 最终收口（2026-11-02）

- 本轮新增33项回归，原始有效负例均保留。最终全量2828 pass / 0 fail / 18449断言 / 245文件 / 65.99秒；类型检查exit0、生产构建exit0（Vite2.64秒）、diff检查通过。
- 718文件源码指纹在最终完整浏览器前后逐文件一致。最终 `evidence/2026-11-02-compatibility-frozen-ui/result.json`：Chromium/WebKit各覆盖mobile390/PC1440，全部既有消费者矩阵及新增旧主题/业务来源同屏和二次重开通过，每引擎pageErrors0/externalRequests0。
- 新场景在两档位均断言原主题、绑定、逐请求回执及业务规划完全一致，2次受控建源调用后重开不增调用/页/History；坏来源显示诊断、正文仍保留。聚焦WebKit截图已实际查看，详情展开且可见。
- 8个真实存储组合（普通/重塑×当前/旧主题×两设备）包含新页证据、旧候选、失败草稿、交付档案、JSONL和History：源/目标原文不变，metadata读回有效，undo/redo恢复同一创建证据，已用草稿资格不重置，旧无可选字段保持缺失且候选仍须复验。
- 初次完整浏览器因同轮类型注解修改触发Vite重载而中断，已保留；最终以冻结源码重跑为准。日志、失败记录及前后718文件清单在 `evidence/2026-11-02-compatibility/`，原始证据按规则Git忽略。

至此按原范围关闭M3-04及AC-21（旧工程/候选可读且不补假来源/验收）。当前18/27完成、9待完成。来源schema兼容不替代完整失效/授权矩阵（M3-05）、交付底线/布局/对比度（M4）或留出/真实模型/双人盲评及原生平台验收（M5）。规则仍默认关闭。本轮没有真实Provider、人评、Rust/原生实机、打包、发布或Git操作；模拟存储和浏览器不冒充跨平台原生验收。
