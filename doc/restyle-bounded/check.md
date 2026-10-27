# 验收
- [x] 小补丁响应处理大HTML，原CSS/业务文案/资源/NID保留；非法目标/字段/截断/保护节点均拒绝且不部分应用。
- [x] 官方Qwen重塑思考关闭传到桌面Rust代理IPC请求体（受控IPC边界断言），其它端点保持原行为。
- [x] 分组上限/输出预算明确，进度与调用预估一致；未闭合围栏可以有界续写，无HTML不续写。
- [x] 无变化不假装已应用，试跑/批量/门禁/History行为兼容。
- [x] 全量、类型、构建与真实浏览器受控大页通过，原工程未写入、未向模型发送用户内容。

## 证据索引
- `test/restyle_patch.test.ts`：小JSON处理大HTML、原CSS/资源/文本保留、后续分组非法全拒绝、取消、无变量/超16组、受保护和未知类拒绝、原门禁/无修改状态。
- `test/restyle_bounded.test.ts`：core和AIService序列化、两条桌面传输到`proxy_stream_request`的受控IPC参数、其它端点不发字段、未闭合围栏续写。没有调用真实Rust网络或真实Provider。
- `test/restyle_progress_ui.test.tsx`：单页导入标识采用变量分组预估；原停止/重试回归。
- `scripts/verify-restyle-bounded.py`：真实TA主页只读样本，Chromium/WebKit各2组、2048预算、关闭thinking字段、计数准确、结构门禁通过、原页不变。`evidence/browser.json`和截图。
- `scripts/verify-restyle-progress.py`：双浏览器各2次开始/停止、可重试、无密钥/推理泄露。`evidence/progress-browser.log`。
- 全量/类型/构建结果见`test.md`和`evidence/{full,type-check,build}.log`。

## 修正记录
开发复核发现单页入口遗漏导入标识，已补齐并用单页13变量样本回归预估为3次（分析+2组补丁）；避免误走基座class补丁。第一次错误/截断复现日志保留于evidence；当前定向测试全通过。
