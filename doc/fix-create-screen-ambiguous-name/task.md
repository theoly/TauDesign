# 新建页面误报同名页面引用歧义修复任务清单 (Task Breakdown)
> 创建时间: 2026-11-09 | 负责人: Agent

| 任务 ID | 任务描述 | 涉及文件/模块 | 潜在影响/波及范围 | 前置依赖 | 状态 |
|---|---|---|---|---|---|
| T-CS-01 | 修复 `screenReferenceResolver.ts` 的裸词匹配范围与新建动词界定 | `src/services/ai/screenReferenceResolver.ts` | 页面名称引用解析、@提及解析 | 无 | [x] ✅ 已完成 |
| T-CS-02 | 优化 `generationTargetResolver.ts`：明确新建场景下非显式歧义不拦截 | `src/services/ai/generationTargetResolver.ts` | 生成落点裁决、明确新建/修改分支 | T-CS-01 | [x] ✅ 已完成 |
| T-CS-03 | 补充自动化单元测试防线，验证新建页面与同名画框场景 | `test/named_page_reference.test.ts`, `test/generation_target_routing.test.tsx` | 现有测试集回归 | T-CS-01, T-CS-02 | [x] ✅ 已完成 |

状态标记: `[ ] 待开始` | `[>] 进行中` | `[x] ✅ 已完成` | `[!] ❌ 打回`
