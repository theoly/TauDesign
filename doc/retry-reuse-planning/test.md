# 参考图解析与安全重试链路：2026-11-12 测试报告

当前验收依据为用户确认的 [修订方案](pipeline-review-proposal.md) 与 [现行规范](spec.md)。本文后半保留的2026-11-11报告属于旧实现记录，不作为本轮通过证据。

## 范围与环境

- macOS arm64；pnpm执行脚本、Bun1.3.5测试、React18/Vite6/TypeScript；Chromium和WebKit使用隔离浏览器上下文。
- 验证对象：真实请求编码、独立视觉证据、完整输入重试、父预算、有效cap、纯推理恢复、长图发送副本、外链预览、持久化/取消/过期/History。
- 源码与测试摘要见 [source-snapshot.json](evidence/2026-11-12-regression/source-snapshot.json)；不包含凭据、用户工程正文或用户`.codex`内容。

## 结果

**ACCEPTANCE: PASS（本轮已确认必做范围）**。按顺序执行：

1. `pnpm test`：**3716通过、0失败**，311文件、22871次断言、121.18秒。[全量日志](evidence/2026-11-12-regression/full-final.log)
2. `pnpm run type-check`：**0错误**，tsc --noEmit成功。[类型日志](evidence/2026-11-12-regression/type-check-final.log)
3. `pnpm build`：**成功**，Vite1967模块、3.16秒。[构建日志](evidence/2026-11-12-regression/build-final.log)

[机器可读汇总](evidence/2026-11-12-regression/verification.json)。最终源码在这些检查期间保持冻结；文档回填不改变运行代码。

| 检查 | 结果与证据 | 范围说明 |
| --- | --- | --- |
| 受影响链路 | [152项通过](evidence/2026-11-12-regression/final-affected-01.log)；[图标/策略62项](evidence/2026-11-12-regression/policy-01.log)；[Prompt预算](evidence/2026-11-12-regression/prompt-budget-01.log) | 其中生成树image-evidence覆盖保存重开、来源文件变化、保持代码档位和既有叶子复用 |
| 浏览器常规图 | [4组通过](evidence/2026-11-12-browser-12/result.json) | Chromium/WebKit × mobile/PC，真实PNG解码/codec/ChatDrawer，合成模型流不外发 |
| 浏览器长图 | [4组通过](evidence/2026-11-12-browser-long-05/result.json) | 390×5000，总览＋3个原分辨率细节片段，末片390×1032、原图y=3968，实际媒体URL可解码 |
| macOS桌面 | [Tauri通过](evidence/2026-11-12-native-02/result.json) | computer use真实点击发送→保留解析→查看发送片段；Rust文件重读和aidesign-media实际390×640加载 |
| 当前真实Provider | [首轮拒绝](evidence/2026-11-12-live-01/result.json)、[修复后通过](evidence/2026-11-12-live-02/result.json) | 腾讯云deepseek/deepseek-flash，仅合成参考图/需求；通过Vite代理，绑定未变；每轮3次、共6次调用，首次失败计入分母 |

## 真实调用与门禁边界

真实模型第二轮约6.984秒完成图片解析→功能规划→代码。请求图片数量依次1/0/0；有效上限4096/3072/8192，实际共申请15360输出额度，Provider报告累计输入10368/输出674 tokens，代码阶段推理tokens为0。独立视觉并不等于一次HTTP；它解决同图重复传输与代码阶段上下文丢失，不能保证任何模型100%成功。

首次3次调用后因生成内联SVG拒绝（8.232秒）。进一步审计发现视觉金律仍要求内联SVG，与外链媒体规则矛盾；修复后对同一合成输入复验通过。未删除失败或放宽媒体门禁；Provider验收是Pipeline完整HTML与字段级证据，未在该脚本中做完整Canvas视觉采纳。

浏览器/桌面重试夹具仅挂ChatDrawer，因此候选iframe检查保持7/8，采纳按钮禁用；这验证未验候选不能采纳，不把夹具缺画布伪装成完整视觉交付。完整采纳、Undo/Redo、保存重开由既有回归覆盖。截图位于各浏览器证据目录，`*-failed.png`与`*-recovered.png`可核对诊断和恢复。

## 打回与修复留痕

- [提前全量01](evidence/2026-11-12-regression/full-01.log)：3693通过、15失败。持久化新增异步边界使旧测试过早断言，旧测试还假设无图必须丢规划或自定义ID可以猜厂商参数。修复对应断言/等待，按实际调用边界复验，不新增任意等待时长。
- [全量02](evidence/2026-11-12-regression/full-02.log)：3709通过、3失败。PC默认Prompt12032字符超既定12000，精简新增规则后原预算测试通过，没有扩大阈值。
- [全量03](evidence/2026-11-12-regression/full-03.log)：3715通过、0失败。后续类型检查发现变换版本的字面量被推断为number；对证据构造显式标注合同类型，运行逻辑无变化，随后重新顺序执行完整验收。最后复核又补齐仅切换Vision档位时的多页/确认区块过期保护；新增该竞态回归后受影响45项通过，再次全量。
- 发送副本预览新增3项测试验证真实独立文件、SHA不匹配拒绝及卸载后的迟到读取不注册资源；首轮测试误用了本项目未安装的测试库，改用项目既有React act/createRoot，无新增依赖。
- Schema/预算/媒体/资源失败均保留明确终态。已有故障注入测试会输出预期console诊断和部分旧React act警告，不把其描述为断言失败或“所有控制台零警告”。

## 保留边界

- Windows/Linux实机缺口按用户先前明确选择保留，本轮不打包。
- 没有新增OCR、跨任务LRU或第二次视觉相似度模型，均为原方案可选项。
- 参考图摘要不保证精确复刻。模糊信息显示不确定项，用户可更正或选区重新解析；原图/发送副本可在解析卡片查看，预览不调用模型。
- 本轮未执行git提交/推送。

---

## 历史报告（2026-11-11；旧实现，非当前验收）

# 重试信息复用与弹性重试 测试报告 (Test Report)
- **环境**: macOS (darwin arm64), bun v1.3.5, Vite 6 + React 18 | **时间**: 2026-11-11 11:00
- **测试套件**: 全量自动化测试套件 (用例数 3693, 通过 3693, 失败 0, 耗时 128.91s) -> ✅ 100% Pass
  - 核心新增特性套件: `test/retry_reuse_planning.test.tsx` (用例数 5, 通过 5, 失败 0) -> ✅ 100% Pass
- **静态分析**: `bun run type-check` (`tsc --noEmit`) -> ✅ 0 errors, 0 warnings
- **生产构建**: `bun run build` (`tsc && vite build`) -> ✅ 构建成功 (dist 产物自包含，3.19s)

## 增量验收项详情 (Verification Matrix)
| 核验项 ID | 关联任务 | 断言标准 | 核验结果 | 证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-RRP-01 | 规划完成触发 `onTaskPlan` 时，当前正在生成的消息即时挂载 `pageTaskPlan` 和 `workflowContract.pageTaskPlan`，若后续生成流发生错误中断，该规划不丢失 | ✅ 通过 | `test/retry_reuse_planning.test.tsx` - CHK-F-01 (63.39ms) |
| CHK-F-02 | T-RRP-02 | 当消息中已有 `pageTaskPlan` 时，点击重试调用 `retryTurn`，`sendMessage` 自动复用该规划，执行时跳过 `preparePageTaskPlan`，不再调用模型进行功能梳理，进度提示明确展示复用状态 | ✅ 通过 | `test/retry_reuse_planning.test.tsx` - CHK-F-02 (76.73ms) |
| CHK-F-03 | T-RRP-02 | 用户选择【重新梳理规划】时，忽略旧规划，重新调用规划大模型并展示“正在梳理用户任务、必要信息与交互状态…” | ✅ 通过 | `test/retry_reuse_planning.test.tsx` - CHK-F-03 (61.02ms) |
| CHK-F-04 | T-RRP-03 | 当发生超时且请求带有图片时，界面呈现针对性超时提示，并提供【仅重试文字要求（跳过参考图）】操作，点击后不带图片发起重试 | ✅ 通过 | `test/retry_reuse_planning.test.tsx` - CHK-F-04 (149.63ms) |
| CHK-F-05 | T-RRP-03 | 附带参考图超时失败时，支持【仅重试文字要求 (不附图)】通道，剥离大图重新发起规划与页面生成 | ✅ 通过 | `test/retry_reuse_planning.test.tsx` - CHK-F-05 (61.34ms) |
| CHK-N-01 | NFR | 静态类型/lint 检查 0 错误 | ✅ 通过 | `bun run type-check` 0 错误 |
| CHK-N-02 | NFR | 全量回归测试 100% Pass，0 新增失败 | ✅ 通过 | `bun test` 3693/3693 Pass |
| CHK-N-03 | NFR | 生产构建/编译成功无报错 | ✅ 通过 | `bun run build` 成功输出产物 |

> **ACCEPTANCE: PASS** ✅ 本特性完成并可交付。
