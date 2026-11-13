/** User-supplied reproduction data; this is a design specification, not an agent instruction. */
export const aiChatDesignPrompt=`## 页面 2：AI 决策对话页 (AI Chat Interface)

### 1. 核心功能与交互需求

- **功能定位**：呈现用户与 AI 决策助手的多轮对话流，动态渲染富文本及可视化决策图表。
- **交互逻辑**：
  - 文本采用 SSE (Server-Sent Events) 打字机流式输出；
  - AI 计算与响应过程中展示"水墨晕染"微动效；
  - 生成的结果分析图表支持轻触放大查看细节。

### 2. 页面结构 (自上而下)

1. **顶部导航条 (App Bar)**：左侧配置返回键，中间显示当前会话标题"AI 决策分析"，右侧配置清空上下文按钮。
2. **对话流区域 (Chat List)**：

- **用户气泡 (User Bubble)**：右对齐，背景采用水墨灰 (\`#2C3E50\`)，白色文本，大圆角包裹。
- **AI 气泡 (AI Bubble)**：左对齐，背景采用纯白 (\`#FFFFFF\`)，配极浅阴影。内部完美支持 Markdown 格式化输出（列表、加粗等）。
- **图表富文本气泡**：AI 气泡内嵌数据进度条组件，直观对比选项数据（如"A选项 82% vs B选项 65%"）。

3. **快捷回复胶囊 (Quick Prompts Scroll)**：紧靠输入框上方，提供横向滚动的胶囊按钮，如"帮我详细对比"、"换个角度分析"。
4. **底部输入框**：支持多行文本输入，左侧整合语音输入快捷按键。`;
