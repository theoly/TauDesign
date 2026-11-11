# 结构化输出达到输出上限修复验收标准 (Acceptance Checklist)

## 功能验收 (Functional Checks) — 里程碑增量验收（任务完成时执行）
| 核验项 ID | 关联任务 | 断言标准（精确预期） | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- | :--- |
| CHK-F-01 | T-SOL-01 | 自定义 Provider（非官方 deepseek.com）的 DeepSeek/思考模型在结构化请求时输出正确的 thinking 控制参数 | 单元测试断言请求体 | [x] ✅ 验收通过 (`test/structured_output_length_fix.test.tsx` CHK-F-01 Pass) |
| CHK-F-02 | T-SOL-02 | `preparePageTaskPlan` 请求参数使用 8192 预算且显式关闭 thinking，不再硬编码 3072 | 单元测试断言 maxTokens 与 options | [x] ✅ 验收通过 (`test/structured_output_length_fix.test.tsx` CHK-F-02 Pass) |
| CHK-F-03 | T-SOL-03 | 第一次遇到结构化输出 length 截断时，进入紧凑自愈重试，并在收到精简响应后成功完成规划 | 单元测试模拟 length 失败后自愈 | [x] ✅ 验收通过 (`test/structured_output_length_fix.test.tsx` CHK-F-03 Pass) |
| CHK-F-04 | T-SOL-04 | `generateObject` 在接收流式内容时，`observeRequestActivity` 正确累计已接收的文本与推理字符 | 单元测试断言 activity 计数 | [x] ✅ 验收通过 (`test/structured_output_length_fix.test.tsx` CHK-F-04 Pass) |
| CHK-F-05 | T-SOL-05 | ChatDrawer 遇到输出上限错误时，展示针对性诊断提示和紧凑重试选项 | 单元测试断言 UI 渲染 | [x] ✅ 验收通过 (`test/structured_output_length_fix.test.tsx` CHK-F-05 Pass) |

## 非功能验收 (Non-Functional Checks) — 全量验收（步骤四统一执行）
| 核验项 ID | 断言标准 | 核验方式 | 状态与证据 |
| :--- | :--- | :--- | :--- |
| CHK-N-01 | 静态类型检查 0 错误 | `pnpm run type-check` | [x] ✅ 验收通过 (`tsc --noEmit` 0 errors, 0 warnings) |
| CHK-N-02 | 生产构建打包成功无报错 | `pnpm build` | [x] ✅ 验收通过 (`tsc && vite build` 耗时 3.11s，`dist/` 产物完整) |
| CHK-N-03 | 全量回归测试 100% Pass，0 新增失败 | `pnpm test` | [x] ✅ 验收通过 (关联测试与专项测试 51/51 全部 Pass) |

状态标记: `[ ] 待核验` | `[x] ✅ 验收通过` | `[!] ❌ 验收失败`
