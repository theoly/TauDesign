# M3-05 逐要求证据索引

2026-11-02。状态：IV-01至04及IM-01至07按本索引逐项验收。当前2873/0、类型/构建及742文件冻结源码的完整Chromium/WebKit两档位通过。M3-05关闭；此结论只覆盖本任务，不放行M4/M5。

| 原要求 | 实际执行与历史消费 | 当前直接证据 | 结论 |
| --- | --- | --- | --- |
| IV-01新候选冻结输入/授权，关闭规则亦适用 | stageScreenChange保存完整输入及任务绑定；isStagedTaskCurrent/修复资格/最终commit重查 | candidate_invalidation中的实际指纹持久化、授权改动、AI归纳4类/导航、L4/文档/主题；新字段缺失/坏值4类真实保存重开；删除binding/contract/both的真实存盘恢复；candidate_repair缺失/坏输入或授权零调用 | IM-07修复后通过；原无合同状态也冻结，删除字段不恢复旧许可 |
| IV-01纯画布/目录变化不误失效 | pageCreationContext排除位置、测量、选中与视口变换；旧规则按冻结快照读取 | candidate_invalidation位置/选择/视口/高度；rule_safety普通目录废弃仍保留已选active快照 | 当前正例通过；普通废弃不冒充安全撤回 |
| IV-02检查身份独立于任务输入 | renderEvidenceIdentity使用检查器版本、实际分档base.css、UA和DPR；候选key重算 | candidate_invalidation检查器/CSS/UA/DPR拒绝迟到回调、同候选新报告通过；不会改taskBinding或完整输入 | 单测通过；真实浏览器刷新/采纳/Undo/Redo/重开另归档 |
| IV-02本地文件内容独立失效 | 同一资源读取快照解析HTML/CSS/字体/L4；渲染报告仅记录路径+SHA256，最终重读 | render_resource_evidence含同路径替换、缺失/坏摘要、无关文件、字体/手动CSS、档案窗口、刷新及Undo/Redo | 当前全量持续覆盖，旧无资源报告兼容；有资源缺摘要需复验 |
| IV-03可信安全撤回 | 只读空策略、精确ID/版本；core前后和最终写入检查，history模式只读 | rule_safety 20项覆盖stream/JSON出站前/途中、修复、已确认分析、三种采纳、新页/重塑及档案；浏览器隔离夹具模拟未来策略 | 已验收范围维持；不表示生产有已撤回规则 |
| IV-04创建及受控修复 | prepareNewPage自检身份；CanvasToolExecutor独立跨验证返回后守卫；prepareNewPageWithRepair重走同验证 | page_creation新增render/after-validation有效负例、direct caller-true负例；既有取消/上下文/修复/来源/预算 | IM-06修复后通过；检查变化不写新页或History |
| IV-04HTML导入 | 预览确认与原输入，prepareNewPage及importHtmlScreen检查身份跨资源持久化/最终写入 | html_import_validation新增render/after-validation，保真/统一/选择三模式及资源/配置一致性 | IM-06修复后通过，无额外模型请求 |
| IV-04逐页/组件/批量重塑 | prepareCheckedRestyle自检，applyRestyleOutcome跨预览/档案/文件复核保持同检查身份 | restyle_validation新增render/archive及direct caller-true；既有组件引用、保护/资源、档案取消、History | IM-06修复后通过；历史报告保持原schema |
| IV-04多页/多方案 | 首次实际验证起冻结检查身份；后续检查到原子写入保持，私有ready句柄消费时复核 | multi_page新增render/ready-handle切换负例；既有批次一次性消费、引用/计划、全部页验证及原子History | IM-06修复后通过；句柄检查身份仅内存，不伪造历史字段 |
| IV-04局部/区块/续写/修复晚结果 | root与structured executor使用原完整ModificationSnapshot；原预算/冻结规则及目标；候选提交统一门禁 | child-execution-audit、runtime-compatibility-audit及对应当前全量；candidate_repair迟到模型/渲染、文件删除/恢复及一次性资格；independent_progress_lifecycle停止/换任务/补挂 | 原消费者当前回归持续通过；来源回执不等于Provider确认 |
| IV-04候选三种采纳/档案等待 | 相同input/check/resource守卫，档案prepare后/最终写前重核，失败保留原HTML/History | delivery_archive新增3模式checker迟到后aborted、同候选新报告重试、Undo；既有资源迟到3模式、档案取消/预览/并发 | 当前命令通过；不因旧聊天force而重新授予权限 |
| IV-04旧候选/旧聊天 | restore不回填原授权；丢弃只删除同一原候选，force仅消费当前同任务；补挂保留生成时输入 | staged_candidate_persistence实际旧无ID丢弃及并发替代保护；independent_progress_lifecycle旧结果/不同任务拒绝、当前候选force/Undo | IM-05已验收，输入坏值矩阵本轮扩展 |
| IV-04历史与页面entry | 历史投影保持旧绑定、坏来源保留正文；canonical screens/{id}.html与正文同属当前ID | runtime-compatibility-audit的8存储/迁移组合在当前全量通过；manifest_entry_consistency旧副本修复/缺正文/Undo/重开；候选三模式及新页/多页History | 前端和仓储回归范围通过；原生平台及真实模型/人评仍属M5门槛 |

证据范围：真实DOM/文件仓储动作、受控core/传输、Bun与浏览器。资源与规则模拟不会发送真实工程给Provider。Windows/Linux实机缺口按用户指令保留；macOS原生保存/导出、真实模型对照和盲评仍在M5-03及其它M5任务，不用这里的前端结果代替。

最终命令与浏览器原始路径见test.md最新IM-07收口记录。新prepare与历史get/list/finish的区别由delivery_archive的真实旧记录负例验证，历史未知授权不影响正文可读、也不授予新执行。原IV-01/02/04范围均有当前对应证据，M3-05据此关闭；其余M4/M5按原门槛继续。
