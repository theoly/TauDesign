# 渐变主题实施计划

> 执行：writing-plans + subagent-driven-development；用户已批准推荐方案及双入口，在当前会话连续执行。Spec: spec.md。

## Task 1: 结构化背景与统一编译
- [x] 先写背景解析/编译/安全/旧主题兼容测试并确认红灯。
- [x] 新增types/themeBackground.ts、utils/themeBackground.ts；扩展DesignSystemTokens.backgrounds，cssCompiler和base.css；Prompt注入。
- [x] 支持线性、径向、多层、透明百分比色标；不支持表达式返回null而非猜测。
- [x] 定向回归绿灯与任务复核。

接口：BackgroundRole='page'|'primaryAction'|'decorativeSurface'；ThemeBackground含可选source；parseThemeBackground(value:string,fallback?:string):ThemeBackground|null；compileThemeBackground(paint:ThemeBackground):string|null；compileBackgroundVariables(backgrounds,mode):string；BACKGROUND_ROLES和BACKGROUND_LABELS导出。backgrounds为Partial<Record<BackgroundRole,Partial<Record<'light'|'dark',ThemeBackground>>>>。source={kind:'page'|'html-import',name:string,selector:string,fingerprint:string}。

## Task 2: 提取与安全合并
- [x] test/page_style_extraction.test.ts先红后绿，新增services/import/pageStyleExtraction.ts。
- [x] HTML静态层叠/变量解析（DOMParser/CSS声明扫描），根背景/主操作/局部装饰分类，来源与拒绝原因。
- [x] 使用纯函数合并选定角色和既有主色/字体/圆角；store单次History应用，来源/Token快照过期拒绝，旧页选择性背景同步。
- [x] 定向测试History、资源权限、未选择/取消及过期路径。

## Task 3: 共用提取面板与渐变编辑
- [x] UI先写双入口、来源选择、差异预览/选择及应用测试。
- [x] 新增PageStyleExtractionDialog和ThemeBackgroundEditor，接入DesignSystemPanel/ThemeEditor。
- [x] 空工程、无渐变、只读参考、错误与成功可访问状态；预览使用真实iframe。

## Task 4: 导入和生成/导出贯通
- [x] 导入现有工程主题更新必须显式、选择性；保留空工程现有建立主题体验，更新与导入同History。
- [x] HTML/画布/PNG背景一致，新页默认继承角色，旧页快照和导入覆盖统一渲染。
- [x] 全量bun test→type-check→build，双引擎真实按钮和computedStyle/导出验证，归档test.md并更新check。

## 预检
Task1提供类型与编译给Task2/3/4；Task2提供分析与合并给Task3/4；Task3与4共用选择器，不重复各自抽取逻辑。Task1编辑类型/compiler/base/Prompt，控制器编辑提取/store/UI，避免文件冲突。现有导入“仅空工程更新主题”已由本次用户确认扩展为已有工程可显式更新，原规则应标记过时保留。
