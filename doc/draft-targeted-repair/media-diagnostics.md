# 媒体偶发错误诊断补充

## 目标与边界

历史 Chromium A 失败文件仅保留候选 render=pending，未记录底层错误名称、阶段、文档身份或时间线；其余三项失败是验证程序 new_page(viewport) 参数错误。后续自然导航16检查全部在当前文档重新ready，旧WebKit注册取消单列。现有证据不能确定历史唯一诱因，不把恢复机制或新增诊断写成根因修复。

补充最多200条内存诊断及遗漏计数，按匿名文档/会话、内部screenId、preview/export、固定阶段/状态、次数/耗时、有限错误名称/类别与最多两级cause名称、worker/controller状态记录。无自动持久化、上报；不采集message/stack/URL/路径/HTML/二进制/Provider配置。只在用户点击失败面板的“导出资源诊断”后调用现有保存通道，显示保存、取消或失败反馈。换文档后内存重置。

## 任务与验收（实施前）

- [x] 固定字段白名单、200环及遗漏计数，导出副本不允许篡改后污染内存。
- [x] 会话记录启动/接管/注册ack/释放/一次自动重试及close，不改变重试次数/worker策略；错误原因最多两级有限名称。
- [x] screen/style hook记录读取、成功、失败与卸载取消，切页后旧事件不能覆盖新资源状态。
- [x] 画布/导出失败区显式下载JSON，仅点击保存，保存/取消/失败反馈；模型0调用。
- [x] 恶意Error的message/stack/cause包含URL、凭据、HTML及二进制标记时输出完全不含；覆盖200上限/副本隔离/未知字段/取消/传输ack阶段。
- [x] 针对测试与类型检查通过；全量/构建由主智能体统一执行。

## 验证记录

- 6个直接套件40 pass / 0 fail、275断言（1.373s），包括恶意message/stack/URL/base64/未知字段、最多2级cause、200环与遗漏、副本隔离、实际注册/ack丢失、screen/style取消及显式UI保存/取消/失败。日志：`evidence/media-diagnostics/final/unit.log`。
- `pnpm run type-check`通过，0类型错误；定向`git diff --check`通过。主智能体统一全量与构建尚待完成，当前不声称已完成本轮全面回归。
- Chromium/WebKit各manual/cancel，共4真实SW检查：失败面板点击前下载0；点击后实际下载JSON，随后手动重读成功；取消切页后新图64px实际解码，register/release成功ack及卸载缓存0可核验。每检查28/21事件，History0、源HTML不变、pageerror0、模型/外网请求0。证据：`evidence/media-diagnostics/round-01/result.json`及两份`*-explicit-diagnostics.json`，sourceInputs与最终生产源码匹配。
- 准确最小接入差异见`evidence/media-diagnostics/final/diagnostic-integration.patch`；前态是逆转本轮精确补丁重建，3份beforeSHA与既有round-02记录一致。ExportModal没有此前记录的独立SHA，明确只按本轮3处接入重建，不虚构历史摘要。
- 内部screenId仅保留受限screen-生成格式或UUID；自定义ID省略，通过匿名session/事件序号串起阶段；不新增散列或放宽任意ID字符串。没有自动持久化/上报，页面重开后内存重置；至多200事件，遗漏数明确显示在JSON。
- 历史失败553730字节文件SHA与精确字段复核保留在`evidence/media-diagnostics/final/historical-evidence-review.json`。Chromium A只有render=pending，其他3项是harness参数错误；未标归属的全局worker错误不能追认为Chromium根因。已有16自然检查全部当前ready，2条旧WebKit取消另列。没有找到支持新自然场景的证据，不再盲跑同类导航。

该能力只改进后续采证，不声称重现或修复历史Chromium诱因。worker文件、重试上限与失败策略未改变，原工程采纳由独立任务处理，视频继续排除。
