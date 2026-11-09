> 用户反馈修复后的当前状态以[当前完成度与证据索引](./completion-current.md)为准。本页以下内容为各冻结版本的历史证据，保留原日期/范围。

> **最新状态（2026-11-03，RG交付后）**：下文逐项表是早期3263版本的历史快照，保留排查链。当前权威为 `evidence/2026-11-03-rg-final-acceptance-v2/result.json`：3286/0、类型/构建、完整双浏览器与macOS两真实副本通过，426运行/722含测试输入不变。M5-03及AC-20/25关闭，顶层24/27完成。原新批次48任务47通过；另立1页恢复后新版交付页24组48图双引擎加载通过，见m5-delivery.md/test.md。M5-02独立真人评阅、M5-04默认放行和M5-05整体归档仍开放；不能以最终补生成包改写首轮统计。

# M5最终证据审计

> 真实模型打回更新：下列3263与完整链是修复前版本的有效证据，随后发现生产AIService丢失Schema；不能作为修复后通过。8失败、1中断、39未启动完整保留，见m5-delivery.md。当前继续受影响修复，未宣布最终完成。

2026-11-03。逐项对应原34项标准，不把工具、意图、旧版本记录或合成响应当作真实模型/独立人评。当前完整验收链运行中：3,263/0、19,705断言、256文件；类型与构建通过，浏览器/原生待终态。运行源与全部测试输入分别冻结。正式48任务及至少两名独立真人评阅尚未完成，规则仍默认关闭。

## 逐项映射

| AC | 必须证明的范围与当前权威来源 | 当前边界 |
|---|---|---|
| 01 | catalog/validation、design_knowledge、rule_safety；20条原创摘要来源/版本/审阅与文档稳定锚点 | 源/schema已核对，待最终链终态归档 |
| 02 | 两档位CSS派生白名单与registered-source-css分流；design_knowledge、html_import_validation | 来源CSS不套原生未知类；不自动抹除样式 |
| 03 | 中英/NFKC/词边界/精确身份；design_knowledge与首次60例离线报告 | 校准/留出各自分母，基线也全对 |
| 04 | no-match/unknown-target/excluded-workflow/budget及最多一次收窄；design_knowledge_integration | 不改变设备、授权、目标或预算 |
| 05 | workflow_sources/design_workflow_contract/structured_guidance及invalidation-audit | 规则包不能授权覆盖；来源与当前保护复核 |
| 06 | modification_entry、modification_review、design_rule_chat_roots与完整UI | 明确局部直接副本，宽泛选择前不执行 |
| 07 | designBrief/pageTaskPlan、design_knowledge_integration/page_task_pipeline/reference_modify | 任务信息优先于视觉建议；仅静态设计 |
| 08 | 显式按钮/字段源码与真实Range检查、function-first及page_task_coverage | 确定性内容子集已实现；真实生成抽样与业务语义人评仍待48任务 |
| 09 | design_token_window/structured_guidance、PromptBuilder与每请求回执 | 不扩大预算/不截断半条/不整库注入 |
| 10 | request-provenance-audit、receipt/structured_guidance、DesignGuidanceCard | 组装/派发/完成分开；应用边界不冒充Provider收包 |
| 11 | root-entry-integration/protocol-integration/child-execution-audit | 新建/参考/库/分析/补丁/润色/批量/分区/续写同快照，专用协议分开 |
| 12 | 导入确定性测试、preserve源码CSS/渐变/级联与原浏览器报告 | 无模型导入另表，不计生成分母 |
| 13 | htmlImport/主题提取/History专测及三模式确认 | 提取为候选，未确认不更新项目 |
| 14 | mobile_navigation/import_viewport/导出测试；最终原生mobile/pc副本与HTML/PNG | 浏览器和原生证据分开；移动HTML无编辑器导航，PNG按设置包含 |
| 15 | content-check-audit的32布局/26字段/30按钮原文/22名称校准及完整UI | 严重几何子集可阻断；业务语义不假通过 |
| 16 | rendered_quality与content-check-audit的对比度范围、复杂背景未知披露 | 图片/渐变/未知墨迹不冒充纯色算法通过 |
| 17 | finding_policy/render_coverage/QualityFindings与分级审计 | required未知不解锁；advisory未知不误阻断 |
| 18 | candidate_repair/page_creation_repair/style_repair_eligibility、delivery-audit | 一次、有界、无删文案/扩围/阈值放宽；迟到拒绝 |
| 19 | progress-audit/independent_progress_lifecycle/timeout及完整UI | 进度来自实际阶段/活动；无虚构百分比 |
| 20 | delivery-audit/candidate_actions、真实原生save→进程退出→reopen | 专项2副本已通过；最终冻结版本原生复验待终态 |
| 21 | runtime-compatibility-audit、候选/历史/清单仓储矩阵 | 旧来源可读不伪造，旧渲染不解锁重开候选 |
| 22 | invalidation-audit、design_rule_control、staged persistence/History | 默认关闭；用户关闭不删除已采纳页面/旧证据 |
| 23 | 首次m5-offline manifest/report、正式offline测试 | 已验收；不重新评分留出以调参，实际选择器依赖未改 |
| 24 | 冻结12需求×2×2、真实账本/页面/失败、两份独立盲评及rollout重算 | **待真实48任务和至少两名独立人评** |
| 25 | verify-design-delivery的unit/types/build原始日志与输入/日志SHA | 3263/0、类型/构建已通过；总体完整链待终态 |
| 26 | 最终result/browser/native分别记录；Git/安装包/发布独立 | 本轮不做Git或安装包/发布；Win/Linux沿用已接受实机缺口 |
| 27 | protocol-integration/structured_guidance/continuation/sectioned与完整UI | HTML/JSON/片段规则语义共享，输出协议不混用 |
| 28 | validation-level-audit/finding_policy/evidenceSchema三采纳矩阵 | 必需未知/错误不被结构确认覆盖，建议不越权阻断 |
| 29 | invalidation-audit IM/IV全矩阵及candidate_invalidation | 任务输入、检查器、资产、来源分层失效，原页变更不覆盖 |
| 30 | task_budget/task_budget_ownership、底层transport-audit及子执行审计 | 应用级请求预留/累计不回补；失败/取消/超时/一次修复共享父额度，重定向不冒充计费调用 |
| 31 | implementation-plan§3 scope语义、validation/selector、catalog原创来源与schema正反例 | 空维度不加限制；本地目标须已知trigger，精确ID不越权；共享别名经确定性排序/范围过滤，非全局唯一键 |
| 32 | request-provenance-audit/child-execution-audit、真实DefaultCore/MockTransport正反例 | 每实际子调用独立身份/状态；凭证/像素不入常规来源回执，实验原文额外本地去凭证 |
| 33 | content-check-audit、自然多行/纯图标/合法外角与导入CSS双引擎校准 | 不自动补偿光学中心；未知viewBox墨迹披露 |
| 34 | offline/experiment统计、独占计划/恢复、measurementComplete、四轴人评与争议0分 | 固定分母和成本代码通过；**真实数据和独立人评待完成** |

## 必须保留的限制

- 目前23/27顶层任务接受。M5-02至05保持开放，不因当前工具或专项通过自动勾选。
- 旧四期重构与text-layout审计的2026-10-28收口已核对：静态开发与安装版当时已完成；旧缺陷列表是历史，不重新当作本轮未实现功能。当前增量安装包与发布未执行。
- 真实模型使用当前应用绑定；实际读取为DeepSeek官方/deepseek-flash。仅独立合成需求，无用户工程内容发送。
- 人评身份由显式独立/盲评声明提供，程序不认证身份。自动点击合成表单不是两名真人。
- 版本和小样本无法证明统计显著性、美感普遍提升或动态业务功能成立。未达到原质量/成本判据保持optional，不调整阈值或只重跑较差组。
