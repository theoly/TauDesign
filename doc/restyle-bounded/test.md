# 大页面风格重塑输出上限修复 · 验证报告

2026-10-27，macOS，Bun 1.3.5 / Vite 6。范围是重塑输出上限缺陷；保留工作区此前的渐变主题/提取和通信进度改动。

## 原因与处理
用户截图为406秒、45121正文/62576推理字符、续写0。只读实际工程确认“TA 的主页”48294字符，其中21793为CSS、254节点。旧执行要求整页返回，已有显式HTML围栏在首根为header且未闭合时还可能未进入续写。

新链路在24000字符以上改为有限JSON样式补丁：原生页按24节点、导入页按12已有颜色变量分组，每组最多2048请求输出Token，最多16组/32768总预算。完整验证所有组后在DOM副本合并，继续源安全/结构/文案/保护检查，确认后的History、文件资源、交付档案和像素门禁不变。截断JSON不拼接，任何组越界/失败/取消都不交付部分HTML。无可映射变量/超分组预算前置说明；无变化单独显示，不假称应用。导入页保持源CSS布局，只绑定颜色变量；此策略不是导入页的任意布局重设计。

官方支持的Qwen混合模型仅本重塑任务发`enable_thinking:false`，不改用户配置；能力名单使用明确型号和快照，不将3.7-max-2026-05-17等仅思考快照误判为可关闭。未知型号和非官方代理不发送新参数。依据[阿里官方文档](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)（2026-10-19）。小页保留原完整HTML流程及有限续写，修复未闭合显式HTML围栏；无HTML/无预算不盲目续写。

## 自动化及浏览器证据
- `test/restyle_patch.test.ts`：保留CSS、文案、资源；多组后续失败原子拒绝；保护/未知类/非法变量/截断/预算拒绝；执行器分组计数、原门禁与无变化结果。
- `test/restyle_bounded.test.ts`：core、AIServiceTransport实际序列化及两条桌面传输到`proxy_stream_request`的受控IPC参数断言；其它端点不新增字段；围栏续写。
- `test/restyle_progress_ui.test.tsx`：单页导入标识保留，13变量显示分析+2组共3次预估，原预检/停止回归。
- `scripts/verify-restyle-bounded.py`：真实TA主页本地只读样本，实际React面板/core/executor/质量门禁，传输用受控JSON。Chromium和WebKit各2组（12+7变量），各发送2请求、每请求2048上限，输入8106/7603字符；响应合计87正文字符、无推理、续写0。所有请求thinking=false，结构通过，原页不变，无pageerror。见`evidence/browser.json`、browser.log、`*-groups.png`、`*-complete.png`。受控响应故意使用简单绑定，只验证链路，不是配色效果验收。
- `scripts/verify-restyle-progress.py`：两浏览器各2次开始/停止，可重试，原页不变，不泄露推理/密钥；`evidence/progress-browser.log`。截图保留在restyle-progress/evidence。
- `git diff --check`通过。最终全量/类型/构建结果见下。

## 边界
没有将用户工程发送真实Provider，也没有修改用户原工程。浏览器验证不代表真实模型的耗时或美感已验收；受控IPC断言不替代原生Rust网络实机验证。Windows/Linux原生实机不在本次范围。全量测试保留既有React act环境提示，不宣称没有测试环境警告。工作区tauri.conf.json版本变动非本次产生，未回退。

生产/验证源码：311文件，`evidence/source.json`，SHA256 `249f874d90e7bd3ee0b8942c254f2ad53a3f2b48caec90e8dfe464e284439f0d`。

## 最终回归（同一源码）
1. `bun test`：**2192通过、0失败**，195文件，13928断言，35.70秒；`evidence/full.log`。
2. `bun run type-check`：通过，无TS错误；`evidence/type-check.log`。
3. `bun run build`：通过，2.47秒；主包1432.81kB / gzip454.21kB；`evidence/build.log`。

**ACCEPTANCE: PASS**（以上前端链路、受控传输及只读样本范围）。真实Provider的最终配色、耗时仍需使用实际绑定试跑审阅。
