# 请求与旧入口审计

日期：2026-10-29。范围：当前源码中的页面/文本/图标模型调用、core/transport 与 Rust 代理。静态审计配合受控测试，不代表抓取真实 Provider 流量。

## 传输边界

| 位置 | 当前源码行为 | 统计结论 |
| --- | --- | --- |
| DefaultAIEngineCore.generateObject | 一次 streamText 后检查结束原因并解析 JSON | 对象调用按一次应用请求预算；格式纠正由上层有限循环负责 |
| AIServiceTransport | 有 Provider 消息时委托 AIService；否则选 FetchTransport | 分支选择，不是失败后自动更换传输重试 |
| AIService.stream | Tauri 分支结束/报错后 return；浏览器分支一处 fetch | 未发现显式网络失败后重发；桌面请求继续走 Rust |
| FetchTransport | 一处 fetch，随后循环读取 body | 读取分片不是新模型请求；浏览器重定向不作为可观测模型计数 |
| TauriRustTransport/nativeProxy | 一次代理 IPC；Ready 后可发取消 IPC | 取消不是生成重试；新请求和取消身份分开 |
| Rust proxy_stream_request | req.send 失败直接返回；重定向逐跳校验，最多 5 跳 | 不能将一次应用调用宣称为一次 HTTP 往返；未新增显式错误重试 |

当前账本记录应用级模型调用与申请额度，不提供底层连接/网络包计数，不将 HTTP 重定向视为已计费生成。依赖库或浏览器内部行为不由本次静态审计证明；未来若添加显式失败重放，须接入同一父账本并新增测试。本轮没有修改网络重试、重定向或 SSRF 策略。

## 找到并修复的页面修改旁路

PropertyInspector 原 Point-and-Edit 用正则提取同名嵌套 HTML，并在 finally 中清理响应后直接替换原页。此路径绕过 TaskContract、范围检查、完整结束判定及候选流程，可能在失败/晚到响应后写回。

已改为：捕获工程/原页快照 → 建立明确元素合同 → executeStructuredEdit → 当前目标复核 → stageScreenChange 副本候选。根预算由结构化执行器负责，元素切换/卸载取消；原页和 History 在采纳前保持。模型不允许自动升级整页重写或修改未授权节点。

## SVG 资源入口

AssetModal 原 SVG 入口直接用 AIService.stream 将增量内容放入宿主 SVG。已改为一次有界 core 调用，只在完整结束后解析、校验并发布：仅允许有限单色 SVG 几何元素/属性，拒绝脚本、事件、文字、外部引用、样式与嵌套 SVG 根。取消/切工程后不更新。校验不证明图标好看或 viewBox 内几何视觉居中，仍需预览判断。

ImageGenerator 当前实际代码为本机 Canvas 程序化图片生成，没有在该文件发现 Provider 调用；不为其虚构模型 Token 预算。连接测试属于配置探测，独立于画框生成任务，未将它当成本轮页面生成已验收。

## 可复核证据

- `test/inspector_structured_edit.test.tsx`：一次结构化请求、嵌套原文保留、采纳前无 History 修改、网络失败、切元素取消和晚到响应。
- `test/icon_svg_generation.test.ts`：完整形状、围栏、危险/破损/外部片段、length 结束拒绝及取消不发请求。
- `test/design_evidence_cards.test.tsx`：旧记录兼容、坏记录容错、推断/事实、实际调用/仅选择以及申请/用量区分。
- `scripts/verify-design-evidence.py`：Chromium/WebKit 实际组件、1280/768 宽度无横向溢出、请求仅一次、原页不变、候选元素范围；外部请求全部拦截，实际发生数为 0。

以上不能替代真实模型、完整用户工程、原生导出与发布验收；完整当前测试结果见 [test.md](./test.md)。

## 2026-10-30 增量

元素 JSON 局部修改已可选使用同预算场景规则。withGuidanceReceipts 现在同时包装 streamText 和 generateObject；后者委托原 core 的解析/结束原因校验，不变成一次额外请求。可选协议字段及 Schema 指纹区分对象输入，旧回执兼容。该记录仍是应用语义边界，不是 HTTP 或计费确认。

新增 test/structured_guidance.test.ts（12 项）覆盖真实 core＋MockTransport 的 Schema、窗口长度、指纹、安全范围、失败/取消/过期及旧数据。浏览器脚本同时用真实 core＋内存传输跑 JSON 试点；Chromium/WebKit 均为一个 completed/json-object 回执，原页不变，外部请求 0。详见 test.md。
