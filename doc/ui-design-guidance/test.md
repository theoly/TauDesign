# 验证记录

2026-10-29，macOS，Bun 1.3.5，TypeScript/Vite 使用当前仓库依赖。

## 规则与接线

修改前运行新增两项测试：推荐类名白名单检查在 `text-base` 失败，布局规则注册检查失败。修改后两项均通过；通用规则建议的排版、背景、阴影等类名在 PC/mobile 白名单中均有效。

`test/prompt_wiring_regression.test.ts` 捕获 PipelineExecutor 经 MockTransport 发出的真实 system 消息，确认所有注册工艺正文均进入模型请求。`test/ui_design_guidance.test.ts` 覆盖新建、修改、润色、保护节点和问答/主题排除。原有结构合同、提示词顺序、白名单源、设备隔离及预算测试未放宽。

首轮定向运行 6 文件：85 通过、0 失败。加强 Pipeline 接线断言后的定向运行 4 文件：16 通过、0 失败；最终由全量运行确认跨文件集成。

## 全量结果

| 命令 | 结果 | 本地证据 |
| --- | --- | --- |
| `bun test` | 2214 通过，0 失败，199 文件，14098 断言，35.86 秒 | `evidence/full.log` |
| `bun run type-check` | 退出码 0 | `evidence/type-check.log` |
| `bun run build` | 退出码 0，1867 模块，Vite 2.52 秒 | `evidence/build.log` |
| `git diff --check` | 退出码 0 | 最终本地检查 |

全量日志仍含既有 React act 警告；不宣称测试环境无警告。基准 PC / techBlue / create_screen / 空 decisions 的提示词从 11984 降至 11765 字符，既有 10000–12000 字符断言保持不变。

## 验证边界

本次验证证明规则接线、类名有效性、保护合同及现有回归通过。未发送真实模型请求，未新增视觉质量硬门禁，不将自动化通过解释为所有生成页面的美学质量已经实测。未修改用户工程、未重打桌面包、未运行跨平台原生验收。原始 PDF 和渲染截图只用于本地阅读，不纳入仓库。

结论：本次规则和指导更新的实现与本地验收通过。
