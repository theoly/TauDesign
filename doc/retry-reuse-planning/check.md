# 重试信息复用与弹性重试 验收标准 (Acceptance Checklist)

> 早期 CHK-F 记录保留供追溯；本轮实际验收以“2026-11-11 修订验收”下 RP-C01～11 及2026-11-12证据为准。

## 功能验收 (Functional Checks) — 里程碑增量验收（任务完成时执行）
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-RRP-01 | 规划完成触发 `onTaskPlan` 时，当前正在生成的消息即时挂载 `pageTaskPlan` 和 `workflowContract.pageTaskPlan`，若后续生成流发生错误中断，该规划不丢失 | 单元测试断言消息状态 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-01 Pass) |
| CHK-F-02 | T-RRP-02 | 当消息中已有 `pageTaskPlan` 时，点击重试调用 `retryTurn`，`sendMessage` 自动复用该规划，执行时跳过 `preparePageTaskPlan`，不再调用模型进行功能梳理，进度提示明确展示复用状态 | 单元测试模拟重试执行并断言不调用规划 LLM | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-02 Pass) |
| CHK-F-03 | T-RRP-02 | 用户选择【重新梳理规划】时，忽略旧规划，重新调用规划大模型并展示“正在梳理用户任务、必要信息与交互状态…” | 单元测试断言清空复用标志重新规划 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-03 Pass) |
| CHK-F-04 | T-RRP-03 | 当发生超时且请求带有图片时，界面呈现针对性超时提示，并提供【仅重试文字要求（跳过参考图）】操作，点击后不带图片发起重试 | 单元测试与组件测试 | [x] ✅ 验收通过 (`bun test test/retry_reuse_planning.test.tsx` CHK-F-04 & CHK-F-05 Pass) |

## 非功能验收 (Non-Functional Checks) — 全量验收（步骤四统一执行）
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- |
| CHK-N-01 | 静态类型/lint 检查 0 错误 | `bun run type-check` | [x] ✅ 本轮pnpm顺序验收通过，见下方最终记录 |
| CHK-N-02 | 全量回归测试 100% Pass，0 新增失败 | `bun test` | [x] ✅ 本轮pnpm顺序验收通过，见下方最终记录 |
| CHK-N-03 | 生产构建/编译成功无报错 | `bun run build` | [x] ✅ 本轮pnpm顺序验收通过，见下方最终记录 |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`

## 2026-11-11 修订验收

按[pipeline-review-proposal.md §6](pipeline-review-proposal.md)核验；2026-11-12结果如下，旧通过记录不替代本轮。自动化命令与打回记录见 [test.md](test.md)。

- [x] RP-C01：规划成功后纯推理length不机械重发、不伪造续写。 **证据：**真实DefaultCore/请求编码器回放纯推理length，最多一次不同请求恢复、无伪前缀；`reference_evidence_pipeline`、`bounded_continuation`。
- [x] RP-C02：实际请求编码的已知/显式/未知能力参数正确。 **证据：**未知网关不发厂商参数；显式端点绑定及已验证Tencent路由共用规划/代码/批量重塑策略；实际wire断言。
- [x] RP-C03：图片证据复用无编码媒体且来源匹配。 **证据：**来源、证据指纹、实际原图/分片字节匹配；浏览器与桌面恢复只有一次代码请求，未重传图片。
- [x] RP-C04：完整附件/模式/授权恢复及失效。 **证据：**`retry_reuse_planning`、`region_modification_flow`、`element_structure_chat`、`reference_page_modify_chat`：文字资料、范围、模式恢复，旧基线拒绝。
- [x] RP-C05：原页复制/局部修改与功能信息完整。 **证据：**唯一未保护表单定位、原副本修改、字段真实label关联；`reference_evidence_pipeline`、`generation_quality`及既有区域修改套件。
- [x] RP-C06：错误分类/取消/迟到响应/重复点击。 **证据：**`independent_progress_lifecycle`45项受影响回归及Core超时/取消用例；迟到回调、重复操作不能落地。
- [x] RP-C07：解析规划生成共用有效父预算。 **证据：**实际cap父预算；解析前存储阻塞也有总时限；观察与重试费用分别保留，首次4次后用户新任务1次。
- [x] RP-C08：媒体独立存储与导出例外。 **证据：**原图/发送副本SHA-256独立文件；实际代码wire无image/data URL，工程/会话任务无编码图片，原导出例外回归。
- [x] RP-C09：候选/撤销/保存重开。 **证据：**候选、Undo/Redo与工程重开既有回归；新增image-evidence生成树恢复，原图被改阻断，原代码档位保留。桌面隔离夹具不挂画布，iframe尚未验的7/8候选仍禁采纳，未伪造渲染通过。
- [x] RP-C10：pnpm全量、类型、构建与浏览器/桌面验证。**证据：**3716通过/0失败、tsc0错误、Vite构建3.16秒；[顺序验收汇总](evidence/2026-11-12-regression/verification.json)，浏览器8组及macOS实测见下方。

- [x] RP-C11：原图与压缩/裁剪发送副本分离，SHA-256身份及旧MD5兼容，超大/长图不静默丢字，缓存不能混用变换/选区/模型版本。 **证据：**常规图＋5000px长图：Chromium/WebKit×mobile/PC，真实解码/切片/最后片段外链预览8组通过；原图篡改和关闭时迟到读取不能展示。变换/选区/解析模型配置不匹配不复用。

### 平台与真实调用证据

- [常规图浏览器最终记录](evidence/2026-11-12-browser-12/result.json) / [长图最终记录](evidence/2026-11-12-browser-long-05/result.json)：各4组；真实浏览器解码、编码器、ChatDrawer、候选与文件重读，模型部分为合成流，未外发。
- [macOS Tauri最终记录](evidence/2026-11-12-native-02/result.json)：computer use真实点击发送、保留解析、查看发送片段；Rust任务文件和`aidesign-media://`实际390×640图片加载通过。
- [真实Provider首次拒绝](evidence/2026-11-12-live-01/result.json) / [修复提示冲突后的通过](evidence/2026-11-12-live-02/result.json)：当前腾讯云DeepSeek绑定、独立合成资料、通过Vite代理；未更改绑定，未向模型发送用户工程。通过只证明实际Pipeline取得完整受检HTML及必需字段，不代表夹具之外的最终iframe视觉验收或所有模型100%成功。
- Windows/Linux实机验证仍沿用用户明确保留的缺口；本轮不打包或宣称跨系统实机通过。

### 最终非功能验收（2026-11-12）

1. `pnpm test`：3716通过、0失败，311文件，121.18秒。[原始日志](evidence/2026-11-12-regression/full-final.log)
2. `pnpm run type-check`：tsc --noEmit成功，0错误。[原始日志](evidence/2026-11-12-regression/type-check-final.log)
3. `pnpm build`：tsc及Vite成功，Vite3.16秒。[原始日志](evidence/2026-11-12-regression/build-final.log)

三项按顺序执行。本轮RP-C01～11全部通过；已明确保留的平台和精确视觉边界见test.md，不以Mock或静态检查替代真实浏览器/桌面证据。
