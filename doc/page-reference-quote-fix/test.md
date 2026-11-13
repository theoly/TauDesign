# 页面规格引用解析测试报告

日期：2026-11-14。环境：macOS，pnpm / Bun 1.3.5。

## 根因

旧正则查找 `分析"..."`，不区分开始/结束引号，也允许 `[^引号]` 跨行。因此在展示标题 `"AI 决策分析"` 的结束引号开始匹配，一直抓取到下一个组件示例的开始引号，生成不存在的“页名”。此外，编号页面规格的标题或示例恰好与旧页同名时，裸页名扫描可能将其隐式绑定为待修改页。

## 实现

- `screenReferenceResolver.ts`：先扫描顶层成对引号，处理转义/嵌套和行边界；只在真实开始引号前检查参考/读取语义。真正缺少结束引号的引用明确阻断，不把后续行作为页名，也不让同名诊断文字匹配到画框。
- 编号规格标题与功能/交互/结构说明之后的普通名称不再产生隐式目标；明确参考/修改语句、@提及、引用开关继续工作。支持Markdown、纯文本及加粗编号标题。
- `generationTargetResolver.ts` 使用同一配对结果判断显式带引号引用，避免路由和上下文使用两套正则规则。
- 不修改用户原文，不改变DOM/History/存储格式，不增加模型调用。

## 复现与定向验收

修复前 `test/page_spec_reference.test.ts`：4 passed / 6 failed，直接复现用户报告的多行错误页名。

修复后：

```text
pnpm test test/page_spec_reference.test.ts test/page_spec_reference_chat.test.tsx \
  test/named_page_reference.test.ts test/named_page_reference_chat.test.tsx \
  test/generation_target_routing.test.tsx test/page_reference_chat.test.tsx \
  test/chat_reference_toggle.test.tsx
58 passed / 0 failed, 251 assertions, 7 files
```

新增12项解析/上下文/管道用例、2项生产聊天Hook用例。完整使用用户原始规格，工程包含“AI 决策分析”和“AI 决策对话页”等同名旧页；检查仅新增一页，三个旧页HTML逐字不变，模型页面请求一次且收到完整原文。真实未知引用在页面请求前停止，工程无改动。

模型使用受控模拟返回，聊天入口和管道采用生产代码；渲染观察使用测试桩并真实读取资源，不声称完成真实模型或浏览器像素验收。本次为文本路由修复，无视觉样式改动。

## 全量验收

- `pnpm test`：3,886 passed / 0 failed，328 files，23,709 assertions，124.57秒。
- `pnpm run type-check`：通过，0类型错误。
- `pnpm build`：通过，Vite构建3.15秒。
- `git diff --check`：通过。

日志归档：`evidence/before.log`、`evidence/targeted.log`，全量日志后续归档于同目录。

**ACCEPTANCE: PASS**。本修复通过上述受控模型、生产聊天/管道回归及全量检查。
