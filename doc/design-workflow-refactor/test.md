# 验证记录

## 2026-10-26 最终交付记录复核

本次只更新文档。当前286个生产/验证文件与`f639b480d6da3bcb3adaf8decca392a539a569e30d3cf506aff2b6041d854319`冻结源逐项相同；核对最新42个矩阵条目、各自报告状态及日志文件，全部通过且无缺失。已归档2,106单测/类型检查/构建仍见[大页面报告](../large-page-generation/test.md)，没有将历史结果冒称本次重跑。交付导航链接和PC01占位页状态另行只读核对。[完整范围与遗留项](./closeout.md)、[机器核对结果](./evidence/closeout-2026-10-26.json)。无生产代码变更，无新增模型调用。

## 2026-10-25 交付提交前资源读取

- 三种候选采纳均复现档案prepare后图片删除仍返回true（原9项通过、新3项失败），现统一在预览/档案后真实读取并复核文件与库，缺失保留原页/候选/History、中止档案。共享画布资源解析，补齐新建/导入、多页/方案、重塑及无实例组件模板的图片/字体/L4读取。仅字体候选可在后台未完成时保存本次1页实际路径证据。
- 新增20项，相关6套 **187/0、643断言、3.31s**。故障/恢复、读取异常、伪URL/转义、字体早晚消失、源与结构不变、后台未完成和跨页均覆盖。
- 最终顺序全量 **2,078/0、13,278断言、176文件、35.54s** → type-check退出0 → build退出0（Vite2.44s，主JS1,319.93kB/gzip415.44kB）。19入口×双引擎 **38/38**，2026-10-25T18:37:54+0800—2026-10-25T18:40:24+0800。新入口两引擎各6个真实iframe/画布/存储/History故障与恢复；初次WebKit夹具过早覆盖画布报告导致37/38，改为等待实际ready后通过，生产守卫不放宽，原失败日志留存。
- 当前指纹 `6f99b09f7ecf88f46f5a8b03f83b1682a20c3a16d71076bada6efa3983d6eeb4`（含Rust的扩展范围）。Vite119ms，Tauri6.98s并Running target/debug/app，本轮原生仅启动；相关进程已关闭。**本增量 ACCEPTANCE: PASS**。[报告](./evidence/resource-final/report.md)、[当前矩阵](./evidence/resource-final/matrix/report.json)。未调用线上模型，读取不代替视觉/语义，不伪称跨文件系统原子或原生文件链路重跑。

## 2026-10-25 原生AI流UTF-8完整性

- 真实Rust代理按每个HTTP分片独立有损解码，会破坏跨片中文/emoji；原生WKWebView/AIService/Rust/Channel实际复现4协议8项正常文字/JSON损坏，JSON可解析并不能发现。增加增量解码器，保留最多3个未完成字节，正常EOF处理尾部、网络错误仍报Error。
- 同12份响应wire SHA256前后一致，最终原生 **12/12通过，损坏8→0**；HTTP503与在半个中文处断流 **2/2真实原生通过**，浏览器AI fetch为0。模型为本地loopback夹具，未模拟IPC，不调用线上Provider，不写用户工程。[完整证据](./evidence/native-utf8/report.md)。
- Rust新4项边界测试，全部lib **22/0**；按序前端全量 **2,058/0、13,197断言、175文件、32.27s** → type-check退出0 → build退出0（Vite2.84s、主JS1,317.71kB/gzip415.01kB）。现有18入口×两引擎 **36/36**，2026-10-25T17:20:41+0800—2026-10-25T17:23:00+0800，源码一致。
- 指纹 `099837066ec9f9b845fa97684c170204b43564c3b74ba8600be159ee9a15bb36`（本轮扩为含Rust源文件/Cargo.toml/Tauri配置，旧前端指纹不直接比较）。Vite78ms、最终Tauri编译2.86s并实际请求14项；相关进程已关闭、ps核对无残留。macOS15.7.3、Rust/Cargo1.99.1、Bun1.3.5。无原生截图、不代表工程IO重跑或线上模型/其他平台；**本增量 ACCEPTANCE: PASS**。

## 2026-10-25 同一页面多方案比较

- 补齐原方案的多方案入口：明确生成同页2～4个备选先确认名称、共同功能与差异，全部通过后并排新增同组副本，一个History动作。保留原页与Token，各方案使用同一原页参考，不自动替换或评选优胜。元素局改优先，问题/主题/页面内套餐内容不误判；不支持多业务页同时多方案，明确提示拆分。
- 新增34项；相关4套 **106 pass / 0 fail / 354 assertions / 2.54s**。首轮2个测试断言错误保留日志并修正，未放宽门禁。直接单页降级、超限/少计划、方案交叉关联、取消/第二项失败/迟到/过期、重复确认、Undo/Redo和存盘重开均覆盖。
- 严格顺序全量 **2,058 pass / 0 fail / 13,197 assertions / 175 files / 32.93s**，随后type-check退出0，build退出0；Vite2.73s、主JS1,317.71kB/gzip415.01kB。18入口×双引擎 **36/36**，时间2026-10-25T16:41:16+0800—2026-10-25T16:43:33+0800，源码前后相同；新入口真实UI与独立iframe验证，人工核对确认表单和并排截图。
- 指纹 `2445341047c67be129863448c26506a1e160d448bb2cb51b08cfd02e0d14761a`。[详细报告](./evidence/page-variants/report.md)、[当前矩阵](./evidence/page-variants/matrix/report.json)。Vite ready83ms，Tauri dev0.47s并Running target/debug/app；本轮原生仅启动，两进程停止并ps核对无残留。**本增量 ACCEPTANCE: PASS**；本地模型夹具，不证明在线模型、语义完整、复杂真实PC或其他桌面平台。

## 2026-10-25 结构化输出结束门禁

- 修复`generateObject`只按JSON.parse成功判断完成的漏洞，通用JSON和一次样式修复共用结束检查。完整闭合JSON若触及上限/过滤/工具调用/未知异常仍拒绝，不续写JSON、不部分执行、不扩成整页；等待文本及结束元数据均可取消，连接恢复不当作正常结构化结果。
- 实际AIService与引擎回退SSE解析器同步保留Anthropic stop_reason、Ollama done_reason，OpenAI/Gemini值保留；内核不让后续正常stop/end_turn覆盖异常。缺结束元数据的旧适配仍兼容，不伪造完整性证明；网络/请求仍经原Rust或Vite代理。
- 新增35项，相关五套 **109 pass / 0 fail / 385 assertions / 630ms**。两引擎分别执行4协议×正常/截断8例，再从真实iframe测量控件错误、以过滤JSON阻断一次修复；每引擎9个本地响应夹具请求，0外发请求/0pageerror，设计数据/候选/History不变。运行态measuredHeight单独排除，其他字段严格比较。
- 首轮104/5为夹具首次遗漏合同造成taskId不同，原首请求均已正确拒绝；修正同一合同复验。浏览器首轮仅measuredHeight变化导致误判，诊断留存后修正测试快照；生产门禁未放宽。全部失败与诊断日志保留。
- 当前源码17入口×两浏览器 **34/34通过**，源码前后一致。严格顺序全量 **2,024 pass / 0 fail / 13,087 assertions / 175 files / 31.78s**；type-check退出0；build退出0，Vite2.42s，主JS1,311.06kB/gzip412.87kB。Vite5174 ready83ms，Tauri dev0.45s并Running target/debug/app，仅启动；会话30901/20655关闭后ps核对无残留。
- 指纹 `02dc738ab3a71f66da8f227d96789d007cf3f9fe7dd7652faf9674ec513437da`。[详细报告](./evidence/structured-output-end/report.md)、[机器汇总](./evidence/structured-output-end/report.json)、[当前矩阵](./evidence/structured-output-end/matrix/report.json)。**本增量 ACCEPTANCE: PASS**。协议为本地字节夹具，未调用真实Provider或重跑原生代理完整链路；缺失结束元数据的适配和模型语义遗漏不能凭该门禁证明完整，既有真实复杂PC/在线模型/其他平台边界保留。

## 2026-10-25 旧移动页顶部与装饰裁切修复

- 已修复真实旧页的两个顶部识别缺口：无status-bar类的首部纯时钟/系统图标行、顶部前的显式隐藏单选状态控件。仅跳过明确非视觉节点；邻接导航/位置/结构证据不足时保留，纯span导航标题可提取。PC不清理，自定义保留作者导航，业务/底栏/隐藏CSS状态保留。
- 装饰误报根因是读取旋转块裁切前外框。只对空、无语义叶子计算可信祖先水平裁切，未扩大2px容差、改样式或全页隐藏overflow。文字/媒体/操作/具名节点、固定定位/逃逸绝对定位/复杂变换/真正越界仍警告。两引擎真实充值共享PNG文档390×906，**每引擎353,340个RGB像素比较0变化**；之前所谓2px警告在本次环境实际300.010–397.990px、裁切父卡片16–374px，按各环境原值留存。
- 两个真实旧页修复前均能复现作者状态栏/导航各1，修复后各0、微信外壳各1；业务nid无额外删除，活动页3个radio与选中状态/显示面板保留。HTML/PNG共享文档规则一致，PC原文不变，自定义作者导航保留，源4输入哈希不变。读取/测量旧页不重写存储正文；显式编辑一次History可撤销恢复原HTML。真实前/后目录分开，未覆写基准。
- 新增16项，三套相关 **72 pass / 0 fail / 190 assertions / 3.61s**。新只读脚本两引擎真实输入、7种实际几何反例均通过，pageerror=0；当前版本另完整执行17入口×2引擎 **34/34通过**，源码指纹前后一致。测试使用各脚本声明的本地夹具，未调用在线AI。
- 按序全量 **1,989 pass / 0 fail / 13,001 assertions / 174 files / 30.92s**；随后type-check退出0；随后build退出0，Vite2.75s，主JS1,309.52kB/gzip412.34kB。Vite5174 ready108ms，Tauri dev0.48s并Running target/debug/app，**本轮原生仅启动**。会话13825和78712退出后ps核对无残留。
- 当前源码指纹 `a68a643229f2b4c87c0ce61e1f5d2e0827a5afebd6fd504d16cad5356e8c50c4`。[详细验收/前后截图](./evidence/mobile-chrome-geometry/report.md)、[机器汇总](./evidence/mobile-chrome-geometry/report.json)、[本轮34项矩阵](./evidence/mobile-chrome-geometry/matrix/report.json)。人工复核两页WebKit后图：一套顶部、业务CTA保留；源活动页“切换活动”仍有旧窄宽换行，未擅自优化业务布局。
- **本增量 ACCEPTANCE: PASS**。本轮是共享iframe/HTML/PNG文档与像素检查，未重新执行原生保存/光栅化完整链路；复杂真实PC、在线Provider和其他平台的边界继续保留。下方历史未处理项已由本节补齐，不删除其原记录。

## 2026-10-25 导入样式诊断语义修正

- 根因：TokenLint把基座白名单外类名直接断言为“渲染时不会产生任何样式”，忽略导入页可能自带CSS；保留原貌时字面值提示还会诱导无条件替换，顶栏与属性面板扫描也漏传移动设备档位。
- 修正：unknown_class改为“未由项目基座定义；页面自带CSS需另行核验”。保留/选择性导入的字面色值与圆角说明源样式、主题回溯和按需统一；统一模式与普通生成仍按项目Token诊断。共用来源上下文，原code/nid/实际值/计数/合规率和白名单不变，CSS存在不会免检；不将类名匹配冒充实际像素检查。
- 创建证据、顶栏、属性面板及一键评测采用一致上下文；顶栏与属性面板按实际设备扫描。导入页说明Token分数是基座差异而非视觉还原度。未修改用户源HTML、画框CSS/布局/颜色、History数据或旧诊断档案；历史报告保持原记录，不回写伪造新版检查。
- 新增10项（6项诊断上下文+4项Store导入），相关两文件 **42 pass / 0 fail / 155 assertions / 280ms**。覆盖已定义作者类和真正未定义类都仍报告、同身份/数量/分数、hex/RGB/圆角、普通/统一/保留/选择性模式、设备差异、安全活动内容和无名主操作拒绝。首轮40/2是新测试把普通控件当成离线主操作：原渲染器被测试替换，不能期望其真实无障碍检查；夹具改为主操作，真实普通无名控件另由两浏览器覆盖，未放宽应用规则。
- 双浏览器实际三种导入预览/确认/Store证据、样式对应、撤销重做/主题恢复、重开、图片解码及真实Canvas红色像素均通过，pageerror=0。三种模式证据unknown_class措辞正确，保留/选择性圆角仍保留；导入页UI说明实际挂载、顶栏title含非视觉评分提示。不可见按钮、普通无名图标按钮及缺失字体均拒绝，页数不增。证据：[Chromium](./evidence/import-diagnostics/chromium/report.json)、[WebKit](./evidence/import-diagnostics/webkit/report.json)。本轮浏览器为本地测试工程/文件输入，未调用在线AI，不冒称本轮又完成原生文件对话框全链路。
- 按序全量：`bun test` **1,973 pass / 0 fail / 12,960 assertions / 174 files / 31.39s**；`bun run type-check`退出0；`bun run build`退出0，Vite **2.45s**，主JS **1,308.24kB / gzip411.93kB**。既有React act提示保留，未报测试失败。原始日志：[测试](./evidence/import-diagnostics/tests.log)、[类型](./evidence/import-diagnostics/type-check.log)、[构建](./evidence/import-diagnostics/build.log)。
- Vite5174 ready77ms；Tauri当前代码dev启动成功，20.21s，Running target/debug/app，**本轮原生仅启动冒烟**。退出本轮会话61664及98492后ps核对无对应残留；先前macOS完整文件/导出验收属于其记录指纹，本轮不复用成当前版本原生全链路通过。
- 源码指纹 `67ef6aa656b1376b293ca335a754008552fae5c18df6a83a940ff464853a4c3b`；[本轮汇总](./evidence/import-diagnostics/report.json)。**本增量 ACCEPTANCE: PASS**，不能据此将34项旧矩阵说成本轮重新执行。复杂PC、在线模型、其他桌面平台仍有验收边界；已知2px越界及旧页重复导航另项保留。

## 2026-10-25 macOS 原生文件/导出/HTML导入验收

- 本增量未改业务代码，源码指纹与下节34/34矩阵及1,963全量通过版本一致。沿用该全量、类型和生产构建结果；当前dist构建实际debug `.app`成功（Cargo24.07s，48.33MiB）。
- 真实macOS系统文件夹选择器打开PC/移动独立ID副本，实际属性面板修改、撤销重做、Rust磁盘保存，退出整个应用重启后内容/History恢复。真实Save面板保存2份HTML、4份原生PNG，分别1440×900、390×844、390×2469、390×906，尺寸/非空白及主要文案检查通过。
- 实际HTML文件选择器导入充值页：原输入纯图标按钮缺名称被门禁拒绝，保留拒绝证据；仅在另一临时副本增加aria-label后通过，移动13→14页，重启恢复和原生PNG通过。原貌保留模式163类名/5色值警告及1项2px横向越界warning明确保留，不宣称零诊断。
- 源PC2项、移动16项及原HTML输入哈希前后不变。临时列表项仅移除、文件留存；测试应用退出，Vite会话95086退出130，5174端口关闭。
- **本增量 ACCEPTANCE: PASS**，补齐macOS基础原生链路。完整范围仍有真实复杂PC页面、在线Provider及其他桌面平台的验证边界。[详细报告与优化建议](./evidence/native-desktop/report.md)、[机器断言](./evidence/native-desktop/report.json)、[实际导出文件](./evidence/native-desktop/exports/import-native.png)。下文“原生仅启动”均为较早轮次历史边界，以本次实际证据补充，不抹除历史记录。

## 2026-10-25 真实 PC 基础验收、最终入口矩阵及 WebKit 竞态修复

- 用户提供 `/Users/theoly/Desktop/a1/pc01`，PC01、schema1、固定PC1440、1个默认占位页，无文档/资产。真实源2个输入文件前后SHA256一致，源指纹 `f0816b178dea886fcafe59aeb03cb1ada1a663854a18408cafe0b3c1083029fa`。只读源、临时目标，实际TS仓储迁移/重开及Store参考设备动作通过；没有改用户源工程。pc-laptop1366×768、pc-standard1440×900、pc-wide1920×1080遵守固定工程宽度，换算视口1440×810/900/810，三预设只形成两种不同尺寸。
- 先显式初始化两引擎基准并人工检查Chromium画布和WebKit真实PNG，再不带更新选项正式复跑；最终代码版本再次复跑。真实PC三设备×两引擎×画布/HTML/PNG，**18项全部0变化**、PageRenderCheck complete/每项7节点无发现、pageerror=0、实际PNG foreign-object尺寸/非白图通过，HTML无运行态导航/视口注入且按钮文案保留。初建记录独立保存initial-report，不把初始化当正式通过。[PC Chromium](./evidence/project-replay/pc-chromium/report.md)、[PC WebKit](./evidence/project-replay/pc-webkit/report.md)。该工程确为默认占位页，不能作为复杂PC业务布局的代表性全验收。
- 在最终版本同样复跑smatch：13页真实迁移/重开，3页×3移动参考设备×2引擎，**54项全部0变化**，原14个输入文件哈希不变、pageerror=0。两真实工程合计**24场景、72项图像比较**。旧工作台头像1.18:1对比度和角标重叠仍作为原页warning保留；原页没有自动修正，像素稳定不等于设计无缺陷。[移动Chromium](./evidence/project-replay/chromium/report.md)、[移动WebKit](./evidence/project-replay/webkit/report.md)。浏览器Chromium145.0.7632.6/WebKit26.0；仅读真实磁盘，文件接口为Python受限桥接，非Rust/原生文件对话框验收。
- 当前同版本完整跑17类入口×2引擎：新建、结构化修改、宽泛分析、重塑、三导入策略、多页、实体、来源、旧页修复、新建修复、模板、库副本/引用/源编辑、交付历史、附属包迁移、视觉报告。最终**34/34 passed**，全部退出0、独立报告通过，运行前后源码指纹一致：`2c09e8e1a9827e00e86f4338346dd15d5260e253c84f1a1df8a7498a89e008b3`，运行时间合计131.57秒。真实应用Store/iframe/History/仓储/像素检查，模型响应和文件选择器为脚本明示夹具，不冒称在线Provider/原生对话框。[逐项验收映射](./acceptance-matrix.md)、[本轮矩阵](./evidence/final-matrix/report.json)、[可复跑脚本](./evidence/final-matrix-runner.py)。
- 本轮发现并修复真实WebKit缺陷：导入后撤销/重做时，iframe.srcdoc已经包含data:image，contentDocument仍为旧相对图片路径，实际图片naturalWidth=0，30秒等待仍不恢复；磁盘图片字节完好。`ScreenFrame`现在等资源成功解析后才挂载iframe，加载/失败明确占位；文档身份改变独立挂载，质量/点选/高度监听随新框架重绑，Token/scopedCSS/L4继续热更新。页面源码、资源字节和History不因渲染适配修改。新增2项真实边界单测先红（4pass/2fail）后绿（6pass），验证延迟读取、缺文件、就绪后点选监听、L4同iframe与源码不变；5套相关**34pass/0fail/215断言**。[前后测试摘录](./evidence/webkit-resource-before-after.txt)。
- WebKit实际导入复验：preserve/unify/selective三模式，预览与画布样式一致、撤销/重做后图片真实decode并读取像素[255,0,0,255]、重开图片可解码；不可见按钮/缺字体仍拒绝。两引擎最终矩阵也全部通过。[WebKit独立复验](./evidence/webkit-import-race-fix.json)、[截图](./evidence/webkit-import-race-fix.png)。仅加等待无法修复的第二轮失败保持在记录中，没有降低图片或采纳断言。
- 验证基础设施修正：Vite忽略doc/**/evidence及test/visual-baselines，实际WebSocket证明证据/基准HTML变更无full-reload消息，普通临时HTML变更仍有消息；不改正常源码热更新。[消息验证](./evidence/dev-evidence-watch.json)。首两次探针把新增HTML/根页面实际导航当正向依据，未触发预期，修为已存在文件变更与真实HMR消息检查；没有用无消息的负例单独证明隔离。
- 矩阵打回：首轮31/34，Chromium候选求值上下文销毁、WebKit导入解码错误和来源等待直接解引用null；第二轮33/34，剩导入问题，诊断确认是实际旧文档；第三轮33/34，WebKit已修复，候选夹具再次失败。独立导航诊断仅见子iframe、无主页面导航，不能归因Vite。夹具在工程重挂载前预加载依赖并同步reset，不再在reset中await动态导入；连续10次独立Chromium运行通过（无异常重试处理），最终原脚本及两引擎全矩阵通过。来源输入框等待增加null守卫；导入等待真实资源就绪后仍decode/核对像素。[三轮失败目录](./evidence/final-matrix-first-attempt/report.json)、[第二轮](./evidence/final-matrix-second-attempt/report.json)、[第三轮](./evidence/final-matrix-third-attempt/report.json)、[10次报告](./evidence/candidate-transition-debug/summary.json)。
- 最终严格顺序：`bun test` **1,963pass / 0fail / 12,920断言 / 173文件 / 34.49s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite2.42s，主JS1,306.79kB/gzip411.42kB。4项Python工具测试通过，git diff --check通过。既有React act及受控错误诊断仍在；类型检查无错误。[原始回归日志](./evidence/final-acceptance-regression.txt)。
- 启动与清理：Vite127.0.0.1:5174 ready125ms；Tauri dev profile0.53s、Running target/debug/app，仅原生启动冒烟。核对父子关系后关闭本轮83116/83117和92755/92823，释放端口；无原生文件选择器/Rust存储/原生截图的新增端到端结论。
- **本轮 ACCEPTANCE: PASS**。当前静态设计核心流程有实现和同版本入口证据；完整原方案仍不能无条件标为全部完成：真实复杂PC业务页、原生文件操作与在线模型全链路尚无完整证据，且当前PC样本只是占位页。明确范围和逐项完成位置以[验收映射](./acceptance-matrix.md)为准，不以历史阶段的勾选数量代替验收。


## 2026-10-25 交付历史视觉基准关联

- 实现：已应用的单页采纳及重塑事件按页增加“视觉基准记录”。从真实档案读取页面HTML/CSS/元数据、历史Token/设备/L4和实际图片/字体，导出冻结首屏任务JSON，含owner（工程/事件类型/事件ID/页面ID）、390×844等实际视口、完整自包含渲染文档和SHA256绑定。新建两个仓储get入口沿用原validRecord核对；未应用/不存在/错页/缺资源拒绝任务。当前项目后续修改不覆盖历史任务，历史源资源或渲染基座变化则新任务指纹变化。
- 离线工具：`scripts/verify-delivery-visual.py`禁JavaScript、所有网络请求路由abort；按指定浏览器、版本、OS/机器/字体度量维护独立基准元数据和图片SHA256。显式`--update-reference`只标initialized，常规比较按尺寸、RGB噪声12和变化比例0.5%判passed/failed；固定阈值不由导入报告修改。结果目录为result.json、reference.png、actual.png、diff.png。环境/owner/视口/基准哈希不一致及缺资源不产生报告，失败时移除该目录的旧result.json。用户自行运行本地命令，无后台执行、网络上传或AI调用。
- 本地复核与存储：`visualEvidence.ts`核对当前历史任务/文档SHA256，冻结owner和三图字节；PNG每图8MiB/600万像素、报告UTF8 64KiB，真实Image.decode并Canvas读取像素，重算changedPixels/totalPixels/ratio及通过状态，不采信模型或外部status。只接受不透明截图；差异图哈希/尺寸核对，其内容仍明确为外部生成。原外部规范结果SHA256与任务绑定随独立记录保存；读取再核对，篡改环境/owner/视口变损坏诊断。未知原文/APIKey等字段不入存档。
- 归档为`deliveries/visual/visual-{uuid}.json`和三张`assets/images/visual-evidence-visual-{uuid}-{role}.png`；不存图片正文、任务整页HTML或调用凭证到项目/记录，不改原交付JSON、当前HTML、Token或History。重复报告去重、同事件防并发、ID冲突不覆盖；取消/切工程/当前渲染任务变化/失败时清理本次新文件。新目录及独立图已纳入bundle迁移，原文/图片可重开读取。读报告有500份预算，超限明确失败而非悄悄截断；图片缺失/变更/解码错误显式提示，原交付代码继续可读。
- 新增27项专项：真实单页/重塑任务、CSP/设备/Token/L4与稳定SHA、缺图/资源字节变化、当前项目修改仍保留历史任务、初始化/通过/失败、去重、错任务/文档/图片哈希、假状态/指标、改阈值、缺图/超限/解码/尺寸/透明PNG、取消/并发/上下文/保存时变更、写盘/读回失败清理、未知字段排除、坏记录与图缺失/变更、输入owner/字节异步被调用方改写、ID冲突不覆盖、owner/视口持久数据篡改、独立迁移与历史UI。相关四套 **83 pass / 0 fail / 364 assertions / 3.08s**。像素检测为纯算法真实断言；单元用注入解码器隔离DOM缺少Canvas的限制，真实图片解码/像素读取另由双浏览器覆盖。
- 最终严格顺序：`bun test` — **1,961 pass / 0 fail / 12,909 assertions / 173 files / 32.28s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite **2.54s**，主JS **1,306.58kB / gzip411.37kB**。既有React act/受控失败诊断保留，无测试失败；`git diff --check`通过。[原始回归日志](./evidence/visual-evidence-regression.txt)。
- 实际双浏览器：`scripts/verify-visual-evidence.py`在 **Chromium145.0.7632.6 / WebKit26.0均PASS，pageerror=0**。真实UI创建候选并实际iframe通过后点击采纳，再真实重塑；从两类历史面板点击导出任务并实际下载JSON，分别启动真正离线浏览器CLI生成PNG，再通过实际File输入导入，使用真正Image/Canvas重新读取329,160像素。单页初始化/正式通过（0变化）/故意失败各一份，重塑通过一份；重复上传不新增，错事件上传拒绝。当前HTML和History计数在所有报告操作前后保持。
- 故意差异与异常：仅在独立基准副本把左上100×100改绿并更新该副本元数据哈希，CLI实际返回exit1/failed，变化 **10,000/329,160 = 3.038036%**，应用真实复核为失败并独立归档；正式基准保持。错误浏览器环境基准被CLI拒绝，不产生结果；复制一份旧成功输出后再用错误环境运行，旧result.json被移除。带外部图片的受控任务因离线策略失败，未产生可导入报告；无外部请求实际发送。外部环境仍只是运行器声明，导入校验无法证明截图实际生成来源，UI明确披露。
- 当前门禁与重开：创建一个按钮font-size:0的候选，实际iframe检查后blocked；再次导入已有历史通过报告（去重）仍不能强制采纳，实际forceAdoptStagedChange返回false。刷新重开项目，单页三类历史报告及三图均可查看/解码，重塑报告独立保存，旧记录不填充本次渲染检查。截图中的当前候选可能仍处重开后的渲染检查过程；不把历史“通过”当当前候选通过。
- 证据：[Chromium报告](./evidence/visual-evidence/chromium/report.json)、[三类历史及三图](./evidence/visual-evidence/chromium/single.png)、[重开](./evidence/visual-evidence/chromium/reopened.png)、[真实通过结果](./evidence/visual-evidence/chromium/passed/result.json)、[故意失败](./evidence/visual-evidence/chromium/failed/result.json)；[WebKit报告](./evidence/visual-evidence/webkit/report.json)、[三类历史及三图](./evidence/visual-evidence/webkit/single.png)、[重开](./evidence/visual-evidence/webkit/reopened.png)、[真实通过结果](./evidence/visual-evidence/webkit/passed/result.json)、[故意失败](./evidence/visual-evidence/webkit/failed/result.json)。各目录另存真实任务JSON、PNG和runner原始输出；仅测试工程，不是用户真实工程的视觉审美验收。
- 打回：首轮19pass/1fail为UI测试在effect前断言，先提交toggle再等实际结果后通过；Chromium首轮已通过单页全部流程，重塑summary含日期导致exact定位失败，改为真实DOM匹配后两引擎通过。没有放宽任务、哈希、像素或采纳门禁。
- 启动与清理：Vite127.0.0.1:5174 ready79ms；Tauri dev profile0.51s并Running target/debug/app，本轮原生仅启动冒烟。完整功能证据来自浏览器本地存储、真实离线CLI截图和真实Canvas复核，未声明原生保存对话框/Rust文件系统/原生截图已端到端验证。完成后核对并关闭本轮78523/78524、79739/79808进程。
- 使用入口：元素属性 → 页面交付历史 → 展开已应用记录 → 视觉基准记录；重塑记录在对应页面版本内。先“导出视觉任务”，本地运行`python3 scripts/verify-delivery-visual.py --job 任务.json --browser chromium --reference 对应该浏览器的基准.png --output 结果目录`（仅初建显式加`--update-reference`），再选择result.json及三张PNG导入。需要已安装requirements-visual-regression.txt中的可选依赖和对应浏览器。
- **本增量 ACCEPTANCE: PASS**。外部视觉报告与两类交付历史已关联；完整重构仍有真实PC工程及全部入口最终矩阵待验收。已向用户请求PC档位工程路径，当前已知smatch仅为移动端；不以合成样例替代真实PC验收，不宣称全部重构完成。


## 2026-10-25 工程附属档案完整迁移

- 完成本轮：新增`projectBundleMigration.ts`，从现有源存储冻结候选、全部单页交付（含已删页）、重塑交付、会话索引/月分片，以及所有现有工程图片/图标/导入字体文件；原始History单独复制。JSON/JSONL原文和二进制逐项读回，不通过反序列化再保存而丢失坏行、旧字段或记录。兼容浏览器listDir扁平后代与原生直接子项形态。档案中的安全资源引用必须有文件；坏JSON/坏会话行原文保留并提示，现有读取器仍自行容错，未伪称损坏记录已修复。
- 门禁：最多5,000文件、单文件24MiB、总量128MiB，文本预算按UTF8计；路径越界/未知形态、空或缺资源、目标已有工程/将覆盖文件/既有文档、源清单或字节变化、读写异常/回读不符均拒绝。先复制附属文件再走既有主文档迁移全量核对，最终再核对源及History，原数据不删除。失败可留未注册的部分目标文件，说明需选择空目录重试，不宣称跨文件事务原子性。
- Workspace入口：当前工程、History和候选排队保存先等待；同一时间只接受一次迁移；选择/复制期间切工作区或源项目变化不发布。注册表原upsertMeta会吞写错误，现增加位置读回确认后才切当前folderPath；列表刷新异常不把已确认发布的成功假报失败。成功后继续编辑写新文件夹，原浏览器项目JSON保持备份。没有增加云传输或后台同步。
- 新增32项Bun专项，相关三套最终 **67 pass / 0 fail / 218 assertions / 0.418s**。覆盖完整原文/图片复制、空旧工程、坏候选/重塑/会话索引/History、坏JSONL单行仍恢复其它轮次、已删页档案、缺/空/越界/未知文件或索引所指月片缺失、目标多种冲突零覆盖、读写/二进制回读失败、源变化/新增文件/History原空后出现、目录清单两种形态、数量/字节预算、源备份、实际存储路由、重复点击、选择/复制时切换、选目录时编辑源项目、注册表吞错读回拒绝和发布后刷新失败语义。更新上轮History失败测试为真实history.json写失败，适配原文迁移，不降低门禁。
- 最终严格顺序：`bun test` — **1,934 pass / 0 fail / 12,789 assertions / 172 files / 29.39s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite **2.43s**，主JS **1,288.65kB / gzip405.47kB**。既有React act及受控写盘/缺文件日志保留，无失败。`git diff --check`通过。[原始回归日志](./evidence/project-bundle-regression.txt)。
- 双浏览器：`scripts/verify-project-bundle.py`，**Chromium145.0.7632.6 / WebKit26.0均PASS，pageerror=0**。真实UI/Store/iframe/交付与会话读取器，使用浏览器localStorage支持的文件IPC夹具替代原生对话框与磁盘，不调用AI。实际创建候选并通过真实iframe后点击采纳、保存独立交付PNG，再做一次真实重塑、创建待采纳候选与PNG，复制一条有效已删页交付事件和PNG；真实ConversationStore追加两个月会话及独立附件，额外追加一条坏行。实际点击管理页“迁移”，**13个附属文件**逐项与源原文/字节一致，源未变化，成功位置关联，结果提示坏行保留。
- 实际重开：刷新后使用openLocalFolder/真实仓储恢复；原候选ID、单页交付ID、已删页交付ID、重塑ID均在，History保留 **3** 条，两月会话均加载，坏行不影响其它轮；4张历史/候选预览加1张附件共 **5张图片**真实decode成功。ChatDrawer实际显示迁移会话与附件；候选面板显示当前实际渲染通过和历史预览。[Chromium报告](./evidence/project-bundle/chromium/report.json)、[迁移提示](./evidence/project-bundle/chromium/migrated.png)、[重开](./evidence/project-bundle/chromium/reopened.png)；[WebKit报告](./evidence/project-bundle/webkit/report.json)、[迁移提示](./evidence/project-bundle/webkit/migrated.png)、[重开](./evidence/project-bundle/webkit/reopened.png)。
- 过期限制如实保留：旧知识指纹包含folderPath，迁移重开后的候选上下文不同，恢复瞬间实际渲染为空且交付blocked；随后真实iframe重新complete，仍不能绕过任务过期。普通/两版按钮disabled，实际forceAdoptStagedChange返回false；不修改原文/指纹或拿旧记录解锁采纳。迁移结果显式提示需重新生成。此次保证保留候选代码与证据，不承诺迁移后原候选无需重新生成即可采纳。
- 两浏览器各额外验证目标冲突与写盘失败：新工程迁入已存在目标时明确拒绝，原目标project.json不变；另一独立夹具在conversations/index.json写入抛disk full时不关联目标位置，原项目与原会话均可读取。共4个实际失败用例，均未假报成功。源变更/防重/注册表吞错等其它边界由专项覆盖，未冒称全部在原生窗口验证。
- 打回：首轮类型误用running，按已有repairing/verifying修正；浏览器首轮错误要求迁移候选pending，实际folderPath指纹使其正确blocked，补说明和拒绝采纳验证；另一轮脚本调用不存在的canForce方法，改为真实强制动作返回false。最后补注册表读回测试时，两轮66pass/1fail因HappyDOM绑定Storage方法使实例/原型spy无效，改在upsertMeta接口模拟吞错无写的等价效果。最终67项专项与两浏览器复验通过，生产门禁没有放宽。
- 启动与清理：Vite127.0.0.1:5174 ready76ms；Tauri dev profile0.50s并Running target/debug/app，本轮仅原生启动冒烟。未验真实原生文件选择器、Rust存储或原生截图；验证完成核对并关闭本轮75631/75632和76205/76272进程。
- 复跑示例（已安装可选Playwright依赖且本地服务启动）：`python3 scripts/verify-project-bundle.py --browser chromium --artifacts /tmp/taudesign-bundle/chromium`；WebKit相应替换browser/artifacts。测试项目在独立浏览器上下文，来源均为测试工程，不访问或修改用户真实工程。
- **本增量 ACCEPTANCE: PASS**。现有路径格式的附属档案迁移已完成；真实PC工程、全部入口端到端矩阵、将外部视觉基准报告关联应用内交付档案仍未全部闭环，不能标记完整重构完成。


## 2026-10-25 真实工程回放与迁移完整性

- 修复：`ProjectRepository.migrateProjectToFolder`原只比对HTML，现同时逐字节检查scopedCss，并按值核对页面元数据、配置/Token/L4、组件、库绑定、资源索引、项目文档；只允许仓储补缺省Manifest和更新时间。读回异常转失败并保留原备份。资源从源ProjectStorage复制实际字节并读回，不再只写资源索引；同时扫描HTML（含template/srcset）、scopedCss、组件和L4中的工程资源，避免未登记图片索引的导入字体漏迁移。非法/缺失/空/不一致资源均拒绝。Workspace传入真实旧浏览器存储，History保存异常返回失败且注册表位置不改变。
- 新增19项Bun专项，相关迁移两套最终 **35 pass / 0 fail / 100 assertions / 0.14s**：HTML完好但配置/Token/覆盖层/组件/资源/决策/绑定丢失，CSS丢失/篡改、页面角色元数据丢失、文档缺失、读回异常、资源真实复制、空/缺/坏/越界路径、History真实分支失败、非Asset字体/组件图片/srcset/template/L4复制和缺字体拒绝。新增4项Python unittest通过，含规范路径和symlink边界、源内容/未登记字体身份、浏览器版本/平台/设备/源变化拒绝复用、空白/尺寸/真实像素差异检测。
- 最终严格顺序：`bun test` — **1,902 pass / 0 fail / 12,671 assertions / 171 files / 28.68s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite **2.39s**，主JS **1,282.82kB / gzip403.41kB**。既有React act和受控失败诊断保留，无测试失败。`git diff --check`通过。[原始回归日志](./evidence/project-replay-regression.txt)。
- 真实输入：用户先前提供的`/Users/theoly/workspace/cowork/smatch`，工程THN-h5、13页、旧无referenceDevice/库绑定的配置，14个关联输入文件SHA256前后完全一致。工具从真实磁盘只读，TS真实ProjectRepository读取/迁移到Python桥接的临时磁盘目录并重开，原HTML/覆盖层保留；实际Store载入后通过History动作切参考设备，源码未被导出/设备选择修改。此工程没有登记资产，实际二进制迁移由专项覆盖；不假称真实案例含图片/字体。
- 实际设备矩阵：员工登录、红娘外勤工作台、约见履约与回访录入 × 移动小屏375×667/标准390×844/长屏412×915，遵守固定390工程宽度，实际视口为 **390×694 / 390×844 / 390×866**。浏览器 **Chromium145.0.7632.6 / WebKit26.0**，Darwin24.6.0 arm64，DPR1，zh-CN，字体度量随基准身份记录。每项真实PageRenderCheck complete；实际buildScreenDocument画布结构、buildStandaloneHtml和exportScreenPng（真实foreign-object引擎，1x首屏）均执行。HTML无系统chrome或固化设备视口，业务操作文案保留；PNG尺寸/非空白通过。另保存完整画布/HTML长图、HTML文件、实际PNG和JSON/Markdown报告。
- 基准与复验：先显式`--update-baseline`建立每浏览器独立基准，检查Chromium完整工作台、约见导出与WebKit完整约见图，保留来源旧缺陷。随后**不带更新参数**重新执行：18组场景的画布、HTML和PNG共 **54项像素比较全部0变化**，应用pageerror=0，来源未变化。基准图带SHA256防止静默替换；源、设备、引擎/版本/平台/字体变化必须重新评审。初建报告状态单独为baseline_initialized，不能当回归通过。
- 故意失败验证：只在/tmp基准副本将登录小屏PNG左上100×100改绿并更新该副本的哈希，正式基准不动。真实再次回放结果 **exit1 / failed**，PNG变化 **0.036947（3.6947%）>0.5%**，其余画布/HTML仍0变化；证明比较不只是校验文件存在/哈希，也不会自动覆盖基准。[故意差异报告](./evidence/project-replay/negative-drift/report.json)。
- 正式证据：[Chromium报告](./evidence/project-replay/chromium/report.md)、[JSON](./evidence/project-replay/chromium/report.json)、[完整工作台](./evidence/project-replay/chromium/screen-1791980074775-gmsc-mobile-standard/canvas.png)、[约见PNG](./evidence/project-replay/chromium/screen-1792026516007-f8ib-mobile-standard/export.png)；[WebKit报告](./evidence/project-replay/webkit/report.md)、[JSON](./evidence/project-replay/webkit/report.json)、[完整约见页](./evidence/project-replay/webkit/screen-1792026516007-f8ib-mobile-standard/canvas.png)。基准与复跑方法见`test/visual-baselines/real-project/README.md`；原始工程正文不额外复制入基准目录。
- 旧页问题没有被“通过”抹去：工作台wcoa257l头像文字对比度 **1.18:1**，建议使用更清晰的语义文字色，普通小字号至少4.5:1；wcoa257t通知角标与主图标重叠，建议保持角标锚定同一容器右上、图标扩大后预留角标空间并收紧角标字号/内边距，避免改成并排信息。两浏览器三设备均记录这两种warning；不自动修改用户原工程。它们不属于迁移丢失或本轮引入的变化，像素稳定也不等于设计质量全通过。
- 打回：Bun首轮32pass/1fail，History夹具mock错模块导致未执行真实分支，改为真实本地归档触发；Chromium首轮迁移已过但Python将JS换行展开、第二轮PlaywrightContext创建页误传viewport，修为raw脚本及page.set_viewport_size；Python专项3pass/1fail为macOS/var规范路径预期，改root.resolve。全部复验通过，无生产门禁放宽。
- 启动与边界：Vite127.0.0.1:5174 ready77ms；Tauri dev profile0.49s并Running target/debug/app，原生仅启动冒烟。真实磁盘存储由Python受限桥接，**未验原生文件选择器/Rust保存链路或原生截图**；无AI请求，无物理手机截图。已核对并关闭本轮73128/73129和74063/74131进程。
- **本增量 ACCEPTANCE: PASS**。完整重构仍剩真实PC工程/更多页面和全部入口的端到端矩阵、候选/交付侧车/会话等附属档案迁移验收，以及将外部视觉基准报告关联应用内交付档案；既有源页问题需用户在工程中另行确认修正。不能标记整个重构全部完成。


## 2026-10-25 设计库源工程编辑

- 完成本轮增量：已绑定设计库的设计系统来源面板新增“编辑源库：选择来源工程”。重新选择同来源、同设备的真实.aidesign工程，只读核对完整页面/文档及有效Token/组件合同，预览名称、版本、影响数量与差异；确认才切换。预览私有持有路径，UI预览不含源正文或路径，取消零来源写入。一次预览确认即消费，失败/取消后需重新选择，源或消费工程过期拒绝。
- 保存与隔离：新增可等待工程保存、串行History写入及检查式History屏障；进入与返回都等待工程/History/候选保存，错误不切工作区。来源读取前后与最终切换复核完整文档，不能把仓储恢复时丢失的页/文档当有效源。来源及返回的History/候选独立恢复，迟到普通导航/双击/取消不可覆盖当前工作区。Workspace按工程ID重挂载，清除旧表单；从文件夹源库普通打开本地工程清除旧folderPath，后续保存不会误写源目录。
- 编辑行为：源工程正常主题/组件编辑、版本递增、撤销重做及原子保存；源自身上游只读限制保持。工作区横幅显示源名和保存后返回。消费工程缓存与页面不联动，返回后仍需实际“检查并更新参考”预览及确认；页面实例保持原内容。临时返回路径只放运行态，不持久化到工程/绑定或模型证据，刷新/普通导航清除；不提供后台同步、跨应用锁或多层返回。
- 新增25项专项：完整工程身份/设备/坏定义/数组/缺页文档、只读预览、一次预览/篡改/取消/上下文变化、实际保存失败、History与候选失败、重复/普通导航迟到、返回失败重试、缺失原工程、上游只读、真实UI、History恢复及撤销重做、运行态路径隔离，以及普通本地打开后来源文件不变。相关5套最终 **104 pass / 0 fail / 504 assertions / 2.45s**。
- 最终依次执行：`bun test` — **1,883 pass / 0 fail / 12,605 assertions / 170 files / 29.01s**；随后`bun run type-check`退出0（tsc无错误）；随后`bun run build`退出0，Vite **2.43s**，主JS **1,280.04kB / gzip402.54kB**。既有React act及受控缺文件/磁盘失败诊断保留，未出现测试失败。`git diff --check`通过。[原始回归日志](./evidence/library-source-regression.txt)。
- 双浏览器：`scripts/verify-design-library-source.py`，**Chromium145.0.7632.6 / WebKit26.0均PASS，pageerror=0**。真实UI/Store/History/iframe，以浏览器localStorage支撑的文件IPC夹具模拟来源文件夹和选择器，**不是真实原生文件夹/对话框验证，也没有在线AI调用**。预览和取消时来源写入0；确认后真实进入源工作区，主题编辑器改主色至#8b5cf6，组件编辑器改p4→p6并v1→v2；实际保存的源文件体现改动，消费缓存/页面不变，撤销重做通过。实际点击返回，消费仍保持v1；实际更新参考预览确认后缓存v2/颜色更新，页面实例不变。刷新重开后源v2/参考v2仍在且临时编辑上下文清除。
- 证据：[Chromium报告](./evidence/library-source-chromium.json)、[预览](./evidence/library-source-chromium-preview.png)、[源库工作区](./evidence/library-source-chromium-editing.png)、[返回后更新预览](./evidence/library-source-chromium.png)、[重开](./evidence/library-source-chromium-reopened.png)；[WebKit报告](./evidence/library-source-webkit.json)、[预览](./evidence/library-source-webkit-preview.png)、[源库工作区](./evidence/library-source-webkit-editing.png)、[返回后更新预览](./evidence/library-source-webkit.png)、[重开](./evidence/library-source-webkit-reopened.png)。
- 打回及修正：首轮专项21pass/1fail，取消guard早于预览领取导致可重用；改为存在的预览首次确认即消费。浏览器首轮把aria-label的div误当region且主题关闭定位不符真实按钮；改按真实DOM。第二轮消费页断言读了插入组件前的旧Store快照；修正最新基线。产品门禁未放宽。最后发现普通本地打开继承旧folderPath，已修正并新增实际保存不改源文件的回归，最终所有检查在此修正后执行。
- 启动与清理：Vite127.0.0.1:5174 ready103ms；Tauri临时覆盖beforeDevCommand复用该服务，dev profile0.56s后Running target/debug/app。本轮原生仅确认启动，UI闭环证据为上述文件IPC夹具的两浏览器；未宣称真实原生文件对话框、Provider或像素基线通过。验证后已核对父子关系并关闭本轮70973/70974、71617/71685调试进程。
- **本增量 ACCEPTANCE: PASS**。完整重构尚需真实工程/参考设备的视觉基线、跨入口迁移与导出端到端验收；保留静态设计范围，其余修复入口按已声明范围阻断，不能把本轮解释为全重构完成。




## 2026-10-25 显式组件模板与插槽合同

- 本轮完成：新增可显式启用的`templateContract:{version:1}`，复用既有slotDefs；`componentTemplate.ts`核对单根/完整/安全定义、20槽上限、稳定同名data-slot或:scope选择器、唯一/类型/重叠约束。当前版本严格实例固定树、文本、属性与样式不可漂移；文本槽仅改纯文字、图片槽仅改src/srcset/alt/data-asset-id、节点槽仅改包装元素内部。运行时NID和实例身份不参与模板比较。严格模板和槽不接受内嵌data:image（含惰性template），图片需使用资源引用或URL。
- 接线：共享`design-entities`现在核对实际严格模板并记录templateCount，覆盖创建/三种HTML导入/候选（普通、强制、保留两版）/多页逐页/页面与组件重塑/既有受控修复的完整复验。未知/坏合同不降级；严格新实例无版本拒绝。既有同身份旧/无版本实例继续兼容并明确警告，没有用当前模板假验旧实例；旧组件不自动启用。
- 同步与持久化：严格实例按槽名保留内容，模板重排不再按叶节点顺序串位；文本前后空白、图片属性和节点内容保留，缺槽/复杂文本/不安全内容/L4冲突跳过且显示实际原因。模板、槽或合同变更均递增版本并走History，启用不改页面，显式同步才改变实例；配置可撤销/重做、存盘重开。来源副本/固定参考保留合同，来源指纹和参考快照包含合同，旧未启用定义指纹兼容；读取前及映射后验证严格模板，写文件前拦坏来源。
- UI与上下文：组件中心逐组件提供配置、HTML和槽JSON、启用/保存/取消/错误状态；冻结工程及定义，过期表单不能覆盖新定义；只读参考禁用配置且Store同样拒绝。主生成/润色的完整组件上下文附槽合同，超预算整项省略，不臆造未提供模板。检查器准确区分严格按槽同步与旧位置兼容模式。
- 新增47项专项：定义/各类同版本伪造、槽内容边界、根文本槽、旧/无版本、同步顺序/安全/空白/L4、版本History/存盘、来源及快照指纹、Prompt、配置UI错误/过期/只读、新建/三类导入/三种采纳拒绝、组件重塑及多页第二页失败整批不写入。相关7套最终**165 pass / 0 fail / 642 assertions / 1.90s**。异步来源拒绝断言最终显式await，完整回归复跑通过。
- 最终依次执行：`bun test` — **1,858 pass / 0 fail / 12,493 assertions / 169 files / 27.96s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite2.45s，主JS **1,265.83kB / gzip398.60kB**。详见[原始日志](./evidence/component-template-regression.txt)。既有React act及受控错误诊断仍保留于日志，没有新失败。
- 双浏览器：`scripts/verify-component-template.py`，**Chromium145.0.7632.6 / WebKit26.0均PASS，pageerror=0**。实际资源中心先显示JSON错误，再保存启用（v1→v2，History增量1且原页不变，撤销重做通过）；显式同步，再通过实际HTML编辑重排姓名/正文和修改固定提示至v3，按槽保留姓名及正文，实际实体报告templateCount=1且无发现。过期表单拒绝保存、参考模式配置按钮disabled。候选固定class被改时实际iframe仍complete/7节点/0发现，但模板门禁阻断全部采纳，证明不能仅凭外观检查放行；只改姓名槽则当前完整门禁ready，实际点击采纳、档案包含严格模板计数，撤销重做通过。真实刷新后重开工程，v3合同/槽/姓名仍在，原页面iframe显示新姓名。
- 证据：[Chromium报告](./evidence/component-template-chromium.json)、[配置表单](./evidence/component-template-chromium-config.png)、[阻断](./evidence/component-template-chromium-blocked.png)、[通过记录](./evidence/component-template-chromium.png)、[重开](./evidence/component-template-chromium-reopened.png)；[WebKit报告](./evidence/component-template-webkit.json)、[配置表单](./evidence/component-template-webkit-config.png)、[阻断](./evidence/component-template-webkit-blocked.png)、[通过记录](./evidence/component-template-webkit.png)、[重开](./evidence/component-template-webkit-reopened.png)。渲染/Store/交付记录均真实，没有渲染桩或在线Provider请求。浏览器主要覆盖文字/节点槽，图片槽及导入来源规则另由专项测试覆盖；不将这些结果称为真实工程像素基线或原生Provider端到端验证。
- 启动：复用本任务已启动的127.0.0.1:5174 Vite（本轮确认可用，Vite ready122ms）；Tauri dev profile0.55s后成功Running target/debug/app。本轮仅验证原生启动，未冒称原生UI全流程。已核对父子关系并关闭本任务开发/调试进程（64595/64596、68376/68444）。
- 当前边界：固定模板与类型插槽为显式启用；旧组件兼容，尚未提供变体或任意props运行态。完整重构仍有编辑源库、真实工程/设备视觉基线、跨所有入口迁移与导出端到端验收，以及按原范围保留的其它修复入口；继续保持静态设计范围。


## 2026-10-24 旧页候选一次受控样式修复

- 完成范围：修改/单页润色候选验收面板新增显式“修复一次并重新检查”和取消入口。仅在有效合同、当前完整实际iframe允许错误及其它门禁全部通过时开放；合同allowedChanges、选中根、实际localEdit根取交集，L4覆盖/合同保护及相关祖先和内容拒绝修复。新页与旧页共用`controlledStyleRepair.ts`，一次1～3控件/最多8样式操作/1800Token请求，不续写、不重试、不改文案、DOM、SVG、链接、颜色或隐藏属性。
- 执行与安全：`candidateRepair.ts`在提案前后重新校验源码、质量、原合同结构、实体、本地文件/只读库；按当前scopedCss/导航/完整L4创建独立iframe，全部通过且无新发现才替换暂存候选。原页和History保持；用户后续正常采纳才生成单条History及交付档案。Store忙时普通/强制/两版保留全部拒绝；取消、丢弃、切工程、原页/Token/知识/候选/执行范围变化拒绝迟到结果。
- 持久化：模型请求前先原子保存尝试预约，避免中断/重开重复调用；成功、失败和取消记录随候选侧车、验收记录与采纳档案保留，展示实际额外用量、操作和指纹。损坏记录安全展示且保持不可重试；历史检查不解锁当前门禁。调用凭证与完整请求正文不持久化。
- 专项：`bun test test/candidate_repair.test.tsx test/page_creation_repair.test.ts test/page_creation_repair_chat.test.tsx` — **79 pass / 0 fail / 447 assertions / 3 files / 1.76s**。新增38项覆盖上述范围/保护/无合同/坏源码实体/旧报告/授权交集/批量入口拒绝、样式协议非法指令、失败保存与重开、并发采纳和迟到、模型及渲染期间删文件、整页和单页润色、精确L4、History/撤销重做、档案及损坏证据UI；原41项新页与多页修复回归全部通过。
- 最终顺序回归：[原始日志](./evidence/candidate-repair-regression.txt)。`bun test` — **1,811 pass / 0 fail / 12,340 assertions / 168 files / 26.93s**；随后`bun run type-check`退出0；随后`bun run build`退出0，Vite2.40s，主JS **1,255.36kB / gzip395.07kB**。既有React act与受控错误诊断仍见日志，静态类型无错误；`git diff --check`通过。
- 真实浏览器：`scripts/verify-candidate-repair.py`使用实际按钮、实时候选iframe、独立PageRenderCheck和真实Store/侧车/交付档案，**Chromium145.0.7632.6 / WebKit26.0均PASS，pageerror=0**。只将模型流替为本地受控响应，无在线Provider请求；渲染检查未桩替。初始当前iframe检查8节点/1条不可见文案error；修复后的独立检查与当前iframe均9节点/0发现。仅1次jsonSchema请求，预算1800、实际用量123in/45out；独立检查携带无关节点精确L4。DOM对照标题、说明、SVG/path、按钮文字和其它按钮均保持。
- 真实采纳/拒绝：修复期间已持久化预约且三种采纳均返回false；修复仅替换候选、History增量0，采纳后增量1，撤销/重做正确，交付档案保存receipt无凭证。实际刷新浏览器后重开工程，按钮文字及档案仍存在。模型改文案整次拒绝、取消保持原候选且保存cancelled，恢复侧车仍不可重试；授权范围外和保护祖先的按钮disabled、模型调用0。双浏览器各包含四种拒绝情况。
- 证据：[Chromium报告](./evidence/candidate-repair-chromium.json)、[等待修复](./evidence/candidate-repair-chromium-repairing.png)、[通过记录](./evidence/candidate-repair-chromium.png)、[拒绝](./evidence/candidate-repair-chromium-rejected.png)、[重开](./evidence/candidate-repair-chromium-reopened.png)；[WebKit报告](./evidence/candidate-repair-webkit.json)、[等待修复](./evidence/candidate-repair-webkit-repairing.png)、[通过记录](./evidence/candidate-repair-webkit.png)、[拒绝](./evidence/candidate-repair-webkit-rejected.png)、[重开](./evidence/candidate-repair-webkit-reopened.png)。共用引擎提取后另重跑`verify-page-repair.py`两浏览器，实际聊天新页、468用量、失败/过期和重开均通过，原报告更新。
- 启动与限制：Vite ready78ms；Tauri本轮编译4.60s后运行`target/debug/app`。CUA按名称匹配到另一份已安装应用（tauri://localhost），该观察不归属于本轮调试构建；**本轮原生只确认启动，真实UI闭环证据来自两浏览器，未宣称原生Provider端到端或跨浏览器像素一致**。验证完成已关闭本轮调试进程与服务。
- 本轮验收通过；完整重构仍未全部结束。此修复是显式候选操作，HTML保真导入和批量重塑仍不自动修复；设计库源编辑模式、组件模板/槽位语义、真实工程视觉基线和迁移/导出端到端仍需后续闭环。保留静态设计范围，不扩展可点击业务原型。


## 2026-10-24 AI新建页面一次受控样式修复

- 覆盖：单页AI新建和多页当前页；仅在完整实际iframe报告出现允许的控件0尺寸/文案不可见错误时，最多一次结构化样式请求。使用既有Engine/Rust代理及jsonSchema，maxTokens1800，禁止续写、格式纠正或网络重试。只改1～3个报错控件自身的允许尺寸/字体/内边距属性，不给模型写HTML、文本、SVG、链接、其他属性/节点、隐藏或颜色的权限。修复后重新执行完整prepareNewPage及新iframe，且不得新增任何渲染发现（包括警告）。
- 实现：`pageCreationRepair.ts`执行只读/私有修复和上下文守卫，`pageRepairRecord.ts`保存安全历史证据；CanvasToolExecutor仅在有实际AI上下文时启用，多页沿用整批提交。HTML导入/旧页局部/区块/润色/批量不自动修复，仍按原门禁阻断，不能据此称全部入口受控修复已完成。
- 新增专项：`bun test test/page_creation_repair.test.ts test/page_creation_repair_chat.test.tsx` — **41 pass / 0 fail / 197 assertions / 2 files / 0.41s**。覆盖真实错误触发/不触发边界、唯一/错误/保护控件、数量预算、无模型上下文、所有危险/越界/无变化/过量/截断/坏JSON指令拒绝、一次请求且重复任务不再调用、传输失败、非协作取消/过期、模型期间删资源后的重新核对、修复引入新溢出阻断、历史损坏/凭证排除、单条History/撤销重做、真实聊天最终HTML/会话/额外用量及多页首修复后整批成功或第二页失败不落地。
- 相关首轮回归 **113 pass / 0 fail / 422 assertions / 5 files / 1.73s**。最终依次执行：[原始回归日志](./evidence/page-repair-regression.txt)；`bun test` — **1,773 pass / 0 fail / 12,090 assertions / 167 files / 26.20s**（进程26.22s）；`bun run type-check` —退出0，2.50s；`bun run build` —退出0，4.79s，Vite2.18s。主JS **1,242.27kB / gzip391.25kB**。既有React act与受控错误诊断日志仍存在，TS无错误。`git diff --check`通过。
- 双浏览器：`python3 scripts/verify-page-repair.py --browser chromium|webkit --screenshot ... --report ...`；**Chromium145.0.7632.6 / WebKit26.0均PASS**。使用真实ChatDrawer、实际两次iframe检查和真实Store/会话/历史路径；模型流为本地受控响应，无在线Provider调用，iframe检查未被桩替换。两引擎首次实际报告均complete、检查6节点、有1条控件不可见error；修复后complete、检查7节点、0发现。
- 实际验收：初始生成+额外修复共2请求（请求修复预算1800），每个请求时工程仍仅原页。严格DOM比较标题、说明、SVG、path和按钮文字保持；唯一变化为按钮字号样式。用量100+200和123+45合并为**468 tokens（223 in / 245 out）**，成功/失败修复调用均计入；缺省用量专项确认明确估算。成功单条History，撤销/重做/保存重开保留修复证据；页面最终HTML与会话HTML完全一致，重加载后恢复的是修复后代码及明确历史提示。
- 错误/过期：模型试图修改按钮文字时整次拒绝，不新增页面或History；修复期间新增项目决策后，迟到响应不再复验或写入，仅保留用户决策自身History。无任何第三次请求，pageerror均0。新渲染警告和样式实值未变的操作同样在专项阻断；没有把“模型返回指令”视作验收成功。
- 证据：[Chromium报告](./evidence/page-repair-chromium.json)、[等待修复](./evidence/page-repair-chromium-repairing.png)、[成功记录](./evidence/page-repair-chromium.png)、[失败](./evidence/page-repair-chromium-blocked.png)、[重开](./evidence/page-repair-chromium-reopened.png)；[WebKit报告](./evidence/page-repair-webkit.json)、[等待修复](./evidence/page-repair-webkit-repairing.png)、[成功记录](./evidence/page-repair-webkit.png)、[失败](./evidence/page-repair-webkit-blocked.png)、[重开](./evidence/page-repair-webkit-reopened.png)。只证明已覆盖的实际渲染/交付规则，不宣称视觉复刻相似度或业务原型通过。
- 打回记录：专项首轮19pass/14fail，渲染桩按调用序号错误放行重放输入、原始SVG比较遗漏既有NID注入；改按实际待验HTML状态返回并比较首次规范副本。第二轮31pass/2fail，空style可被规范化移除（测试接受null）；删除不存在属性引起格式化被误判有变化，服务新增CSSOM实际样式比较后拒绝。Chromium首轮真实修复/468用量已通过，但最终说明被既有思考折叠区隐藏；新增独立可见结果提示并在重开时明确历史属性后双浏览器通过。全部保留在check.md，未放宽门禁。
- 启动：Vite `127.0.0.1:5174` ready；Tauri复用服务，临时覆盖beforeDevCommand后Rust dev构建0.49s并启动`target/debug/app`。仅声明启动冒烟，无在线原生Provider测试。验证后关闭本次服务。
- **本增量 ACCEPTANCE: PASS**。完整重构仍有其余入口受控修复、编辑源设计库、模板/槽位语义一致性、真实工程长期设备视觉基准和完整迁移/导出端到端验收待完成。

## 2026-10-24 跨入口设计实体引用门禁

- 目标：补齐普通新建、HTML导入、候选普通/强制/两版采纳、多页及批量重塑中的组件ID、声明版本和静态目标一致性。新增只读DOM检查器 `designEntityValidation.ts`，包括template内容与SVG；目录计划强制`design-entities`，实际创建、候选和重塑写集共享检查。组件投影检查使用将提交的新组件版本表。
- 规则：未知/空组件、非法/未来版本、新引入旧版本、孤立版本声明、坏定义及未知/空静态目标阻断。仅基线同身份、同组件/旧版本实例可兼容保留并明确提示未同步模板；缺省版本兼容但不声称已验证模板一致性。普通href不在此处推断业务行为，原有安全/静态检查保持。新建不能借旧页实例授权，跨页计划只允许有效预分配域。
- 新增专项 **42 pass / 0 fail**：26项 `design_entity_validation.test.ts`、16项 `design_entity_gates.test.ts`。覆盖伪原型键、版本边界/损坏定义、重复/转移nid、复制旧实例、DOM位置兼容、嵌套template、SVG、三种导入、普通新建、全部候选采纳入口、组件与页面变化重算、多页第二页失败整批不落地、工作流删阶段防绕过及证据存档/恢复。边界补充后进入最终全量；首轮两文件为119 assertions。
- 首轮全量 **1,704 pass / 28 fail**，已打回：结构化编辑预检未支持新增必要阶段，导致模型前失败；另有两项固定阶段数组断言。补预检支持（实体/文件/渲染仍在实际交付时重算）并更新严格断言后，6套受影响回归 **120 pass / 1 fail**；剩余为旧局部测试引用`shared`却未注册，门禁正确拒绝。测试补真实组件定义后，结构化/局部/实体四套 **81 pass / 0 fail / 259 assertions / 1.21s**。未放宽未知引用检查。
- 最终按顺序执行：[原始全量日志](./evidence/design-entities-regression.txt)；`bun test` — **1,732 pass / 0 fail / 11,893 assertions / 165 files / 25.86s**（进程25.88s）；`bun run type-check` —退出0，3.39s；`bun run build` —退出0，5.09s，Vite2.25s。主JS **1,231.31kB / gzip387.69kB**。既有React act和受控错误日志仍存在；TS无错误，不能声称所有日志零警告。`git diff --check`通过。
- 实际浏览器：`python3 scripts/verify-design-entities.py --browser chromium|webkit --screenshot ... --report ...`；**Chromium145.0.7632.6 / WebKit26.0 均PASS**。不调用AI Provider，用受控静态输入运行真实iframe和实际Store/采纳/持久化；候选与新页实际render均complete、检查5节点，pageerror均0。源码/组件版本/保留旧文案、一次History、撤销/重做、重开及独立交付档案的实体检查证据均已核对。
- 两引擎实际拦截五条入口：普通创建、preserve/unify/selective导入、批量重塑；未知引用失败时原页/页数/History不变。无效候选在画布工具条、聊天和验收面板明确报错，两个同名采纳入口及两版保留均disabled，直接普通/强制/两版API亦失败。已有v1实例在定义v3下保留，显示“本次未同步模板”，实际重新等待ready后才采纳。新建页必须使用v3；重开仍是旧页v1、新定义/新页v3及历史证据，不自动升级旧页。
- 证据：[Chromium报告](./evidence/design-entities-chromium.json)、[创建历史](./evidence/design-entities-chromium.png)、[无效引用](./evidence/design-entities-chromium-blocked.png)、[旧实例兼容](./evidence/design-entities-chromium-compatible.png)；[WebKit报告](./evidence/design-entities-webkit.json)、[创建历史](./evidence/design-entities-webkit.png)、[无效引用](./evidence/design-entities-webkit-blocked.png)、[旧实例兼容](./evidence/design-entities-webkit-compatible.png)。截图仅记录界面和检查，不宣称参考图相似度或业务导航运行态通过。
- 浏览器脚本打回保留在check.md：聊天/画布同名按钮使唯一定位冲突，改为逐个核对所有入口；摘要/折叠工作流重复警告，改为明确摘要；候选替换保留details展开状态，改为先读取open再展开。真实生产门禁未降低；证据展开可能触发iframe重新核验，脚本等待当前真实ready后才采纳，未复用历史complete解锁。
- 启动冒烟：Vite在 `127.0.0.1:5174` ready；Tauri复用该服务并临时覆盖beforeDevCommand，Rust dev编译0.46s后启动`target/debug/app`。不声称完整原生Provider生成实测。验证结束停止本次服务。
- **本增量 ACCEPTANCE: PASS**。完整方案仍有编辑源设计库、库模板/槽位语义一致性、一次受控修复、真实工程长期设备视觉基准及跨入口旧工程迁移/导出验收待完成；本门禁仅保证实际引用身份/声明版本/目标有效，不能代替这些验收。

## 2026-10-24 多页面只读规划、确认与整批交付

- 范围：高置信多页新建进入只读结构化计划，初始2～8页，明确N页不可漏页，超过8页在模型前提示拆分。用户编辑页面名/要求/静态关联或缩减后确认；每页沿用统一Pipeline及来源、源码、质量、实际资源/iframe门禁，全部通过才通过私有批次和单条History加入画布。已有页保留。未完成批次不持久恢复，不实现业务原型。
- 专项：`bun test test/multi_page.test.ts test/multi_page_ui.test.tsx` — **50 pass / 0 fail / 166 assertions / 2 files / 1.25s**。覆盖计划坏格式/数量/重名/关联/有界文本、一次纠正/网络不重试、规划取消/迟到、修改确认、独立页身份、缺关联/未知目标/坏HTML、第二页失败、并发确认、切工程/Token/文档/决策变化、伪造批次、单页入口旁路、整批撤销/重做与保存重开、历史UI损坏防护。
- 最终按顺序执行：`bun test` — **1,690 pass / 0 fail / 11,772 assertions / 163 files / 25.41s**；`bun run type-check` —退出0，2.46s；`bun run build` —退出0，4.79s（Vite构建2.24s）。主JS 1,226.60kB / gzip385.80kB。全量仍有既有React act及受控错误诊断日志，不能声称日志零警告；TS无错误。
- 全量原始记录：[multi-page-regression.txt](./evidence/multi-page-regression.txt)。`git diff --check` 通过。
- 实际浏览器脚本：`python3 scripts/verify-multi-page.py --browser chromium|webkit --screenshot ... --report ...`。Chromium **145.0.7632.6**、WebKit **26.0**均通过真实ChatDrawer、计划编辑/删页/关联、逐页实际iframe、一次History整批加入、撤销/重做、保存/重开和历史验收面板。每页实际检查7节点，render complete、workflow ready；所有生成请求时工程仍只有原页。
- 两浏览器均复核：第一页验收后，取消非协作第二页响应，或第二页返回无HTML时，工程均只有原页且History增量0；工程决策改变后原计划按钮禁用，HTML调用0。pageerror均为0。成功计划原3页、用户确认缩减为2页，结果及历史明确披露。
- 浏览器证据：[Chromium报告](./evidence/multi-page-chromium.json)、[截图](./evidence/multi-page-chromium.png)、[取消](./evidence/multi-page-chromium-cancelled.png)、[失败](./evidence/multi-page-chromium-blocked.png)；[WebKit报告](./evidence/multi-page-webkit.json)、[截图](./evidence/multi-page-webkit.png)、[取消](./evidence/multi-page-webkit-cancelled.png)、[失败](./evidence/multi-page-webkit-blocked.png)。模型使用本地受控对象/流响应，未调用在线Provider；实际iframe门禁未被桩替换。静态路由/结构证据不等于业务交互或视觉相似度通过。
- 开发服务：Vite `127.0.0.1:5174` ready。桌面：`bunx tauri dev --config '{"build":{"devUrl":"http://127.0.0.1:5174","beforeDevCommand":""}}'` 成功完成Rust dev构建0.49s并启动 `target/debug/app`；只声明启动冒烟，不冒称完整桌面模型生成实测。验证结束停止本次启动的服务。
- 打回记录保留：首轮TS缺阶段映射/错误数组展开、可选坐标和JSX括号均修复；核心36pass/1fail发现History根screens替换不受支持，改为同一History中的逐页add/remove及位置patch后通过。聊天3pass/1fail为测试误定位旧取消卡片，定位最新卡片后通过。Chromium首轮整页JSON重做比较失败，经逐字段诊断仅`measuredHeight:700→undefined`；运行时测高缓存由iframe重挂载重算，脚本排除该缓存，仍严格比较HTML、位置、完整计划及逐页证据，生产门禁/History未放宽，双浏览器复验通过。
- **本增量 ACCEPTANCE: PASS**。四期完整方案仍未全部完成：编辑源库、跨入口完整设计实体一致性/一次受控修复、真实用户工程长期设备截图基准及完整旧工程迁移/导出端到端验收，继续保持待办。

- 定向回归：`bun test test/page_link_editing.test.tsx test/project_manifest.test.ts test/screen_click_crash_fix.test.tsx` — 13 pass，0 fail，46 assertions；页面跳转编辑、撤销/重做、画布跳转和关系清单通过。
- 全量测试：`bun test` — 1,274 pass，0 fail，10,038 assertions，137 files。包含候选渲染门禁、强制放行边界、组件版本、Token/样式资产版本与指纹，以及页面交互完整性诊断。存在部分 React `act(...)` 与模拟 IPC 错误日志，未导致测试失败。
- 类型检查：`bun run type-check` — 通过。
- 生产构建：`bun run build` — 通过；最大 JS chunk 约 1,020 kB，后续可评估拆包。

本阶段没有进行真实模型在线生成或浏览器像素回归；静态质量检查不等价于视觉验收。

- 本次额外定向回归：`bun test test/action_adoption.test.tsx test/guard_reject_modify_routing.test.tsx` — 23 pass，0 fail，71 assertions。
- 强制放行只绕过已明确由用户确认的结构守卫；HTML 安全检查仍生效，当前 iframe 实际渲染报告也必须完整且无 error，更新前会保存原页面检查点。
- Token 身份测试覆盖键顺序稳定、仅值变更递增、History undo/redo、持久化和 Manifest/Prompt 可见性；页面交互清单测试覆盖导航、按钮、表单标签和状态信号提取。
- scoped CSS 资产测试覆盖导入身份、CSS 修改版本递增、History undo/redo，以及 Manifest/Prompt 可见性。
- 交互诊断测试覆盖缺失锚点、断开的 ARIA 控制引用、表单缺少提交动作和无可访问名称控件；均为提示级结果，不声称验证了运行态行为。

## 2026-10-22 表单交互契约增量
- 定向回归：`bun test test/project_manifest.test.ts` — 7 pass，0 fail，22 assertions；覆盖表单字段分组、类型/标签/必填状态、提交动作及表单外 `form="id"` 提交按钮归属。
- 全量测试：`bun test` — 1,275 pass，0 fail，10,041 assertions，137 files。
- 类型检查：`bun run type-check` — 通过。
- 生产构建：`bun run build` — 通过；本轮构建最大 JS chunk 约 1,030 kB。
- Manifest 的 AI 表单摘要限制在 8 个页面、每页 2 个表单、每表单 5 个字段及 2 个提交动作；明确声明 HTML 结构契约不代表业务提交实现。

## 2026-10-22 浏览器截图比较器增量
- 可选依赖：`requirements-visual-regression.txt` 固定 Playwright Python 1.58.0 与 Pillow 12.3.0；浏览器二进制需单独安装。
- Chromium 145.0.7632.6：同一参考与页面 0 变化像素通过；将 CTA 色值改动后变化比例为 0.94%，阈值 0 时正确失败。
- 损坏图片资源：报告未就绪并阻止覆盖视觉基准；WebKit 浏览器二进制缺失时返回 `unavailable` 与非零退出码，不伪装为通过。
- 比较器输出浏览器/版本、操作系统、视口、资源错误、实际 PNG、差异 PNG、变化像素比例和平均像素差；基准更新需显式传入 `--update-reference`。
- 比较器关闭页面 JavaScript，与画框 CSP 的 `script-src 'none'` 保持一致；页面仍通过浏览器 CSS 布局与图片/字体加载进行渲染。
- CSP 对齐验证：对比器截图保持脚本修改前画面；以允许脚本的参考图比较时正确报告差异，不会执行目标 HTML 的行内脚本。
- WebKit 浏览器最初缺失，之后安装 Playwright WebKit 26.0 并完成双引擎回归：Chromium 145.0.7632.6 与 WebKit 26.0 分别用独立临时基准；相同页面均为 0 差异通过，按钮颜色改动均正确检出。该验证覆盖比较器，不等于 TauDesign 的全部画框已有视觉基准。
- 运行态边界复核：`ScreenFrame` 拦截画布普通点击用于选中元素，`screenDocument` CSP 禁止脚本、表单提交和嵌套 frame；按 PRD D7 将真实业务提交、角色分支和复杂页面状态转移排除在本次验收外。相关保证只覆盖 Manifest 静态交互契约与画框实际渲染。
- 本次仅修正文档验收边界；代码验证沿用同日全量回归（1,275 pass、类型检查和构建通过）。

## 2026-10-22 完整方案进度复核
- 复核对象是用户提出的四期完整方案，而非此前缩小的静态增量清单。`DesignTaskContract` 仍缺任务 ID、来源版本/过期信息与授权范围快照；导入、润色和局部编辑仍走各自执行/结果路径；`DesignSystemOrigin` 尚无设计库三种使用模式。
- 当前候选在 Store 中只保存目标、新 HTML、名称和可选修改请求；渲染报告只存内存。截图对比命令尚未接入候选采纳，也没有真实工程长期基准。因而此前自动化测试通过只证明现有实现稳定，不能证明完整方案交付。
- 本次是状态审计和文档更正，未修改运行代码；`task.md` 和 `check.md` 已显式列出未完成项。

## 2026-10-22 任务快照与资源门禁续建
- 同一工作流目录为现有主聊天、HTML 导入、单页/批量润色提供 ID、所需上下文、禁改范围和验收描述；任务合同保留任务 ID、原始请求、授权范围、保护节点、目标基线、实际知识来源及指纹。候选采纳前复核原页、设计系统 Token 与项目知识版本；旧候选沿用原有质量及渲染守卫。
- 工程清单现在识别未登记的 `data-asset-id` 和 HTML/CSS 本地资源路径。候选新引入未登记引用时，普通采纳、强制采纳和保留两版均拒绝；导入写入资源后调用工程存储 `exists` 核对实际文件。只读文件核对失败明确返回“不可核对”，不报告为通过。
- 定向回归：`bun test test/action_adoption.test.tsx test/project_manifest.test.ts test/design_workflow_contract.test.ts` — 30 pass，0 fail，106 assertions；HTML 导入 UI 定向回归 7 pass。
- 全量回归：`bun test` — 1,282 pass，0 fail，10,070 assertions，137 files。部分既有 React `act(...)` 警告仍存在，未导致失败。
- 类型检查：`bun run type-check` — 通过。构建：`bun run build` — 通过，最大主 JS chunk 约 1,040 kB。
- 开发服务：普通沙箱绑定 `127.0.0.1:5173` 遇到 `EPERM`；允许后 Vite 启动成功。Tauri 默认启动因已有进程占用 5173 退出；复用现有服务并临时覆盖 `beforeDevCommand` 后，Rust 桌面二进制编译成功并启动。两次测试进程随后退出，未关闭已有服务。
- `git diff --check` 通过。未做真实模型在线生成、真实工程资源全量磁盘审计和持续视觉基准验收；这些仍在任务清单中。

## 2026-10-22 页面分类与项目资源复核续建
- 检查器可编辑页面分组、静态设计状态及适用角色；修改通过 History，知识指纹随分类变化。两版保留的新页记录原页来源，工程 Manifest 报告断开的候选来源。分类仅用于静态设计，不提供运行态角色权限或状态机。
- 检查器新增按需项目资源核对：扫描现有页面的本地图片/图标引用及资源 ID，并用项目存储逐项核对文件。导入字体由独立资源管道管理，不误判为图片库未登记项；核对结果只反映本次扫描。
- 定向回归：`bun test test/screen_design_role.test.tsx test/side_by_side_replace.test.tsx test/project_knowledge.test.ts` — 25 pass，0 fail，103 assertions；包括检查器提交、History 撤销/重做、候选来源、缺失文件可见提示及知识版本。
- 最终全量回归：`bun test` — 1,286 pass，0 fail，10,083 assertions，138 files。`bun run type-check` 与 `bun run build` 均通过；主 JS chunk 约 1,046 kB。
- 最终 Vite 在独立端口 5174 启动成功后退出；此前 Rust 桌面二进制编译并启动成功。没有关闭用户原本占用 5173 的服务。
- 当前结果仍未证明四期方案整体完成：设计库只读/副本/编辑源模式、统一执行结果/受控修复、候选证据持久化、真实工程视觉基准和跨入口端到端交付门禁仍需继续开发。

## 2026-10-22 候选文件门禁与执行记录续建
- 该阶段候选新引入已登记图片或图标后，工程存储逐项核对真实文件；未完成、缺失、不可核对或不安全路径均阻止普通及强制采纳。补齐文件后可在画布重新核对。当时旧页面已有的缺失资源不自动阻断局部修改；此限制已在 2026-10-23 的最终候选资源核对中收紧。检查结果只绑定当前候选和本次核对，迟到结果不覆盖新候选。
- 主生成、润色与 HTML 导入转换共用执行记录结构，区分模型输出和确定性导入；模型记录保留原始响应、完整可用 HTML、结束原因、续写次数、错误、警告与质量报告。润色流失败时不再从残留内容提取候选。局部 DOM 操作及批量编排仍需进一步接入统一结果合同。
- 定向回归：`test/action_adoption.test.tsx`、`test/project_manifest.test.ts`、`test/bounded_continuation.test.ts`、`test/html_import.test.ts`、`test/design_stability.test.tsx` 均通过；两条聊天采纳 UI 用例更新为等待门禁状态刷新后再点击，定向 11 pass。
- 主生成与润色的执行记录可随候选暂存在内存，含原始响应与规范化后的候选 HTML；渲染证据键不包含大段原始响应。`test/canvas_tools.test.ts` 与候选门禁测试覆盖传递。
- 全量回归：`bun test` — 1,292 pass，0 fail，10,117 assertions，138 files；`bun run type-check` 与 `bun run build` 通过，`git diff --check` 通过。主 JS chunk 约 1,054 kB。
- 本轮沿用已完成的 Vite/Tauri 启动冒烟验证；没有对真实模型调用或长期真实工程视觉基准作通过声明。

## 2026-10-22 修改入口与局部执行证据续建
- 宽泛优化现在由同一工作流目录选中 `review-page-modification`；分析合同无授权 HTML 修改，并进入分析模型请求与聊天分析卡。明确元素和修改细节仍直接走局部副本路径，不触发分析列表。
- 元素、用户确认后的局部和区块修改候选都携带 `local-edit` 执行记录，记录最终 HTML、质量报告、目标节点、模式和实际操作数量；结构化模型回复未收集原始文本，因此 `rawResponse` 留空。执行记录仅暂存在内存，不宣称持久化。
- 定向回归覆盖路由、分析合同、明确元素、局部和区块候选及 History。全量回归：`bun test` — 1,293 pass，0 fail，10,133 assertions，138 files；`bun run type-check` 和 `bun run build` 通过，`git diff --check` 通过。构建最大主 JS chunk 约 1,056 kB。
- Vite 开发服务在受限沙箱绑定 `127.0.0.1:5174` 时返回 `EPERM`；经授权的同一启动命令随后报告 ready，已结束该临时服务。当前批次未重新启动 Tauri 原生窗口，沿用先前同日的桌面编译/启动验证。未进行真实模型在线生成或真实工程视觉基准验收。

## 2026-10-22 设计来源快照采纳门禁
- 任务合同补记设计系统稳定来源 ID，并在提示中显示来源 ID/指纹/Token 版本。采纳时同时核对来源种类、ID、来源内容指纹和 Token 版本；相同 Token 值但切换来源也阻断旧候选。只有 `modify` 和 `restyle` 合同可进入修改候选采纳；仅分析合同即使误暂存也被拒绝。
- 定向回归覆盖来源身份四种变化、普通/强制/保留两版入口、分析合同误暂存及任务快照不受输入对象后续变异影响。最终全量回归：`bun test` — 1,296 pass，0 fail，10,152 assertions，138 files；`bun run type-check` 和 `bun run build` 通过，主 JS chunk 约 1,056 kB。
- 临时 Vite 服务在 `127.0.0.1:5174` 报告 ready；Tauri 使用该服务完成 Rust 开发构建并运行 `target/debug/app`。两项冒烟验证后均已停止。本轮未接入真实设计库实体，也未验证在线模型或真实工程长期视觉基准。

## 2026-10-22 设计库项目副本增量
- 设计系统面板新增从另一 `.aidesign` 工程复制 Token 与自包含组件的入口。来源 `project.json` 只读；组件 ID 与内部组件引用按来源工程命名空间映射。来源本地资源、未知组件引用、来源与目标设备档位不一致均明确拒绝。源组件后来移除时，目标旧副本仍保留，避免页面引用断裂。
- 导入作为单条 History 事务覆盖当前 Token 并逐组件添加/更新，撤销/重做后工程状态正确；绑定来源 ID、指纹与 Token 版本经项目保存/加载、Manifest 和有界项目知识上下文传递。旧工程没有绑定字段可加载。定向 `test/design_library_copy.test.ts` 覆盖来源只读、缺资源/断链、设备、命名空间、指纹、History、再次导入、持久化与旧工程迁移。
- 全量回归：`bun test` — 1,298 pass，0 fail，10,175 assertions，139 files；`bun run type-check` 与 `bun run build` 通过，主 JS chunk 约 1,064 kB。临时 Vite `127.0.0.1:5174` 启动成功，Tauri `target/debug/app` 编译运行；验证后均停止。
- 该增量当时尚未提供实时只读引用、源库编辑或来源图片/图标自动搬运；也没有建立真实用户工程的浏览器视觉基准。

## 2026-10-22 设计库资源复制续建
- `readDesignLibraryCopy` 读取组件实际引用的来源图片/图标，拒绝未登记、不安全或缺失的资源；为目标工程生成命名空间资源 ID 和内容指纹文件名，改写组件 DOM 属性与内部 CSS 中的路径。来源文件保持只读。
- `installDesignLibraryCopyFiles` 在工程元数据变更前写入目标文件；写入中断则删除本轮新增文件。组件、资源登记与 Token 在单条 History 中保存，撤销/重做恢复元数据；文件留存供重做使用。保存的工程 JSON 不含 base64 文件内容。
- 定向 `test/design_library_copy.test.ts` 4 pass，覆盖路径重写、缺失文件、写入失败清理、History 和来源只读。全量 `bun test`：1,300 pass，0 fail，10,191 assertions，139 files；`bun run type-check`、`bun run build` 通过，主 JS chunk 约 1,067 kB。临时 Vite 与 `bunx tauri dev` 均启动成功，Rust 桌面进程运行后关闭。未建立真实工程视觉基准；只读实时引用与编辑源库仍未实现。

## 2026-10-23 候选跨重启恢复
- 增加工程内 `candidates/current.json` 侧车：保存候选 HTML、基线/项目知识/设计来源指纹、任务合同与执行记录。顺序写入/删除处理快速丢弃和采纳竞态；危险源码不存档，保存失败在画布标明。候选不写入 `project.json` 页面清单或会话 JSONL。
- 打开工程后恢复候选，但不恢复旧渲染和资源文件“通过”状态；两项检查重新运行，项目基线或上下文变化时阻断采纳。定向测试覆盖恢复、过期、快速丢弃、损坏或外工程侧车、危险候选替换和工作区打开路径。
- 第一次全量回归发现旧候选在同会话修改手动样式并重新渲染后被项目指纹误阻断；已收窄跨重启项目指纹检查到“从磁盘恢复”的候选，保留现有同会话重新渲染规则。最终 `bun test`：1,303 pass、0 fail、10,216 assertions、140 files；`bun run type-check`、`bun run build`、`git diff --check` 通过。Vite 与 Tauri 开发启动均成功并已关闭。尚未把预览图、历史渲染报告或真实工程视觉基准存入候选侧车。

## 2026-10-23 最终候选资源核对
- 资源文件门禁从“仅新增资源”扩展为候选最终页面全部本地图片/图标，覆盖 `src`、CSS URL 和 `data-asset-id`。原页保留的缺失或未登记资源不能通过普通或强制采纳；补齐文件后重新核对可继续。其它页面中的缺失文件不影响当前候选。
- `test/action_adoption.test.tsx` 覆盖旧引用缺文件、补齐后重新采纳、旧未登记引用及无关页面隔离；`test/project_manifest.test.ts` 覆盖 ID 与 CSS 路径收集。全量 `bun test`：1,306 pass、0 fail、10,226 assertions、140 files；`bun run type-check`、`bun run build`、`git diff --check` 通过。Vite 与 Tauri 开发启动均成功并已关闭。文件核对证明检查当时文件存在，不代表外部进程随后不能删除文件；真实工程截图基准仍未建立。

## 2026-10-23 候选验证证据与全项目资源审计归档
- `auditProjectAssets` 由项目资源面板和候选检查共用。候选核对以最终候选替代目标页后审计全部页面引用和已登记文件，报告记录时间、页面数量、逐文件路径及问题；仅候选使用的文件问题参与其文件门禁，其它页面的问题保留为工程级证据。
- `candidates/current.json` 保存实际源码安全/静态质量、交付检查、iframe 报告与项目资源审计，绑定候选/上下文/基线指纹、设备和 Token/设计库身份。画布“查看验收记录”展示范围和问题；历史证据只供回溯，当前采纳仍读取本次实际检查。损坏或不匹配候选指纹的证据会被丢弃而保留可恢复候选。截图和采纳后长期档案未在此增量中交付。
- `test/candidate_validation_evidence.test.tsx` 四项测试覆盖全项目缺文件不误阻断候选、真实返回的渲染发现完整存档、恢复不复用旧通过、报告容错和迟到审计隔离。最终全量 `bun test`：1,310 pass、0 fail、10,250 assertions、141 files；随后 `bun run type-check`、`bun run build`、`git diff --check` 通过，主 JS chunk 约 1,081 kB。`bun run dev` 与 `bunx tauri dev` 启动成功，Rust `target/debug/app` 运行后关闭。本批未进行真实工程像素基准或截图验收。

## 2026-10-23 长期交付档案与异步采纳
- `DeliveryRepository` 把交付方式、请求/执行记录、修改前后 HTML/CSS、实际验收证据和当时的 Token/设备/覆盖/引用资源保存在 `deliveries/screen-{hash}/{id}.json`。先原子写准备记录，再复核候选/项目/渲染上下文并经 History 应用；最后标记已应用。准备失败阻断页面修改；收尾失败保留明确标为状态待确认的准备记录。撤销/重做只改变页面，不抹去已经发生的交付事件。
- 普通、强制、保留两版共用异步采纳编排。实际点击重新核对引用文件；等待期间双击、取消、改页、切工程及新候选均有守卫。旧交付结束后的清理按候选 ID 匹配，不能删除后来的候选。聊天回调等待实际完成，跨项目或已有新候选时不写错会话状态。右侧“元素属性”在未选元素时显示“页面交付历史”，可查看请求、前后代码和历史验收；损坏记录逐份提示。
- 首轮全量测试在比较蒙版用例失败：happy-dom 无布局的 iframe 观察器在异步等待中发布 pending，正确阻断了手工通过的旧报告。该用例仅测蒙版，改为固定其观察器回调，保留所有生产检查。已有采纳测试同步更新为等待持久化完成。
- `test/delivery_archive.test.tsx` 9 pass，49 assertions：档案前后版本、History、准备失败、双击/过期、切工程、取消、点击前文件消失、迟到清理、保留两版与强制真实检查报告、收尾失败与损坏记录。最终 `bun test`：1,319 pass、0 fail、10,301 assertions、142 files；依次 `bun run type-check`、`bun run build` 与 `git diff --check` 通过，主 JS chunk 约 1,090 kB。Vite 和 Tauri 启动完成，临时进程已关闭。
- 新增可复跑 `scripts/verify-delivery-history.py`（复用 `requirements-visual-regression.txt`）：启动 Vite 后运行 `python3 scripts/verify-delivery-history.py --browser chromium --screenshot /tmp/delivery.png --report /tmp/delivery.json`。隔离浏览器自动创建测试工程，不使用在线模型或已有用户项目。Chromium 145.0.7632.6 和 WebKit 26.0 均由实际 iframe 渲染产生六项通过，再点击采纳、查看历史、重载并重新打开工程，页面与档案均保留。初次脚本未切到元素属性标签导致隐藏定位超时，修正标签切换后两浏览器通过；沙箱 Chromium 曾被 MachPort 权限阻止，同一测试经允许的本地执行完成。
- 可复核证据：`evidence/delivery-history-chromium.json`、`evidence/delivery-history-chromium.png`、`evidence/delivery-history-webkit.json`、`evidence/delivery-history-webkit.png`。这是受控测试工程的浏览器回归，存储走浏览器回退；真实用户 `.aidesign` 目录的端到端迁移/导出、在线模型以及候选预览图自动存档仍未在本批验收。

## 2026-10-23 交付版本首屏 PNG 归档
- 采纳前按交付快照设备/Token/导入元数据/L4 生成首屏图；复用 `exportScreenPng`，桌面优先原生，浏览器使用兼容渲染。图片写入工程 `assets/images/delivery-preview-{deliveryId}.png`，JSON 只存路径、尺寸、引擎和版本/上下文指纹。上限 6,000,000 像素、8 MiB，资源读取与渲染等待上限 15 秒；拒绝非 PNG、错误尺寸和覆盖已有历史图片。截图失败记录原因，不影响已通过现有门禁的代码交付；准备档案失败清理图片，已准备的历史图片随撤销保留。
- 补存交付前后 metadata，注册图片/图标与导入字体只在渲染内存解析为 data URL；L4 中的背景图也解析。修复保留两版丢失原页 L4 的问题，新页面及复制覆盖在同一 History 事务中撤销/重做。
- 页面交付历史按需读取图片，显示首屏范围和实际渲染引擎；旧记录、缺失图片、解码错误和损坏预览字段均有可见提示，损坏预览不隐藏有效页面代码/检查记录。预览仅为历史外观快照，不视为当前页面通过或跨浏览器像素一致性证据。
- `test/delivery_preview.test.tsx`：10 pass，57 assertions，覆盖移动设备/导入元数据/资源/L4、格式与尺寸拒绝、超时迟到、部分写入失败、保留两版及撤销重做、截图期间取消/基线变化/切工程、准备失败清理、按需读取/缺失/解码失败/旧档案和不安全路径容错。最终 `bun test`：1,329 pass、0 fail、10,358 assertions、143 files（21.59s）；依次 `bun run type-check`、`bun run build` 通过，主 JS 1,096.94 kB（gzip 346.81 kB）；`git diff --check` 通过。测试输出仍有既有 React act 警告，无断言失败。
- 扩展 `scripts/verify-delivery-history.py`：Chromium 145.0.7632.6、WebKit 26.0 均由真实 iframe 检查通过后采纳，生成 1440×900 PNG，展开预览并调用实际图片 decode，重载/重开工程后再次 decode 通过；两张应用截图已人工目视复查。证据位于 `evidence/delivery-preview-chromium.{json,png}` 与 `evidence/delivery-preview-webkit.{json,png}`。浏览器使用隔离工程和浏览器存储回退，实际引擎为 foreign-object；不宣称已验证真实用户工程或原生 PNG 实际捕获。
- `bun run dev --host 127.0.0.1 --port 5174 --strictPort` 沙箱监听 EPERM，允许本地执行后 ready；默认 `bunx tauri dev` 因已有 5173 服务退出，改用临时配置复用本轮 5174 服务，Rust 构建成功并运行 `target/debug/app`。不修改持久配置、不停止原有 5173 服务；本轮临时进程验证后关闭。
- 范围边界：本轮仅为采纳后的交付版本归档首屏图。未采纳候选的预览侧车、真实用户工程视觉基准/迁移/导出、设计库完整三模式与其余编排统一仍未全部完成。

## 2026-10-23 未采纳候选首屏预览与生命周期
- 把原交付预览实现收敛为 `PagePreviewCapture`，交付和未采纳候选共用真实 PNG、参考设备、Token、导入 metadata、资源解析、L4、超时及尺寸限制。候选当前 iframe 完成后后台生成，同一 key 去重、失败可显式重试；目标 metadata 纳入渲染 key。首屏图独立存储，侧车无二进制；截图不写页面/配置/History，不替代质量或实际渲染门禁。
- 候选侧车的原子保存、删除和替换串行处理 PNG 引用；成功换图后清旧图，写失败清理新 PNG。图片路径精确绑定候选 ID 与独立 UUID，拒绝前缀相似的其它候选路径。采纳档案不引用临时图，交付继续有独立 PNG。丢弃、替换、切工程或采纳完成后的迟到截图不恢复候选，亦不删新候选图片。
- 候选验收面板增加首屏图、进度和重试，恢复出的图即使上下文 hash 相同也标为历史，live 检查仍为空；设备/Token/原页/L4/资源和元数据变化后按当前上下文重新检查。候选与交付共用 `StoredPagePreview` 按需安全读取，缺图、错误尺寸和解码失败可见。
- 新增 `test/candidate_preview.test.tsx` 11 项：等待真实报告、去重、最新证据不丢、History 不变、相同 key 恢复仍不得放行、metadata 失效、失败重试、四种迟到取消、条件清理、侧车写失败及外来路径拒绝；已有 10 项交付图测试继续通过，共用 PNG 测试数据生成器。首轮两个用例失败分别因漏填 finding.actual/expected 和读图缓存后未重新展开；全套另有同 key 恢复用例写死 revision 的测试隔离错误。均已修复并记录打回；最终 `bun test` 1,340 pass、0 fail、10,415 assertions、144 files（22.43s）。既有 React act 警告仍存在，未出现测试挂起。
- 依次 `bun run type-check`、`bun run build` 通过；主 JS 1,103.66 kB（gzip 348.06 kB），`git diff --check` 通过。Vite 127.0.0.1:5174 ready；Tauri 临时配置复用该服务，Rust dev 编译成功并运行 `target/debug/app`，不修改持久配置/不停止已有 5173 服务。临时进程验收后关闭。
- `scripts/verify-delivery-history.py --candidate-preview` 扩展验证未采纳预览、真实图像 decode、重开工程时历史图存在且 render=null、delivery=pending，再次 iframe 完成后新 PNG 替换并删除旧图，采纳后删除临时图且长期交付图保留。Chromium 145.0.7632.6 和 WebKit 26.0 均通过，证据 `evidence/candidate-preview-{chromium,webkit}.json`、`candidate-preview-{chromium,webkit}-candidate.png` 及交付状态截图 `candidate-preview-{chromium,webkit}.png`；图片均已目视复查。
- 浏览器首轮 Chromium 在保留旧图的 pending 中间态被脚本误认为新图，已增加当前 key / pending=false / 已保存条件；后续 Vite HMR 使脚本无时间戳导入产生另一份工作区 store，诊断为工程列表、iframe=0、无页面异常，改为复用应用已加载模块 URL 后两浏览器通过。一次自动审批超时，允许的单次重试获准后完成，未留下权限阻塞。失败诊断现能输出页面错误、候选与渲染状态和独立截图，避免盲目延长等待。
- 验收边界：浏览器使用隔离测试工程与浏览器存储回退，PNG 实际引擎为 foreign-object。Tauri 本轮仅验证启动；不宣称真实用户 `.aidesign` 工程原生 PNG、像素基准/迁移/导出或完整四期重构已完成。

## 2026-10-23 共享模型终结器与重塑执行服务
- 新增 `modelHtmlResult.ts`，主 Pipeline 与润色共用原始响应提取、完整性、源码安全、移动导航规范化及静态质量终结；先拒绝危险/未闭合原文再解析，取消或显式传输错误不能接纳残留 HTML。润色仍使用独立的严格结构授权，保留完整原始 fragment 兼容性；旧提取接口也委托共享终结器，避免残留分叉。
- `restyleExecutor.ts` 管理单目标续写及实际执行记录；`restyleBatch.ts` 冻结试跑队列/上下文、复用一次确认结果、依次解析当前目标。外部编辑、切工程和取消阻止迟到应用与后续模型请求；自身组件更新/实例同步后刷新后续页面基线。只有 store 实际应用返回 true 才计入成功，false 计入 conflict，生成或应用异常计入 failed，已应用项保留 History。
- 面板只组装上下文并展示状态，防重复点击、关闭时取消、卸载后不写迟到结果。单页局部润色补真实执行记录。store 应用入口重新核对当前基线、源码安全、质量、结构及当前手动保护节点；验证失败不增加 checkpoint 或修改 History，页面备份仅在通过复核后建立。
- 相关回归：`bun test test/aesthetic_a3.test.ts test/design_workflow_secondary.test.ts test/modification_review.test.tsx test/local_copy_modification.test.tsx test/bounded_continuation.test.ts` 为 75 pass / 0 fail / 288 assertions；新增 `test/restyle_execution.test.tsx` 为 14 pass / 0 fail / 68 assertions。覆盖真实 Pipeline/润色结果、取消非协作模型、危险/未闭合响应、History 撤销、组件实例同步、三类迟到变化、旧试跑、假成功/异常计数、store 复核和面板重复点击。
- 最终依次 `bun test`、`bun run type-check`、`bun run build`：1,354 pass / 0 fail / 10,484 assertions / 145 files（20.91s）；`tsc --noEmit` 无错误，Vite 1808 modules 构建成功（2.24s），主 JS 1,108.28 kB / gzip 349.56 kB。测试仍有既有 React act 警告，未出现挂起。`git diff --check` 通过。原始本机日志为 `/tmp/tau-restyle-{initial,execution,full-final,types-final,build-final}.log`，统计与覆盖范围在本报告归档。
- Vite 127.0.0.1:5174 启动 ready；Tauri 通过临时 build 配置复用该服务，Rust dev 构建完成并运行 `target/debug/app`，未修改持久配置、未停止已有 5173 服务。本轮临时进程验证后关闭。
- 验收边界：AI Core 使用受控响应，未调用在线 Provider；本批未新增像素/浏览器截图验证，也未将批量重塑接入实际 iframe 渲染、资源物理核对及长期交付档案。局部结构化编辑仍是独立编排，完整方案的剩余任务继续保留进行中。

## 2026-10-23 批量重塑实际渲染与资源门禁
- 新增 `PageRenderCheck` 独立同源 `iframe srcdoc` 检查面：使用项目参考设备、权威 CSS/Token、移动导航、原页 scoped CSS 和 L4；本地图片/图标/导入字体只在内存解析。等待既有真实几何观察器完成，8 秒内未完成、不可测量、取消、缺图或严重视觉问题均拒绝应用；清理 iframe、计时器和监听，不注入宿主正文。相同文档的重复 load 去重绑定。资源存在性不等同于所有 CSS 背景图均已解码，不宣称业务交互验收。
- 抽出 `projectComponentSync` 纯投影，沿用实例叶文本/图片保留、组件版本及 L4 冲突保护，供手动同步与预检共用。批量组件同时检查独立模板和所有将变更的实例所在页面；模板与页面全部通过后，写入已检查的精确 HTML，并在单条 History 中撤销/重做，不重新生成另一份页面。对未受影响或手动保护跳过的页面不作新的通过承诺。
- `prepareCheckedRestyle` 冻结写集，核对完整引用（含保留的图片与 L4 背景）及实际文件，渲染后再检查文件及上下文。公共 `applyRestyleOutcome` 改为唯一异步入口，移除同步旁路；批量等待其结果并记录真实 validation、失败原因和计数，面板支持展开逐页渲染发现。取消、工程/内容变化、并发旧结果不会污染单页候选、checkpoint 或页面 History。长期批量交付档案尚未接入。
- 先复现两处缺口：异步 apply 的 Promise 曾被当作 true（14 pass / 1 fail），原同步公共入口可绕过实际渲染（专项断言失败）。分别修复为等待结构化应用结果及唯一异步公共入口。生命周期专项两次打回涉及模拟环境 load 次序、跨工程 checkpoint 假设和移除 iframe 后读取空 Document；处理过程记于 `check.md`，未放松生产门禁。最终四套定向回归 `page_render_check`、`restyle_validation`、`restyle_execution`、`aesthetic_a3` 为 63 pass / 0 fail / 209 assertions；本批相对上轮增加 18 项测试。
- 最终依次 `bun test`、`bun run type-check`、`bun run build`：1,372 pass / 0 fail / 10,559 assertions / 147 files（21.06s）；`tsc --noEmit` 无错误；Vite 1811 modules，构建成功（2.44s），主 JS 1,115.80 kB / gzip 351.95 kB。既有 React act 警告仍存在，无测试挂起；`git diff --check` 通过。原始本机日志 `/tmp/tau-restyle-gates-{special,full-final,types-final,build-final}.log` 及两份 `tau-restyle-browser-*.log`。
- 新增可复跑 `scripts/verify-restyle-gates.py`：在隔离浏览器工程调用真实异步应用入口及批量编排，不替换渲染器、不使用在线模型。Chromium 145.0.7632.6 与 WebKit 26.0 均通过：移动页面真实检查、透明按钮拦截且无 History、缺失本地资源阻断、补齐 PNG 后资源实际加载并恢复、PC 检查、组件及两个实例页批量验收、整批撤销/重做、零核验 iframe 泄漏。JSON 与目视复查的工作台截图位于 `evidence/restyle-gates-{chromium,webkit}.{json,png}`；两个引擎分别记录实际 findings，未将跨引擎外观差异视为像素一致。
- Vite 127.0.0.1:5174 ready；Tauri 临时配置复用服务，Rust dev 完成并运行 `target/debug/app`。沙箱曾拒绝监听和 Chromium MachPort，经允许的本地命令完成验证。未修改持久构建配置或停止既有 5173 服务。Tauri 仅验证启动；本批浏览器使用本地存储回退，不宣称已验收真实用户工程、原生截图、旧工程迁移/导出、完整设计库三模式或完整四期重构。

### 独立复核修复与最终复验
- 复核确认 Chromium/WebKit 离屏 lazy 图片均不进入加载范围，正常图片会被误判未就绪。新增专项先得到 4 pass / 1 fail（loading 实际 lazy、预期 eager），随后只在核验用内存文档设置 eager；原 HTML 不改，首屏外图片同样覆盖。CSS 背景解码仍属于前述边界，不将文件存在性误称为解码成功。
- 修复后四套定向 64 pass / 0 fail / 211 assertions；按序全量 1,373 pass / 0 fail / 10,561 assertions / 147 files（22.16s）、类型检查通过、生产构建通过（1811 modules，2.46s，主 JS 1,115.88 kB / gzip 351.97 kB）。既有 React act 警告保留。日志沿用上述 final 路径，失败复现另见 `/tmp/tau-render-lazy-red.log`。
- 实际浏览器脚本新增注册本地 PNG 的 lazy 页面：真实检查通过，应用后源码仍为 lazy。Chromium 145.0.7632.6 与 WebKit 26.0 全流程重新通过，JSON `checks.lazy` 保存实际报告，截图已重新目视复查。未用模拟观察器替代浏览器门禁。
- 独立复核再次运行 5 项生命周期专项并核对双浏览器 lazy 报告，确认已修复，无剩余阻断发现。本轮 Vite/Tauri 临时服务均已关闭。

## 2026-10-23 批量重塑长期交付归档
- 新增 `restyleDeliveryRepository.ts` / `restyleDelivery.ts`：每个已检目标保存单一原子事件，组件及所有实际更新页共存，记录请求合同、批次、原始执行、实际 source/quality/render 与资产核对、设计系统/来源/设备、前后组件和页面、L4/资源快照。真实页面首屏 PNG 复用 `PagePreviewCapture`，路径绑定事件与页面序号，JSON 不嵌入图片二进制；模板无实例时仍有事件和模板验收，不声称存在页面截图。
- `applyRestyleOutcome` 开始时冻结来源及结果，先核验精确写集、生成独立 PNG、原子准备档案，然后重新检查资源文件与上下文/取消，才在单条 History 写入结果并完成档案。准备失败不改页面/checkpoint/已有候选，未归档图片清理；准备后编辑/切工程/取消或资源消失则事件标取消。应用后状态收尾失败返回 applied=true 和 prepared 回执，可查看不确定状态，不谎报未应用。撤销/重做不删除历史。
- `restyleBatch` 统一批次身份并接收归档回执和实际同步提交瞬间的 key；若异步收尾期间发生人工修改，下一项停止，不能把外部修改纳入自身基线。页面属性与批量面板共用按需 `RestyleDeliveryHistoryPanel`，展示版本/实际证据/执行/首屏图与失败原因，缺预览或坏预览不隐藏有效代码；重开后按历史证据展示，不据此放行当前页面。扫描可扩展到最近 200 次事件，更早记录仍在 deliveries/restyle 下。
- TDD 首先在真实应用入口复现无持久档案（13 pass / 1 fail）；新增每页实际源码/静态证据断言也先失败再接入真实报告。独立复核发现外部损坏来源名称可触发 React child 崩溃：四种坏嵌套字段隔离回归先红（11 pass / 1 fail，invalidFiles=0）后绿；仓库读取校验来源/主题/设备名称和设备档位，坏记录单独计数。复核再次运行三套 41 项通过并确认原 P2 已修复、无新增 P1/P2。
- 新增 `restyle_delivery.test.tsx` 15 项：历史读取/PNG独立、准备及原子写失败/清理、编辑/切工程/取消、归档期间删除图片、收尾失败回执/撤销、收尾期间人工修改阻止后续模型、组件有/无实例、坏记录/坏预览/路径拒绝、来源对象污染、PNG写入后取消和跨工程迟到读取。首轮跨工程 UI 用例因 React act 批处理，旧 release 在新 effect 前触发，测试停在 loading；拆为两次 act 后正确验证迟到结果隔离。一次批量用例使用 addScreen 前旧状态 key 导致未进入 finish，修正为确认时最新 key，不放松生产守卫。
- 6 套相关回归：94 pass / 0 fail / 377 assertions。最终依次全量 `bun test`：1,389 pass / 0 fail / 10,642 assertions / 148 files（22.67s）；`bun run type-check` 无错误；`bun run build` 成功（1814 modules，2.42s），主 JS 1,130.94 kB / gzip 355.42 kB。保留既有 React act 警告，无挂起。`git diff --check` 通过。本机日志 `/tmp/tau-restyle-archive-{special-final,full-final,types-final,build-final}.log`，首红/复核首红分别见 `/tmp/tau-restyle-archive-red.log` / `/tmp/tau-restyle-bad-archive-red.log`。
- 扩展 `scripts/verify-restyle-gates.py`：Chromium 145.0.7632.6 / WebKit 26.0 实际 iframe 验收后 3 个批量目标全部应用，归档 3 条共批次记录；组件事件含 2 个实例页、3 份实际检查；总计 4 张 390×844 首屏 PNG 实际 decode，通过撤销/重做后刷新并重开工程，3 条记录和 4 PNG 均保留，再在真实属性面板展开历史及图片并 decode。原有透明按钮、缺图/补图、lazy、PC/mobile、零检查 iframe 泄漏继续通过。最终 JSON 与已目视复查的截图为 `evidence/restyle-archive-{chromium,webkit}.{json,png}`。窄栏刷新按钮补不换行/不收缩约束，空态明确区分单页采纳与重塑记录。
- Vite 127.0.0.1:5174 ready；Tauri 用临时 build 配置复用该服务，Rust dev 0.64s 后运行 `target/debug/app`，未修改持久配置或停止既有 5173 服务。浏览器使用隔离测试工程和 localStorage 回退，PNG 实际引擎为 foreign-object；Tauri 仅启动检查，未冒充真实用户 `.aidesign` / 原生 PNG / 迁移导出验收。未调用在线 Provider，模型及无布局单测使用受控响应，真实浏览器未替换渲染器。完整四期方案仍有局部编排、目录/设计库模式及真实工程验收待办。
- 本轮 Vite/Tauri 临时进程已在验收后关闭；最终文档与代码 `git diff --check` 通过。

## 2026-10-23 结构化局部修改执行收敛
- 新增 `structuredEditExecutor.ts`：元素操作、已确认局部操作/补充、区块替换与纯润色局部共用只读执行编排，输入/合同冻结，校验工作流、目标原页指纹、设备和授权节点；每次结构化模型请求前后、最终结果前检查取消和调用方快照。成功保存完整副本、真实目标与操作数量和 `local-edit` 执行记录；失败/取消/过期不返回 HTML，无整页兜底，无补充的局部不需要 Provider。继续调用现有 DOM 安全引擎和 Rust/Core 网络通道。
- `useAIEngineChat` 的直接元素、已确认局部/区块与 `RestylePanel` 局部润色接统一服务；保留明确元素不再分析、宽泛建议用户选择、候选并排与原页保护、实际 iframe 门禁和采纳归档。结构化接口无原始模型文本，rawResponse 保持空，未伪造 finishReason 或续写。
- 独立复核确认既有修改快照未覆盖来源/决策/组件等变化，新增六类真实模型首请求期间变更测试先红（13 pass / 6 fail），随后快照叠加实际项目知识指纹、设计来源/库、资源登记及目标全部 metadata，下一请求停止；位置、测量和焦点不失效。二次复核发现知识摘要排除样张，补目标 name/HTML/scopedCss 独立基线，样张两个用例先红后绿。最终复核 25 pass / 0 fail，无新增 P1/P2。
- 另补缺授权节点在补充请求前拒绝、模型传输错误伴随项目过期时返回 stale，均先红（19 pass / 2 fail）后绿；原始 HTML 源安全移至移动导航规范化前，防止解析器修复残缺源后误放行（24 pass / 1 fail → 通过）。新模块最初尚未实现时测试因缺少模块无法加载，该记录不作为行为性失败证据；上述实际行为断言均已单独复现。
- 类型首轮发现两处可选 binding 未初始化，已显式初始化。两个旧焦点回归在分析后新增页面，与知识变更过期规则冲突，改成分析前预建页面、等待期间只切焦点，目标不漂移断言保留；失效引用错误提示继续明确“引用元素”。打回历史保留于 check.md。
- 6 套相关回归 107 pass / 0 fail / 385 assertions。最终按序 `bun test`：1,414 pass / 0 fail / 10,712 assertions / 149 files（21.38s）；`bun run type-check` 无错误；`bun run build` 成功（主 JS 1,134.14 kB / gzip 356.66 kB，2.17s）。保留既有 React act 警告，无挂起；`git diff --check` 通过。日志 `/tmp/tau-structured-{special-final,full-final,types-final,build-final}.log`，行为失败复现另见 snapshot-red、boundaries-red、specimen-red、source-red。
- 新增 `scripts/verify-structured-edits.py`，在隔离浏览器工程通过真实统一执行器、候选 iframe、采纳和 DeliveryRepository：local/element/region 请求分别 0/1/1，执行器不改原页；3 个结果分别采纳，3 张实际 390×844 PNG 解码，刷新重开后三条档案与当前页面一致。Chromium 145.0.7632.6、WebKit 26.0 均通过，证据 `evidence/structured-edits-{chromium,webkit}.{json,png}`，工作台截图已目视复查。模型使用受控结构化对象，浏览器渲染/PNG/仓库未模拟，无在线 Provider 请求。
- Chromium 末轮两次在 evaluate 中报 execution context destroyed，pageErrors 为空，未得到稳定根因；加入阶段、导航及控制台诊断后连续两轮通过（`/tmp/tau-structured-chromium-{diagnostic,final}.log`）。未将其称为已修复的产品缺陷或修改页面逻辑，失败截图保留。WebKit 复验通过。该脚本用于开发服务环境，仍不等同于真实用户工程跨入口迁移/导出验收。
- Vite 127.0.0.1:5174 ready，Tauri 临时 build 配置复用该服务，Rust dev 0.47s 后运行 target/debug/app；未改持久配置/未停止原有 5173 服务。浏览器用 localStorage 回退与 foreign-object PNG，Tauri 仅启动检查。本增量未宣称目录已驱动全部门禁、完整设计库三模式或完整四期重构完成。
- 本轮 Vite/Tauri 临时进程均已在验收后关闭，最终文档与代码 diff 检查通过。

## 目录验收计划与实际阶段证据（2026-10-23）
- `workflowValidation.ts` 从目录派生版本化计划和指纹；合同携快照，候选/批量/结构化入口共用身份和策略核对。目录删除阶段不能去掉源码、质量、资源、渲染与修改结构底线；旧合同缺计划时按当前目录推导，旧候选无合同时保留既有硬门禁。未知、错配、篡改、过期或无法执行的必要阶段全部阻断，不能强制绕过。
- 候选按实际源码/质量/结构/资源登记/文件/iframe 检查生成阶段报告，采纳与批量长期档案保存同一计划及实际证据。面板展示阶段状态，恢复的历史证明不填充当前渲染检查。保留显式强制的既有质量/结构例外，原被跳过阶段仍记录 blocked，不伪造 ready。纯润色沿用树守卫；明确节点/区块按授权根并集检查范围外 DOM，补上范围外属性（如按钮 disabled）保护；整页结构授权沿用原语义。
- 先红后绿行为证据：工作流身份首轮 26 pass / 2 fail；批量和结构化入口 39 pass / 4 fail；计划阶段 5 pass / 6 fail；范围外属性 10 pass / 1 fail；目录删除结构底线 10 pass / 2 fail（其中一处是新增底线后的预期同步）。最后资源/归档证明专项 12 pass / 3 fail，定位候选遗漏 L4 图片引用及汇总状态可与逐项 blocked 矛盾。候选/批量现共用只读审计投影，不写回页面 CSS；未登记或缺失的 L4 背景图片同样拒绝强制采纳。相互矛盾的历史阶段报告判无效。修复后 32 项资源/工作流相关测试通过。
- 最终 7 套定向回归：99 pass / 0 fail / 356 assertions。按序全量 `bun test`：1,435 pass / 0 fail / 10,772 assertions / 150 files（23.07s）；`bun run type-check` 无错误；`bun run build` 成功（主 JS 1,142.17 kB / gzip 358.81 kB，2.06s）；`git diff --check` 通过。日志 `/tmp/tau-workflow-{special-final,full-final,types-final,build-final}.log`，失败复现见 identity-red、executors-red、stages-red、scope-red、minimum-red、proof-red，资源修复复验见 proof-green。
- 浏览器脚本新增计划及实际阶段证明断言。Chromium 145.0.7632.6 与 WebKit 26.0 均完成候选 local/element/region 三模式（请求数 0/1/1）、实际 iframe、采纳、三条档案/三张 PNG 解码与刷新重开；批量均完成三个实际目标、共享组件/两个实例页、四张 PNG、整批撤销/重做、历史面板实际图片解码与重开，全部应用的计划为 ready。证据 `evidence/workflow-plan-candidate-{chromium,webkit}.{json,png}` 与 `evidence/workflow-plan-batch-{chromium,webkit}.{json,png}`，四张工作台截图已目视复查。模型返回为确定性对象，真实渲染/仓库/图片未模拟，无在线 Provider 请求。重开截图可能仍显示当前渲染检查中，符合历史证据不放行当前候选的规则。
- Vite 127.0.0.1:5174 ready，Tauri 复用临时 devUrl 配置，Rust dev 0.36s 后运行 target/debug/app。验收后仅关闭本轮 Vite/Tauri 临时进程，未改持久配置或停止原有 5173 服务。Tauri 仅启动检查，浏览器使用隔离 localStorage 工程与兼容 PNG；不等同真实用户工程/原生截图/在线 Provider 全入口验证。
- 本轮完成候选/批量应用计划与结构化入口预检，不宣称导入预览、分析格式、新建页面整个生命周期或参考图/设计库/多页面目录均已接齐。设计库实时只读/编辑源库、受控一次修复及真实工程迁移/导出验收仍在总清单。本轮采用行为回归、代码自查及双浏览器核验，没有新增独立智能体复核。

## AI 新建页面应用门禁与创建记录（2026-10-23）
- 新增 `pageCreationValidation.ts`：冻结工程、实际项目文档、页面/渲染元数据、来源/设计库、Token/设备/导航与资源快照；按 create 目录计划核对工作流、策略、授权、源码完整/安全、静态质量、登记/真实文件、参考设备 iframe，应用前再查文件与上下文。没有实际检查器的新增阶段不能伪通过。源码在解析/导航/NID 处理前验证，页面和 History 在成功前不变。
- `CanvasToolExecutor.executeAsync` 为 AI 新建唯一执行入口，同步 create 明确拒绝；任务并发/已应用去重，来源参数不受调用方后续污染。自动新建、手动补挂共用异步入口，聊天等待结果；失败不报告成功，取消/过期不写页面。修复创建补挂失败可能退回旧页修改的路径。保留空白页/样张/复制原有 History 动作，不改 Rust AI 请求通道。
- 页面 metadata 只保存创建合同、来源/静态/实际渲染证据、计划、文件和指纹，不保存整个原始模型响应或完整 HTML/图像 base64。ProjectRepository 读写、单步撤销重做、旧工程缺记录和坏记录 UI 均回归；新增 `PageCreationEvidencePanel` 展示中文阶段与历史说明，页面变化后标明内容已变化。创建记录不作为当前验收授权，原页面/当前候选不被替换。
- 行为失败复现：同步绕过与残缺源码首轮 0 pass / 2 fail（`/tmp/tau-create-sync-red.log`），修复后通过；消息集成首轮 1 pass / 1 fail，确认 htmlOutput 代码卡片遮挡实际失败原因，修复 ChatDrawer 未挂载卡片及重试状态后通过。期间类型检查发现 union 参数与未定义 busy 变量，均修复。AI 文档自查回归 26 pass / 1 fail（`/tmp/tau-create-ai-document-red.log`），因知识指纹会排除 AI 文档，创建快照现独立覆盖全部实际文档；先红后绿。
- 存盘专项首轮 28 pass / 1 fail 是测试把含方法的整个 Zustand store 交给只读数据仓库，structuredClone 正确拒绝；改为真实 ProjectDocument 字段后通过。全量首轮 1,460 pass / 4 fail，旧路由单测缺真实布局环境被新门禁拒绝；明确添加 `test/helpers/pageCreation.ts` 渲染替身，仅用于路由/History 单元测试，保留实际浏览器验证，不降低生产门禁。
- 最终新建三套专项 31 pass / 0 fail / 111 assertions；回归还覆盖旧聊天卡片/落点/补挂、命名和自动聚焦。按序 `bun test`：1,466 pass / 0 fail / 10,883 assertions / 153 files（21.12s）；`bun run type-check` 无错误；`bun run build` 成功（主 JS 1,152.16 kB / gzip 361.77 kB，2.07s）；`git diff --check` 通过。日志 `/tmp/tau-create-{special-final,full-final,types-final,build-final}.log`。保留既有 React act 等测试日志警告，不将它们声明为已全部消除。
- 新增 `scripts/verify-page-creation.py`。Chromium 145.0.7632.6 与 WebKit 26.0 在独立 PC/mobile 工程实际执行新建门禁：透明主按钮/未登记缺图被拒，重复任务只创建一次，成功记录实际检查节点、源码/质量/计划与上下文；撤销/重做、独立 HTML 导出（含按钮内容、不含创建诊断和移动预览壳）、刷新后重开两个工程及展开创建记录均通过。证据 `evidence/page-creation-{chromium,webkit}.{json,png}`，最终中文面板截图已目视核查。此脚本不模拟 PageRenderCheck，不调用在线模型；聊天消息的真实 Hook 路径由集成测试补充。
- 本地 Vite 启动最初两次自动审批超时，沙箱内监听返回 EPERM，未当作安全风险定性。用户明确允许启动本机服务/测试浏览器后，Vite 127.0.0.1:5174 ready；Tauri 用临时 devUrl 配置，Rust dev 0.15s 后运行 target/debug/app。验收后两个临时进程已关闭，未修改持久配置。浏览器用隔离 localStorage 工程；Tauri 仅启动检查，无真实用户工程修改、无原生 PNG/在线 Provider 验收。
- 新建应用门禁已收敛；导入和分析完整生命周期、参考图/设计库/多页面目录、设计库三模式及全入口真实工程迁移/导出仍在总清单。本轮未新增独立智能体复核，不宣称完整重构方案全部完成。

## HTML 导入确认与应用门禁（2026-10-23）
- 三种导入模式的结果附完整 `DesignTaskContract`；目录与共享 `prepareNewPage` 增加 import 用途，强制源码/质量/引用/文件/实际 iframe/导入预览阶段，描述符删除阶段不能弱化底线。旧保留/统一/选择性 CSS 转换算法保持，源 CSS 自定义类只作既有警告，不误作为生成类白名单的硬拒绝。合同核对模式、策略、源指纹、设备、设计系统及授权类别，未知阶段 fail closed。
- `HtmlImportDialog` 的转换预览加入独立标记和指纹，绑定有效 Token、明暗、设备/导航、转换模式/类别、名称和结果 HTML/CSS；实际 iframe load 必须匹配当前标记才启用确认。任意 load/旧预览不能授权新结果。busy ref 防双击，选项修改或卸载/切工程会让异步确认失效；等待完整应用后才关闭。预览未就绪时明确提示先查看当前页面对比。
- store 的 `importHtmlScreen` 改为等待共享校验的 Promise，缺少应用合同/回执即拒绝；统一按工程串行，冻结原页/资源/文档/主题/选择。先以内存二进制和当前存储核验图片及字体读取、资源登记/文件和真实渲染，通过后才持久化；再检查写入内容与所验上传 bytes 相同、文件仍存在和工程快照，最后原子写页面/资源/可选提取主题与导航，仍为单条 History。旧数据层测试明确用 `seedImportedScreen` 装载已保存文档，未把绕过渲染称作导入验收。源码安全、格式、真实门禁均由新增专项与 UI/浏览器路径覆盖。
- 复用页面创建记录保存合同、完整计划、源码/质量/实际渲染、文件（包括 `assets/imports/fonts`）与指纹，不保存上传 base64 或模型原始输出；旧工程无记录正常显示，历史不放行当前结果。图片/字体文件存在性与被读取不等于任意资源格式或逐像素保真保证。写盘后中断可能留下未登记文件，不冒险删除可能被并发复用的内容，不注册错误页面或改变主题。
- 行为先红后绿：原同步导入无预览合同也写页，新增回归 0 pass / 1 fail（`/tmp/tau-import-preview-red.log`），异步入口修复后通过。三模式专项首轮 19 pass / 1 fail 是测试误把“统一全部类别”断言为保留 spacing，按既有定义修正预期，生产转换未改。预览协议测试最初假设 DOM 模拟器不会自动 load，得到 37 pass / 1 fail；改为捕获阻止 load，再分别发布错误/正确标记，直接验证协议。保留完整失败记录于 check.md。
- 最终 8 套相关回归 102 pass / 0 fail / 441 assertions；全量按序 `bun test`：1,500 pass / 0 fail / 11,008 assertions / 154 files（23.51s）；`bun run type-check` 无错误；`bun run build` 成功（主 JS 1,157.52 kB / gzip 363.64 kB，2.29s）；`git diff --check` 通过。日志 `/tmp/tau-import-{special-final,full-final,types-final,build-final}.log`。保留既有 React act 日志警告，不将其称为已全部消除。
- 新增 `scripts/verify-html-import.py`，在 Chromium 145.0.7632.6 / WebKit 26.0 真实操作文件选择、三种模式/选择类别、原貌下提取主题、当前预览加载和确认；每个结果比较预览与画布的卡片颜色/圆角/间距，原貌精确保留白底/19px/18px。三个实际图片写入/解码、RGBA 像素 [255,0,0,255]、去除源状态栏、单步撤销恢复主题、重做、三个独立工程刷新重开、创建证据展开均通过。另通过真实 UI 触发不可见按钮、缺失字体拒绝，页面数保持。重开末页也等待 data URI/图片自然尺寸/解码完成；证据 `evidence/html-import-gates-{chromium,webkit}.{json,png}`，最终图片均可见，截图已目视复查。
- 浏览器脚本首轮错用按钮名“画面”，实际为“页面”，修正后复验。截图曾发现 WebKit 图片未显示；增加等待仍未解决，随后检查确认初始测试 PNG 的 IDAT CRC 错误。更换标准 zlib/正确 CRC 的 16×16 测试 PNG 并加入解码像素断言后两引擎一致；没有为损坏测试素材修改生产导入器，也不将尺寸/decode 通过等同任意格式的完整像素保证。
- 沿用用户此前明确允许的本机服务/浏览器验证；Vite 127.0.0.1:5174 ready（93ms），Tauri 临时 devUrl 配置复用该服务，Rust dev 0.46s 后运行 target/debug/app。验收后临时 Vite/Tauri 均已关闭，未改持久配置。浏览器用隔离 localStorage 工程，无真实用户工程修改、无在线模型或原生 PNG 验收。本轮为代码自查、行为回归及双浏览器实际验证，没有新增独立智能体复核。
- 导入确认/应用已收敛；分析完整生命周期、参考图/设计库/多页面目录、设计库实时参考/编辑源库及全入口真实工程迁移/导出等仍按总清单推进，不声明完整重构全部完成。


### 页面修改分析生命周期（2026-10-23）
- 范围：宽泛修改分析及单页润色分析接当前目录身份/计划预检、原页/请求/设备/Token/保护范围核对；analysis-schema 是不可删除底线，没有执行器的阶段在模型调用前阻断。输入独立克隆，每次请求前后、纠正前及返回前检查取消和工程快照。完整字段/数量/操作协议由代码核验，仅格式错误最多一次纠正，网络异常不重复请求。
- 结果记录真实尝试次数、实际 Token/设备/知识版本和上下文指纹、局部/区块安全降级原因。聊天与润色确认前核对建议指纹、基线、当前计划和选择；未知/重复建议及被改写结果拒绝。来源回执随执行候选进入当前侧车和已有长期交付档案，候选与历史面板只读可查看，损坏来源隔离，历史不恢复执行权。没有把格式通过宣称为视觉通过；明确元素细节仍直接局部修改。
- `test/modification_analysis_lifecycle.test.ts` 32 pass，覆盖身份/基线/请求/设备/Token/范围/计划、不支持阶段、协议字段/数量、非协作模型返回后过期/取消、纠正中途变化、冻结输入、实际降级、确认选择和源导航域。`test/modification_analysis_evidence.test.tsx` 3 pass，覆盖检查/纠正/降级展示、只读 JSON 重开和损坏隔离。聊天补两项过期不纠正/未知选择与篡改拒绝；局部实际采纳用例验证来源在候选和长期档案一致，润色用例断言来源接线。
- 自查新增导航回归先红：30 pass / 2 fail，分析返回总数 22，而实际默认/自定义操作域应为 19/21。修复为规范导航副本执行定位和预算，原始指纹仍绑定合同，复验 32 pass / 0 fail；未修改旧页面本体。
- 最终按顺序执行：`bun test` **1,537 pass / 0 fail / 11,134 assertions / 156 files / 23.55s**；`bun run type-check` 成功；`bun run build` 成功（主 JS 1,166.17 kB，gzip 366.72 kB，2.15s）；`git diff --check` 通过。运行时 Bun 1.3.5，macOS；摘要保存在 `evidence/modification-analysis-regression.txt`。全量仍有既有 React act 提示，不当作无警告运行或实际浏览器证明。
- `scripts/verify-modification-analysis.py` 在 Chromium 145.0.7632.6 与 WebKit 26.0 通过实际聊天 UI：第一次受控错误输出纠正一次，分析记录/降级原因可查看，默认未选择不授权；选择局部后无额外模型调用（分析合计两次、stream 为零），原页不变、真实 iframe 门禁通过后采纳，来源随候选/交付保存，工程重开后与原记录一致。再次分析期间改变原页，非协作模型返回无效格式也不会纠正（总调用数保持三次）、不落候选。报告与分析/候选展开截图为 `evidence/modification-analysis-{chromium,webkit}.{json,png}` 及 `*-review.png`。
- WebKit 首轮脚本截图后直接调用采纳，被重新 pending 的实际渲染门禁拒绝；最终记录显示 complete → pending → complete，等待当前真实 ready 后双浏览器通过。生产渲染门禁未放宽；首轮失败截图保留供复查。
- Vite 127.0.0.1:5174 ready（75ms）；Tauri 临时配置复用该服务，Rust dev 5.17s 后运行 `target/debug/app`。已关闭本轮临时 Vite/Tauri，未修改持久配置或停止其它服务。浏览器使用隔离 localStorage 工程和受控模型响应、真实 iframe；Tauri 仅启动检查。未调用在线 Provider、未修改真实用户工程，也未冒充原生 PNG/真实参考设备像素基准验收。
- 本增量验收通过。完整方案仍未全部完成：参考图/设计库/多页面专门工作流、设计库只读实时引用/编辑源库、完整实体一致性与受控设计修复、真实工程全入口迁移/截图基准和导出仍在总清单中。


### 设计库副本预览、隔离与资源导出修复（2026-10-23—24）
- 实施范围：完善既有 `project_copy`，不把它包装为只读实时引用或编辑源库。`DesignLibraryImportPanel` 替换 ThemeEditor 的直接导入；选择器前固定目标工程，读取完先显示主题、Token 版本/指纹、组件新增/替换、资源清单和冲突。确认时走 `designLibraryImport.ts` 的私有一次性会话，冻结输入、核对预览/当前工程、重读来源、先查文件冲突、安装后再查源和目标字节，最后同步调用既有单条 History。取消/切工程/设计变化/卸载、双击、来源变化和文件写失败不提交元数据；部分已写文件可能复用时保留并说明，不冒险清理。
- `readDesignLibraryCopy` 的 v2 来源指纹稳定覆盖库身份、设备、主题身份/Token 版本、组件名/说明/插槽/模板/版本及引用资源内容和元数据，忽略保存时间、来源页面、组件时间戳和 refCount。每轮读取前后复核 JSON 与资源，Token 类型和编译、资源元数据、重复 ID/路径、不安全/缺文件、6 MB UTF-8 清单和既有数量/二进制上限在预览前检查；仅保留实际组件/主题字段。导入回执存有限文件指纹/时间/源/目标上下文身份，不存来源绝对路径或二进制；可只读展开，坏诊断隔离、旧绑定兼容。
- `test/design_library_import.test.ts`、`design_library_import_ui.test.tsx`、`design_library_resources.test.tsx`、既有 `design_library_copy.test.ts` 最终 **55 pass / 0 fail / 237 assertions**，覆盖只读来源、预览不写、冲突/变化/取消/非协作读取、冻结与篡改、重复确认、中途写失败/数据损坏、保留文件、单条 History/撤销/重做/重开和 UI 状态。首轮一个断言误认为 setColorMode 提交 History，改用真实主题 History 动作验证；生产导入未因此降低约束。自查资源 name 对象先红，补元数据类型预检后通过。
- 浏览器发现库图片链路缺陷：`useScreenResources` 原先仅解析 HTML 导入的 SHA256 图片名，遗漏正常库命名和图标；新增回归先 **0 pass / 3 fail**。修复为从实际资产登记传递安全路径，解析普通页 HTML/CSS 图片/图标，资产登记更新触发重读，并拒绝迟到旧工程结果；源码保持相对路径。增加迟到读取后 **4 pass / 0 fail**，画布/导出共用。未以“文件已写”代替图片成功。
- 新来源主题预览复用 compact 时原先只调整 iframe 高度，造成“可视化”逐字换行、色板六列挤压；compact 改标题/控制分行、按钮不拆字/不收缩、色板两列。两浏览器实际按钮高度/行高16px，宽度约75px，截图复核通过。
- PNG 浏览器兼容路径实际视觉打回：WebKit 输出780×572但页面只绘390×286，32×32 CSS图片仅有1024红像素。隔离复测捕获的实际 SVG，确认并非资源解码或 onload 时序，WebKit 忽略嵌套 XHTML 的 viewBox 缩放；改为物理像素 SVG viewBox 和保留 CSS 390px 布局的 HTML 容器绘制缩放，未把1x位图拉伸作为兜底。更新既有 SVG 结构验收；XHTML/资源相关 **14 pass**。原生优先与错误拒绝未变。
- 最终按顺序 `bun test` **1,588 pass / 0 fail / 11,336 assertions / 159 files / 23.27s**，`bun run type-check` 成功，`bun run build` 成功（主 JS **1,178.27 kB / gzip 370.05 kB / 2.18s**），`git diff --check` 通过。回归摘要为 `evidence/design-library-import-regression.txt`。全量有既有 React act 提示，不宣称无警告；Bun 1.3.5、macOS。
- `scripts/verify-design-library-import.py` 在 **Chromium 145.0.7632.6 / WebKit 26.0** 通过实际 ThemeEditor 入口、来源预览/主题样张/清单、确认、来源更改拒绝、文件选择器等待期间切工程、一次 History、Undo/Redo、组件插入、工程重开与导入回执。来源为隔离的只读 native IPC 测试夹具，源写调用数0；目标使用真实浏览器 ProjectStorage，未替换资源解析器或导出器。登记资源重开后实际 decode 为16×16，canvas像素 **[255,0,0,255]**。
- 实际点击导出 UI 下载 HTML/PNG；自包含 HTML 在独立页面解码成功且不含移动导航壳。两浏览器2x PNG均780×572，红色图片64×64（4096像素）。直接兼容引擎的1x/2x/3x实际检查分别390×286/780×572/1170×858、图片边长32/64/96、面积1024/4096/9216，位置按倍率一致。报告、预览/确认截图、实际 HTML/PNG/SVG 为 `evidence/design-library-import-{chromium,webkit}*`。不宣称所有字体/阴影跨引擎逐像素一致。
- Vite 127.0.0.1:5174 ready（74ms）；Tauri 临时配置复用服务，Rust dev0.42s后运行 `target/debug/app`。已关闭本轮 Vite/Tauri 临时进程，不修改持久配置。Tauri仅启动检查，浏览器来源IPC是测试替身，不等同真实文件夹/原生PNG全流程验收；未调用在线模型、未向真实用户工程执行导入/生成。
- 本增量验收通过。完整四期重构仍有只读实时引用/编辑源库、参考图/设计库/多页面专门工作流、完整实体一致性与受控设计修复、真实工程全入口/迁移/设备截图基准等待办。


### 固定版本只读设计库参考（2026-10-24）
- 新增 `pinned_reference` 与 `project_copy` 并存，ThemeEditor 可先选择使用方式，再分析/预览/确认。来源始终只读；固定版本缓存在当前工程，保存 Token 身份、组件/资源定义及真实文件内容指纹。不保存来源绝对路径或二进制正文。Store 保护 Token/库组件定义/资源删除，HTML 导入不能接管参考 Token，批量队列排除受保护定义且核验器再次阻断绕过；页面实例仍可独立调整和显式同步。
- 更新仅允许当前同源且必须预览确认；图片 ID 按内容区分版本，旧资源/上游已删除定义保留并继续保护，现有页面实例不自动重写。转为项目副本通过一条 History 解锁并保持外观；导入/更新/转换支持撤销重做、存盘与重开。快照/实体漂移在创建/候选/重塑门禁阻断，真实缓存字节在检查与提交前复核。异常快照须显式转副本再重新导入。
- 首轮相关回归 **54 pass / 1 fail**，新增工程 effect 在 React 合并更新时误取消刚为新工程开始的选择；移除多余 effect，保留现有冻结上下文/isCurrent/卸载取消保护。新专项首轮 **22 pass / 1 fail**，测试错误把 RestylePlan 当数组；改用实际 queue 验证。修复后相关5套 **72 pass / 0 fail / 368 assertions**；再新增“旧缓存被覆盖阻断更新、返回绑定与保存快照一致”用例，进入最终全量通过。
- 只读 UI 细查发现 preset div 不受 disabled fieldset 约束，改为真正可禁用、保持左对齐的按钮；颜色模式仍可预览。主题选择器/受保护组件与资源删除/HTML 风格提取展示禁用原因；损坏参考可在来源区查看原因和显式转副本。
- 最终按顺序运行 `bun test` **1,606 pass / 0 fail / 11,473 assertions / 160 files / 24.61s**；`bun run type-check` 成功（2.45s）；`bun run build` 成功（主 JS **1,187.13 kB / gzip 372.80 kB**，Vite2.21s，含类型构建总4.73s）。`git diff --check` 通过。摘要见 `evidence/design-library-reference-regression.txt`。现有套件仍有 React act 提示，不宣称零警告。
- 新脚本 `scripts/verify-design-library-reference.py` 在 **Chromium145.0.7632.6 / WebKit26.0** 验证实际 ThemeEditor：模式选择、预览未安装、禁用 Token/主题按钮及4个 Store 修改入口；同源更新、更新 Undo/Redo、旧实例不改写；刷新离线重开、实际 iframe 的旧红图/新绿图 decode 像素分别 **[255,0,0,255] / [0,255,0,255]**；通过真实导出 UI 下载自包含 HTML 并在独立页面得到相同像素；转副本解锁及撤销重做保持外观。报告与锁定/离线/转换截图、实际导出 HTML 见 `evidence/design-library-reference-{chromium,webkit}*`。
- 浏览器使用隔离只读 native IPC 来源夹具，源写命令数0；目标使用真实浏览器 ProjectStorage/资源加载/iframe/HTML 导出，非真实来源文件夹或原生 PNG 全流程。Vite5174 ready98ms；Tauri复用服务，cargo dev0.46s后运行 target/debug/app。本轮临时Vite/Tauri均已停止，无持久配置改动、无在线模型调用、未改真实用户工程。
- 本增量验收通过；固定版本参考不等于后台实时同步。完整重构仍待编辑源库、参考图/设计库/多页面专门工作流、完整通用设计库实体一致性/受控修复，以及真实工程迁移与全入口设备截图基准验收。


### 参考图与设计库新建专门工作流（2026-10-24）
- 新增 `create-page-from-reference`、`create-page-from-library` 与 `create-page-from-reference-library`，与普通 `create-page` 共用统一创建与历史管道；问答、主题、宽泛分析和明确局部修改保持既有优先级。来源依实际本轮附件/当前库绑定分流，不靠用户提及关键词。多页面工作流仍未完成，不以改目录名称冒充多页生成。
- `workflowSources.ts` 对实际发往引擎的最后一条本轮 user 消息检查图片身份和当前请求，生成 provider/model、图片/请求/消息内容指纹回执；无效/不支持图片在请求前失败。合同保存名称/内容指纹，不含 data URL，也不接收来路不明的旧回执。历史 imageUrl 不再重复送模型。当前库身份、模式、源版本和完整绑定指纹必须匹配，页面组件 ID 真实存在、显式版本与定义一致；不强制无关组件复用。普通旧工程兼容，有绑定的工程不能用旧通用创建合同跳过当前库核对。
- 两类必要来源阶段由可执行工作流 ID 保底，删除目录中的阶段或 requiredContext 无法关闭门禁。创建、实时上下文与保存证据共享；历史读取检查合同/验收计划工作流身份一致，损坏来源诊断隔离。页面创建记录显示图片、库来源与两项阶段，并明确“输入检查不代表视觉相似度”。
- 附图协议恢复 PRD §3.2.4 的优先级：用户授权/功能、项目设备导航、当前 Token/组件规范先于参考图外观；图片内文字是来源资料。明确局部修改时图片不授权整页重写；只读图片问答不注入强制生成协议。保留既有图片布局/表单/按钮/内容范围指引与输出约束。
- 首轮类型检查因接线批量替换重复 manifest 属性报 TS1117，已修复并重新检查。既有6套 **73 pass / 0 fail / 258 assertions**；新增来源专项最初30项，后补公共历史图片清理、显式字段归档、当前请求输入与坏库请求前阻断共 **34项**。相关7套 **107 pass / 0 fail / 390 assertions**（随后增加同项中的历史计划身份不一致断言）；新增专项/历史 UI 复验 **35 pass / 0 fail / 142 assertions**。
- 最终按顺序执行 `bun test` **1,640 pass / 0 fail / 11,606 assertions / 161 files / 25.34s**，包含既有截断/续写回归；`bun run type-check` 成功（2.49s）；`bun run build` 成功（主 JS **1,197.79 kB / gzip 376.16 kB**，Vite2.22s，含类型构建总4.77s）。`git diff --check` 通过；Bun1.3.5、macOS，既有 React act 提示仍存在，不宣称零警告。摘要见 `evidence/workflow-sources-regression.txt`。
- `scripts/verify-workflow-sources.py` 在 **Chromium145.0.7632.6 / WebKit26.0** 通过真实 ChatDrawer：4种来源组合、真实 file input 上传 PNG、绑定固定版本设计库、实际图片/消息指纹对比、统一真实 iframe 门禁、原页不变、工程 JSON 重开记录相同、实际属性面板来源/限制提示。第5次受控模型响应等待时转项目副本，非协作迟到输出未新增页或候选（仍2页）。报告与各流程/最终截图见 `evidence/workflow-sources-{chromium,webkit}*`。
- 浏览器首轮 JSON 重开严格比较打回；实测 `isPageCreationEvidence` 为 true，字段差异仅 render.reason 在内存为 undefined，Playwright/Python桥转 null，而 JSON 存盘正确省略。脚本将预期值先按真实 JSON 边界归一化，保留全部有效字段严格比较；未修改生产存储、未放宽门禁。失败截图保留，第二轮与最终双浏览器均通过。
- 本轮浏览器是隔离工程和受控模型流输出，未调用在线 Provider，不代表参考图像素相似度或真实模型设计能力通过。Vite127.0.0.1:5174 ready181ms；Tauri复用服务，Rust dev0.50s后运行 target/debug/app，仅启动验证。本轮临时Vite/Tauri已关闭，未改真实用户工程或持久配置。
- 本增量验收通过。完整重构仍待多页面计划/逐页交付、编辑源库、通用实体一致性与受控设计修复，以及真实工程迁移/全入口设备视觉基准等验收。


## 2026-10-25 复杂 PC 静态流程与验收状态收敛

仅新增 scripts/verify-pc-workflow.py 与文档，无生产代码修改。源指纹 `2b5329b1600e678f809397705df68bdb091d43607e602e83b67d50d120aa4df7`。创建/局部/润色/原貌导入、三PC参考设备真实文档与HTML/PNG/重开双引擎通过；40/40当前入口，2,078 pass / 0 fail / 13,278 assertions / 176 files / 31.94s，类型0、构建2.42s，Vite及Tauri target/debug/app启动通过。原貌导入前后及画布/HTML完整像素相同；PNG按既有12/255容差补充6/6通过，严格初轮差异和三次脚本错误保留，未修改业务门禁。

[完整报告](./evidence/pc-workflow/report.md)、[矩阵](./evidence/pc-workflow/matrix/report.json)、[当前范围](./completion-status.md)。本轮合成PC，不声称真实复杂PC/在线Provider/其它平台或原生IO重跑。


## 2026-10-25 当前绑定在线服务与工程文案泄漏

用户确认阿里百炼/qwen3.8-flash，首轮原生5类静态服务通过但人工发现工程说明泄漏；System合同修正后第二轮仍失败，第三轮规划/页面请求分离边界后通过。15次真实请求、配置未变、浏览器直连0、证据无密钥；三轮各自指纹与失败保留。最终当前源`bdaa57c546e14f5baaa40cbc5ff67b2a4cd175011a70f3bf0d1777cd65a2bb32`，2,078 pass/0 fail/13,278 assertions/176 files/32.53s，类型0，build2.46s/1841模块/主JS1321.25kB gzip416.07kB；40/40入口矩阵、最终2页×两引擎4份预览通过。原生运行及服务均已退出。

[报告](./evidence/live-provider/report.md) / [最终矩阵](./evidence/live-provider/matrix-final/report.json)。原生harness为内存服务检查而非在线UI/History，提示规则不是通用语义门禁，具体业务事实仍需审阅。原生文件IO/其他模型/其他平台未混作本轮重跑。


## 2026-10-25 在线聊天采纳与History闭环

新增显式启用scripts/verify-live-chat.py，无生产代码修改；当前源`7b5934c83ad71684b47e62a09c402fc62bddde3241f1983a947b561d25e91228`，去除新增脚本后等于上一bdaa57…冻结源。两引擎各2次真实qwen请求，实际UI发送/iframe引用/候选预览/采纳/撤销重做/刷新卡片重开/390×844历史PNG解码通过。两轮脚本失误保留，合计7次请求启动，1次用量未知，未作假成功。AIService/Vite回退、第三方直连0、凭证仅内存/报告扫描/用户配置不变。2,078/0、13,278断言、176files、33.94s；类型0、构建2.48s/1841模块/1321.25kB gzip416.07kB；Tauri4.38s编译Running，服务与浏览器全部收尾。

[报告](./evidence/live-chat/report.md)。40入口未重复，沿用相同生产源的上一冻结矩阵；本次在线UI不冒称Rust原生UI。


## 2026-10-25 取消生成的上游终止

开发代理断开传播、原生Ready注册/按ID取消/释放及共享前端桥接完成。Chromium4项、WebKit4项、真实Tauri/Rust8项本机检查通过，零在线Provider请求。2,085 pass/0 fail/13,294断言/177files/31.93s；23 Rust通过；类型0；build2.73s/主JS1321.69kB gzip416.19kB。40入口首轮39项通过，Chromium复杂PC发生上下文销毁，独立完整复测通过，首次原因未确认且原始失败保留。源da9f3a847ecfb25d05526eca79143c5a91f1810de1b64bb236dc0acc7d2e94e0，详见[报告](./evidence/request-cancellation/report.md)。原生编译2.61s运行验证；全部临时服务已停止。旧在线报告保持旧冻结版本，不冒称本轮重跑。


## 2026-10-26 PC异步脚本及大页面恢复

PC测试Promise回收原因已确认并修复；用户随后增加大页面输出上限处理，本次最终2,106/0、类型/构建、42/42矩阵、原生合成渲染与真实qwen后缀验证通过。逐版本边界和打回见[大页面测试报告](../large-page-generation/test.md)及[PC诊断](./evidence/pc-context-diagnostic/report.md)。
