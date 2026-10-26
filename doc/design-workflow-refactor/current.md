# TauDesign 重构当前交付状态

更新：2026-10-26。**增量修复：候选按钮显示阻断原因，结构变更需显式确认；2,143项单测、类型、构建与双引擎8场景通过。** [按钮修复验收](../candidate-action-feedback/test.md)。下述42项矩阵为此前版本执行，不冒充本次全矩阵复跑。

此前交付：**用户确认的静态设计范围内，原四期重构已完成；当前版本42项浏览器入口回归全部通过。** 本页为当前导航，历史任务中的进行中/打回记录保留其原日期，不作为当前未完成清单。

此前42项全矩阵生产/验证源：`652ce3b7f67cf95b90c5f043f8f12c2ac884933d07d84b89dfe49892509f6921`（296文件）。[矩阵及报告](../current-refactor-acceptance/test.md)、[源码身份](../webkit-png-shadows/evidence/source-reviewed.json)。本次增量以按钮修复验收记录为准。

| 阶段 | 已完成能力 | 证据 |
|---|---|---|
| 路由与任务合同 | 明确小改直接复制局部修改，宽泛优化先分析选择；冻结目标、授权、基线、知识、来源和设备 | 当前矩阵的modification-analysis、structured-edits、workflow-sources |
| 统一执行与候选 | 新建/局部/区块/整页、润色/批量、HTML导入共用执行记录和门禁；候选对比与采纳可撤销 | page-creation、candidate-repair、restyle-gates、html-import、page-repair |
| 工程和设计库 | `.aidesign`单一权威源；资源/组件/页面关系校验，设计库副本/固定版本/源编辑，迁移重开 | design-entities、component-template、三种design-library、project-bundle |
| 门禁与交付 | 源码/文本/结构/文件/实体/实际iframe检查；候选/交付预览与历史证据，失败不绕过 | resource-final、delivery-history（含candidate-preview）、visual-evidence |

本轮42项为当前源码新执行；2,136项单测、类型/构建来自逐文件相同源码的[最近执行](../webkit-png-shadows/test.md)，本轮没有重复运行。旧的在线模型、原生文件和真实工程证据分别保留自己的版本与范围。

## 后续已完成增量
- [大页面普通续写和确认后拆页](../large-page-generation/usage.md)。
- [参考图可选区域、同页2～6区块生成](../reference-regions-sections/test.md)。
- [安全失败草稿与确认后的定点修复](../failed-design-drafts/test.md)。
- [工程路径显示/打开](../project-directory/test.md)、[对话输入框自适应](../chat-input-autosize/test.md)。
- [真实PC六页迁移及三页多设备/原生验证](../real-pc-acceptance/test.md)；早期PC01只有占位页的说明为历史输入。
- [PNG受控阴影补偿和实际能力/降级提示](../webkit-png-shadows/test.md)。

## 明确保留的边界
1. Windows/Linux原生实机未验收；本轮macOS浏览器不替代它们。
2. 系统WK的部分兼容PNG阴影不能无损补偿，显示明确警告；正常桌面原生PNG优先。
3. 分区和普通续写检查点只保留当前会话；可点击业务原型、状态机、后台库同步和多Agent不在本次范围。
4. 静态/像素检查不能代替对业务真实性、语义完整和美感的人工审阅。

这些边界不能标为已验证，也不应通过“继续”自动扩大成新功能。当前未发现需要继续修改的重构代码项；新问题按可复现缺陷处理。
