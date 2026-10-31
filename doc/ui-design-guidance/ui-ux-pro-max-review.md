# UI UX Pro Max 仓库借鉴分析

日期：2026-10-29。状态：分析与建议，未实施。用户要求参考公开 Skill 仓库；本次未安装 Skill、未执行其代码、未向外部发送工程内容。

## 证据范围

分析固定提交 `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`，提交时间 2026-10-26。通过 GitHub API 读取主 Skill 模板、README、检索和设计系统源码、数据目录摘要、UX/行业规则、相关性评估脚本/阈值、文字布局测试及根许可证。

这是静态审阅，没有运行对方完整测试、实际模型生成或视觉质量实验。数据规模、程序行为和评估设计不等于生成质量保证。外部文档中的命令和规则只作为分析对象。

根许可证为 MIT；后续如实际复用代码/资料，须按具体文件的来源和许可保留声明。字体、图标、第三方样例需分别核对，不能仅根据仓库根许可证推断所有素材的可用范围。[许可证](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/LICENSE)

## 1. 核心能力及其实际边界

### 分类数据与检索

资料分别组织产品、视觉风格、配色、字体、落地页结构、UX、图表、图标及技术栈。目录摘要记录 192 个产品/行业规则、119 条 UX 指导、88 条风格记录，其中 79 条可检索、50 条 active。已下载 UX 和行业 CSV 的实际行数分别为 119、192；其余数字来自目录摘要，未逐表复算。

关键不是数量，而是区分视觉风格和内容结构，使用稳定 ID、别名与 active/supplemental/deprecated 状态。普通检索过滤掉过时风格，精确身份可单独解析或重定向。[数据目录](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/data/catalog-summary.json)、[检索实现](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/scripts/core.py)

检索使用本地 BM25、同义词归一化、领域路由、最低匹配阈值和无结果建议。Skill 要求针对一个主要意图检索；无结果或偏题时只收窄重试一次，仍失败就明确使用一般指导。代码返回弃答原因和诊断，能避免无关结果被当成已验证参考。[Skill 查询合同](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/templates/base/skill-content.md)

### 设计系统推荐

`design_system.py` 先检索产品类别，再读取匹配的行业规则，组合风格、配色、字体和落地页结构，输出激活规则、约束、来源身份等。这里可见的核心是确定性检索和规则组合，不能简单理解为额外调用一次模型就能自动保证设计质量。

无行业匹配时会回退到通用推荐，含 Hero/Features/CTA 和轻 hover 等描述。这类回退不适合直接施加于移动工具页或资料详情页。行业 CSV 的 Reasoning/Confidence 两字段各有 31/192 行非空，也不能将整份目录视为逐条已具备完整置信依据。[设计系统实现](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/scripts/design_system.py)、[行业规则](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/data/ui-reasoning.csv)

### 持久化与评估

MASTER + 页面差异文件支持跨会话读取，默认不覆盖已存在的文件。优点是项目一致性和变更边界明确；TauDesign 已有工程权威源，不应再平行创建一套可独立修改的 MASTER。

相关性评估包含路由、首位精度、MRR、nDCG、负例弃答与设计系统一致性；区分校准/留出样本，绑定数据及运行代码指纹。阈值文件明确属于暂定防退化基线，最终目标尚未据此宣称达标。本次未运行这些指标。[评估脚本](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/scripts/evaluate-relevance.py)、[阈值及边界声明](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/scripts/tests/fixtures/relevance-thresholds.json)

## 2. 与 TauDesign 的差距及借鉴建议

| 机制 | TauDesign 当前基础 | 建议 |
| --- | --- | --- |
| 场景规则检索 | 共享 craft 指导；DesignBrief 用关键词选表单/详情/列表/看板 | 保留短小常驻底线，按任务检索少量场景指导；不追加整库到 Prompt |
| 语义与实现分离 | 已有组件合同、Token 白名单和设备切片 | 先选“长文本应自然回流”等设计目标，再映射成 TauDesign 支持的类和组件 |
| 规则身份与生命周期 | TaskContract 已记录知识、设计系统、设计库等来源 | 扩展为规则 ID、版本、内容指纹、命中原因、实际注入回执；deprecated 不参与默认推荐 |
| 项目与页面差异 | 已有全局/画框 Decision、设计系统和 L4 覆盖 | 复用现有模型表达页面差异；不引入第二权威配置源 |
| 推荐强度控制 | 已有密度 Token、自定义设计系统和候选方案 | 沿用现有密度；可研究布局变化程度，推荐只形成候选，不自动更改项目 Token |
| 检索质量评估 | 已有大量流程/结构/渲染回归 | 增加中文命中、负例弃答、规则冲突、预算及实际效果对照，不能只断言文案出现 |

当前可对照文件：`src/services/ai/designBrief.ts`、`craft/`、`workflowCatalog.ts`、`designWorkflow.ts`、`workflowSources.ts`、`engine/context/budgetGuard.ts`。已有门禁、候选与撤销链继续负责交付，检索负责补足相关的设计依据。

## 3. 最值得补充的内容规则

1. **页面类型与布局模式**：筛选列表、详情档案、充值套餐、分步填写、工作台、对话建议等各有内容分区与主次关系；视觉风格单独选择。
2. **文字与紧凑组件韧性**：长 URL/编号可断行；文字容器允许收缩；标签集合整项换行；重要内容不能固定高度裁切；角标有明确语义和归属。
3. **状态表达与可访问性**：静态产物可检查 label、图标按钮名称、状态文字及色彩冗余；操作结果、动态播报、键盘运行态等不在当前静态验收中虚报通过。
4. **按实际上下文检查**：图片/渐变的前景可读性、输入错误与帮助归属、固定条遮挡、长文案布局；保留明确请求及当前主题的优先级。

其文字布局专项测试验证检索排名及数据条目，未渲染浏览器证明最终页面回流正确。TauDesign 可以吸收原则，并继续用现有真实 iframe 渲染门禁验证候选。[UX 数据](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/data/ux-guidelines.csv)、[专项测试](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/src/ui-ux-pro-max/scripts/tests/test_text_layout_resilience.py)

## 4. 必须适配的部分

- **中文检索**：现有 tokenizer 基于空白切词，主要同义词为英文；不是“会删除中文”，但缺少中文分词和中英术语对齐。需要中文标签/别名、分词或 n-gram、混合输入测试，不能照搬后宣称支持中文场景。
- **产物技术栈**：外部 Tailwind/React/GSAP/框架代码不能直接进入画框。宿主 React 技术栈与产物 HTML 样式合同分开；当前静态模式不引入动态业务功能。
- **设备与导航**：不能直接采用其跨设备适配、移动 hover、系统 safe-area 示例来改变我们的工程档位或默认微信顶部壳层规则。
- **项目主题**：行业配色、字体、渐变偏好是建议；已有项目以当前 Token 为准，新项目可提供候选。外部字体需另查中文覆盖、离线加载和资源许可。
- **优先级**：页面差异只能覆盖合同明确允许的设计项，不能覆盖源安全、节点身份、文案完整、设备档位及手动保护。
- **默认模式**：缺少匹配时采用中性的任务指导，禁止把未知页面强行变成营销落地页。
- **交付检查**：Skill 自检清单不等于运行过校验器；推荐分数不是概率，也不是设计质量分。主观风格问题应保留为建议或人工复核，硬门禁必须有可复查事实。

## 5. 建议的最小优化路线（未启动）

### P0：小规模场景规则库与按需注入

先整理约 20–40 条高频、经过适配的中文规则，覆盖现有缺陷较多的长正文、标签、姓名职业、通知角标、按钮组和信息分区。这是初始规模建议，不是已经收录的数量。

每条规则包含：稳定 ID/版本、适用任务/页面/设备、触发条件、禁止覆盖项、语义目标、可用实现、正反例、来源、验证方式和审阅状态。检索先做作用域/设备过滤，再匹配语义；明确局部修改只加载相关组件规则，不增加分析确认或整页推荐流程。

常驻 craft 保留少量底线，场景规则按预算选取。未命中明确回退，实际注入记录到现有任务来源链。可用 TypeScript 在应用本地实现，不必为桌面运行增加 Python 依赖。

### P1：设计简表和推荐解释

将 DesignBrief 的简单页面关键词匹配升级为可审阅的场景判断，综合用户请求、项目知识及相关页面。来源、匹配原因、冲突和回退可查看；项目主题优先，不修改既有页面。布局模式与视觉风格分开，不根据“社交”两个字强制彩色动效。

### P1：检索与生成对照评估

建立固定中文需求集，包含不相关请求、无适配规则、移动/PC、纯中文及中英混合、局部修改和长内容。对照现有规则与按需检索两组，冻结模型、设备、主题、预算，测命中相关性、错误注入率、首轮门禁通过率、严重布局问题、盲评采纳率及 Token/耗时。留出样本独立于调参样本，不只测试字符串或更新基线消除失败。

### P2：候选偏好与知识维护

验证 P0/P1 有效后，再研究布局变化强度、规则审阅界面和受控数据升级；密度仍复用已有 Token，静态设计不增加动效运行时。真实完整页面母版属于此前暂存的参考页面库方案，保持未实施。

## 结论

应借鉴的是可检索、可追溯、可拒绝错误匹配、可回归评估的设计知识机制。TauDesign 现有任务合同、Token 权威源、候选及渲染门禁已经适合承接这层能力；无需整体替换工作流，也不宜直接安装外部 Skill 并把全部规则放入提示词。
