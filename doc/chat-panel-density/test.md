# AI对话信息密度验证

2026-11-12，macOS；修改范围为宿主组件样式和调用摘要折叠呈现。

- 增量：8个文件115项测试通过，覆盖真实进度、长页、失败草稿、参考图、滚动、布局、检查器及候选修复。
- 最终按顺序：`pnpm test` 3,751通过/0失败，314文件、23,048断言、128.36秒；`pnpm run type-check`退出0；`pnpm build`退出0，Vite 1,970模块、3.32秒；`git diff --check`通过。测试中的既有React act提示与负向错误输出保留，最终0失败。
- [增量日志](./evidence/2026-11-12-regression/focused.log)、[全量日志](./evidence/2026-11-12-regression/pnpm-test.log)、[类型检查](./evidence/2026-11-12-regression/pnpm-type-check.log)、[构建](./evidence/2026-11-12-regression/pnpm-build.log)。

Chromium/WebKit × mobile/pc的4组合成浏览器回放通过：实际面板390px；规划/预算/参考图/调用摘要默认折叠且各高30px，11px文字、16px行高；思考卡48px。展开保留原网络/模型/字符数/统计说明；运行中计时更新，活动请求可见；长模型名无横向溢出。无页面脚本异常及外部网络请求。只使用隔离合成工程，不调用真实Provider或修改用户工程。

[浏览器结果](./evidence/2026-11-12-browser/result.json)、[紧凑效果](./evidence/2026-11-12-browser/chromium-mobile-compact.png)、[展开详情](./evidence/2026-11-12-browser/webkit-mobile-expanded.png)、[验证脚本](./evidence/2026-11-12-browser/verify-chat-density.py)。验证脚本初次使用了错误的Vite CommonJS导入形式，修正为default导出后4组通过，应用代码无需因此改变。

ACCEPTANCE: PASS。未新增镜像样式实现的单元测试；沿用受影响功能回归并实测浏览器几何尺寸/折叠行为。
