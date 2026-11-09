# M4-02 检查分级与采纳审计

2026-11-03（实施始于2026-11-02）。原任务：兼容四类finding、固定required/advisory、可复核原因与节点定位、人工确认不能替代自动底线。下表已结合当前全量/类型/构建、布局校准与完整冻结双浏览器验收；不把目录存在当作交付。

| 原要求 | 应用权威与实际路径 | 正反证据 |
| --- | --- | --- |
| 阻断/警告/未验证/建议 | findingPolicy固定checkId、code/status/severity组合；旧error/warning保持兼容 | finding_policy，原V4-NAME/FINDINGS/CONTENT及当前UI |
| 上传文档/模型不能降级 | 工具结果不决定检查等级；evidenceSchema验证可选assessment，新代码不能通过删metadata变legacy | 未知check/status、跨code、附加requirement、severity降级拒绝 |
| required失败不可采纳 | source/quality/资源/实体/实际render/授权由共同交付计划执行 | 三种Store入口与创建/重塑/候选修复回归；原完整UI |
| required未知不可采纳 | pending/incomplete/unavailable或非法报告不满足isPassedRender；结构确认只豁免结构 | finding_policy、render_coverage、workflow_validation与原UI按钮原因 |
| advisory未知不误阻断 | 对比度复杂背景、几何变换/外角接触仅说明局限，所有required仍必须通过 | 真实Frame校准与三入口采纳/候选及交付仓库读回 |
| 不适用不能假装通过 | renderCoverage固定reason→检查及outcome，不接受输入自定义passed/等级；producer仅记录实际分支 | 禁用/隐藏控件、特殊正文布局和自然换行；伪造/坏计数/重复原因拒绝 |
| 不适用不能取消明确内容义务 | 通用控件inactive记录与独立用户原文规则分别执行 | 禁用控件＋inactive说明仍因required_action_text_missing在三入口拒绝 |
| 节点及实际证据 | finding展示actual/expected、源/像素边界及可定位nid；源消息只定位当前匹配产物；范围记录提供有限节点样本 | 实际定位回传、Canvas现场报告与Chat报告；历史只读，不定位旧节点到新页面 |
| 限定检查范围 | 大页面节点/正文测量超预算保持incomplete；复杂变换不混算client与DOMRect | 测量预算及正文/角标/裁切校准；不以无finding代替全面视觉通过 |
| 保存/重开兼容 | report.coverage可选；旧合法报告不伪造新范围，新数据随候选/交付记录保存；恢复证据仍须重验 | legacy/schema、真实仓库读回与既有restore/invalidation/UI |
| 人工语义与审美 | PageTaskCoverage仅给源码线索，semanticStatus仍unverified；风格建议与来源归因不等于业务验证 | function-first/coverage与设计依据面板；未生成正式人工必需验收能力，不能宣称已验证语义 |

scope说明：coverage是具体分支的范围披露，不是所有CSS能力的完整清单，也不能通过列出某条不适用记录抹掉真实error。正常角标的外角接触仅依据矩形无法确定墨迹，因此列为建议类未验证；中心或文字范围重叠仍给具体警告，不提升为新的审美阻断。

M4-02若验收通过，也不代表M4-01全部内容/组件检查、M4-05交付交互链或M5真实模型/人评已通过。指导仍默认关闭，静态设计范围保持。

验收：M4-02于2026-11-03按原范围关闭。3099项前端测试、类型/构建、当前完整Chromium/WebKit两设备及104布局组合通过。原失败与最终结果见[test.md](./test.md)和[汇总](./evidence/2026-11-02-layout-audit/verification-summary.json)。M4-01/05与M5仍开放，指导默认关闭；没有真实模型、人评、原生实机或发布验收。
