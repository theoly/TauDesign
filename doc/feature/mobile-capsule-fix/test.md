# 移动端导航胶囊修复测试报告

- 日期：2026-10-14
- 环境：macOS、Bun 1.3.5、Vite 6.4.3

| 验证 | 结果 |
| --- | --- |
| bun test test/wechat_mini_header.test.ts test/mobile_appbar_layout.test.ts test/aesthetic_a0.test.ts | 33 pass，0 fail |
| bun test | 83 个文件，715 pass，0 fail，6.62s |
| bun run type-check | 退出码 0，无类型错误 |
| bun run build | 退出码 0，1715 模块，Vite 构建 1.46s |

真实 DOM 回归使用 Happy DOM 注入完整基座与移动端 Token，校验样张和生成范例的胶囊计算样式。标题样式不再匹配胶囊，胶囊固定为 86 × 32；两个子区以相同 flex-basis 分配宽度，边框包含在盒内。

全量测试日志：`/tmp/designer-mobile-capsule-tests.log`。测试中存在 React act 提示；构建存在大于 500 kB 的 chunk 提示，均未导致失败。未执行桌面端截图验收。

产物：dist/index.html、dist/assets/。验收结果：PASS。
