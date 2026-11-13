# 测试与验收记录

日期：2026-11-14。

## 根因与实现

1. `streamWithContinuation` 在 HTML 到达后直接用 `embeddedMediaIssue` 拒绝内联 SVG；随后主体、分区及终检也要求外部媒体。已有 SVG 外置器只接导入流程，生成链路没有资源编译阶段。
2. 新增生成媒体处理器：源安全检查 → 静态 SVG 检查 → 主题样式固化/独立文件 → SHA-256 核对 → 外部引用 → 原有终检。只允许内存里的静态 SVG 作为编译输入；data/base64/blob 与活动 SVG 仍阻断。最多256项、总量30MiB，取消和来源变化仍阻断，哈希冲突不覆盖旧文件。
3. 接入普通主体、整页/分区、受限自动续写、草稿局部修复、多页和共享生成树。未配置编译器的调用继续保持严格拒绝。
4. 新建的资产与页面共同进入一条 History。多页资产随整批条件发布。候选只在校验文件后经 History 登记媒体并暂存，不直接覆盖原页。失败草稿/恢复只保存独立文件引用，恢复后重新核对文件。
5. 修正分区合并把 SVG `<title>` 当作 HTML 页面标题拒绝的问题。

## 定向回归

`pnpm test test/generated_media.test.ts test/multi_page_tree.test.ts`：23 passed，0 failed，113 assertions。新增17个媒体用例涵盖静态矢量、一次请求自动外置、完整续写/不存截断前缀、活动内容与编码媒体拒绝、取消/来源/哈希冲突、分区检查点、页面发布/Undo/Redo、失败草稿零请求修复、多页和共享父节点、候选不覆盖、元数据不得夹带二进制。

另一次相关链路回归：156 passed，0 failed（功能规划、分区、多页、共享生成树、草稿区域修复等）。最终以文末全量记录为准。

## 浏览器验证

运行器：`scripts/tests/test_generated_media_browser.py`，使用独立 Vite 端口5178，隔离工程、模拟模型响应，不发送用户资料，也不调用真实 Provider。页面接收、SVG 编译、IndexedDB独立资源、实际 PageRenderCheck、CanvasToolExecutor、保存重开、History 均使用生产实现。

最终证据：[results.json](./evidence/browser-final/results.json)。Chromium/WebKit 实测均满足：一次代码请求、两份真实独立SVG、主题竹青`rgb(92,131,116)`、外置前后尺寸相同、保存重开和Undo/Redo正常；RGB通道平均差异分别为0.042584/255、0.045235/255，阈值2/255。

早期运行器缺少 `screenOverrides` 配置；随后旧5174服务因动态导入与HMR时间戳加载两份Store，误读`proj_default`资源。独立5178服务消除了该测试环境问题，未放宽文件检查。早期测试不算通过。另一次颜色测试误用了不存在的Token `--color-primary-500`，已更正为权威`--color-primary`并显式断言原图颜色后重跑。

## 全量回归

- `pnpm test`：3,872 passed / 0 failed，326 files，23,639 assertions，125.18秒。
- `pnpm run type-check`：通过，0类型错误。
- `pnpm build`：通过，Vite构建3.20秒。
- `git diff --check`：通过。

完整本机日志保存在 `evidence/regression/{tests,types,build,targeted}.log`。此前3,870项全量也通过；随后补充共享父节点和媒体元数据的防御校验，再以本次3,872项结果闭环。

## 范围边界

本次修复的是模型返回的静态矢量图表/图标的自动资源编译。精确雷达图不额外调用位图模型；未新建通用第三方位图生图Provider或自动执行需求文档中的v0/Midjourney指令。二进制只作为临时文件写入负载，不进入项目元数据、任务正文或会话；已有HTML/PNG导出内联例外保持。
