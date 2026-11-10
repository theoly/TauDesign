# 新建页面误报同名页面引用歧义验收标准 (Acceptance Checklist)

## 功能验收 (Functional Checks) — 里程碑增量验收
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
|---|---|---|---|---|
| CHK-F-01 | T-CS-01 | `新建页面"完善资料弹窗"` 或 `新建页面"推荐购买引导页"` 时，新建动词后的页面名不被抓为现有页面引用 | 单元测试 | [x] ✅ 验收通过 (`test/generation_target_routing.test.tsx`: 明确新建同名页面正常新建，不被抓取为引用) |
| CHK-F-02 | T-CS-01 | 长篇 PRD 文本末尾附带新建页面指令时，正文中顺带提及的已有页面名不被抓为参考源 | 单元测试 | [x] ✅ 验收通过 (`test/generation_target_routing.test.tsx`: 长篇 PRD 偶遇同名画框正常新建) |
| CHK-F-03 | T-CS-02 | 存在多个同名画框（如两个「完善资料弹窗」）时，用户发送 `新建页面"推荐购买引导页"` 或长文本+`按上述要求新建页面"推荐购买引导页"`，返回 `action: 'create_screen'`，不报错 `needs_reference` | 单元测试 | [x] ✅ 验收通过 (`test/generation_target_routing.test.tsx`: 返回 create_screen, targetScreenId 为 null) |
| CHK-F-04 | T-CS-02 | 存在同名画框时，用户明确发送 `新建页面"完善资料弹窗"`，返回 `action: 'create_screen'`，正常创建新画框，不报错 `needs_reference` | 单元测试 | [x] ✅ 验收通过 (`test/generation_target_routing.test.tsx`: 同名画框新建放行) |
| CHK-F-05 | T-CS-02 | 存在同名画框时，若用户显式使用 `@完善资料弹窗` 或 `参考完善资料弹窗，创建...`，依然正确拦截为 `needs_reference` 提示指明 @页面ID | 单元测试回归 | [x] ✅ 验收通过 (`test/generation_target_routing.test.tsx`: atMention & bareRef 保持 needs_reference) |

## 非功能验收 (Non-Functional Checks) — 全量验收
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
|---|---|---|---|
| CHK-N-01 | 静态类型检查 0 错误 0 告警 | `bun run type-check` | [x] ✅ 验收通过 (`tsc --noEmit` 耗时约 4s，0 errors, 0 warnings) |
| CHK-N-02 | 全量回归测试 100% Pass，0 新增失败 | `bun test` | [x] ✅ 验收通过 (3688 pass, 0 fail across 307 files, 22661 expect() calls, 耗时 120.88s) |
| CHK-N-03 | 生产构建打包成功 | `bun run build` | [x] ✅ 验收通过 (`tsc && vite build` built in 2.98s, dist/index.html & assets generated successfully) |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`
