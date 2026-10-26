# 四期方案验收映射（2026-10-25）

> **当前交付导航：[current.md](./current.md)**。2026-10-26已在当前296文件源码上新执行42/42入口，0失败/超时；[本轮报告](../current-refactor-acceptance/test.md)。下文旧日期/旧指纹的记录保留为历史证据，不替代当前导航。

> 2026-10-26[最终交付复核](./closeout.md)：当前286个生产/验证文件与最新冻结源一致；42个条目及独立报告/日志已重新核对，均存在且通过。本次为记录复核，不是重跑测试。

本表整理当前已实现的静态设计流程及可复核证据。当前范围不含可点击业务原型、真实表单提交或多 Agent 派发。通过浏览器夹具不等于在线模型或原生文件对话框已端到端验收。

## 最新增量：大页面续写与PC自动化稳定性（2026-10-26）

当前指纹`f639b480d6da3bcb3adaf8decca392a539a569e30d3cf506aff2b6041d854319`。普通对话分段恢复、会话内主动继续、显式2～4页规划和无HTML失败分支已接入；2,106全量/类型/构建、42/42最终矩阵及原生合成渲染通过。真实qwen3.8-flash仅合成前缀+实际后缀协议验证，保留两次前期格式打回，不冒称整张真实长页在线闭环。PC先前异常原始错误为Promise回收，脚本引用生命周期已修复，冷启动GC及完整矩阵通过。[大页面报告](../large-page-generation/test.md)、[PC诊断](./evidence/pc-context-diagnostic/report.md)。

## 取消生成的上游终止（2026-10-25，历史冻结）

当前指纹 `da9f3a847ecfb25d05526eca79143c5a91f1810de1b64bb236dc0acc7d2e94e0`。开发代理断开传播与原生请求注册/取消已修复，两浏览器8项及真实Tauri/Rust8项本机验证通过；2,085全量、23 Rust、类型/构建通过。40入口首轮39通过，Chromium复杂PC上下文销毁失败保留，独立完整复测通过；不是首轮40/40。本轮零在线模型请求，旧在线证据仍是其冻结版本。[报告](./evidence/request-cancellation/report.md)。

## 真实在线聊天采纳闭环（2026-10-25，历史冻结）

当前扩展指纹 `7b5934c83ad71684b47e62a09c402fc62bddde3241f1983a947b561d25e91228`，仅新增显式启用的verify-live-chat.py；全部原有生产/测试源仍与上一`bdaa57…`冻结版本相同。Chromium/WebKit分别真实发起新建和元素修改，经实际聊天、iframe点选/引用、候选预览、UI采纳、顶栏撤销/重做及刷新卡片重开完整通过。成功4次真实请求，包含两轮夹具失败共7次启动，全部保留；密钥不进存储/证据，用户配置不变。**2,078测试、类型/构建、开发/原生启动**通过。[报告](./evidence/live-chat/report.md)。此轮为AIService/Vite开发代理，非Rust原生UI；40项离线矩阵未重复，沿用逐字节相同生产源的上一冻结报告。

## 当前绑定在线模型与文案边界（2026-10-25，历史冻结）

当前指纹 `bdaa57c546e14f5baaa40cbc5ff67b2a4cd175011a70f3bf0d1777cd65a2bb32`。用户确认当前阿里百炼/qwen3.8-flash，真实原生AIService/Rust执行五类静态服务，人工发现工程说明进入业务正文；仅System合同修正复测仍失败，最终同时加强规划字段与逐页请求边界。三轮15真实请求，最终多页定向通过、2页×两引擎4份画面检查通过，配置未变、凭证不入档、直连AI为0。最终**2,078全量、类型/构建、40/40同版本入口矩阵**通过，服务已收尾。[详细报告](./evidence/live-provider/report.md)、[最终矩阵](./evidence/live-provider/matrix-final/report.json)。五类首轮与最终定向复验各有冻结版本；原生在线harness为内存服务检查，UI/History仍由既有独立矩阵验证，不把两者冒称一次在线UI全链路。提示规则不是通用语义保证，真实复杂PC/其它平台仍待证据。

## 复杂 PC 静态流程与状态收敛（2026-10-25，历史冻结）

当前指纹 `2b5329b1600e678f809397705df68bdb091d43607e602e83b67d50d120aa4df7`，本轮仅新增回归脚本/文档，生产逻辑仍为上一资源闭环版本。两引擎分别在三种参考设备实际执行复杂PC创建、局部采纳/撤销重做、润色、原貌导入、HTML/PNG及重开；完整画布与HTML像素一致，原貌导入前后像素一致，PNG按既有12/255容差补充比较6/6通过。**2,078全量、类型/构建与40/40入口矩阵**通过，Tauri启动通过并收尾。详见[本轮报告](./evidence/pc-workflow/report.md)、[矩阵](./evidence/pc-workflow/matrix/report.json)与[收敛清单](./completion-status.md)。这是明确的合成复杂PC输入，真实复杂PC/在线模型/其它平台证据边界保留。

## 提交前真实资源读取（2026-10-25，历史冻结）

当前指纹 `6f99b09f7ecf88f46f5a8b03f83b1682a20c3a16d71076bada6efa3983d6eeb4`（沿用含Rust的扩展范围）。补齐三种采纳的预览/档案后检查空档，共享实际HTML/CSS/L4资源解析读取，字体/新建/多页整批/重塑/无实例组件均覆盖，字体-only的即时读取也进入范围明确的证据。187专项、2,078全量、类型/构建与 **38/38双浏览器入口**通过，每引擎6个真实资源故障与恢复用例；原生本轮仅启动。[详细报告](./evidence/resource-final/report.md)、[最新矩阵](./evidence/resource-final/matrix/report.json)。读成功不等于视觉语义通过，仍非外部文件与内存跨介质原子事务，在线模型与历史原生完整文件链路边界不变。

## 原生UTF-8字节完整性（2026-10-25，历史冻结）

当前指纹 `099837066ec9f9b845fa97684c170204b43564c3b74ba8600be159ee9a15bb36`（本轮扩展为包含Rust源码/Cargo.toml/Tauri配置）。真实桌面WKWebView→AIService→Rust网络→Channel复现并修复独立解码分片造成的中文/表情损坏；同12份HTTP响应字节前后一致，正常输出损坏8→0，上限JSON继续拒绝；HTTP503/半码点断流2项拒绝。4新Rust测试、22全量Rust、2,058前端、类型/构建和 **36/36浏览器入口**通过。[原生详细报告](./evidence/native-utf8/report.md)、[最新矩阵](./evidence/native-utf8/matrix/report.json)。本轮原生已执行实际本地AI请求，不再仅为启动；仍是本机协议夹具，不等于在线模型质量或项目IO/导出重跑，历史完整原生IO与真实工程报告保留冻结版本。

## 同页多方案比较（2026-10-25，历史冻结）

源码指纹 `2445341047c67be129863448c26506a1e160d448bb2cb51b08cfd02e0d14761a`。`plan-page-variants`补齐同页2～4方案的规划确认、差异编辑、同一来源和同Token约束、逐项实际验收及整批并排History。候选为新的静态副本，原页不替换；旧多业务页流程保持兼容。106专项、2,058全量、类型/构建与18入口×两引擎 **36/36**通过；原生本轮仅启动。[详细报告](./evidence/page-variants/report.md)、[当前矩阵](./evidence/page-variants/matrix/report.json)。所有模型为本地夹具，方案共同功能与差异仍需用户审阅，不将几何通过解释为语义完整；此前真实工程与原生文件报告继续保留自身冻结版本。

## 结构化输出结束（2026-10-25，历史冻结）

当前源码指纹 `02dc738ab3a71f66da8f227d96789d007cf3f9fe7dd7652faf9674ec513437da`。完整JSON不能绕过输出上限/过滤/异常结束检查；实际服务和回退解析器保留四协议结束值，取消/网络恢复防护统一，有限JSON不续写。109专项、2,024全量、类型/构建与当前34/34入口通过，两引擎各8个协议用例+真实iframe修复拒绝；所有模型响应是本地字节夹具，未调用在线Provider。[报告](./evidence/structured-output-end/report.md)、[当前矩阵](./evidence/structured-output-end/matrix/report.json)。原生本轮仅启动；缺失结束元数据不能证明语义完整，真实复杂PC/在线模型/其他平台边界继续保留。

## 移动顶部与裁切增量（2026-10-25，历史冻结）

该增量冻结源码指纹 `a68a643229f2b4c87c0ce61e1f5d2e0827a5afebd6fd504d16cad5356e8c50c4`。两真实旧页的导航重复、充值裁切装饰误报已修复；原输入哈希相同，保留业务/隐藏状态/PC/自定义策略和History。双引擎充值RGB图像0变化，7种实际几何反例/72专项通过；1,989全量、类型、构建与当前版本34/34入口矩阵通过。[详细报告](./evidence/mobile-chrome-geometry/report.md)、[当前矩阵](./evidence/mobile-chrome-geometry/matrix/report.json)。当前矩阵已包含上轮导入诊断修改；下方旧版本矩阵保留作为历史。原生本轮仅启动，复杂真实PC/在线模型/其他平台仍待同等验收，源设计其他排版不自动改动。

## 导入诊断增量（2026-10-25，历史冻结）

该增量冻结源码指纹 `67ef6aa656b1376b293ca335a754008552fae5c18df6a83a940ff464853a4c3b`，修正导入自带CSS诊断措辞、来源上下文、设备档位和UI评分说明，不修改样式或白名单。42专项、1,973全量、类型/构建、两浏览器三种导入及三类拒绝通过；原生本轮仅启动冒烟。[增量报告](./evidence/import-diagnostics/report.json)。下方34项矩阵与原生完整操作保留各自冻结版本指纹，未冒称本轮全部重跑。2px越界与旧页导航重复仍为另项，复杂PC/在线模型/其他平台边界不变。

## 原方案与实现

| 方案 | 实现位置 | 实际验证 |
|---|---|---|
| Skill 分流与工作流目录 | workflowCatalog / designWorkflow / workflowValidation；明确元素优先，宽泛优化先确认 | 路由与合同单测；modification-analysis / structured-edits / workflow-sources / page-variants 双引擎 |
| 任务快照与项目上下文 | designWorkflow / workflowSources / projectKnowledge；基线、知识与库版本身份 | 过期／授权／来源单测；来源与候选恢复浏览器验收 |
| 统一执行与结果合同 | PipelineExecutor / structuredEditExecutor / restyleExecutor / htmlImport；共享执行记录与声明式门禁 | 新建、三类结构化修改、重塑、三导入策略；结构化原始流不可取得时不伪造 rawResponse |
| .aidesign 项目合同 | projectManifest / designEntityValidation / projectAssetIntegrity | 页面状态／分组／来源关系、静态链接、组件模板和资源真实文件测试及双引擎 |
| 设计库三模式 | designLibraryImport / designLibraryReference / designLibrarySource | 副本／固定版本引用／源编辑返回；真实Store／History与文件IPC夹具，失败和重开 |
| 确定性质量门禁 | candidateValidation / pageCreationValidation / restyleValidation / PageRenderCheck | 源码、结构、实体、文件、真实iframe尺寸/文本检查，取消/过期/故意失败不解锁 |
| 候选及交付证据 | candidateRepository / deliveryRepository / restyleDeliveryRepository / visualEvidence | 候选侧车、请求、前后快照、实际报告、独立PNG、重开；视觉外部结果本机重算 |
| 回滚与迁移 | History / projectRepository / projectBundleMigration | 单条采纳撤销重做、附属档案与资源字节迁移、冲突/磁盘失败；真实移动13页和PC1页只读迁移 |

## 冻结版本入口矩阵（后续增量另列）

代码指纹：`2c09e8e1a9827e00e86f4338346dd15d5260e253c84f1a1df8a7498a89e008b3`；开始 2026-10-25T13:08:44+0800，结束 2026-10-25T13:10:55+0800。34 项全部退出 0、独立报告 passed，运行前后源码指纹一致。模型流与文件选择器使用脚本明示夹具；应用 Store、iframe、History、仓储及本地像素工具真实运行。

| 入口 | Chromium | WebKit |
|---|---|---|
| 单页新建与创建门禁 | [通过](./evidence/final-matrix/chromium/page-creation/report.json) | [通过](./evidence/final-matrix/webkit/page-creation/report.json) |
| 元素／局部／区块副本修改 | [通过](./evidence/final-matrix/chromium/structured-edits/report.json) | [通过](./evidence/final-matrix/webkit/structured-edits/report.json) |
| 宽泛修改分析与确认 | [通过](./evidence/final-matrix/chromium/modification-analysis/report.json) | [通过](./evidence/final-matrix/webkit/modification-analysis/report.json) |
| 单页润色与批量重塑 | [通过](./evidence/final-matrix/chromium/restyle-gates/report.json) | [通过](./evidence/final-matrix/webkit/restyle-gates/report.json) |
| HTML 导入三策略 | [通过](./evidence/final-matrix/chromium/html-import/report.json) | [通过](./evidence/final-matrix/webkit/html-import/report.json) |
| 多页计划与整批交付 | [通过](./evidence/final-matrix/chromium/multi-page/report.json) | [通过](./evidence/final-matrix/webkit/multi-page/report.json) |
| 组件／页面引用合同 | [通过](./evidence/final-matrix/chromium/design-entities/report.json) | [通过](./evidence/final-matrix/webkit/design-entities/report.json) |
| 参考图／库／组合来源 | [通过](./evidence/final-matrix/chromium/workflow-sources/report.json) | [通过](./evidence/final-matrix/webkit/workflow-sources/report.json) |
| 旧页候选受控修复 | [通过](./evidence/final-matrix/chromium/candidate-repair/report.json) | [通过](./evidence/final-matrix/webkit/candidate-repair/report.json) |
| AI 新建受控修复 | [通过](./evidence/final-matrix/chromium/page-repair/report.json) | [通过](./evidence/final-matrix/webkit/page-repair/report.json) |
| 固定模板与插槽 | [通过](./evidence/final-matrix/chromium/component-template/report.json) | [通过](./evidence/final-matrix/webkit/component-template/report.json) |
| 设计库项目副本 | [通过](./evidence/final-matrix/chromium/design-library-import/report.json) | [通过](./evidence/final-matrix/webkit/design-library-import/report.json) |
| 固定版本只读引用 | [通过](./evidence/final-matrix/chromium/design-library-reference/report.json) | [通过](./evidence/final-matrix/webkit/design-library-reference/report.json) |
| 编辑源库与返回 | [通过](./evidence/final-matrix/chromium/design-library-source/report.json) | [通过](./evidence/final-matrix/webkit/design-library-source/report.json) |
| 候选预览／采纳历史／重开 | [通过](./evidence/final-matrix/chromium/delivery-history/report.json) | [通过](./evidence/final-matrix/webkit/delivery-history/report.json) |
| 工程附属档案迁移 | [通过](./evidence/final-matrix/chromium/project-bundle/report.json) | [通过](./evidence/final-matrix/webkit/project-bundle/report.json) |
| 视觉报告导出／离线比较／本机复核 | [通过](./evidence/final-matrix/chromium/visual-evidence/report.json) | [通过](./evidence/final-matrix/webkit/visual-evidence/report.json) |

[汇总报告](./evidence/final-matrix/report.json)保存每项退出码、运行时间、命令及原始日志位置。[复跑脚本](./evidence/final-matrix-runner.py)在仓库根目录运行，需已安装可选Python依赖及Playwright浏览器并启动127.0.0.1:5174；输出覆盖当前矩阵，历史失败分别保存于first/second/third-attempt目录。

## 真实项目与验收边界

- 用户指定 PC01：真实 PC 档位、1 个默认占位页，无项目文档/资产。三参考设备×两引擎×三类图片18项正式比较；固定1440宽，笔记本/宽屏按比例换算810高，标准900高。只能证明基础PC迁移/参考设备/导出链路，不能据此证明复杂业务PC布局。
- smatch：真实移动工程13页，选择员工登录、外勤工作台、约见回访三页×三参考设备×两引擎，画布/HTML/PNG正式比较54项；原页对比度与角标警告保留，像素稳定不代表源设计无缺陷。
- 真实磁盘读写通过Python受限桥接到临时目标。来源禁止写入并核对前后哈希，原工程保持不变。不是原生文件选择器或Rust文件系统验证。
- macOS原生后续验收已完成真实系统文件选择器、Rust保存、History与应用退出重启、HTML/原生PNG导出及充值HTML导入（含坏输入拒绝）。[原生报告](./evidence/native-desktop/report.md)独立列出实际操作、输出和警告。在线Provider的完整生成结果、复杂真实PC业务页及其他桌面平台仍未取得同等证据。所有浏览器基准均按引擎独立，不代表物理设备截图。
- 视觉报告为历史交付的独立记录，不能替代当前候选渲染门禁；外部运行环境只是工具声明，不声称有可验证的运行来源证明。

因此：同版本静态入口矩阵、真实PC基础验收及macOS基础原生链路通过；不能把它扩写成原完整方案在所有真实工程、所有平台及在线模型上的无条件全部完成。
