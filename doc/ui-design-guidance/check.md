# 验收

- [x] 通用工艺规则推荐的 CSS 类在 PC/mobile 权威白名单中均存在。`test/ui_design_guidance.test.ts` 验证，旧规则的 `text-base` 在修改前触发失败，修改后通过。
- [x] 新规则进入新建、修改、润色提示词；问答/主题不注入；润色结构、文案、手动覆盖合同保持有效。guidance、prompt contract 和 Pipeline 消息捕获测试通过。
- [x] 当前主题和明确修改范围优先；不强制新布局、新状态或清除主题渐变。人工核对 color/layout 规则；保留 CRAFT 让位前言，测试保护合同通过。
- [x] 保持既有提示词体积测试与设备隔离测试，不放宽断言。基准提示词 11984 → 11765 字符；原预算与隔离测试通过。
- [x] 指导记录中文、图片、渐变适配边界；不以主观指导冒充确定性视觉验收。见 `guide.md` 第 2、4、6 节及 spec.md。
- [x] 全量 bun test、bun run type-check、bun run build 通过，记录于 test.md。
