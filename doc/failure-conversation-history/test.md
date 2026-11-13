# 验证记录

日期：2026-11-12。范围：分区布局图片证据传递、失败会话保存和只读恢复。

## 根因及回归

只读检查现有失败任务后确认：原需求、参考图解析和首次输入回执有效；7个功能分组进入 SectionedPatch 后，布局 JSON 子请求重建消息时遗漏了同一份解析。复用业务规划的重试因此在0次模型调用时被发送前校验拒绝。修复显式传递 `ReferenceEvidence`，保留原门禁；没有降低来源要求或重新发送图片二进制。

失败对话原先绕过成功分支的 JSONL 追加。新存档覆盖活动生成、分析、多页、元素和确认区块修改的失败/拒绝/停止；冻结工程来源及原需求，独立附件落盘，有界投影去敏诊断。实时记录和旧任务补入按同一 taskId 去重，跨月份也只保留一份；显式重试有独立任务身份。已存在会话优先显示，任务完整性验证和补入随后执行，无可补入项时不重复读取会话。

| 项目 | 验证依据 |
| --- | --- |
| 分区消息 | `test/page_task_generation.test.ts` 使用真实 DefaultAIEngineCore 编码与 MockTransport：自动7功能布局1次、正文3次；4次真实发送前均调用 recordReferenceInput，最后用户消息保留原多行需求与相同解析；无图片字段 |
| 原门禁 | 现有 reference_evidence_pipeline、reference_field_coverage、workflow source 套件保持来源绑定、损坏/缺失、取消、预算与规划复用约束 |
| 保存 | `test/failure_conversation_archive.test.ts` 验证同任务并发去重、跨月实时/补入去重、原任务清单不变、SHA-256独立图片、去敏、图片失败仍留正文、JSONL失败返回false、压缩保留失败、坏可选字段不丢正文 |
| 对话真实分支 | `test/failure_conversation_chat.test.tsx` 覆盖0请求失败及显式重试、分析、多页、元素、确认区块、随后Provider预检失败、停止及迟到回调、跨工程写入、重挂载只读恢复与文本复用 |
| 现有流程 | 区块确认、独立进度、聊天滚动、功能修改、创建、规则来源、参考图修改等恢复与采纳/撤销回归 |

确认区块每次执行在Provider等预检前创建新合同，清除旧保存提示；否则预检失败可能误用上次taskId而被去重。成功仍恢复原分析卡的分析来源，候选保留实际执行来源。

## 浏览器

`scripts/verify-failure-history.py`：Chromium/WebKit × mobile/pc，4组通过。使用真实浏览器图片解码、独立存储、模型请求编解码和 ChatDrawer；Provider采用本地合成传输并阻断所有外网请求。原页和History未改、失败存档1轮；重挂载后显示失败诊断，点击“重新使用该需求”只填输入框，未发新请求、未附图、未创建候选、未恢复执行按钮。

证据：[结果](./evidence/2026-11-12-browser/result.json)、[WebKit移动端截图](./evidence/2026-11-12-browser/webkit-mobile-restored.png)。这是浏览器会话重挂载验证，不宣称完整退出桌面应用后重启或真实Provider再次生成。

`scripts/verify-reference-retry.py --output doc/failure-conversation-history/evidence/2026-11-12-reference-retry`：同样4组通过；实际编码调用序列 vision→plan→code→code（纯推理失败）→code（用户明确保留解析重试），无重复识图/规划，代码请求无图片编码；独立任务/图片可重读，候选保留原字段，原页/History未修改。证据：[重试结果](./evidence/2026-11-12-reference-retry/result.json)。

## 最终顺序回归

按顺序完成：

- `pnpm test`：3,751 pass，0 fail，314个文件，23,048个断言，128.51秒。含新停止存档与确认区块Provider预检重试用例。
- `pnpm run type-check`：退出0，无TypeScript错误。
- `pnpm build`：退出0，Vite生产构建成功（1,970模块，3.32秒）。
- `git diff --check`：通过。

[完整测试日志](./evidence/2026-11-12-regression/pnpm-test.log)、[类型日志](./evidence/2026-11-12-regression/pnpm-type-check.log)、[构建日志](./evidence/2026-11-12-regression/pnpm-build.log)。测试日志仍含部分既有React act提示和负向用例的预期错误输出，不作为失败；最终统计0失败。

回归过程中发现先验证旧任务会延迟已有历史恢复，已调整为先读会话、再有界补入，并避免无补入时重复读取。最终全量包含聊天滚动和各历史来源/附件恢复用例。

## 限制

- 已存在的失败任务按现有索引上限补入最近40项可验证且有错误摘要的未完成记录；旧任务原文件不变。此前未写入任务或会话的失败正文无法凭空恢复。
- 失败记录已写入JSONL才显示“已保存”；辅助写入失败保留当前UI并提示检查目录/空间，不虚报成功。强制结束进程前尚未写入的瞬时UI不作为已存档保证。
- 本次不改Rust、HTML/PNG导出或真实用户原页，不将用户工程发送给模型，不执行git操作。
