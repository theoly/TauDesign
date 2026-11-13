# 本轮实施与验证

本轮完成基础草稿区域修复和部分确定性误报修正，整体专项仍在进行，见 task.md / check.md。

- UI提供最多3个区域及补充文字；实际范围须经原区块校验，无嵌套、无重复且总影响不超过60%。区域生成JSON保留根节点，禁止公共样式、脚本、内嵌媒体和跨区身份，使用配置的模型代理/父预算。修复仅修改私有草稿，合并后仍走完整Pipeline检查和现有候选采纳流程。
- 模型修复不会标为零调用local-edit；没有报告的用量不伪报为0。参考图沿用原冻结解析和输入证明，真正发送前重新校验消息证据。
- 失败新草稿采用新ID并记录来源草稿、指纹、区域及补充要求；源草稿保持。生成异常仍显示诊断，不把失败结果标为已修复。
- 修正旧分区修改草稿修复时的错误分流、wholePage基线恢复、业务规划复用及重复整页合并。
- 新增局部、保护、越界、取消、异步输入冻结及真实Pipeline通过/拒绝测试。最终3758通过、0失败，315文件，23080断言；类型检查通过；生产构建通过（3.33秒）。日志见 evidence/regression。最后补充的区域标签/卡片识别通过11项针对性测试。
- Chromium/WebKit验证入口默认折叠、选择与补充后才启用、点击只提交所选区域参数，未调用模型；证据见 evidence/ui。真实生成合并通过/不通过由编码级Pipeline测试验证，不宣称浏览器中已完成真实Provider整页交付。
- 原工程只读回放见 evidence/sample-replay.jsonl：第一份checkbox不再误报遗漏；第二份依旧指出两处name属性变化。可修复区域见 evidence/available-regions.jsonl。

待完成：一般文案授权、只读字段合同、完整分区职责清单及整套真实样本最终验收。当前不要以本轮测试通过宣称原两份草稿已全部通过或完整方案已完成。

## 只读字段、文案合同与字段职责补充轮

- 新增referenceFieldContract / referenceFieldNames / businessTextEdits / referenceFieldOwnership：派生规则保持图片证据不可变，公共有限同义词单一来源。
- 只读模式只从明确用户要求派生；可见dl/dt/dd或有效readonly原生控件/disabled控件支持只读展示，普通字段仍需关联控件；隐蔽值、空值、可编辑值、readonly无效的checkbox和歧义不能通过。别名、星号与原标签共享同一合同。
- 只编译明确引用的旧→新文案；原节点仍存在时必须在该节点落实，不允许把新文案放到旁处冒充修改。多个同名源节点不自动授权，否定、冲突、空替换不能产生合法编辑合同。
- 参考字段唯一归属按精确标签/有限同义词和验证过的图片来源ID确定；个人图片字段和用户新增同名择偶条件不混合。二者都来自图片且仍歧义时阻断，不凭标题猜测。分区requirements携带字段、组、模式和featureId；复杂规划阶段仍只纠正一次，不提高预算。
- 局部修复资料增加阻断项对应的原始最小片段（24k上限，超出拒绝，不截断），避免模型猜测原控件属性。最终完整门禁保持。
- 本轮最终3763 pass / 0 fail，316文件、23105断言、134.40秒；类型检查0错误；构建通过（3.41秒）。日志：evidence/business-contract-round。较早的重复测试进程出现钩子超时，已终止旧进程，最终独立顺序回归通过，未据此修改应用逻辑。
- 真实工程仅只读：field-modes.jsonl证明4只读、7输入；field-ownership.jsonl证明11字段归入f3/f4且原图证据保持。未调用真实模型重新生成用户工程，也未将上述回放视为完整页面交付通过。

整体专项未完成：非字段完整业务职责、区域语义授权的人机裁决、问题聚合及真实样本最终视觉/Provider验收仍待推进。

## 完整业务职责与诊断聚合轮

- 新增businessInventoryOwnership：从冻结原页枚举文本、控件、媒体及保护项，以稳定清单ID逐项分配到唯一区块。整页SectionedPatch写正文前执行一次有界JSON归属请求；所有区块都需列出，可为空，不得遗漏或重复。空清单由程序直接分配，避免无效空enum请求。超过1200项或12k区块职责拒绝，不静默裁剪。
- 归属调用进入原父预算、来源检查、调用证据及用量累计；不自动续写、不扩权删除。每区保存来源指纹、完整清单指纹及实际项值；恢复逐项重新核对，复用既有职责和完成区块。旧计划无职责时明确展示缺少新回执，不伪造历史证据。
- FailedDraftCard按诊断code聚合，保留实际条目数量和严重度；可展开actual/expected，旧nid未在草稿找到时回溯冻结原页。新增“将保留要求加入局部修复”只补充保守的原文保留要求，仍需用户选择区域并提交，不把模糊改写变成全页权限。源码片段按选中项memo，避免每次渲染重复解析大HTML。
- 自动化新增完整归属、漏项阻止正文、空清单零额外模型调用、职责篡改拒绝与中断恢复测试；现有30k/50k/100k整页、业务丢失/媒体/控件/保护门禁继续通过。
- 最终顺序回归：**3766 pass / 0 fail，317文件、23117断言、138.40秒**；类型检查0错误；生产构建通过（3.94秒）。日志见 `evidence/inventory-round/`。
- 浏览器：`evidence/grouped-ui/result.json` 与两张截图证明Chromium/WebKit中2项同类问题聚合、旧原节点定位、保留要求填入和只提交所选区域通过。测试脚本同目录归档。浏览器这部分不调用Provider。
- 当前应用绑定Provider的合成数据实测：`evidence/live-inventory/result.json` 为7/7项归属，1次代理调用，503输入/57输出token；`evidence/live-inventory-repair-02/result.json` 为归属与独立私有草稿局部修复合计2次代理调用，CTA“保存”补齐，生成质量检查通过，未选区域和源草稿不变，模型deepseek-v4.1-flash-1017，绑定未改。修复单次404输入/59输出token。均无用户工程数据、无浏览器直连Provider；不据此保证所有真实页面一次成功。
- 首次联合实测的失败报告保留在 `evidence/live-inventory-repair/result.json`：验证脚本错误地把注入nid前的fixture与注入后的草稿比较，造成外区不相等；改为对实际冻结草稿快照比较后通过。此次纠正仅修改验证脚本，未放宽产品门禁。
- 用户两份真实失败草稿只读统计见 `evidence/business-inventory-samples.jsonl`：各66项（22文本、22控件、22媒体），来源基线仍匹配；未发送工程内容到Provider，也未覆盖或采纳草稿。

仍未完成：模糊区域文案改写的逐项人机授权、两份用户原始页面完整修复后的设备视觉与最终验收。业务清单唯一归属证明覆盖与追溯，不自动证明模型的语义分区正确；合并后原有整页安全、业务和渲染门禁保持。

## 歧义文案逐项裁决轮

- 新增businessTextReview合同及卡片入口：展示完整原文，用户在所选区域中指定唯一非交互目标文本，填写新文字后显式勾选。最多8项、每项原文/新文字400字符，超额不截断。改文字/目标清除旧勾选，切换草稿重置未提交内容，取消区域或重复目标禁用提交。无稳定身份、多段复杂文本、控件/标签/操作、隐藏与保护内容不开放此授权。
- 确认记录绑定原页、原草稿和源/目标/区域节点，进入现有局部修复请求、任务合同与失败新版本。原请求/规划/图片观察不改写。保存恢复和候选复验逐项检查来源及实际新文案，未授权原文保持，原有明确要求冲突及表单/操作门禁仍阻断。节点索引用Map一次构建，避免对大草稿逐节点全表扫描。
- 接入真实渲染观察，指定新文案不仅需在源码正确，还需完整绘制。CSS隐藏、透明产生missing阻断；裁切/不支持的复杂变换产生unverified阻断，不把测量不确定性视为通过。
- 新增6项合同/渲染/候选测试及1项完整Pipeline测试，覆盖伪造旧文案、歧义源/重复目标、空值/超额、隐藏/交互/保护、错区域、原页变化、目标缺失或旁处复制、新失败存档、重开再次修复及候选采纳检查。
- 第一次针对回归发现分区旧草稿局部修复丢失冻结pageWriteStrategy，造成相同来源误判上下文变化；接回原写入模式后整页分区→失败→逐项确认→单区域修复→新失败重开→再次修复→候选复验通过。既有原页/模型变化仍拒绝。
- 首轮全量3771通过/1失败，旧补挂测试在实际挂载出现后、整轮异步保存完成前就移除页面并点击仍禁用的补挂按钮。单独重跑通过但不作为最终验收；改为等待实际整轮完成和挂载并逐步flush React，保留原断言。调试时在单个act中等待DOM提交会阻塞该提交的失败日志也保留，未放宽产品行为。
- **最终按序：pnpm test 3773 pass / 0 fail，318文件、23174断言、147.75秒；pnpm run type-check通过；pnpm build通过（3.79秒）。** 完整日志与前述失败日志见evidence/text-review-round。
- Chromium/WebKit：界面选择、显式勾选、改字取消勾选、选区失配阻断、只提交已确认项、新草稿清空均通过；各验证正常/CSS隐藏/透明/裁切/变换五种实际iframe状态。记录、截图、脚本见evidence/text-review-ui。UI验证未调用模型。
- 当前绑定模型deepseek-v4.1-flash-1017：evidence/text-review-live为一次合成修复验证；evidence/text-review-live-02补齐实际PageRenderCheck iframe验收，一次代理请求、508输入/56输出token、1.568秒，实际新文案匹配、原草稿与未选区不变、渲染complete且无问题，绑定未改、无直连、无用户工程内容。两个实测分别留痕，不混算成只调用一次。
- 两份实际失败草稿仅只读检查：每份4条原文符合逐项确认条件，候选文本分别24/26处；未自动作出源/目标对应决定、未发送给模型、未覆盖工程。统计与回放脚本见evidence/text-review-round/real-sample-eligibility.jsonl。

本轮完成唯一非交互文案的逐项人机裁决；复杂节点继续要求保留原文或重新明确要求，不授予全区改写/删除权限。**仍未完成的是两份用户原始页面实际修复后的最终视觉与采纳验收**，不能用合成测试结果代替。语义对应由用户明确选择，代码核对来源、范围和落实，不宣称自动证明文案语义等价。

## 2026-11-13 两份真实草稿修复与评阅交付

本轮补齐上节尚缺的真实样本隔离修复与自动渲染检查；人工评阅和是否采纳仍待用户决定。

- 新增inlineFormContract：仅从明确用户语句派生命名任务→内联表单的字段清单，以及进度摘要新计数；引用块、代码围栏、否定/疑问/示例不授予转换权限。计数替换要求唯一原计数及明确合法的新分数；命名旧入口唯一且对应完整原生表单真实形成，才替代其旧“去完成”提示。多个独立完整分组仍为歧义，嵌套同一组按最小完整分组去重；正文/只读/原控件规则及其他业务保持原门禁。
- 派生合同同时进入新业务规划实际请求与代码System Prompt，要求原生label关联、控件类型、明确只读信息及当前分区职责。旧规划和原图片观察保持原字节/身份，不伪造重新规划或扩权。输出仍静态与实际渲染两次验证，提示优化不保证模型一次成功。
- 真实来源暴露的匹配错误：用户已授权删除的内嵌“保存”原先先占用了重建主按钮，造成真正主CTA被误报移除；现在在候选消费前排除已授权删除项，业务文本检查也只统计未删除的主操作。具名icon-mask进入实际可见图标检查；零尺寸/无名称仍拒绝。折叠details的非summary后代按原生未激活状态排除，展开后恢复裁切与操作测量。
- 两份副本采用本地DOM操作：恢复未授权丢失的原标题/说明/关闭入口/微信待填写状态，保留已确认的8/14摘要和“保存并完善”；实名四项改为带锁图标的dt/dd；基础资料与择偶要求按钮行改为关联的原生输入，补齐学历/收入/职业；恢复原微信input与checkbox身份/属性；恢复第二份被擅改的择偶分组标题。修正左右留白、轻边框和重复底栏，未重新生成整页，未调用Provider、未写入原工程。
- 独立媒体22份复制到证据目录，引用保持外部路径。新节点用确定性8位身份并防重，原节点按保留/恢复策略处理。`source-integrity.json`校验project.json、原页、两份旧草稿及22个资产共26份文件SHA-256前后相同。`context.json`仅是只读验收资料，不伪造新SavedQualityDraft、任务或用户采纳记录。
- 原始副本与修复副本均通过真实项目Token/390×844设备在Chromium/WebKit渲染，8个前后环境结果记录在`evidence/real-samples/2026-11-13/render-result.json`。修复后4项readonly、原生输入可实际填写，静态和渲染均无阻断；无横向溢出或裁切提示。A长图Chromium2743/WebKit2727px，B为2313/2299px；差异来自实际引擎排版，不填充伪高度。
- 剩余提示：静态记录主CTA文案按已确认要求变化；渲染A有55处、B有54处渐变背景对比度未被算法精确验证，均保持为人工核对，不宣称零提示或自动证明所有像素可读。所有外网/模型请求阻断，资源加载无缺失。
- 直接file打开SVG mask会被浏览器文件跨域策略拦截，因此完整评阅页默认使用双浏览器已验证的外置PNG长图，实时HTML通过127.0.0.1:5197读取独立资源，不改为base64。离线评阅页4张图在Chromium/WebKit均验证完整，HTTP表单预览固定390px且可填写；证据见`review-check.json`。旧空白预览式交付未复用。
- 本轮236项针对测试通过；**最终依序pnpm test：3780 pass / 0 fail，319文件、23216断言、132.80秒；pnpm run type-check通过；pnpm build通过（3.35秒）**。日志见`evidence/real-sample-round/`。
- 可评阅入口：`evidence/real-samples/2026-11-13/review.html`，内含两份真实草稿的前后长图、独立HTML、本地来源与自动报告。修复、浏览器验证、评阅构建与加载检查脚本同目录归档，媒体均保持文件分离。

交付边界：本轮本地DOM修复及静态/双浏览器验证完成，应用交付链见后续补充记录；人工评阅未发生；用户原工程未应用/采纳。前轮Provider合成验证继续独立保留，本轮确定性修复没有模型调用，不能描述成真实模型重新生成了用户页面。

## 2026-11-13 子智能体协作与应用交付复验

- 分工：整页结构授权、恢复记录结算排查、真实副本产品导出、独立证据审计；主智能体整合与最终回归。
- 整页候选遗漏来源授权已修复：复算原页完整清单、来源与基线指纹、保护范围及设备，核对唯一screen范围和modify/candidate-copy，再传递结构重排权限。新增23项专项用例，相关两组119项增量通过；局部、业务、表单、媒体、保护与外链门禁保持。
- 恢复任务的draft误判来自浏览器测试提前读取Promise结果；生产完成记录没有Undo/Redo回退。测试改为有界轮询实际异步仓库结果，保存并loadProjectById重开，核对任务manifest、Applied交付记录、指纹及实际正文。无需修改任务仓库或History生产逻辑。
- 普通8/8场景（4采纳、4不安全媒体拒绝）、恢复4/4场景，均覆盖Chromium/WebKit×mobile/PC；8次采纳均ready且无额外结构确认，Undo/Redo和重开正文一致、任务completed及delivery有效；恢复保留原blocked任务。详见evidence/application-delivery/{redesign,recovery}/results.json。旧failure.json为已纠正的历史记录，不作为当前结果。
- 上述是合成内容与受控模型输出的真实ChatDrawer/InfiniteCanvas链路，不是用户工程经真实Provider重新生成，也不代替原生桌面或其他系统验收。
- 独立只读审计已复核普通/恢复证据；评阅页HTTP证明已补入review-check.json：两浏览器×A/B宽390px、18个输入、实际填写并恢复，资源失败/外网请求均0。离线4张PNG完整加载。
- **本轮最终按序：pnpm test 3803 pass / 0 fail，320文件、23268断言、141.90秒；pnpm run type-check通过；pnpm build通过（3.82秒）。** 日志见evidence/application-delivery/final-regression。测试日志含既有React act提示，未据此宣称零运行警告。
- 用户已回复“需要调整”，已补充以B为基础，缩小字段行距、增加输入边界、实名四项统一外框、标签与输入列统一对齐；新建隔离修订版复查。当前副本不标记人工认可，不覆盖用户原工程。

### 实际产品导出补充

两份本地修复副本在Chromium/WebKit各完成1次完整隔离交付，4/4通过：候选保存并重开、实际工具栏采纳、Undo/Redo精确还原、采纳工程保存重开；新建本地合同，不复用旧模型回执，不写原工程。通过实际ExportModal下载HTML/PNG，输出文件及SHA-256见real-samples/2026-11-13/delivery/result.json。

- HTML独立离线宽390px，昵称实际填写并恢复，姓名/性别/生日/民族四项只读，保存并完善及稍后再说均保留；A17/B14个SVG mask在导出产物中全部解码成功，默认微信壳不包含。页面中的照片区原本是占位块，未伪报实际照片。
- PNG实际使用浏览器foreign-object兼容引擎，并非截图，也不宣称原生导出已验收；宽390px，Chromium A2744/B2313px，WebKit A2727/B2299px。构建文档包含92px微信壳，实际PNG相对无壳HTML高度差为92px（Chromium A受测量舍入为93px）。导出长图人工核对图标、正文、主次按钮及顶部壳可见。
- 模型调用0、阻断外网请求0、致命pageerror0；WebKit两项ResizeObserver提示单列browserWarnings，未隐去。此次检查24份来源文件哈希保持，与上轮26份来源完整性核对分开记录，不宣称逐一核对整个原工程。
- 增强验收曾遇到一次快速重开时媒体服务注册失败、渲染pending；失败证据保留，正独立核对是否产品竞态或测试环境因素，不能因正式4/4通过就抹去该边界。

## 用户反馈B版修订与最终交付

用户明确选择B方向，要求收紧行距、增加输入指示、实名四项单一外框并统一所有标签/输入对齐。新增form_layout_refinement智能体只修改b-refined隔离副本，保留189个节点的tag、除class/style外全部原属性和直接文本；未修改应用src、旧A/B或原工程。原B输入指示消失的具体原因是颜色Token `--color-border`被用于border-width/style，两个浏览器计算为0px/none；新版明确宽度/线型，仅颜色使用`--color-control-border`，实际1px/solid。

- 21行均52px，label起点x34、输入/值x174，Chromium/WebKit列偏差0；17个原生文本输入逐一填写并还原，微信checkbox切换还原，4项实名保持只读，外框统一、内部三条分隔。没有横向溢出。两浏览器总高均比旧B减少120px。
- 静态安全/质量及实际渲染complete/error0；保留54项渐变对比度未精确验证提示，不代替人工可读性判断。14个图标有实际可见尺寸，添加照片mask有非空像素；22份资产仍为独立文件。源工程26份选定文件SHA-256保持。
- 新B真实隔离候选→持久化重开→工具栏采纳→Undo/Redo→保存重开→实际ExportModal HTML/PNG，两浏览器2/2通过，模型0/外网0；产品PNG分别390×2193及390×2179。原生桌面PNG不在此次证据内。root再次独立核验新B及原A/B全部12个实际导出文件SHA-256。
- 复查入口：`evidence/real-samples/2026-11-13/b-refined/comparison.html`（外置PNG离线比较）；实时HTML使用同目录live-comparison.html的本机HTTP入口。字段、原CSS计算值、输入与对齐证据详见summary.json/report.md，产品导出详见delivery-b-refined/result.json。
- 新B未修改生产代码，未重复已经按序通过的3803/0全量、类型及构建；新增的副本、HTML夹具与验证脚本均已实际执行。当前待用户最终视觉复查，不将其视为自动认可或原工程已采纳。

### 快速导航媒体服务调查结论

独立合成纯SW对照route on/off均记录旧URL注册被导航取消（TypeError/HTTP200），新URL产品createMediaResourceSession均得到controller/active注册及HTTP200独立SVG、naturalWidth24，零新文档错误/外网。因此不能把已复现的旧文档取消当成新文档资源失败。首次对照context.close挂起及其真实stdout结果、超时边界均如实注明于delivery/media-worker-navigation.json；未伪装成完整进程正常结束。早期Chromium活跃页面资源失败没有稳定复现，没有改生产媒体服务，也不宣称其根因已修复；历史失败保留供后续有可复现条件时排查。正式旧A/B4/4及新B2/2通过仅证明所记录流程，不证明所有快速导航/平台均无风险。

## B版实名外框padding局部修订

按用户追加反馈在新b-padded副本处理：实名统一外框四侧12px padding；其余字段行同步左右留白，标签列116px、gap12px，21行label x46/value x174、两浏览器偏差0，保持原值列位置。行高继续52px；最长标签Chromium112px/WebKit107.37px均容于116px，无裁切或横溢。189节点身份、非样式属性、直接文本及控件值保持，17输入逐一填写还原/checkbox还原/4只读通过。静态与双浏览器实际渲染complete/error0，54条原有渐变对比度未验证提示保持。

新b-padded通过实际候选持久化→重开→门禁ready→采纳→Undo/Redo→保存重开→ExportModal实际下载，Chromium/WebKit2/2。产品foreign-object PNG为390×2217及390×2203；HTML无微信壳、PNG含92px壳，离线输入/4只读/14个SVG mask通过。此交付轮模型/外网/pageerror/browserWarning均0（与独立渲染报告54条对比度提示是不同口径），26选定源文件SHA-256保持。root独立复核4个真实导出文件哈希。证据分别b-padded/summary.json、report.md及delivery-b-padded/result.json。

本次仅证据副本和执行过的验证脚本变化，无生产源码变化；不重复既有3803/0全量→类型→构建结果。最新复查入口b-padded/comparison.html；原B及b-refined保留，原工程未覆盖，新版仍待用户视觉认可。

## 用户确认后的应用级收尾（视频排除）

用户明确确认最新b-padded可接受，人工视觉评阅通过。按后续指令继续剩余技术任务，并将视频样本排除本轮；此前已生成的短视频仅保留excluded历史，没有执行视频播放或导出验收，不据此改变产品既有视频支持。原工程不自动采纳或覆盖。

### 媒体恢复

mediaResourceSession仅对明确浏览器传输故障最多自动重试一次；服务拒绝、权限及native失败不自动重试。注册在发送前登记lease，超时/迟到注册可释放，close幂等，失败pending可重读；hook失败关闭会话且仅当前key可返回资源摘要。画布及ExportModal有显式重读入口，候选重试先更新render key，加载/失败时不能沿用旧ready证明，不自动再次导出或改业务HTML。

47项针对测试通过，真实SW双浏览器automatic/manual/cancel/ack共8/8通过；均实际解码64px外链图、校验当前资源hash和渲染complete，卸载缓存归零、源HTML/History不变。证据evidence/media-recovery/results.json、unit.log。此为受控故障恢复证明，历史单次Chromium活跃页面失败未完全复现，不能宣称找到全部偶发原因。

### 通用表单与类型错误防护

同一FORM规则接入新建/整页及element/local/region/draft四条局部修改的实际system请求；作用范围限定授权子树，不扩大JSON Schema、单次预算或调用次数。指导支持边框/下划线/有效填充等合法形式、只读分组Token内距、共享列及长标签完整呈现；按设备/Token密度，不把B的52px/12px做全局强制值。指南doc/ui-design-guidance/guide.md已同步。

静态css_token_property_type只阻断可证明的颜色→边宽/线型错误；未知变量、条件、外链、typed变量及可能胜出的级联/inline/shorthand/!important/all保守处理，基线已有同项降为warning避免范围外逼改。实际输入指示、只读组贴边、列错位是warning，不自动改页或阻断采纳。独立审计曾发现条件/跨块/important覆盖误报，已打回修复；旧B先合法shorthand再错误longhand仍检出2项，不能为减少误报把真实错误全跳过。

最终7个直接套件92/0、1484断言，类型检查通过；Chromium/WebKit40场景包括合法覆盖1px/2px solid与原B0px/none的真实computed证据，归档evidence/form-presentation-final/result.json。标准无附件PC create fixture实际11897字符，既有10000~12000阈值不变。首轮全量3840/3失败均为提示词超12527字符；失败日志保留于evidence/closeout-regression/first-failed-tests.log，压缩规则与重复措辞而未提高阈值。

### 真实照片与本机原生导出

系统Big Sur Coastline壁纸缩略图转换为356×356 PNG（196523bytes）作为非私人照片样本，不访问用户相册、不外发。浏览器真实候选/持久化重开/采纳/History/ExportModal HTML及PNG双引擎2/2通过；运行独立URL、存盘与离线HTML解码SHA一致，工程/History未嵌入图片原文。实际foreign-object PNG为390×668及390×662，照片64点平均绝对误差5.54/6.38，照片/图注/CTA/微信壳完整。证据evidence/media-delivery/result.json；两次测试等待/短页viewport高度断言误用已保留为历史，未放宽门禁或改变产品高度。

本机真实Tauri/Rust IPC在新/tmp工程中保存并退出，再起独立进程重开（没有mock native API）。首轮PDF的B图标有黑色方块，即使文件、尺寸、照片像素检查通过，人工检查仍打回；round-01/visual-review.json为failed。修正pngExporter：导入页及实际.icon-mask/自定义mask声明使用WebView snapshot，未使用mask的普通页保留PDF；只读检测包含CSS注释，不改原HTML/资源。新增11个引擎路由/回退用例，高保真联合25项通过；直接调用方回归另留日志。

最终round-03保存/进程重开共4张真实原生PNG：B native-webview-snapshot 390×2203，照片native-webview-pdf 390×844；14图标异常黑像素0且保留正确前景像素，照片64点平均误差5.36。12个HTML/render/PNG文件SHA及sourceInputs由root独立复核，26份指定原工程来源不变。regression-pixels.json对真实旧PDF和新快照反例再次核验，能检出旧问题且新14图标通过。原生结果与浏览器照片测试使用不同测试页/主题，不宣称它们整页逐像素等价。最终源码及文件证据evidence/native-photo/round-03/result.json。

独立只读审计最终未发现阻断缺陷；审计区分了合成调用、确定性副本、浏览器兼容和真实native结果，未代替用户作审美批准。最终统一全量/类型/构建见下节，尚未在本条先行宣称通过。

### 最终统一回归与验收结论

- `pnpm test`：**3847 pass / 0 fail**，324文件、23483断言、123.05秒。
- `pnpm run type-check`：通过，0类型错误。
- `pnpm build`：通过，Vite 1980模块，3.46秒。
- 定向`git diff --check`通过（非git提交任务）；全量日志中的已有React act和受控失败输出不冒称零运行警告。
- 当前源码原生round-03的sourceInputs与12个实际导出文件摘要再次独立核对，26份指定原工程来源不变；媒体47单测/8真SW、表单92直接/40浏览器、照片2真实浏览器交付及4张真实native PNG证据均已归档。
- 最新b-padded视觉已由用户确认接受；本轮没有再请求重复确认，没有覆盖原工程。视频样本按用户新范围排除，不计为缺口或通过。

**ACCEPTANCE：本轮约定范围通过。** 已完成媒体故障恢复与可操作失败、通用表单约束/诊断、照片及macOS原生PNG验证和回归。历史单次Chromium错误的全部诱因未被稳定复现；受控故障的恢复能力已证明，不能据此承诺任何环境都无偶发。Windows/Linux和视频不在本轮验收范围，原工程采纳及git提交不自动执行。

最终日志：evidence/closeout-regression/final-tests.log、final-types.log、final-build.log。首轮失败日志及原生round-01视觉失败分别保留，不与最终通过混用。

## 继续：有界自然快速重开排查

清单完成后，针对唯一保留的历史Chromium异常做进一步有界复现。新增scripts/verify-media-reopen.py，复用现有真实照片/候选画布，不修改生产代码、不注入失败、不读取原工程、不采纳/导出，也不处理视频。

最终round-02覆盖双浏览器×注册/图像挂载时导航×冷重开/reload/goto/替换标签，共16个当前文档检查点；全部ready/complete，照片解码356px且SHA保持、原业务HTML相同、History0/0，缓存仅当前2资源，旧URL0，无AI/外网/手动重试。初轮round-01保留；第二轮只增加身份/时间线/History证据，不叠加宣传成32种独立场景。

WebKit两条注册access-control错误保留在原始result.json（status仍passed-with-browser-errors）。classification.json核对其发生于请求导航后、新文档提交前，注册拒绝事件属于同一旧文档UUID；随后新UUID候选取得ready。此结果只能把本次旧文档取消与当前加载失败区分，未复现历史Chromium持续错误，不宣称所有诱因已查清。

新增脚本已实际执行、源摘要再次核验匹配当前文件；定向diff检查通过。生产代码未改变，按照“新失败/改动才重复回归”的原则，不重复上轮已通过3847测试、type-check和build。证据evidence/media-reopen/round-02/result.json与classification.json；本轮没有新的需修复生产缺陷。

## 用户要求子智能体完成剩余事项：诊断与原工程应用

用户在列明“历史诱因、暂缓视频、B原工程未应用”后要求子智能体完成。采用media_root_cause、apply_accepted_b、delivery_final_audit三项分工；视频仍遵循更明确的暂缓指令。此次原工程采纳授权来自本轮要求及此前B认可，不从旧context的task/Provider/图片回执取得权限。

### 媒体：历史证据与可采证能力

历史大失败JSON只有render pending、无底层name/cause/阶段/controller/文档时间线；另几项失败属于测试API误用。该证据不足证明具体诱因，因此没有继续无限自然重载或宣称根因已修。新增仅内存≤200事件的mediaDiagnostics及错误区共用导出按钮，记录匿名doc/session、允许的内部screenId、usage/scope、阶段/attempt/耗时/有限状态、白名单错误名和最多2层cause名；自定义ID省略。无message/完整stack/URL/path/HTML/图片/凭据，无自动持久化或上报。用户点击“导出资源诊断”才调用原saveExportFile；保存/取消/失败有反馈。原worker/超时/2-attempt/lease策略不改，最小集成diff独立核对。

40项直接测试/275断言通过，含恶意message/stack/base64/URL、未知字段和枚举不能流出、200上限、getter安全、保存/取消/失败与取消卸载。Chromium/WebKit共4实际SW检查通过，实际下载脱敏JSON，注册/释放ack及缓存归零、模型0/外网0，证据media-diagnostics/round-01及final目录；专项media-diagnostics.md。该功能提升后续定位能力，不冒充历史错误修复。

### 原工程：全备份、演练、实际应用

核验原目标e5424880…78ce、认可B273470321a56eab7e8222579d726f099ee81a52f811017195fd8c96ff7b1a038、设计系统/settings及22引用资产均匹配。原工程含680文件/10,586,175bytes、94个screen目录文件及516已有asset，不能只核manifest32页/22登记资产。原candidates/current.json不存在，无覆盖其它待采纳候选。完整备份到/private/tmp并复制到本仓库忽略目录evidence/accepted-b-application/backup/project，680逐文件SHA独立验证；备份本体不作演练。

演练01的32页InfiniteCanvas仅7门passed、render pending，缺DOM/LOD/iframe等数据，不能证明远坐标就是原因，也未采纳；保留failed。演练02改为只挂实际生产ScreenFrame原目标+候选，因HMR仍只记诊断成功。干净03两进程通过后才在最终回归完成且root执行信号下对原工程运行original-01。验收诚实限定target-only生产Frame，并非声称32页Canvas pending原因已解决。

原工程由ProjectRepository.load新authoring session、新task/candidate、当前原业务inventory与本地html-import执行说明完成；真实iframe自然回报、当前render key/资源证明8门ready/complete。adoptStagedChange走History及CAS原子发布，不直接替换文件、不手填complete、不使用旧回执。fresh task design-mwexhnm8-o5tiqkd2、candidate-2831de48-7ebd-4ae0-ac5f-c519a7090a08、delivery-mwexhp0j-ee5ecdcc-2de4-43bc-ac7c-2a4705fc6f88在真实原盘Applied/commit逐项一致。B预览native-webview-snapshot ready390×844，54条既有渐变提示未改为机器零警告。

新进程重开同一交付，Undo精确恢复e542…78ce，Redo精确恢复273470…1a038并保存；最终原盘保持B。History154→155，旧154past逐项前缀完整，checkpoint25→26且旧25内容/顺序保留。完整680基线对照只改history.json、project.json、目标HTML，新增本轮delivery JSON及独立预览PNG，0删除；project语义只savedAt/publicationCommits改变，32页位置/metadata/Token/settings/asset元数据一致，其它93 screen文件及516已有asset字节不变。最终原盘682文件，两份完整备份680文件均原样，模型调用0。独立审计已逐文件和新交付链复核通过。

### 最终回归

**pnpm test：3855 pass / 0 fail，325文件、23561断言、122.44秒；pnpm run type-check通过；pnpm build通过（1982模块、3.18秒）。** 按序执行，日志accepted-b-application/regression。源码冻结后才实际应用原工程；应用脚本及夹具与演练/最终回归时SHA相同。定向diff --check通过，未重复已验证的其它大范围试跑；视频没有进入验收。

本轮交付通过：B已应用原工程且可撤销、备份可恢复，媒体诊断能力已就绪。历史Chromium具体诱因及演练01整画布pending原因仍未被稳定查明，不作虚假闭环。实际变更和恢复说明见evidence/accepted-b-application/report.md。
