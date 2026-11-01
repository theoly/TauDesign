# M3-02 请求来源与交付绑定审计

2026-11-01。保持原规则选择/协议/预算与.aidesign格式，审计组装、调用、候选、历史及交付侧车；不把应用调用回执当成Provider收包或模型遵从证明。

- [x] RQ-01 验证本任务请求ID、连续序号和父任务绑定；拒绝异任务ID、跳号、乱序及误用修复命名空间。历史应用包实际生成的普通ID也是taskId:request-N，缺outputProtocol的旧合法记录仍可读；不为坏记录补造来源。
- [x] RQ-02 修复来源展示区分组装内容与已记录调用输入；零调用/组装中不能显示实际注入或复验通过。保留失败/取消状态，不重发请求。
- [x] RQ-03 逐项检查TaskContract→候选→会话历史→单页/重塑交付与新页证据的绑定，含父子分区/续写/有限JSON/修复；损坏与跨任务信息拒绝、旧缺来源保持缺失。
- [x] RQ-04 负例、专项、全量测试/类型/构建及真实双引擎UI验证归档；只有逐项原范围证据充分时才关闭M3-02，M3-03/04/05及M5不自动放行。

本轮发现：普通packet仅检查父字段与ID非空/去重，没有核对ID的任务前缀与序号；RepairGuidanceSource把预先组装的injectedRuleIds当成实际注入，即使requests为空。先固定负断言，再修复代码。新旧数据都执行一致性检查，这不是对本地JSON提供密码学真实性背书。

扩展审计发现普通DesignGuidanceCard也把含assembled的记录数写成调用次数，并称实际进入请求。RQ-02覆盖该同类展示：使用“请求记录N条”，assembled标“已组装输入”，其它状态标调用输入记录；历史各状态仍可只读查看，不因此通过执行检查。先添加各状态读回/展示断言。

## 原范围逐项审计

| M3-02要求 | 当前代码与实际数据链 | 验证证据 |
| --- | --- | --- |
| 冻结选择包与任务绑定 | receipt.ts 的 makeGuidancePacket/guidanceBinding 绑定taskId、工作流/策略、目标与基线、设备、主题/库/图像/知识、授权范围及协议；选择规则正文/指纹独立校验。 | design_guidance_receipt.test.ts、structured_guidance.test.ts、workflow_sources.test.tsx、当前全量；改范围/设备/正文/协议不可通过。 |
| 组装与实际调用分开 | begin只组装记录；实际core API返回句柄/Promise后标dispatched，完成/失败/取消独立；预取消、安全撤回、预算拒绝在调用前不产生回执。调用语义为应用core，不是HTTP或Provider确认。 | 真实DefaultAIEngineCore/MockTransport、挂起/取消/迟到/异常与配额反例；图像仅指纹、不存凭据；Core消息中的规则与注入IDs逐项匹配。 |
| 父子请求身份 | 普通ID严格为taskId:request-N，按组装顺序连续，parentTaskId必须相同；64上限、重复、额外IDs、状态和消息指纹校验。修复仅允许独立style-repair:request-1命名空间。 | 新异任务/跳号/误用命名空间负例；既有真实续写双调用、有限JSON/分区/补丁多调用；修复trace独立父选择和绑定指纹。旧合法ID格式已核对acd3ea5源代码。 |
| 各生成入口 | Pipeline的普通/参考/库绑定/整页/分区/续写共用包装core；分析、结构化有限JSON/区块和重塑HTML/补丁各声明协议并使用同一回执模块；未采用规则的专用事实规划、问答/主题及确定性导入不伪造规则包。 | root-entry-integration.md、protocol-integration.md，design_guidance_receipt、analysis_guidance、structured_guidance、restyle_guidance_protocol、large_page_continuation等实际core用例；完整浏览器协议/开关/分析/多页矩阵。 |
| 格式纠正与失败 | 只允许分析JSON的failed记录指向更晚且同模型/Provider、schema有效的completed纠正；其它失败/取消不能被升级。Core返回完成不等于源码/渲染通过。 | analysis_guidance.test.ts、回执正反例和完整浏览器分析纠正/取消；历史五种状态都可读，但非completed不满足执行检查。 |
| TaskContract与候选 | workflowValidation/taskProvenance调用统一校验；Store的当前任务/基线/授权/渲染及任务绑定检查与规则回执分别保留。候选仓储保存损坏信息作诊断，不能因重开丢失新字段而降级为legacy。 | 新候选有效→保存错误ID→重开保留错误→实际adoptStagedChange返回false、原页/History不变；已有scope、null、保护节点与全部候选门禁回归。 |
| 普通/重塑交付侧车 | deliveryRepository与restyleDeliveryRepository在prepare、finish及读取时校验TaskContract/回执、结果与基线HTML及验证证据；模型或用户声明不是来源凭据。 | guidance_archive_integrity.test.tsx扩展普通/重塑×错误任务ID/序号；所有坏档案读为invalid、不能prepare/finish；正常归档/后续无关编辑/历史可读。 |
| 新页与多页证据 | pageCreationValidation把当前contract保存在creationEvidence，读取通过taskProvenanceIssue；多页每页任务通过multiPage.scope与共享planId链接，整批同步交付，回执父ID为该页设计任务。 | 新真实Core回执→Canvas异步创建→metadata保持相同packet；只改child ID即isPageCreationEvidence=false；multi_page及新页/引用/库来源全量和浏览器矩阵。 |
| 草稿与零请求修复 | qualityDraftRepository/qualityDraft及draftExecutionSource保留原来源；手填修复以historicalGuidanceSource/sourceTaskId绑定，不制造本次模型注入回执；自动修复继承原选择、手动修复另有明确一次预算，二者来源都回指设计任务。 | guided_draft_repair、failed_design_drafts_ui及candidate/page_creation_repair；当前完整浏览器修复、零请求和恢复矩阵。预算归属总体审计仍属M3-03。 |
| 会话与只读展示 | history.ts投影允许字段、匹配原请求并保留正确ID/状态；useAIEngineChat读回为historicalGuidance而非可执行workflowContract。丢失来源不补造；坏来源不删除会话正文。 | design_provenance_persistence.test.ts、五状态读回/展示、缺outputProtocol旧记录保持缺失；坏ID不能capture/read；完整浏览器历史查看不增AI调用。 |
| 组装/调用UI | 普通卡使用请求记录条数；assembled显示已组装输入。修复卡分别显示本次组装和非assembled调用输入；没有实际调用回执时不声称注入，0规则但1调用仍正确显示。 | 修复五状态/空调用/全省略、普通历史五状态单测；真实Service资格原子写入挂起→超时→重开均0调用，UI显示尚无实际回执；完成后父ID与修复namespace正确、输入规则匹配。 |

事实规划不接受视觉规则时使用已有PageTaskSnapshot/规划来源，而不是伪造一个空规则调用；其调用数仍由独立应用活动摘要统计。parentTaskId表达设计任务的输入来源，不等于每个显式新操作都重用同一预算；用户主动一次修复的独立预算不能冒充原生成额度续期。

## 本轮结果与边界

- 新增25项：回执3项，普通/重塑档案4项，修复显示7项（含0调用），旧字段兼容1项，坏历史3项，新页1项，候选1项，历史五状态5项。
- 有效首轮35通过/4失败；普通卡扩展36通过/5失败。中间77/1为新测试调用错Store方法，已改实际adoptStagedChange；首轮浏览器旧正文文案定位未同步，保留失败后精确替换，未放宽任何数值断言。
- 当前最终`bun test`2779/0、17827断言、245文件、64.26秒；类型检查/构建通过，Vite2.63秒。最终完整浏览器Chromium/WebKit、移动390/PC1440通过，每引擎pageErrors0/externalRequests0。
- 最终浏览器`evidence/2026-11-01-provenance-visible-ui/result.json`，含实际修复服务的组装/资格保存/重开与完成来源；聚焦初轮`evidence/2026-11-01-provenance-panels/result.json`只证明当时修复卡阶段，最终全套同时验证新的普通卡表述。

至此关闭M3-02当前原范围。M3-03全部协议/预算所有权、M3-04所有运行时schema与旧工程迁移、M3-05完整失效矩阵仍独立验收；不能据当前几个旧格式正例声称全部旧数据都已验收。当前校验是来源与数据一致性，不是对可编辑本地JSON作密码学真实性证明；也不证明Provider收包或模型遵从。未执行真实模型/人评或新增原生跨平台验收，规则仍默认关闭。

可见性收口：原完整浏览器final-ui已通过，但只读取折叠详情DOM文本。最终visible-ui在真实summary点击展开、来源区可见之后核验资格等待/重开和完成状态；已查看WebKit移动截图，明确显示本次组装、尚无实际回执、调用尝试0，未把保留的一次资格当成一次模型调用。最终回归2779/0，专项102/0（572断言），716文件源码SHA256及全部日志在evidence/2026-11-01-provenance/。当前顶层16完成/11待完成。
