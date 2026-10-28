# 验收清单

> 2026-10-28收口：复制页entry修复与当前源码42/42复验、新增双引擎/真实macOS原生专项通过，最终2,212单测/类型/构建及24Rust通过。[报告](../refactor-finalization/test.md)。Windows/Linux原生实机仍未验收，用户已确认保留缺口；后文按日期保留历史。

- [x] 2026-10-26 真实复杂PC外部样本增量已执行：6页只读迁移、3页三设备双引擎54项回放、macOS副本文件/History/原生PNG；原源码未变，WebKit兼容PNG交叉差异3项未通过并保留。[报告](../real-pc-acceptance/test.md)。

## 2026-10-26 最终收口验收

- [x] CLOSEOUT-C1 当前286个生产/验证文件与最新冻结指纹一致；42个矩阵条目退出成功，其实际报告与日志均存在并核对通过状态。[证据](./evidence/closeout-2026-10-26.json)。
- [x] CLOSEOUT-C2 当前验收导航71个本地链接有效；明确区分已归档测试与本次只读复核，不重复宣称在线模型或跨平台全链路验收。[记录](./closeout.md)。
- [x] CLOSEOUT-C3 四期静态功能完成；复杂真实PC、Windows/Linux证据单独待验收；不将历史进行中记录或范围外功能算作当前开发待办。[范围](./completion-status.md)。

> 当前验收范围与未取得的外部证据见[收敛清单](./completion-status.md)。下方增量保留历史版本与当时限制；通过表示明确范围内的检查成功，不是所有模型、工程和平台的无条件质量保证。

- [x] 用户明确指定元素时合同标记为局部修改，并记录 elementNid 与页面基线；不强制走宽泛分析。
- [x] 宽泛页面修改仍遵循现有“先分析并选择修改点”入口策略；现有修改分析回归覆盖 12 项。
- [x] 新建、整页修改、主题、问答均生成稳定且一致的合同。
- [x] 所有 PipelineOutput 状态均带合同，包括安全拒绝、质量拒绝、截断、流错误和成功候选（统一出口包装）。
- [x] Prompt 含设备/目标/范围/验收合同，且不覆盖用户请求与项目规则。
- [x] Manifest 校验对正常工程通过，对重复/非法实体给出定位明确的问题；失效页面关系、坐标和资源路径有测试。
- [x] `bun test`、`bun run type-check`、`bun run build` 均通过。
- [x] HTML 导入 preserve/unify/selective 合同写入来源文件指纹、设备和导入策略；来源信息保留在页面元数据。
- [x] 单页/批量重塑合同随提示和候选/拒绝结果传递；设计系统来源写入提示，主题替换和手动编辑通过 History 可撤销/重做。
- [x] 设计系统来源跟随工程保存和加载；普通 HTML 页面导入不会误把项目主题来源改成 HTML 导入。
- [x] 组件模板定义记录版本和提取来源；仅模板变化递增版本，实例插入/同步/分离正确维护 `data-component-version`；提取与页面改动同一 History 事务可撤销/重做。
- [x] 工程清单包含页面组件引用与库版本；组件定义缺失或实例版本落后时生成可定位问题。
- [x] 检查器可设置/清除页面跳转；目标不存在或节点不存在时拒绝写入；页面跳转沿用 HTML 单一来源，撤销/重做正常。
- [x] 画布 Shift+点击有效跳转元素会定位到目标画框；普通点击仍用于选择元素。
- [x] 工程清单/AI 项目上下文显示有效跳转边，并报告失效目标。
- [x] 候选必须有与当前内容/Token 快照匹配的 `complete` iframe 渲染报告才可采纳；缺失、过期、pending、incomplete 或 unavailable 报告均不能绕过 Store 直接采纳。
- [x] 画布明确显示渲染检查未完成状态并禁用采纳/保留两版；warning 可继续采纳，error 阻断。
- [x] 守卫拒绝候选的明确“强制放行”可覆盖原页；只跳过结构守卫，仍拒绝不安全 HTML 和缺失/过期/未完成/不可用或含 error 的渲染报告，且覆盖前创建历史备份。
- [x] Token 指纹对对象键顺序稳定；仅 Token 值变动递增版本，名称变化不递增；History undo/redo 与项目序列化恢复对应身份。
- [x] Manifest 与任务 Prompt 展示 Token 版本/指纹/来源，以及每页导航、按钮、表单字段和可观察状态信号。
- [x] 导入/生成的 scoped CSS 获得页面内稳定资产 ID 与指纹；CSS 改动递增版本，撤销/重做恢复原身份，Manifest 显示资产信息。
- [x] 页面交互静态诊断标记不存在的页内锚点、断开的 `aria-controls`、无提交控件的表单和无可访问名称的控件，并以 warning 提示。
- [x] 明确静态交互诊断的边界：页面脚本和真实表单提交受 CSP 禁止，PRD D7 排除可点击原型；验收不宣称真实提交、角色分支或页面状态转移通过。
- [x] 表单契约按表单归组字段和提交动作，保留字段类型、名称、可访问标签与必填约束；正确识别 `form="id"` 外置提交按钮；Prompt 摘要有界；不宣称校验真实业务提交结果。`test/project_manifest.test.ts` 覆盖完整契约和外置按钮；全量回归通过。
- [x] 视觉比较命令将目标 HTML 在指定浏览器/视口截图，与同浏览器基准比较并输出 PNG 和变化比例；越过阈值、尺寸不一致、浏览器不可用或页面资源未就绪时必须失败。Playwright 1.58.0/Pillow 12.3.0 固定于可选依赖文件；Chromium 匹配与差异、损坏资源、缺失 WebKit 均已验证。
- [x] Chromium 145.0.7632.6 与 WebKit 26.0 使用各自独立临时基准完成实跑；两边相同画面均通过，按钮色改动均触发差异失败。项目级长期基准仍由使用者按具体页面建立。

## 早期验收边界（历史）

> 此段为最初增量记录；Token和页面CSS版本、交付视觉证据关联已在后续完成，当前以验收映射为准。
本阶段工程 Manifest 的重复 ID 校验接受数组输入；应用当前 Zustand 页面/资源记录本身以对象键去重。设计系统来源和组件模板版本已追踪，Token/样式库的逐项版本追踪尚未接入。交互关系与表单字段/提交结构为静态契约；真实提交结果、页面状态转移和角色分支明确不在 PRD D7 当前范围内。跨浏览器像素对比提供独立 CLI，尚未纳入候选采纳门禁，也没有为真实用户工程预置基准。

## 完整方案验收状态（当前静态范围）
- [x] 现有生成和导入入口使用声明式工作流路由、任务快照和共享执行结果；各安全策略保留专用引擎。包含参考图、设计库、同页多方案及多业务页。见验收映射与入口矩阵。
- [x] 候选可追溯知识来源、设计库版本、基线、授权范围、实际验证与独立预览；旧状态/配置不能直接采纳。资源最终读取补充见 evidence/resource-final/report.md。
- [x] 三种设计库模式、真实资源及引用检查通过确定性端到端；旧工程/附属档案迁移、真实移动工程/PC基础与macOS文件链路有独立证据。具体版本见验收映射。
> 以下一项保留当时的证据缺口原文；在线模型服务及浏览器聊天闭环后来已补独立证据，见验收映射的在线增量。当前外部待验收仅复杂真实PC与Windows/Linux实机，不将旧记录算作尚未开发的功能。
- [>] 参考设备截图、真实移动工程及PC基础验收已有证据；新增复杂PC合成回归，复杂真实PC/在线模型/Windows与Linux证据仍未取得，不标为全平台实测完成。

### 当前续建批次
- [x] 普通/强制/保留两版先存交付档案再修改页面；准备写失败保留原页，取消/过期/切工程不误应用，重复点击不重复交付；History 与档案分别表达页面状态和历史事件。九项专项测试和 1,319 项全量回归通过，页面面板正常展示。首轮比较蒙版用例因 happy-dom 无几何布局覆盖手工“通过”而失败；为纯蒙版测试固定观察器后回归通过，生产门禁保持实测约束。Chromium/WebKit 均完成真实渲染、采纳、历史展示与重开工程验证，截图和 JSON 位于 `evidence/delivery-history-*`。
- [x] 候选侧车保存实际静态检查、全项目资源审计与 iframe 报告，并能查看检查范围和发现的问题；恢复出的历史报告不参与当前采纳，跨候选迟到检查不能覆盖新证据。`test/candidate_validation_evidence.test.tsx` 四项定向回归及 1,310 项全量回归通过。
- [x] 候选资源文件核对覆盖最终页面全部本地图片/图标，包含原页面保留的引用；未登记、缺文件、不安全路径、不可核对或 pending 均阻断普通与强制采纳。其它页面的缺失资源留给项目级审计，不牵连当前候选；补齐文件后可重新核对。
- [x] 当前候选单独保存到 `candidates/current.json`；快速丢弃、采纳或保留两版时顺序删除，不会被之前慢写复活。重新打开工程能恢复候选 HTML、任务快照与执行记录，但渲染/资源物理检查重新从 pending 运行；来源工程、页面或项目知识变化时阻止采纳。写盘失败在画布提示，危险源码不会存档。
- [x] 设计库项目副本会只读核对来源组件实际引用的图片/图标登记与文件，复制到目标工程并重写组件 DOM 属性和内部 CSS 路径；缺失、冲突或写入失败在元数据事务前阻断并清理本轮新增文件。资源元数据与组件、Token 在一条 History 中撤销/重做，二进制内容不写入工程 JSON。
- [x] 主生成、导入和润色由同一工作流目录选出既有工作流 ID 与对应约束；元素修改优先于整页修改，定向测试覆盖。尚未覆盖完整四期方案中新增的工作流类型。
- [x] 任务快照包含请求、基线、保护/授权范围和实际知识来源指纹；变更后能判定旧候选或知识过期。
- [x] 候选携带任务快照并在采纳前检查基线与设计系统身份；历史工程与旧候选沿用已有质量和渲染门禁。
- [x] 工程清单诊断未登记资源 ID、HTML/CSS 的未登记本地资源路径；最终候选含有该问题时普通/强制采纳均拦截；HTML 导入在资源写入后逐项核对文件存在。项目全量资源审计已接入候选报告。`test/project_manifest.test.ts` 与 `test/action_adoption.test.tsx` 覆盖。
- [x] 页面分组、静态状态和适用角色存于页面元数据，检查器编辑走 History；保留两版时新页面记录原页 ID。Manifest 检查失效候选来源并将静态分类纳入有界 AI 上下文，项目知识指纹跟随分类变化。`test/screen_design_role.test.tsx` 与并排采纳回归覆盖。分类不驱动运行态交互。
- [x] 检查器的“项目资源核对”能按需读取全部当前页面和资源，并经工程存储核对真实文件；异步跨工程结果不会写回当前面板。缺失文件的用户可见提示由 `test/screen_design_role.test.tsx` 覆盖。
- [x] 候选交付状态由任务快照、HTML 源安全、静态质量、资源引用、全部引用资源物理文件、当前 iframe 渲染报告六项实际检查计算；画布与聊天候选卡均显示通过项数并按同一状态禁用普通采纳。结构守卫拦截候选只能通过明确的“强制放行”入口，仍必须通过任务/安全/资源/渲染检查。`test/action_adoption.test.tsx` 与 `test/side_by_side_replace.test.tsx` 覆盖。
- [x] 候选引用已登记图片/图标后，物理文件检查以 pending 开始，缺失或不可核对时普通和强制采纳均阻断；只有当前候选的核对结果可写入报告。聊天与画布显示检查进度或原因；其它页面资源问题作为工程级提示归档。
- [x] 主生成、润色与导入转换的结果可读取统一的执行记录字段；有界续写次数、最终结束原因、原始响应和完整 HTML 与实际执行一致。模型流报错时润色不得提取残留 HTML 当作成功结果；导入记录声明来源为 `html-import`。
- [x] 主生成及润色执行记录随候选进入暂存状态，原始模型响应与最终规范化 HTML 均可核对；当前候选记录持久化于独立侧车，不写入聊天 JSONL 或主工程页面清单。采纳后的长期档案尚未建立。
- [x] 宽泛优化由目录路由到仅分析合同，分析卡保存合同；明确元素和细节仍直接进入局部副本路径。分析合同的授权修改范围为空，分析输出格式失败时仍按既有受控纠正及错误展示处理。
- [x] 元素、局部和区块候选保存统一执行记录，包含规范化页面、质量结果、目标节点及实际操作数量；结构化模型应答未收集原始文本，不伪造 `rawResponse`。当前候选记录统一随侧车持久化。
- [x] 同 Token 值但设计来源 ID、来源指纹、来源种类或 Token 版本变化时，旧候选普通、强制和保留两版采纳均被任务门禁拒绝；分析合同也不能误作可采纳画布候选。旧工程缺失来源信息时沿用原有门禁，不宣称已有设计库三模式。
- [x] 设计系统面板可从另一 `.aidesign` 工程导入项目副本；只读来源项目文件，复制 Token、组件及其引用资源，ID 命名空间化并在 DOM 中改写引用。来源资源未登记或缺失时阻断导入；导入作为单条 History 事务可撤销/重做，绑定与组件随工程保存/加载并进入 Manifest/项目知识。当前仅交付项目副本模式，不宣称只读实时引用和编辑源库已实现。

### 交付首屏预览增量（2026-10-23 已核验）
- [x] 交付图使用归档的参考设备、Token、导入页元数据、资源及手动覆盖；图片独立存储，JSON 不嵌入 base64。`test/delivery_preview.test.tsx` 验证移动视口、字体/图片、导航标题、vh 与 L4。
- [x] 图片类型/尺寸/字节受限、超时或写盘失败可见，不能伪造成功；旧记录、缺失和解码错误明确提示。专项测试覆盖 SVG/坏 PNG/错误尺寸、超时迟到、部分写入清理；损坏预览字段不隐藏有效代码档案。
- [x] 截图期间取消/变更/切工程不应用候选；档案准备失败清理孤立图，撤销不删除历史图片。专项测试覆盖三种迟到取消与准备失败。
- [x] 保留两版保留 L4 样式，新页面和覆盖在同一 History 中撤销/重做；真实浏览器预览可解码且重开保留。专项测试与 `evidence/delivery-preview-{chromium,webkit}.{json,png}` 验证。
- [x] 全量 1,329 pass / 0 fail / 10,358 assertions / 143 files，类型与构建通过；Vite 5174 与 Tauri `target/debug/app` 启动通过。

### 未采纳候选预览增量（2026-10-23 已核验）
- [x] 当前 iframe 完成才生成首屏预览，重复报告去重，失败可重试，截图不影响采纳检查或 History。 `test/candidate_preview.test.tsx` 覆盖等待、去重、证据保留和显式重试。
- [x] 图片与候选/上下文相符，元数据变化使旧渲染身份失效；恢复图片仅作历史，不能放行。 单测覆盖导航元数据与同 key 恢复；双浏览器实际恢复即刻记录 liveRenderCleared=true、delivery=pending。
- [x] 串行保存不会丢预览或新验收证据；取消/切工程/采纳/替换时迟到结果不复活侧车，不删除新图。 四种迟到结果、最新验收记录及条件删除均有回归。
- [x] 更新/删除候选清理对应安全图片，失败清理新图；交付图片和有效代码/检查档案保留。 原子侧车写失败、旧图清理、前缀相似的其它候选路径拒绝和独立交付图由测试验证。
- [x] 图片缺失、解码失败和重试反馈可见；双浏览器生成、重开恢复、实际解码验证通过。 共享图片组件与交付图片用例验证读错/解码错；`evidence/candidate-preview-{chromium,webkit}.json` 和对应两类截图记录真实解码及重开。
- [x] 全量测试、类型、生产构建和开发/桌面启动检查通过。 1,340 pass、0 fail、10,415 assertions、144 files；类型与构建通过，Vite 5174/Tauri target/debug/app 启动成功。

- [!] 2026-10-23 预览首轮专项打回：19 pass / 2 fail。新证据测试漏填 finding 的 actual/expected，被合法性校验丢弃；共享图片组件改为按所有者/路径缓存后，旧用例仅换对象引用不再触发重读。修正测试数据，并通过关闭/重新展开验证缺图重读，不改动生产门禁。

- [!] 2026-10-23 浏览器首次复测：WebKit 通过，Chromium 抓到“重捕获中保留旧图”的合法中间态；脚本仅检查 report.ready 而未检查 pending，误认作新截图。补齐当前 key、pending=false 与已保存条件，同时让相同上下文的恢复图片在新捕获完成前也显示历史标记。

- [!] 2026-10-23 浏览器复测打回 #3：两引擎在初次渲染等待超时。诊断截图显示仍在工程列表、iframe=0 且无页面异常；Vite 热更新为应用的 store 模块追加时间戳，测试脚本无时间戳动态导入创建了另一份 workspace store。脚本改为复用应用已加载的模块 URL，不修改生产状态或绕过 iframe 门禁。

- [!] 2026-10-23 全量 #2 打回：1,339 pass / 1 fail。同上下文恢复用例将渲染 revision 写死为 0，仅在单文件执行成立；全套共享 store 的 revision 会累积。改为按当前 revision 回退一轮，保证真实模拟“恢复前后 key 相同”，保留全部生产校验。

- [x] 以上打回项最终已复验通过，失败原因与修复保留为历史记录；本轮结果不宣称完整四期重构或真实用户工程原生截图验收全部完成。

### 重塑执行与批量守卫增量（2026-10-23 已核验）
- [x] 主 Pipeline 与润色使用相同的 HTML 完整性/源码安全/导航/静态质量终结，取消和传输错误不接纳残留 HTML。`test/restyle_execution.test.tsx` 对两条实际服务路径、未闭合产物、危险原文和非协作模型取消作断言；兼容原始 fragment 的既有提取回归通过。
- [x] 试跑及批量冻结队列与上下文，外部变更/切工程/取消阻止迟到应用和后续请求；自有组件同步后使用最新页面基线。执行专项覆盖三种迟到结果、过期试跑、目标错配和真实组件实例同步。
- [x] apply=false、异常、结构拒绝与取消结果如实计数；重复点击不重复执行，忙状态能收尾。执行专项验证应用失败计入 conflict、模型异常计入 failed，以及面板双击与旧试跑确认。
- [x] store 不信任 status=applied，基线/危险源码/结构变化被拒且不污染 History；局部润色候选有真实执行记录。执行专项验证拒绝前后 checkpoint/past 不变、手动保护新增后拒绝旧修改；`test/local_copy_modification.test.tsx` 验证 source、mode、目标节点及实际操作数量。
- [x] 原有工作流、完整性与结构授权回归通过，全量测试/类型/构建和启动检查通过。最终 1,354 pass / 0 fail / 10,484 assertions / 145 files；类型与生产构建成功，Vite 5174 ready、Tauri 运行 `target/debug/app`。本批未验证在线 Provider 或批量实际 iframe/资源/交付档案门禁，完整方案仍有剩余项。

### 批量渲染与资源门禁增量（2026-10-23 已核验）
- [x] 独立复核打回已修复：离屏 iframe 中仅核验副本 eager；源码保持 lazy，首屏外图片的单测先红后绿，真实本地 lazy PNG 在 Chromium/WebKit 均通过。
- [x] 组件预检与同步使用同一投影，保护 L4、保留文本/图片和文档形态；实际应用与被检查 HTML 一致且单步可撤销。`test/restyle_validation.test.tsx` 校验精确写集、L4 跳过和单条 History；既有组件同步回归通过，双浏览器验证实际模板/两个实例页面、整批撤销/重做。
- [x] 核验 iframe 有真实尺寸/CSP/Token/设备/本地资源/L4，等待实际渲染；不完整/不可用/严重错误/超时/取消不放行，销毁监听与 iframe。`test/page_render_check.test.ts` 四项验证构建、超时、取消、无布局不伪通过；双浏览器使用实际观察器验证透明按钮被拒、补图后恢复、PC/mobile 检查。
- [x] 未登记/缺失资源、晚到结果、核验中工程变更或取消不应用、不新增 History/checkpoint，也不影响已有单页候选。重塑核验专项 13 项覆盖 L4 背景未登记、渲染中图片被删、三种迟到变化、并发只应用一次；旧同步应用旁路已移除。
- [x] 批量等待异步应用，并按实际应用结果及核验原因报告；自身成功应用不误判为外部变更。`restyle_execution` 新增 Promise 被误认成功的回归，面板显示逐页实际发现；双浏览器三项目标均在门禁通过后应用，组件先检查三个页面。
- [x] 最终专项 64 pass / 211 assertions；全量 1,373 pass / 0 fail / 10,561 assertions / 147 files；类型与构建通过。Chromium 145.0.7632.6 / WebKit 26.0 JSON 与截图见 `evidence/restyle-gates-*`，Vite/Tauri 启动通过，临时进程验收后关闭。长期批量档案、真实用户工程/原生图像及完整方案剩余项仍未宣称完成。

- [!] 2026-10-23 门禁专项首次打回：56 pass / 4 fail。切工程用例错误假定 initNewProject 会清空 checkpoint；iframe 生命周期用例与 happy-dom 自动 load 竞争，同一文档重复 load 可重复绑定观察器。核对初始化与 load 次序后，保留 checkpoint 数量作断言，并为相同文档去重绑定、以显式完成回调核验清理。

- [!] 2026-10-23 门禁专项第二次打回：59 pass / 1 fail。模拟 iframe 被移除后 happy-dom 清空其 Document，测试在完成后才读 CSP 得到空值；将文档检查放在显式完成回调前，保留销毁后的监听/iframe 清理断言。最终专项 63 pass / 0 fail，全部打回已复验。

### 批量长期交付归档增量（2026-10-23 已核验）
- [x] 独立复核打回已修复：新增来源/主题/设备嵌套字段读取校验，四种损坏档案隔离回归先红后绿，坏记录不进入面板；复核确认无新增 P1/P2。
- [x] `restyle_delivery` 与 `restyle_validation` 验证可重读单事件、精确前后版本、实际 source/quality/render、执行及批次；组件有/无实例均存档，保护页面不写入事件。
- [x] 15 项归档专项覆盖准备失败、编辑/切工程/取消、归档中资源删除、源对象污染、PNG 写入后取消、原子写失败；既有候选及 History/checkpoint 不受误改，未引用 PNG 被清理。
- [x] 收尾失败返回 applied=true/prepared 回执并提示，历史保持待确认；撤销/重做不删事件；实际延迟 finish 期间人工编辑触发批量 stale，后续模型请求为 0。
- [x] 页面和批量共用 `RestyleDeliveryHistoryPanel`，按需读记录/PNG；坏预览不隐藏有效代码，跨工程迟到读取不出现旧记录。双浏览器重开后实际展开历史及图片 decode，通过 390×844 检查。
- [x] 94 项定向、1,389 项全量（148 files / 10,642 assertions）通过；类型/生产构建成功，Vite 5174 ready，Tauri target/debug/app 运行成功。Chromium 145.0.7632.6 / WebKit 26.0 实测记录、4 PNG、工程重开和面板图片 decode 通过；证据见 evidence/restyle-archive-*.{json,png}。

### 结构化局部执行收敛增量（2026-10-23 已核验）
- [!] 复核打回：既有修改快照遗漏设计来源、决策、组件及参考页等知识变化；类型检查发现两处可选 Provider binding 未初始化。补实际过期用例和守卫后重验。
- [!] 定向回归打回：原“切换焦点”用例在分析后新增页面，与新的知识过期规则冲突；改为分析前建页、分析后只切焦点，保留目标不漂移断言。失效元素错误提示恢复明确说明“引用元素”。
- [!] 二次复核打回：项目知识排除样张页，需保留目标 HTML/scopedCss 独立基线；补样张两项先红后绿回归后复验。
- [x] 服务专项及 Hook/润色集成回归验证完整副本、任务合同和实际 targetNids/operationCount；真实浏览器执行前后原页保持，进入候选后通过现有采纳管道。
- [x] 25 项专项覆盖无效/分析合同、错误目标/基线/设备/授权、缺失节点在模型前拒绝；元素子树越界、无权文本操作、区块残缺返回无 HTML，未新增整页回退。
- [x] 取消/知识来源六类变化在非协作模型返回后立即停止，下一请求不发且无部分候选；源对象污染不能改变冻结合同/操作。目标 HTML/CSS 在样张页也独立保护；位置/测量不失效。
- [x] 确定性局部无 Provider 且 0 模型请求，纯润色强制禁止文本并复查树；实际浏览器 local/element/region 请求数分别 0/1/1，错误记录无 completeHtml。
- [x] 107 项相关回归、全量 1,414 pass / 149 files / 10,712 assertions；类型/构建成功、Vite ready、Tauri target/debug/app 启动；双浏览器证据 evidence/structured-edits-*.{json,png}。

- [x] 上述快照/样张/类型及焦点用例打回均已复验：六类快照、样张独立基线、原始残缺源码都先红后绿；独立复核最终 25 pass，无新增 P1/P2。焦点测试只切焦点，新增页面按知识变动失效。Chromium 两次执行上下文销毁记入 test.md，加入诊断后连续两轮实际通过。

### 目录验收计划增量（2026-10-23 已核验）
- [x] 伪造/未知工作流、operation/strategy不匹配、计划篡改/过期在候选及批量拒绝；旧数据不携计划时仍按当前安全规则核对。
- [x] 必要阶段由当前目录解析并与源码/质量/结构/资源/实际渲染证据对应；无实现或无证据不能伪通过，底线不可因目录删阶段被削弱。
- [x] 纯润色、明确元素、已确认区块与整页结构授权保持正确，显式强制仅使用已有边界；实际被跳过的检查如实披露。
- [x] 当前验收计划及阶段证据随候选/采纳/批量事件持久化，历史不放行当前候选；坏诊断数据不崩溃。
- [x] 新增专项、相关回归、全量/类型/构建与双浏览器流程通过。

- [!] 先红后绿：未知/不匹配工作流、缺失阶段、局部范围外属性修改、目录移除结构底线、L4 资源遗漏和矛盾汇总状态均已行为复现后修复；详细次数见 test.md。
- [x] 7 套相关回归及全量 1,435 pass / 0 fail / 10,772 assertions / 150 files；类型/构建成功，Vite 5174 与 Tauri target/debug/app 启动通过。双浏览器候选三模式及批量三项目标均核验实际计划、归档/图片解码和重开，证据 evidence/workflow-plan-*.{json,png}。
- [x] 本增量仅统一候选/批量采纳与结构化入口预检；导入/新建/分析完整生命周期、设计库三模式及真实工程全入口迁移/导出仍在总清单，不据此声明完整四期方案完成。

### AI 新建页面应用门禁增量（2026-10-23 已核验）
- [x] 同步 AI 创建不写页面；异步仅在正确工作流、源码/静态/资源/完整真实渲染全部通过后提交。
- [x] 未登记/缺失文件、不可用/不完整/严重渲染错误、缺失执行阶段与篡改合同拒绝；取消/切工程/过期/重复操作无部分 History。
- [x] 自动创建和手动挂载共用入口，失败消息不伪成功；原页面和当前单页候选不被改动。
- [x] 保存有限创建快照、不保存 rawResponse/base64；历史仅作诊断、损坏记录容错、旧工程兼容，撤销/重做与重开后可读。
- [x] 专项及全量、类型/构建、Chromium/WebKit 实际渲染和 Vite/Tauri 启动通过。

- [!] 2026-10-23 新建消息集成首轮：1 pass / 1 fail。执行器已经返回具体失败，但 ChatDrawer 在有 htmlOutput 时优先展示代码卡片，遮住错误文本；需在未挂载卡片显示实际阻断原因，并让手动重试等待同一异步门禁。

- [!] 2026-10-23 全量首轮 1,460 pass / 4 fail：旧聊天创建/落点/补挂单元用例未声明渲染替身，无实际布局环境被门禁正确拒绝；对相关测试显式加入渲染替身，生产门禁保持不变。复验全量 1,464 pass / 0 fail。
- [!] 2026-10-23 创建记录存盘专项首轮 28 pass / 1 fail：测试直接传整个 Zustand store（含方法）给纯数据 Repository，structuredClone 正确拒绝；改传真实 ProjectDocument 数据字段后 29 pass / 0 fail。消息集成的错误被代码卡片遮挡及一个未定义的 busy 状态变量均已修复并复验。
- [x] 本机验证启动曾受权限限制：自动审批两次超时，沙箱监听 127.0.0.1:5174 返回 EPERM；用户随后明确允许，Vite/Tauri 与双浏览器实际核验已完成，未将审批超时描述为操作不安全。

- [!] 2026-10-23 自查新增 AI 整理文档过期回归 26 pass / 1 fail：知识指纹为避免自失效会排除 AI 文档，创建快照需独立覆盖全部实际项目文档；补入后先红后绿。最终 31 专项、1,466 全量通过，证据见 test.md 与 evidence/page-creation-*.{json,png}。

### HTML 导入应用门禁增量（2026-10-23 已核验）
- [x] 三种导入工作流身份/策略/计划/源指纹与当前结果匹配；缺少预览回执、旧预览和没有执行器的阶段阻断。
- [x] 转换预览实际加载后才可确认，用户修改设置后旧预览不授权新结果；源 CSS 保留，不误套生成白名单硬限制。
- [x] 缺图片/字体、危险或残缺转换结果、不可用/不完整/严重渲染错误均拒绝；写盘前先内存渲染，写盘后再查真实文件。
- [x] 取消/卸载/切工程/上下文变化/重复确认不写页面/配置/History；成功一条事务保留原页和现有候选，可撤销重做。
- [x] 记录、旧工程兼容及回归通过，全量/类型/构建、双浏览器真实导入和桌面启动完成并归档。

- [!] 2026-10-23 导入专项首轮 19 pass / 1 fail：测试错误假定“项目统一”保留 spacing 字面值，但该模式按既有规则统一全部类别；修正为断言 Token 映射，原貌/选择性仍断言原间距，生产转换未改。复验相关三套 64 pass / 0 fail。

- [!] 2026-10-23 预览回执 UI 专项首轮 37 pass / 1 fail：测试误假定 happy-dom 永远不触发 srcdoc load，实际已加载合法标记而正确启用确认。调整为先捕获阻止 load，再分别发布错误/正确标记的事件，验证协议本身；最终 9 项 UI 用例通过，生产回执校验保留。

- [x] 最终 102 项相关回归、1,500 全量 / 0 fail / 11,008 assertions / 154 files；类型/构建、Vite/Tauri 启动通过。Chromium/WebKit 实际三模式 UI、预览/画布样式、物理图片解码、隐形按钮/缺字体拒绝、撤销/重做、三工程重开和创建记录通过，证据见 evidence/html-import-gates-*.{json,png}。
- [!] 浏览器首轮脚本按钮误写为“画面”，实际为“页面”，修正后通过。末轮截图发现 WebKit 图片未显示，补解码等待仍未解决；检查确认测试 PNG 的 IDAT CRC 错误（IHDR/IEND 正常），换用正确 CRC 的 16×16 PNG，并增加实际 canvas 解码像素 [255,0,0,255] 断言。生产导入规则未因此改动，最终双浏览器截图中图片均可见，重开后解码完成。

### 页面修改分析生命周期（2026-10-23）
- [x] 身份/基线/设备/Token/保护范围或计划不符、不支持阶段在模型调用前阻断；目录不能删掉 analysis-schema。
- [x] 字段/数量/操作协议严格核验，最多一次格式纠正；网络错误不重试。取消/过期后不纠正、不返回可确认结果，输入修改不改变当前任务。
- [x] 仅当前且证据一致的建议可确认；未知/重复选择拒绝，明确元素请求继续跳过分析；格式/降级证据可查看并进入候选合同及档案。
- [x] 相关和全量测试、类型/构建及 Chromium/WebKit 和 Vite/Tauri 启动验证完成，证据归档。

- [!] 2026-10-23 WebKit 首轮：分析/纠正/候选就绪通过，展开检查面板并截图后渲染阶段重新 pending；脚本直接调用采纳被门禁拒绝。需定位为界面重新核验还是产品持续失效，并等待真实可采纳状态复验，不降低渲染门禁。

- [!] 2026-10-23 代码自查补导航域回归（先红）：分析合同改用原始 HTML 后，节点预算仍计算源状态栏/默认导航，和实际执行域不一致。需只用规范导航副本计算定位及预算，保留原始指纹用于确认。

- [x] 最终 32 项生命周期专项、3 项证据 UI 专项及相关聊天/润色/局部/区块/导入/创建回归通过；全量 1,537 pass / 0 fail / 11,134 assertions / 156 files，类型/构建与 diff 检查通过。
- [x] 导航域回归先红（30 pass / 2 fail，默认/自定义都错误计入状态栏，22 vs 19/21），统一用规范副本定位及计数、原始合同指纹保留后 32 pass / 0 fail；最终全量再次通过。
- [x] WebKit 首轮采纳被 pending 门禁正确拦截；最终证据 renderStates 明确显示 complete → pending → complete。脚本等待当前真实 ready 再采纳后通过，未改渲染门禁。Chromium/WebKit 实际分析卡、受控一次纠正、局部零额外调用、实际候选渲染、采纳/原页保护、来源存盘/重开、过期不纠正均通过；详见 evidence/modification-analysis-*.{json,png}。

### 设计库副本预览与导入隔离（2026-10-23）
- [x] 指纹包含影响输出的来源内容和资源字节，键序/时间戳/无关页面变化不影响；坏 Token/重复资源/不安全或缺失文件明确拒绝。
- [x] 预览前不写文件/状态，展示真实主题/组件/资源变化与冲突；不支持设备和碰撞在写文件前阻断。
- [x] 切工程、改变上下文、取消/关闭、源改变及目标文件冲突/写失败不提交；输入/计划被修改、重复确认拒绝，来源始终只读。
- [x] 成功一次 History，撤销/重做与重开保留绑定回执且无二进制/绝对路径；既有副本与旧工程正常。
- [x] 专项、全量、类型/构建、双浏览器和 Vite/Tauri 启动通过，证据归档。

- [!] 2026-10-23 导入服务专项首轮 35 pass / 1 fail：测试假定既有 setColorMode 会新增 History，但其实际是预览模式设置。需使用真实有 History 的设计系统修改验证中途变化，避免错误断言导入行为。

- [!] 2026-10-23 Chromium 首轮：设计库预览/确认/来源复核/切工程保护/撤销重做/绑定重开均通过，但重开后立即 img.decode 报 EncodingError。需核对实际资源 bytes、src 映射与异步加载完成状态再复验，不能仅以文件存在当作图片成功。

- [!] 2026-10-24 截图自查：新来源主题预览复用 compact 控件，但该参数原先仅改变 iframe 高度，窄栏标题与控制按钮挤压，“可视化”出现逐字换行且色板沿用桌面六列。需让 compact 实际约束布局并复验截图。

- [!] 2026-10-24 自查新增资源字段回归先红：错误的 asset.name 对象能进入预览，存在 React 渲染异常风险。补来源资源元数据类型预检，清单大小按 UTF-8 字节计数后复验。

- [x] 2026-10-24 最终验收：55 项设计库/资源专项通过，XHTML/PNG 与资源专项 14 项通过；全量 1,588 pass / 0 fail / 11,336 assertions / 159 files，类型/构建成功；Vite/Tauri 启动正常。
- [x] 资源漏解析先红（0 pass / 3 fail）后补所有已登记 images/icons 的内存解析，增加迟到结果后 4 pass；浏览器实际图像解码像素 [255,0,0,255]，HTML 同样独立解码。保存的工程仍使用相对路径。
- [x] 双浏览器预览“可视化”按钮行高/高度均16px，宽度约75px，未逐字换行；来源变化、选择器期间切工程、预览不写、一次确认、撤销/重做与重开通过，源写入计数0（隔离 IPC 测试来源）。
- [x] PNG 视觉打回复验：WebKit 首次780×572图仅绘390×286内容，红色32×32标记只有1024像素；修复后两引擎2x均4096像素。1x/2x/3x分辨率390×286、780×572、1170×858，标记面积1024/4096/9216、边长32/64/96，位置按倍率一致。未把单纯文件存在或图片存在当作保真验收。


### 固定版本只读设计库参考（2026-10-24）
- [x] LIB-REF-C1（2026-10-24，design_library_reference/import/ui 专项与双浏览器 updated 记录）：参考预览无写入，确认一次 History；同源显式更新保留旧资源/实例，禁止静默换来源/模式。
- [x] LIB-REF-C2（2026-10-24，Store/重塑/导入/清理专项；浏览器 blockedMutations=4，控件 disabled）：受保护 Tokens、组件定义、素材无法通过 Store/批量重塑/导入风格覆盖；普通资产可编辑、清理保留库缓存。
- [x] LIB-REF-C3（2026-10-24，异常快照/实体与真实字节专项；浏览器 offline + conversion）：异常快照/漂移阻断交付；持久化保留锁；转副本/更新撤销重做恢复正确内容和锁。
- [x] LIB-REF-C4（2026-10-24，evidence/design-library-reference-{chromium,webkit}.json 和 regression.txt）：模式选择/禁用原因/更新/转副本在 Chromium、WebKit 实测；全量测试、类型、构建和 Vite/Tauri 启动通过。

- [!] LIB-REF 首轮回归打回（2026-10-24）：54 pass / 1 fail。新增按工程切换清理预览的 effect 在 React 合并更新时误取消刚为新工程开始的选择；移除多余清理 effect，继续使用已有冻结上下文/isCurrent/卸载取消保护，复验真实设备冲突预览。

- [!] LIB-REF 专项打回（2026-10-24）：22 pass / 1 fail。新增断言误把 RestylePlan 当数组；改用实际 queue 验证队列没有受保护组件，生产过滤逻辑未改。

- [x] LIB-REF 打回复验通过：去掉多余工程 effect 后设备冲突预览正常；新增队列断言读取实际 queue。相关 5 套首轮复验 72 pass / 0 fail，额外新增缓存字节覆盖用例进入最终 1,606 项全量并通过。未放宽上下文、只读或交付门禁。


### 参考图与设计库新建工作流（2026-10-24）
- [x] FLOW-SRC-C1（2026-10-24，workflow_sources 组合/优先级测试与四种浏览器聊天路由）：参考图/设计库/组合正确分流；问题/主题/明确局部修改保留原路由，不能凭关键词或历史图片误触发。
- [x] FLOW-SRC-C2（2026-10-24，实际 messageFingerprint/imageFingerprint 对比、缺图/旧图/改请求/损坏回执测试）：参考图指纹与实际发送 image_url 回执一致，缺失/不匹配在请求或应用前阻断；无 data URL 持久化，验收不伪称视觉相似度。
- [x] FLOW-SRC-C3（2026-10-24，库来源/模式/版本/指纹及未知组件/版本测试，浏览器5次响应第5次过期拦截）：创建核对当前库身份/模式/版本；未知组件和伪造版本阻断，更新/转副本使旧合同失效，普通旧工程兼容。
- [x] FLOW-SRC-C4（2026-10-24，删目录阶段/必需上下文仍拒绝；双浏览器实际面板、保存重开与来源提示）：必要阶段不可通过删目录定义或删合同字段绕过；证据 UI 展示来源/限制，浏览器实际 iframe 与保存/重开验证通过。
- [x] FLOW-SRC-C5（2026-10-24，evidence/workflow-sources-regression.txt 和双浏览器 JSON/截图）：bun test → type-check → build，Vite/Tauri 启动、git diff --check 通过，记录实际证据与未完成范围。

- [!] FLOW-SRC 首轮类型检查打回（2026-10-24）：TS1117，给顶层 Pipeline 传绑定时批量替换误在已有 manifest 对象重复加入同名字段；移除重复字段后重新验证。

- [!] FLOW-SRC 浏览器首轮打回（2026-10-24）：普通新建实际渲染成功，但脚本重开时检查来源记录失败（无 pageerror）；保留失败截图，增加实际/预期诊断，查清持久化或历史解析问题后重验，不放宽门禁。

- [>] FLOW-SRC 浏览器重试：字段对比确认数据未丢，Playwright 跨 Python/JS 时把内存 render.reason:undefined 转为 null，而 JSON 存储正确省略 undefined。脚本先按真实 JSON 边界归一化返回的预期记录，保留所有有效内容的严格比较，生产存储/门禁不改。

- [x] FLOW-SRC 打回复验通过：TS1117 重复 manifest 属性已删除；浏览器首次记录差异仅为跨语言桥将 undefined 转为 null，脚本按 JSON 序列化边界比较后两浏览器通过，真实工程存储和门禁未放宽。


### 多页面计划与原子交付（2026-10-24）
- [x] MULTI-C1（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：多页请求进入只读计划，未确认零HTML生成/零页面写入；单页引用、问答、主题、明确修改不误判。
- [x] MULTI-C2（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：严格计划格式/数量/重名/有界文本/合法关联，最多一次纠正；取消/过期时不纠正也不执行。
- [x] MULTI-C3（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：每页实际通过统一来源/质量/资源/iframe检查，身份与计划一致，约定关联及目标可复核；计划不能经单页入口绕过。
- [x] MULTI-C4（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：全部通过才一次History加入全部页，撤销/重做/保存/重开保留计划与逐页证据；失败/取消零部分页面，原页不变。
- [x] MULTI-C5（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：双击/切工程/Token库文档变化/非协作迟到输出被阻断；进度区分验收与加入，缩减范围明确披露。
- [x] MULTI-C6（2026-10-24，multi_page/multi_page_ui专项、evidence/multi-page-{chromium,webkit}.json及multi-page-regression.txt）：实际聊天编辑/确认/取消、双浏览器iframe与历史证据通过；bun test→type-check→build、Vite/Tauri启动和diff检查归档。

- [!] MULTI 首轮类型检查打回（2026-10-24）：新增阶段缺少UI名称映射，合同批量插入误把scope对象展开进来源数组；补全映射并删除错误数组展开后复验。

- [!] MULTI 类型复查打回：KnowledgeState 的页面坐标为可选，构造只读 manifest 时补默认坐标，不改实体页面；重新检查。

- [!] MULTI UI 首轮类型打回：确认按钮 JSX 缺少事件表达式结束括号，已补齐并复验。

- [!] MULTI 核心首轮打回：36 pass / 1 fail，撤销批次时现有 History 解析器不支持根 screens 替换路径，产生 undefined 页面。修复为逐页 add/remove 与已有页面 position patch，共用同一条 History，复验撤销/重做/存盘。

- [!] MULTI 聊天专项首轮3 pass / 1 fail：测试二次发送后仍取首张已取消卡片，误找不到新确认按钮；改为定位最新卡片，不改生产流程。

- [!] MULTI 浏览器首轮打回（2026-10-24）：Chromium 真实计划编辑、缩减、逐页验收和整批加入通过，但撤销/重做后整页 JSON 比较失败（无 pageerror）。保留 multi-page-chromium-failure.png，需核对实际页面与元数据差异，不降低验收条件。

- [>] MULTI 浏览器诊断：逐字段比较仅 measuredHeight 从700变为undefined；这是画布 iframe 重新挂载后的异步测高缓存，History 原始页面尚未带该缓存。改为严格比较所有设计字段（含HTML、位置、计划、完整逐页证据），排除该运行时缓存；画布仍必须实际渲染，生产 History 和门禁不改。

- [x] MULTI 打回复验通过：per-screen History修复后撤销/重做无undefined页面；实际浏览器唯一变化为异步measuredHeight缓存，HTML、位置、完整计划和逐页证据严格比较通过。技术请求折叠、关联可见；取消/第二页失败均无部分页面或History。50项专项、1,690项全量和两浏览器均通过。


### 跨入口设计实体引用门禁（2026-10-24）
- [x] ENTITY-C1（2026-10-24，design_entity_validation/gates专项、evidence/design-entities-{chromium,webkit}.json及design-entities-regression.txt）：未知/空组件ID、非法/未来版本、坏定义、孤立版本声明、空/未知页面目标阻断；合法与未声明版本兼容且不改源。
- [x] ENTITY-C2（2026-10-24，design_entity_validation/gates专项、evidence/design-entities-{chromium,webkit}.json及design-entities-regression.txt）：仅原页同身份同旧版本实例可保持为警告；伪造nid/换组件/换版本/复制旧实例不能借旧页绕过；库更新不强制改写旧页。
- [x] ENTITY-C3（2026-10-24，design_entity_validation/gates专项、evidence/design-entities-{chromium,webkit}.json及design-entities-regression.txt）：所有创建/导入/多页/候选/强制/保留两版/批量入口共用检查；实际组件投影用新版本表核对，缺必要阶段不能绕过。
- [x] ENTITY-C4（2026-10-24，design_entity_validation/gates专项、evidence/design-entities-{chromium,webkit}.json及design-entities-regression.txt）：实际UI说明错误/兼容警告，工作流历史存盘重开可查看；两浏览器真实iframe及采纳通过，失败零History/原页不变。
- [x] ENTITY-C5（2026-10-24，design_entity_validation/gates专项、evidence/design-entities-{chromium,webkit}.json及design-entities-regression.txt）：专项、bun test→type-check→build、Vite/Tauri启动、diff检查有证据归档。

- [!] ENTITY 全量首轮打回（2026-10-24）：新增实体阶段后，结构化编辑预检尚未声明该阶段，导致原有局部编辑在模型前被拒绝；另有固定阶段数组断言需更新。先修复预检阶段支持，保留真实交付实体核验，再重跑受影响套件和全量。

- [!] ENTITY 受影响6套复验120 pass / 1 fail：旧局部测试页面引用shared组件却未注册，现被门禁正确拒绝。测试补真实组件定义，继续验证局部编辑保留组件标识及采纳；生产检查保持阻断未知组件。

- [!] ENTITY Chromium首轮：实际创建/三种导入/重塑拒绝未知引用，候选实体报错可见；脚本用唯一按钮定位遇到聊天与画布两个同名采纳按钮（两者均disabled），改为逐个核对所有同名入口，不改生产门禁。

- [!] ENTITY 双浏览器定位复查：当前摘要与折叠工作流报告各含同一条旧实例警告，脚本唯一文本定位冲突；改定位当前摘要首项，工作流完整记录仍保留，继续实际采纳/持久化验证。

- [!] ENTITY 浏览器展开复查：替换候选时证据details沿用已展开状态，脚本无条件点击反而关闭，警告变为hidden。改为读取真实open属性后再展开；继续验证可见警告与实际当前ready采纳。

- [x] ENTITY 打回复验通过：结构化预检声明新阶段，实际检查继续在交付门禁重算；旧测试补真实组件，阶段数组包含新必需项。最终42项专项、1,732项全量及双浏览器通过。定位重复控件/警告、已有details展开状态的脚本问题均修正，未放宽实体或渲染门禁。


### AI新建页面一次受控渲染修复（2026-10-24）
- [x] REPAIR-C1（2026-10-24，page_creation_repair/chat专项、evidence/page-repair-{chromium,webkit}.json及page-repair-regression.txt）：只对真实完整render中的允许错误/唯一控件nid触发；坏源码/实体/资源/合同/不可测量/警告/导入/无模型上下文零额外调用。
- [x] REPAIR-C2（2026-10-24，page_creation_repair/chat专项、evidence/page-repair-{chromium,webkit}.json及page-repair-regression.txt）：一次模型请求、无续写/格式纠正/网络重试；只改明确控件的允许尺寸/字体样式，文本/结构/SVG/链接/其他节点不变，隐藏/颜色/越界/非法/空/无变化/过量操作拒绝。
- [x] REPAIR-C3（2026-10-24，page_creation_repair/chat专项、evidence/page-repair-{chromium,webkit}.json及page-repair-regression.txt）：取消/切工程/Token/知识改变/非协作迟到不落地；修复后所有门禁和新iframe重跑，失败零History/原页不变，多页整批语义保持。
- [x] REPAIR-C4（2026-10-24，page_creation_repair/chat专项、evidence/page-repair-{chromium,webkit}.json及page-repair-regression.txt）：聊天/多页进度和最终修复结果可见，成功代码预览/会话为实际验收HTML，用量包含修复；证据可保存/重开/撤销重做，损坏记录容错且无凭证/图片正文。
- [x] REPAIR-C5（2026-10-24，page_creation_repair/chat专项、evidence/page-repair-{chromium,webkit}.json及page-repair-regression.txt）：专项与双浏览器真实iframe/实际聊天验证，bun test→type-check→build、Vite/Tauri启动与diff检查归档；明确当前覆盖和剩余范围。

- [!] REPAIR 首轮专项19 pass / 14 fail：13项重放测试的渲染桩按调用序号无条件在第二次返回通过，误把未修复HTML当可用；另1项直接比较原始SVG与既有NID注入后的规范DOM。改用实际待验HTML状态决定桩结果，基于首次真实检查的规范副本验证所有未授权节点保持，生产门禁不改。

- [!] REPAIR 第二轮31 pass / 2 fail：空style被既有规范化移除，测试需接受null；无变化操作发现既有局部引擎按style属性字符串判断，CSS格式化也算changed。修复服务新增每个授权控件前后CSSOM实际样式比较，全部相同时拒绝，不触发复验或第三次模型请求。

- [!] REPAIR Chromium首轮：真实修复/重新iframe和468用量已通过，但最终修复说明被聊天既有“AI思考与反馈过程”折叠隐藏，无法直接看到。补独立的创建修复状态提示，再验证实际可见提示、记录与会话重开；不以内部消息字段当UI验收。

- [x] REPAIR 打回复验通过：首次实际规范DOM作为对比基线；渲染桩按HTML状态返回，非调用序号；CSSOM实值不变操作拒绝。独立聊天成功提示实际可见，重开恢复历史提示和最终HTML；41项专项、1,773全量及两浏览器通过。


### 旧页候选受控样式修复（2026-10-24）
- [x] CAND-REPAIR-C1（2026-10-24，79项专项及evidence/candidate-repair-{chromium,webkit}.json）：有效合同且仅render允许错误可修；授权根/局部目标交集/L4/保护祖先/坏资源实体/过期/无合同等在模型前阻断。
- [x] CAND-REPAIR-C2（2026-10-24，79项专项及evidence/candidate-repair-{chromium,webkit}.json）：与新页共用一次样式协议，40余项新页回归不退化；候选全门禁及真实L4下新iframe复验，无新增问题才替换候选，原页/History不变。
- [x] CAND-REPAIR-C3（2026-10-24，79项专项及evidence/candidate-repair-{chromium,webkit}.json）：双击/取消/丢弃/切工程/基线Token知识或候选变化不发布迟到结果；忙时全部采纳拒绝，失败保留原候选且不能再请求。
- [x] CAND-REPAIR-C4（2026-10-24，79项专项及evidence/candidate-repair-{chromium,webkit}.json）：成功/失败侧车及采纳档案保留尝试/实际证据，用量和限制可见；重开重新核验，损坏记录不解锁，无凭证持久化。
- [x] CAND-REPAIR-C5（2026-10-24，双浏览器JSON/截图、candidate-repair-regression.txt；原生仅启动验证，限制见test.md）：显式按钮与取消/实际iframe/采纳/重开双浏览器通过；bun test→type-check→build、Vite/Tauri启动、diff检查归档，说明剩余范围。

- [!] CAND-REPAIR 首轮打回：共用提取脚本误改 contextFingerprint 属性导致语法错误，随后类型检查发现提案联合类型未收窄；修正后41项新页回归通过。候选首轮31 pass / 3 fail为测试夹具：预览状态使用不存在的unavailable、资源测试擅自新增节点被结构门禁正确拒绝、直接写侧车被并发真实保存覆盖。改用failed预览、基线也含资源、先同步候选再验证侧车；生产门禁未放宽。复验75 pass / 0 fail。

- [!] CAND-REPAIR Chromium首轮：真实按钮恢复、独立iframe与当前8/8门禁、一次用量已通过；脚本采纳按钮用了中文括号，实际UI为ASCII括号导致定位超时。仅修正脚本文本，继续采纳/重开与失败取消验证。

- [x] CAND-REPAIR 打回复验：抽取后79项专项通过，原41项新页无回归；新增授权交集、L4实际传入、模型/渲染期间删文件、重开损坏记录等断言。双浏览器候选按钮/失败/取消/越界/保护/采纳/重开均通过，新页两浏览器亦复查通过；全量1,811 pass。原生启动成功，CUA命中已安装版本的观察不作为本轮原生UI证据。

### 显式组件模板与插槽合同（2026-10-24）
- [x] SLOT-C1（2026-10-25，165项专项和evidence/component-template-{chromium,webkit}.json）：严格定义单根/安全，槽名/选择器/数量/类型/唯一/重叠校验；固定结构/属性/文本变化阻断，允许内容槽变化；无副作用。
- [x] SLOT-C2（2026-10-25，165项专项和evidence/component-template-{chromium,webkit}.json）：所有现有实体门禁核对真实严格模板；新无版本严格实例拒绝，已有旧/无版本兼容有警告；强制/保留两版不能绕过。
- [x] SLOT-C3（2026-10-25，165项专项和evidence/component-template-{chromium,webkit}.json）：按槽名同步不串文案/图片/节点、缺槽/冲突不丢内容；合同变更版本+History/撤销/重开，来源读写隔离及指纹保护。
- [x] SLOT-C4（2026-10-25，双浏览器报告/截图及component-template-regression.txt；原生仅启动，限制详见test.md）：显式UI保存/取消/错误、只读禁用与过期表单保护；上下文完整合同/无臆造；双浏览器真实iframe/门禁/采纳及回归归档。

- [!] SLOT 首轮专项32 pass / 3 fail：空模板先被既有定义检查拒绝，断言错误码需保留先后顺序；根button夹具未携带组件标识导致未执行合同检查；存盘夹具调用不存在的serialize。修正为DOM附组件身份、真实ProjectRepository数据模型及具体错误码后重新验收；生产门禁未放宽。

- [!] SLOT 多页夹具41 pass / 1 fail（2026-10-25）：测试请求“创建两个资料页面”未被现有高置信多页路由识别，尚未进入所测交付门禁。将夹具改为明确已支持的“创建两个页面”，继续验证第二页模板失败整批不写入；此次不扩展意图分类范围。

- [!] SLOT Chromium首轮（2026-10-25）：实际启用/版本History/按名重排同步/过期表单/只读禁用均通过；脚本关闭资源中心时定位在标题内层，未包含关闭按钮而超时。按真实DOM上移至header后重跑，不改产品代码或放宽门禁。

- [x] SLOT 打回复验通过（2026-10-25）：修正根button夹具实际绑定、空定义优先错误码及真实存盘模型；多页交付夹具使用现有明确多页请求。资源中心关闭按钮脚本定位改到真实header。最终165项相关专项、1,858全量及双浏览器通过；异步来源拒绝断言显式await后完整顺序回归再次通过。未放宽固定区、版本、源码或渲染门禁。

### 设计库源工程编辑（2026-10-25）
- [x] SOURCE-C1（2026-10-25，25项新增专项、evidence/library-source-{chromium,webkit}.json及library-source-regression.txt；原生仅启动，详见test.md）：来源只读预览匹配ID/设备/有效库；坏源/缺页文档/自己/错源拒绝，预览取消零来源写入，修改源内容使确认失效。
- [x] SOURCE-C2（2026-10-25，25项新增专项、evidence/library-source-{chromium,webkit}.json及library-source-regression.txt；原生仅启动，详见test.md）：进入/返回均等待工程+History+候选保存，失败不切工作区；过期/取消/双击/常规切换均不得迟到切换，History工程隔离且返回恢复。
- [x] SOURCE-C3（2026-10-25，25项新增专项、evidence/library-source-{chromium,webkit}.json及library-source-regression.txt；原生仅启动，详见test.md）：源工程真实修改和存盘，当前项目缓存与页面保持；源自身只读不绕过，返回后仅显式导入确认更新，不自动同步实例。
- [x] SOURCE-C4（2026-10-25，25项新增专项、evidence/library-source-{chromium,webkit}.json及library-source-regression.txt；原生仅启动，详见test.md）：显式预览确认和横幅/返回/错误可见，运行态路径不入工程/绑定/AI记录，刷新及常规导航清除编辑上下文；双浏览器真实Store/iframe/本地接口、全量/类型/构建及启动归档。

- [!] SOURCE 首轮21 pass / 1 fail：预先取消的确认在guard处返回、未消费一次性预览，使同一预览可去掉signal再尝试。将预览领取移到取消guard前，并在存在的预览首次确认时立即消费，取消/失败均需重新选择。复验后再进入后续验收。

- [!] SOURCE Chromium首轮：来源已只读核对并显示预览、无页面异常；脚本以region定位实际div预览而超时。改为按真实aria-label定位；同时以主题编辑器现有“完成”按钮关闭，继续真实进入/编辑/返回流程，不改产品门禁。

- [!] SOURCE Chromium第二轮：已真实进入源库、修改主色/组件并保存；消费页不联动断言使用了插入组件前的旧Zustand快照，导致误报。夹具改读插入后最新Store，继续验证返回与显式更新，不改源编辑流程。

- [x] SOURCE 打回复验完成：一次确认预览在取消/失败后不可再用；浏览器按真实aria-label与最新Store验证。源库编辑/History/返回/显式更新/重开两引擎通过，普通本地打开清除旧源文件夹，后续保存来源project.json不变。1,883全量、类型/构建与diff检查通过。

### 真实工程回放与迁移完整性（2026-10-25）
- [x] REPLAY-C1（2026-10-25，migration_integrity专项、scripts/tests/test_project_replay.py、evidence/project-replay/{chromium,webkit,negative-drift}/report.json及project-replay-regression.txt；边界见test.md）：丢CSS/覆盖层/Token/组件/绑定/页面元数据/文档/资源字节或读回异常均迁移失败，原备份不变；旧字段缺省兼容。
- [x] REPLAY-C2（2026-10-25，migration_integrity专项、scripts/tests/test_project_replay.py、evidence/project-replay/{chromium,webkit,negative-drift}/report.json及project-replay-regression.txt；边界见test.md）：已注册资源真实复制并核对，非法/缺失/空资源拒绝；History失败不更新迁移注册表。
- [x] REPLAY-C3（2026-10-25，migration_integrity专项、scripts/tests/test_project_replay.py、evidence/project-replay/{chromium,webkit,negative-drift}/report.json及project-replay-regression.txt；边界见test.md）：真实工程只读采集前后源文件哈希不变，多参考设备下实际仓储迁移/重开与HTML/PNG导出，报告可追踪且没有AI/原生文件夹假验收。
- [x] REPLAY-C4（2026-10-25，migration_integrity专项、scripts/tests/test_project_replay.py、evidence/project-replay/{chromium,webkit,negative-drift}/report.json及project-replay-regression.txt；边界见test.md）：按浏览器/版本/系统/页面/设备/源指纹隔离基准；初建单独标识，普通比较及故意差异失败验证，资源与环境异常不误报；最终全量/类型/构建及文档归档。

- [!] REPLAY 首轮专项32 pass / 1 fail：History失败夹具mock了未被Workspace引用的模块导出，真实分支未进入；改用真实本地History归档触发失败，不改生产门禁。

- [!] REPLAY Chromium首轮：真实13页读取/迁移/重开已通过，回放脚本Python字符串将JS换行转成非法字面换行；改为raw脚本字符串，再运行，不改页面内容或生产门禁。

- [!] REPLAY 第二轮：真实迁移及PNG导出已执行，Playwright Context.new_page不接受viewport参数；改为独立page.set_viewport_size，再验证截图。

- [!] REPLAY Python专项3 pass / 1 fail：macOS临时目录/var为/private/var符号链接，安全解析返回规范绝对路径；测试预期改root.resolve()，路径边界逻辑保持。

- [x] REPLAY 打回复验通过：真实History失败不发布迁移；Python/API/路径夹具修正后双浏览器正式回放54项比较0变化，故意差异失败，4项Python/35项相关Bun及1,902全量通过；未改来源HTML或放宽门禁。

### 工程附属档案完整迁移（2026-10-25）
- [x] BUNDLE-C1（2026-10-25，project_bundle_migration专项、evidence/project-bundle/{chromium,webkit}/report.json及project-bundle-regression.txt；原生仅启动，见test.md）：候选/单页/已删页/重塑档案、会话索引月片/附件、预览及History原文/字节完整复制且可由现有读取器重开。
- [x] BUNDLE-C2（2026-10-25，project_bundle_migration专项、evidence/project-bundle/{chromium,webkit}/report.json及project-bundle-regression.txt；原生仅启动，见test.md）：坏JSON/坏行原样保留并诊断；缺/空/越界资源、未知路径、超预算、目标冲突、读写/读回异常拒绝，原数据不变。
- [x] BUNDLE-C3（2026-10-25，project_bundle_migration专项、evidence/project-bundle/{chromium,webkit}/report.json及project-bundle-regression.txt；原生仅启动，见test.md）：进入前等待当前保存，双击/选择期间切换/源变更/新增文件/复制期间切换不会发布注册表；成功只改变该工程位置，候选重开仍重新校验。
- [x] BUNDLE-C4（2026-10-25，project_bundle_migration专项、evidence/project-bundle/{chromium,webkit}/report.json及project-bundle-regression.txt；原生仅启动，见test.md）：真实Store和文件接口的双浏览器迁移、重开/预览/档案/会话与失败验证，最终全量/类型/构建和证据归档，清楚限定原生验证范围。

- [!] BUNDLE 首轮类型检查：候选修复运行态实际为repairing/verifying，误用了running；按现有类型修正忙态守卫后复验。

- [!] BUNDLE Chromium首轮：档案/5张图片/两月会话/History均已恢复，脚本误要求候选pending。实际既有knowledgeFingerprint包含folderPath，迁移重开正确判过期blocked；保留门禁，补迁移提示与三种采纳禁用验证，不改历史指纹或伪造可采纳。

- [!] BUNDLE 浏览器强制采纳验证脚本引用了不存在的canForceAdoptStagedChange；改为实际forceAdoptStagedChange动作返回false，继续验证不变更原页。

- [!] BUNDLE 最终补查66 pass / 1 fail：Storage实例为代理，直接spy实例setItem未拦截实际写入；改在真实Storage原型拦截注册表写，再验证吞错读回阻断。生产读回检查不变。

- [!] BUNDLE Storage原型重试仍66 pass / 1 fail：HappyDOM缓存已绑定方法，原型spy未影响实际实例。改在既有upsertMeta接口模拟“吞错返回但没有写入”的真实效果，直接验证读回拒绝；不改生产实现。

- [x] BUNDLE 最终复验：32项新增/67项相关专项、1,934项全量；两浏览器每种13个附属文件一致、5张图片解码、两月会话及坏行保留，目标冲突/写盘失败均不发布位置。位置读回失败保持旧路由；迁移重开的旧候选即使真实渲染通过仍过期，三种采纳保持阻断。

### 交付档案视觉基准关联（2026-10-25）
- [x] VISUAL-C1（2026-10-25，visual_evidence专项、evidence/visual-evidence/{chromium,webkit}/report.json及visual-evidence-regression.txt；原生仅启动，详见test.md）：实际已应用单页/重塑事件按页导出任务；代码/资源/Token/设备/L4真实绑定，错ID/缺文件/过期/未应用拒绝。
- [x] VISUAL-C2（2026-10-25，visual_evidence专项、evidence/visual-evidence/{chromium,webkit}/report.json及visual-evidence-regression.txt；原生仅启动，详见test.md）：CLI禁脚本/网络，初建/比较通过/失败区分，环境或基准异常不误报；故意差异拒绝验证。
- [x] VISUAL-C3（2026-10-25，visual_evidence专项、evidence/visual-evidence/{chromium,webkit}/report.json及visual-evidence-regression.txt；原生仅启动，详见test.md）：导入重算PNG哈希/尺寸/解码/像素，伪status/指标/错任务/坏图/超限拒绝；重复/取消/切项目/事件/文件改变不迟到写入或覆盖。
- [x] VISUAL-C4（2026-10-25，visual_evidence专项、evidence/visual-evidence/{chromium,webkit}/report.json及visual-evidence-regression.txt；原生仅启动，详见test.md）：历史报告与图独立保存/重开/迁移，缺失损坏提示；两类UI与双浏览器真实闭环通过，不改变History/原页或当前采纳状态。
- [x] VISUAL-C5（2026-10-25，visual_evidence专项、evidence/visual-evidence/{chromium,webkit}/report.json及visual-evidence-regression.txt；原生仅启动，详见test.md）：专项及最终全量/类型/构建、启动与证据归档，披露外部环境声明和当前覆盖边界。

- [!] VISUAL 首轮专项19 pass / 1 fail：UI测试在同个act里等定时器，读取effect尚未触发便断言；改为先提交toggle，再等待实际加载结果，不降低报告/像素门禁。

- [!] VISUAL Chromium首轮：单页真实任务导出、初始化/通过/失败导入与本机复核已通过，重塑summary包含日期子元素，exact文本定位超时；修正实际summary定位后继续，不改应用门禁。

- [x] VISUAL 最终复验：27项新增、83项相关及1,961全量通过；双浏览器实际离线CLI截图与应用Canvas重算，单页三类报告/重塑一份报告、错任务/环境/联网/旧输出防护均通过。历史通过不解锁坏候选，外部环境仅声明，PNG和JSON独立归档；UI与原生验证边界详见test.md。


### 真实 PC 工程验收（2026-10-25）
- [x] PC-C1（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：真实源工程前后 SHA256 一致，1 页实际迁移/重开保留配置、HTML、CSS 与覆盖层。
- [x] PC-C2（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：三 PC 设备 × 两引擎，画布/HTML/PNG 尺寸和内容检查；基准初始化与正式对比区分，18 项比较通过。
- [x] PC-C3（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：人工复核截图，明确源页质量问题、浏览器文件桥接及原生验证边界，文档与复跑步骤归档。


### 最终入口矩阵复验（2026-10-25）
- [x] MATRIX-C1（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：34 项当次运行退出 0 且独立报告通过；各项失败日志保留，不以新基准或历史报告掩盖失败。
- [x] MATRIX-C2（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：原四期要求逐条映射到代码、测试及实际证据，静态范围与原生/模型夹具边界清楚；最终全量测试、类型检查和构建按序通过。

- [!] MATRIX-C1 首轮31/34：失败日志及截图见evidence/final-matrix-first-attempt；开发日志证据HTML写入触发page reload。复验需实际检查证据写入不再重载，WebKit图片就绪/DOM重新挂载正确等待，不放宽采纳或像素门禁。

- [!] MATRIX 第二轮33/34：开发证据目录隔离及DOM等待修正后，其余33项通过；WebKit导入图片仍无法加载，不能按单纯等待问题结案，继续检查真实资源/CSP链路。失败档案保留evidence/final-matrix-second-attempt。

- [!] WK-RESOURCE-C1：WebKit实际srcdoc含data:image但contentDocument仍为旧路径，30秒仍破图，资源字节完好；必须修复画框挂载，不可放宽图片解码断言。
- [x] WK-RESOURCE-C2（2026-10-25，通过；证据见test.md本轮记录与acceptance-matrix.md）：延迟资源解析不挂载未解析iframe；就绪后真实解析文档、点选/高度监听有效；错误显示明确占位；Token/L4不替换iframe；三种导入策略撤销重做及重开在两引擎图片均解码且像素正确。

- [!] MATRIX 第三轮33/34：WebKit导入修复已通过；Chromium候选夹具在outside重建分支再次上下文销毁。独立导航诊断只有子iframe导航、无主页面重载，因此不能将其归因于Vite。预加载夹具依赖后同步切换，需连续十次及全矩阵复验。HMR消息隔离已独立验证，但不作为该异常根因证据。第三轮日志保留evidence/final-matrix-third-attempt。

- [x] WK-RESOURCE-C1打回复验：真实WebKit三导入模式图片解码/像素/重开、两项新增单测及34项矩阵通过；源码/L4不因渲染适配写回；先前失败保留。
- [x] MATRIX最终复验：34/34通过，三轮失败保留，无自动吞错重试；候选预加载依赖后另连续10次通过；最终1,963全量、类型和构建按序通过。


### 原生桌面文件链路（2026-10-25）
- [x] NATIVE-C1（2026-10-25，[实际桌面报告](./evidence/native-desktop/report.md)与report.json）：PC和移动源工程前后输入哈希相同；副本使用独立ID、所有写入限定临时副本/导出目录。
- [x] NATIVE-C2（2026-10-25，[实际桌面报告](./evidence/native-desktop/report.md)与report.json）：当前Tauri调试实例中实际系统对话框打开副本，History修改/撤销/重做，Rust保存文件和重开内容一致。
- [x] NATIVE-C3（2026-10-25，[实际桌面报告](./evidence/native-desktop/report.md)与report.json）：HTML/PNG经实际保存对话框落盘；检查可见文字、导航规则、图片尺寸与非白图，记录所用实际导出引擎，失败不冒称原生通过。

- [x] NATIVE-C4（2026-10-25，[实际桌面报告](./evidence/native-desktop/report.md)与report.json）：充值HTML源哈希不变；原输入缺名称时拒绝，另一个只补aria-label的临时副本原貌导入仅新增页面；4组CSS嵌入HTML（无侧车/外部资源），重启可读，实际原生PNG通过。

- [!] NATIVE-C4原始输入拒绝：充值HTML的agree-check按钮仅图标且缺aria-label，真实门禁拒绝且页面仍13个；保存native-desktop/html-import-rejected证据。只在另一临时副本通过HTMLParser精准补一项aria-label后复验成功路径，原文件与初始副本不变，不放宽门禁。

- [x] NATIVE结案：源输入PC2项/移动16项/充值HTML均不变；临时项目列表项已移除（未删文件），测试应用及5174服务退出。原生保留模式的类名/色值警告与2px渲染警告保留，未降低门禁。

### 导入样式诊断（2026-10-25）
- [x] DIAG-C1（2026-10-25，[报告](./evidence/import-diagnostics/report.json)）：未知类仍报告，不能用style/导入元数据绕过白名单；文案不再断言自带CSS无效。
- [x] DIAG-C2（2026-10-25，[报告](./evidence/import-diagnostics/report.json)）：保留/选择性模式字面值解释正确，统一模式和普通生成保持Token约束，code/nid/计数不变。
- [x] DIAG-C3（2026-10-25，[报告](./evidence/import-diagnostics/report.json)）：真实Store创建证据采用相同上下文；无名按钮与安全门禁仍拒绝；UI说明Token分数非视觉评分且扫描设备正确。
- [x] DIAG-C4（2026-10-25，[报告](./evidence/import-diagnostics/report.json)）：专项、bun test、type-check、build通过，文档与日志归档。

- [!] DIAG首轮专项40通过/2失败：新夹具用普通纯图标按钮，却期望离线主操作检查拒绝；普通控件名称在真实渲染阶段检查，而本测试已替换渲染器。修正为明确主操作按钮以覆盖离线拒绝，浏览器另测普通无名按钮，不改变应用门禁。

- [x] DIAG打回复验：普通无名控件由真实Chromium/WebKit渲染门禁拒绝；离线夹具改成明确主操作，40/2首轮失败未通过改门禁掩盖；42专项和1,973全量最终通过。

### 旧移动页顶部与装饰几何（2026-10-25）
- [x] CHROME-GEO-C1（2026-10-25，[报告](./evidence/mobile-chrome-geometry/report.md)）：两个真实旧页默认仅一套微信顶部，隐藏CSS单选状态和所有业务保留；自定义保留作者导航，PC不清理；非首部、业务时钟/导航反例不误删。
- [x] CHROME-GEO-C2（2026-10-25，[报告](./evidence/mobile-chrome-geometry/report.md)）：充值装饰节点的裁切后几何不误报，截图像素不变；可见越界/文本裁切/固定定位/逃逸绝对定位反例仍报告。
- [x] CHROME-GEO-C3（2026-10-25，[报告](./evidence/mobile-chrome-geometry/report.md)）：画布共享文档与HTML/PNG导出规则一致，旧页读取/测量不改源HTML；真实输入前后哈希一致。
- [x] CHROME-GEO-C4（2026-10-25，[报告](./evidence/mobile-chrome-geometry/report.md)）：专项、双浏览器、全量测试、类型检查、构建及启动通过，留存失败/修复前后证据。

### 结构化输出结束门禁（2026-10-25）
- [x] OBJECT-END-C1（2026-10-25，[报告](./evidence/structured-output-end/report.md)）：完整可解析JSON在length/max_tokens/过滤/未知异常结束时仍拒绝；正常stop/end_turn/stop_sequence等兼容，无静默续写。
- [x] OBJECT-END-C2（2026-10-25，[报告](./evidence/structured-output-end/report.md)）：四种协议真实结束原因不被传输层stop覆盖；连接恢复/网络失败不能生成可应用JSON，等待元数据时取消不会挂起或迟到返回。
- [x] OBJECT-END-C3（2026-10-25，[报告](./evidence/structured-output-end/report.md)）：真实结构化编辑/受控修复停止、不产生部分候选和History写入；错误可理解，正常局部路径保持。
- [x] OBJECT-END-C4（2026-10-25，[报告](./evidence/structured-output-end/report.md)）：专项、双浏览器、全量、类型、构建及启动通过，区分夹具/真实在线Provider边界。

- [!] OBJECT-END首轮104通过/5失败：新增修复夹具首次调用遗漏传入已冻结task，第二次用了另一个taskId，错误地期望跨任务只计一次；首请求均已正确拒绝。修正夹具复用同一合同，不修改一次尝试门禁；first-attempt.log保留。

- [!] OBJECT-END双浏览器首轮：请求已拒绝且History/HTML未变，但夹具将画布自动补写measuredHeight=800当业务变化。诊断确认只有该字段新增；仅从快照比较排除此运行态高度，其余页面字段、候选、请求数及History仍严格核对，原失败/诊断日志保留。

### 同页多方案比较（2026-10-25）
- [x] VARIANT-C1 明确同页2～4方案先确认，元素细改/问题/主题/多业务页不误路由，超限及直接单页降级被拒绝。
- [x] VARIANT-C2 卡片可改名称/差异、至少2个无交叉业务链接；全部真实门禁通过一次History并排新增，原页/Token不变；Undo/Redo/重开保留来源记录。
- [x] VARIANT-C3 第二方案失败、取消/迟到、上下文过期/重复确认不写部分页面，不同方案不得强制沿用前一方案布局；旧多页流程兼容。
- [x] VARIANT-C4 专项/全量、类型、构建、双引擎与入口矩阵实际报告、桌面启动归档，不将本地夹具当作在线模型验证。

VARIANT 首轮打回（2026-10-25）：100项中2项测试断言不正确：将原有“生成主题方案”的普通新建路由假定为改主题；对嵌入JSON的来源HTML重复序列化后少算一次转义。未发现生产代码改变该既有行为；调整为真实纯主题口令及直接核对规划消息中的来源JSON，保留首轮日志，再回归。

VARIANT-C1～C4通过证据：[106专项及原始失败记录](./evidence/page-variants/targeted.log)、[当前36项入口矩阵](./evidence/page-variants/matrix/report.json)、[2,058项全量及类型/构建/启动汇总](./evidence/page-variants/report.md)。两引擎原页/Token/History/重开及真实iframe逐项检查，模型响应为本地夹具，语义差异仍由用户审阅。

### 原生UTF-8分片完整性（2026-10-25）
- [x] UTF8-C1 修复前实际本地HTTP+Tauri IPC可复现跨字节中文/表情损坏；记录实际输入字节与结果，不以JS模拟替代Rust。
- [x] UTF8-C2 增量解码在任意有效分片组合与空片下还原精确文本；非法UTF-8及未闭合尾部行为明确；网络失败保留原错误，不伪造成功结束。
- [x] UTF8-C3 四协议正常文本/JSON中文不损坏，闭合JSON仍受截断/过滤门禁；实际请求走Rust，未调用线上Provider。
- [x] UTF8-C4 Rust专项、bun test、类型、构建、双引擎矩阵及实际桌面运行证据归档；进程清理、源工程不变。

UTF8-C1～C4证据：[修复前](./evidence/native-utf8/before-report.json)、[12份字节相同对照](./evidence/native-utf8/wire-comparison.json)、[最终原生12项](./evidence/native-utf8/recheck/after-report.json)、[真实错误2项](./evidence/native-utf8/recheck/errors-report.json)、[22Rust/2,058前端/36浏览器汇总](./evidence/native-utf8/report.md)。未打开或写入用户工程，验收页不加载App；无原生截图，凭真实IPC/HTTP/原生二进制证据验证，本机夹具不等于在线模型。

### 提交前资源读取闭环（2026-10-25）
- [x] RESOURCE-LAST-C1 修复前复现图片在档案prepare后消失仍采纳；修复后三种采纳均保留原页/候选/History、档案aborted且显示错误。
- [x] RESOURCE-LAST-C2 HTML/scopedCss/L4实际读取统一解析，字体与图像路径进入证据；新建/导入、多页批次、重塑档案写后都复核，缺失/读取失败不提交。
- [x] RESOURCE-LAST-C3 资源恢复后可重新检查/采纳，取消/上下文变化不迟到提交；旧记录、无资源页面、既有只读设计库规则兼容。
- [x] RESOURCE-LAST-C4 实际iframe双引擎故障/恢复、全入口矩阵、bun test/类型/构建及原生启动有实证，不将读取成功解释为视觉解码或模型语义通过。

RESOURCE-LAST 首次复现（2026-10-25）：既有交付档案套件9项通过，新增普通/强制/保留两版3项均失败，实际返回true而预期false；图片在真实archive prepare写入后删除，证明首次文件检查过期仍可采纳。原始日志为evidence/resource-final/before.log。按本项打回修复，不作为测试夹具错误处理。

RESOURCE-LAST 首次矩阵37/38（2026-10-25）：新资源验收的WebKit用例未等画布候选本身完成渲染，用独立iframe结果写回后又被画布pending覆盖，采纳入口正确提前拒绝；脚本却期待已进入档案故障阶段。保留matrix-first-attempt与原始日志，修改夹具为等待实际候选交付ready及预览完成，不手动替换渲染报告，增加故障阶段诊断后复验。生产门禁保持严格。

RESOURCE-LAST-C1～C4通过：[原始3条生产失败](./evidence/resource-final/before.log)、[187专项](./evidence/resource-final/targeted.log)、[最终38项矩阵](./evidence/resource-final/matrix/report.json)、[全量/类型/构建/原生启动汇总](./evidence/resource-final/report.md)。字体-only后台未完成证据/无实例组件已补，6故障恢复×2浏览器真实验收，无模型或文件选择器调用；首次WebKit就绪夹具失败与先前通过版本均保留。


### 复杂 PC 静态流程验收（2026-10-25）
- [x] 明示合成 PC 输入含侧栏、表格、表单、长文案和主按钮；在 Chromium/WebKit 通过真实创建/局部候选/采纳/润色/原貌导入，原页在采纳前保持不变，撤销重做可复核。
- [x] 三种参考设备保持 pc/1440 不变，真实画布文档与独立 HTML/PNG 导出尺寸、文本及局部修改保留；保存重开保持交付记录，不以夹具代替复杂真实工程证据。
- [x] 当前状态与证据映射一致，历史不足说明标明所属时间；全量测试/类型/构建/入口矩阵通过且收尾。

- [!] PC 验收脚本首轮打回：创建、局部采纳和润色已执行，导出复查误用 BrowserContext.new_page(viewport=...) 参数而停止；改用 new_page 后 set_viewport_size。业务门禁未修改，首次报告保留 evidence/pc-workflow/first。

- [!] PC 验收脚本第二轮打回：错误地给PC表格小按钮增加28px断言，现有btn-sm实测27px且现有门禁通过；专项改为明确24px以上及完整标签/边界检查，不修改产品基座或放宽生产门禁。原始几何和失败日志保留。

- [!] PC 验收脚本第三轮打回：导入与原页同名，测试按iframe标题选择命中两页；改用稳定data-inspector-screen页面ID定位，并补导入前后同引擎实际像素一致检查。业务代码不变。

- [!] 补充PNG交叉检查首轮使用新设的2/255容差，WebKit边缘像素变化0.879%～0.962%，布局/标签一致，最大通道差34/255、平均差<0.064/255。与项目既有compare-visual.py默认12/255不同；保留strict-first-*结果，按已有12/255重新核对，未修改PNG实现或任何采纳门禁。

- [x] 本节全部脚本/PNG初轮打回已复验，证据见 evidence/pc-workflow/report.md；合成PC与外部真实工程明确区分。40/40矩阵、2,078测试/类型/构建、Vite/Tauri启动通过。


### 当前绑定在线模型验收（2026-10-25）
- [x] 实际isTauri、AIService/Rust传输，浏览器直连AI为0；当前模型与用户选择一致，原Provider配置保持。
- [x] 创建/元素/分析/2业务页/2方案实际应答和静态门禁留证；保留被拒原因，不标假成功；未使用用户工程或修改注册表。
- [x] 有界请求/超时/脱敏生效；脚本和生产代码改动分别说明，全量检查与证据归档。


### 在线产物的工程文案泄漏（2026-10-25）
- [!] 首轮模型输出的工程说明进入业务UI，源码/几何门禁未覆盖语义，保留run-1与对应截图。
- [x] 共享合同规则区分业务文案和执行约束，保留用户技术说明/原文授权；在线多页复测不含该类工程备注，所有实际渲染门禁仍通过。

- [!] 在线文案复测第二轮打回：共享System合同仍未阻止“权益说明为静态展示，实际发放规则以会员中心为准”。计划requirements混有“静态说明/不发请求”执行描述，末尾页面请求再次提高其权重；补规划字段与生成请求两处业务文案边界，不放宽验收词检查。run-2原始失败保留。

- [x] 第三轮在线文案复验及人工看图通过；最终2,078/0、类型/构建、40/40入口与配置/凭证/进程检查通过，见 evidence/live-provider/report.md。通用业务语义未冒称自动验收。


### 在线模型与聊天采纳闭环（2026-10-25）
- [x] 真实模型经AIService/Vite代理，core与模型响应未模拟；每引擎实际新建与元素修改请求，原页采纳前不变，不弹宽泛分析卡。
- [x] 真实当前候选iframe/独立预览通过后按UI采纳；仅按钮文案变化，撤销/重做恢复精确HTML，刷新重开保留证据/交付档案和可解码PNG。
- [x] 只读当前绑定、密钥不进localStorage/报告，Provider配置不变；两个引擎独立，失败原因保留，全量检查和进程收尾。

- [!] 在线UI首轮脚本打回：生成时composer placeholder变化，测试直接访问旧选择器的null.disabled而立即失败；真实模型请求刚开始、未拿到产物。改为等待输入框重新存在且可用；保留first原始报告和脚本，不修改产品逻辑。

- [!] 在线UI第二轮脚本打回：真实创建与元素修改已完成、原页保持且候选ready；脚本看完候选预览未关闭验收浮层，浮层遮住采纳按钮而点击超时。按正常用户操作关闭详情后采纳，不使用force点击或绕过采纳入口；原始报告及两次模型真实应答证据保留。

- [x] first/second脚本打回保留，third Chromium/WebKit完整通过；所有前后HTML/历史PNG/代理次数/配置凭证/全量与启动证据见evidence/live-chat/report.md。不是原生在线UI验证。


### 取消生成的上游终止（2026-10-25）
- [x] 浏览器断开后本机上游及时观察断开，正常完成不误取消。chromium/chromium.json、webkit/webkit.json各4项通过。
- [x] 原生首包前、输出中和超时取消均中止上游；取消早于注册确认仍有效，不影响并行请求；请求Promise结算、无迟到Done。native/native.json共8项及7个单测通过。
- [x] 原生注册在成功、错误、取消后清理；2,085全量、23 Rust、类型检查、构建、启动通过；本机夹具，不使用在线Provider。证据均位于evidence/request-cancellation。
- [!] 本轮矩阵首轮复杂PC出现执行上下文销毁，原始报告保留；需独立复测确认，不能以此前40项通过替代本轮。
- [x] pc-retry/report.json完整独立复测通过；本轮40入口由首轮39项及PC复验共同覆盖，保留首次失败及根因未确认的边界。


### PC执行上下文失效诊断（2026-10-25）
- [x] 冷启动诊断保留实际导航/重载和流程结果，不把偶发失败复测通过解释为已确认根因。

- [x] 固定引用的PC任务在GC期间仍可完成，任务完成/失败后释放引用；冷启动、两引擎完整流程及40入口通过，不放宽断言。

- [!] 局部Promise固定未覆盖后续润色；cdp-cold-10/run.log保留原始协议失败，需全操作生命周期复验。


### PC上下文诊断收尾（2026-10-26）
- [x] 已确认原始错误为Promise was collected，非已观察到的主窗口导航；PC脚本全操作持有/释放引用，不重试业务操作。三次冷启动各9次GC、两引擎成功/失败清理、冻结40/40及后续2,106全量/42入口通过。详见[evidence/pc-context-diagnostic/report.md](./evidence/pc-context-diagnostic/report.md)。历史失败原样保留。
