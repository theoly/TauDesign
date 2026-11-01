# M4-04 实际进度、停止与时限验收审计

2026-11-01。仅关闭原任务 M4-04、AC-19 和 PG-03/04，不关闭整个 M3/M4/M5，不改变静态设计范围或启用默认规则。此次核对依据为当前源码与实际命令/浏览器结果，历史切片记录保留于 test.md。

## 逐项核验

| 原要求与路径 | 当前实现证据 | 当前可复核验证 |
| --- | --- | --- |
| 真实阶段，不按耗时推进 | Pipeline executor 的 phase 仅在执行边界发布；根 hook 发布渲染/候选/创建；ChatDrawer 从 executionEvents 渲染。计时器只更新耗时或滚动/聚焦。 | progress_feedback.test.tsx 等待 1300ms 超过原600/1200ms后仍无伪造后续阶段；request_activity.test.ts 的真实阶段断言；完整浏览器实际等待/返回截图。 |
| 正文/推理/JSON调用摘要 | requestActivity.ts 观察实际 core 调用，JSON只计返回对象字符，不重复消费流、不记录私有推理正文，不把应用调用当HTTP/Provider确认。 | request_activity.test.ts：等待、两种流、JSON、同步失败、预算拒绝零调用、取消、已结算修复接续；浏览器精确计数与密钥不显示断言。 |
| 普通生成、参考、问答与失败 | useAIEngineChat 的当前controller/工程/模型门禁；实际Pipeline/CanvasToolExecutor分别负责返回与应用阶段。一次受控修复累计在同一实际摘要。 | progress_feedback.test.tsx、page_creation_chat.test.tsx、page_creation_repair_chat.test.tsx、完整 design-evidence 浏览器；质量失败不应用，旧finally不能结束新任务。 |
| 分析、元素/局部/区块 | 修改分析与结构化服务共享观察；零请求操作不补造调用，执行与分析摘要分开；根的 publishActivity/Phase 受任务归属保护。分析最终来源回执仅回填原消息历史，不更新执行阶段或恢复权限。 | independent_progress_lifecycle.test.tsx：分析、有限JSON、区块、零请求、取消/卸载/上下文变化与迟到ready；完整浏览器独立入口矩阵。 |
| 多页及比较方案 | 规划与执行分开计数，确认后共享批次累计；所有页面通过后才同步History提交。执行窗口涵盖资源/iframe检查与写前守卫。 | multi_page.test.ts、independent_progress_lifecycle.test.tsx；两引擎两档位实际规划1调用、生成2调用、停止不交部分页面；最后页面超时与精确耗尽额度正反例。 |
| 单页润色、批量重塑 | RestylePanel 捕获操作/工程/模型；停止立即释放锁，旧onProgress/终态/finally不影响新试跑。批次传父signal/当前守卫；实际History提交通过可信回调报告。 | restyle_owner.test.tsx、task_budget_ownership.test.ts、restyle_delivery.test.tsx；专用restyle-progress浏览器；新增12个真实iframe/档案render/prepare/finish时限组合。 |
| 属性面板与候选修复 | 显式停止、工程/元素/模型变化与卸载保护；候选两个入口共用取消。资格先保存，一次不恢复；父窗口终止挂起复验，迟到不替换候选。 | inspector_structured_edit.test.tsx、candidate_repair.test.tsx；完整浏览器panels；实际原子写入阻塞、精确额度、底层迟到inspect结束后检查、采纳/撤销/重做。 |
| 草稿建议与恢复 | 一次建议的资格、模型、保存共享原单次窗口；超时清理保存建议，旧结果不覆盖新手填修复。重新挂载为用户新发起的零模型复验，独立既有标准15分钟窗口，不重置原生成额度。模型续写仍用原账本。 | failed_design_drafts_ui.test.tsx、independent_progress_lifecycle.test.tsx、large_page_chat.test.tsx：资格/保存超时、保存重开、手填竞争、补挂超时/成功、旧预算不更新；完整浏览器恢复/续写矩阵。 |
| 总时限与迟到结果 | TaskBudget 预留冻结单调截止点，结果结算再次核对；run 为非模型等待建立剩余总时限窗口，关闭/取消即退出，写前另作存活检查。执行存活独立于是否还能申请下一请求。 | task_budget.test.ts：流式/JSON父/单次截止前/到期/超时、并行取消、挂起流/元数据、非模型等待、关闭、嵌套与监听清理；各根超时组合与恰好用完额度交付正例。 |
| 已提交结果与历史 | 只有实际同步History授权提交才回报已应用；档案收尾超过期限不能声称原页未改，剩余目标停止。旧会话没有阶段证据时只显示整体状态，不补造成功步骤。 | restyle_delivery.test.tsx + 新浏览器finish场景：原页已改、prepared收尾提示、撤销重做、迟到档案完成不改页面/其它目标；恢复/历史浏览器与既有schema兼容测试。 |

## 当前执行证据

- `bun test`：2754通过、0失败、17698断言、245文件，61.25秒。
- `bun run type-check`、`bun run build`：exit0。构建时间详见 test.md。
- 完整浏览器：`evidence/2026-11-01-remaining-lifetime-ui/result.json`，Chromium/WebKit各覆盖移动390/PC1440；页面错误与外部请求均0。
- 实际重塑提交窗口：`evidence/2026-11-01-remaining-restyle-lifetime/result.json`，2引擎×2设备×3阶段共12项，等待底层迟到应用真正结束，核对页面/History/档案状态。没有模型请求。
- 既有重塑UI根：`evidence/2026-11-01-remaining-restyle-progress/browser.json`，两引擎两档位的停止即重试、旧回调、关闭/工程/模型切换通过。
- 本轮有效负例及主动中止日志、最终日志与源码指纹在 `evidence/2026-11-01-remaining-lifetime/`；原始证据按工程规则不提交Git。

## 没有据此放行的要求

调用摘要始终是应用core级观察，不能证明物理HTTP跳转次数或真实Provider质量。浏览器iframe不替代Tauri原生WebView验收，Windows/Linux原生缺口仍保留。M3-02/03/04/05的完整来源消费者、协议/预算审计、schema和失效矩阵，M4其它渲染/交付门禁，以及M5留出、真实模型对照与两位独立人工评审仍按原任务验收。安全停止与进度通过不能替代这些要求；自动参考设计规则仍默认关闭。
