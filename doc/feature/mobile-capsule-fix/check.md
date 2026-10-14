# 验收清单

- [x] span 胶囊计算样式为固定宽高、flex: none，且不会被标题选择器匹配。证据：wechat_mini_header.test.ts 实际 computed style 断言 86px × 32px、grow/shrink 均为 0。
- [x] 标题居中，胶囊子区等宽且图标居中，样张与 few-shot 同样通过。证据：同一回归测试校验 absolute、left: 50%、子区 flex-basis: 0%、border-box 和 center。
- [x] 移动端白名单与样张覆盖通过。证据：专项 33 项测试全部通过。
- [x] bun test 全量通过。证据：83 文件、715 pass、0 fail，见 test.md。
- [x] bun run type-check 通过。证据：tsc --noEmit 退出码 0。
- [x] bun run build 通过。证据：Vite 1715 模块，退出码 0。
