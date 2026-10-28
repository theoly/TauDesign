# TauDesign

[English](./README.md) | [简体中文](./README.CN.md)

<p align="center">
  <img src="assets/brand/taudesign-mark.svg" alt="TauDesign" width="104" height="104" />
</p>

<p align="center"><strong>结合 AI、本地工程与无限画布的高保真界面设计工作台。</strong></p>

<p align="center">
  <img src="assets/screenshots/editor-workspace.png" alt="TauDesign 编辑器：AI 对话、无限画布和属性面板" width="880" />
  <br><sub>工作台概览，实际界面以当前版本为准。</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Developer%20Preview-amber" alt="开发者预览版" />
  <img src="https://img.shields.io/badge/Stack-Tauri%202%20%2B%20React-blue" alt="Tauri 2 与 React" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-green" alt="Apache 2.0 许可证" />
</p>

TauDesign 将产品需求、参考图片和已有 HTML 转换为可编辑的高保真界面。你可以在同一画布排列多个页面，点选元素调整细节，对比 AI 候选方案，并导出 HTML 或 PNG。桌面工程存储在本地 `.aidesign` 文件夹中。

**开发者预览版：** 当前范围为静态界面设计与设计交付。可点击业务原型、真实表单提交和角色状态机尚未纳入当前验收范围。请审阅生成内容，并备份重要工程。

## 核心功能

| 领域 | 能力 |
| --- | --- |
| 无限画布 | 多页面管理、平移缩放、小地图、自动排布与首屏参考线。 |
| 设备规范 | 工程级移动端/PC 固定档位、参考设备预设及分设备布局约束。 |
| AI 工作流 | 新建页面、参考图设计、明确元素修改、页面优化建议、多页计划及多方案比较。 |
| 项目上下文 | 查看和编辑上传文档及 AI 归纳，结合相关页面、整体需求和设计规则生成。 |
| HTML 导入 | 保留外观、统一项目 Token，或选择性映射颜色、字体、间距、圆角和阴影。 |
| 设计系统 | 预制主题、自定义主色与风格候选、明暗 Token、渐变背景及已有页面风格提取。 |
| 设计库 | 导入项目副本、绑定固定版本只读参考，或显式打开源库编辑。 |
| 可视化编辑 | 元素点选、间距与对齐、文本安全修改、容器级联删除及持久化撤销重做。 |
| 候选比选 | 新旧页面并排展示，通过交付检查后可替换原版、两版保留或放弃候选。 |
| 交付检查 | HTML/PNG 导出、资源核对、渲染诊断、候选预览及交付档案。 |

### 可控的页面修改流程

1. 在对话中明确引用需要修改的页面或元素。
2. 已指定目标和细节的要求，例如修改按钮文案，直接进入复制后局部修改；“优化页面”等宽泛要求先给出建议，允许选择和补充。
3. 工作流记录目标、基线、允许改动、设备、设计系统及相关项目上下文。
4. 源码、结构、文案、资源及实际 iframe 渲染检查决定候选是否可采纳；失败或不完整的结果不应用。
5. 比较新旧方案后再采纳，采纳经 History 提交，可撤销和重做。

渲染诊断覆盖长正文挤压、裁切、遮挡和部分对比度问题。当横向操作组把长正文挤成窄列，且结构支持安全修改时，渲染报告会提供布局修复预览和局部候选入口。这些检查覆盖特定规则，业务准确性和视觉美感仍需审阅。

### 大页面与输出上限

新建长页面可使用分区生成：先规划 **2～6 个区块**，逐块生成并验收后合并为一页。明确的多页面要求可进入可审阅的页面计划。支持的截断响应通过有界续写处理，不完整 HTML 不会直接应用。分区和续写检查点目前仅在当前会话保留。

### HTML 导入与移动端导航

通过 **File → 导入 HTML**，或页面面板的导入入口，查看分析与预览后选择保留外观或 Token 映射方式。新项目可以从导入页面建立设计系统；已有项目可以预览并确认提取的主题。**设计系统面板**与**完整主题编辑器**均提供“从已有页面提取风格”入口。

移动端默认使用统一的微信风格状态栏和导航栏。在此策略下，导入 HTML 或参考图中的顶部栏不纳入页面内容；统一顶部栏在画布和 PNG 导出中展示，不包含在导出 HTML 中。开启 **“使用自定义导航栏”** 后，才将自定义导航作为页面设计内容处理。

## 快速上手

1. 启动 TauDesign，在本地文件夹中新建工程，选择移动端或 PC、参考设备，以及预制或自定义设计风格。设备档位创建后固定。
2. 在 AI 对话面板打开 **Provider 配置**，填写端点、密钥和模型，并绑定所需模型角色。参考图工作流需要具备视觉能力的模型。
3. 从提示词、图片、HTML 导入或项目文档开始。修改已有内容时，请启用对应页面或元素引用。
4. 审阅诊断和候选方案，采纳后导出设计。

支持 OpenAI 兼容 API、Anthropic、Gemini 及 Ollama 原生协议，包含 OpenAI、DeepSeek、阿里百炼等服务预设。连接本地端点时，选择对应协议和模型，按需开启该 Provider 的私有网络访问选项。密钥要求及模型可用性取决于具体端点。

### 提示词示例

| 目标 | 示例 |
| --- | --- |
| 新建页面 | “设计一个简洁的会员订阅页，包含套餐比较、权益说明和主操作按钮。” |
| 明确小改 | “将引用按钮的文字改为‘保存修改’，保留图标和尺寸。” |
| 宽泛优化 | “分析这个移动端页面的信息拥挤和层级问题，列出建议让我选择。” |
| 长页面 | “按产品概览、核心优势、价格和常见问题分区生成产品介绍页。” |

### 快捷键与画布操作

| 操作 | 功能 |
| --- | --- |
| 空格 + 拖动 | 平移画布。 |
| 触控板滑动 | 平移画布。 |
| Cmd/Ctrl + 滚轮 | 以指针为中心缩放，范围 10%～400%。 |
| Cmd/Ctrl + Z | 撤销。 |
| Cmd/Ctrl + Shift + Z | 重做。 |
| 单击元素 | 选中并打开元素属性。 |
| 双击可编辑文本 | 进入行内编辑。 |
| 编辑时 Enter / Esc | 确认 / 取消文本修改。 |
| 选中节点后 Delete / Backspace | 删除节点及其子孙节点。 |
| 双击画框标题 | 重命名画框。 |

## 工程、隐私与导出

桌面工程包含 `project.json`、`screens/` 下的页面、`assets/` 下的资源，以及持久化会话和历史记录。备份完整工程文件夹可保留相关文件。项目设置提供工程路径展示及 **“打开目录”** 功能。

AI 请求会将提示词及工作流采用的页面、图片或文档上下文发送到你配置的 Provider。API 密钥保存在本机应用设置中，用于向配置的端点认证。远程字体和图片可能产生额外网络请求。本地模型可以使 AI 推理留在本机；能否完全离线还取决于页面引用的资源。

- **HTML：** 内联项目样式和可解析资源，可选导出 Manifest 侧车文件。导入样式可能需要保留内部标识；交付时请检查外部资源依赖。
- **PNG：** 支持 1x、2x、3x，以及整页长图或仅首屏。桌面端优先原生渲染并实测内容高度，浏览器环境可使用兼容回退；部分 WebKit 阴影等后端限制会明确提示。
- **可移植性：** 导出结果可在未安装 TauDesign 的环境中查看，具体取决于资源依赖。静态或像素检查不能证明业务逻辑已实现，也不保证所有系统逐像素一致。

## 从源码运行

### 环境准备

前端使用 React 18、TypeScript、Vite 6、Zustand 和 Immer，桌面壳使用 Tauri 2 与 Rust。

安装 [Bun](https://bun.sh/docs/installation)（CI 固定为 **1.3.5**）、用于 Node 工具的 Node.js 22，以及通过 [rustup](https://rustup.rs/) 安装的 Rust stable/Cargo。桌面构建还需要对应平台的系统依赖：

| 平台 | 环境要求 |
| --- | --- |
| macOS | Xcode Command Line Tools，使用系统 WebKit。 |
| Windows | Microsoft C++ 桌面开发工具、Windows SDK、WebView2 Runtime 和 MSVC Rust 工具链。 |
| Linux | 对应发行版的 Tauri 依赖，包括 WebKitGTK 4.1 开发包、编译工具及 OpenSSL。 |

具体安装步骤参见 [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)。以下命令均在仓库根目录执行。

### 安装与调试

```bash
bun install --frozen-lockfile
```

仅调试前端：

```bash
bun run dev
```

浏览器访问 `http://localhost:5173`。Vite 使用固定端口，若已占用需先停止原服务。浏览器模式通过 Vite 代理访问 AI，并使用存储回退；原生工程文件读写、系统对话框和原生 PNG 应在桌面模式验证。

启动完整桌面应用：

```bash
bun run tauri dev
```

Tauri 会自动启动 Vite，请勿同时另开一个开发服务占用 5173。API 密钥在应用内配置，构建过程不需要密钥。

### 验证与构建

```bash
bun test
bun run type-check
bun run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

前端产物位于 `dist/`。在目标操作系统上构建桌面包：

```bash
bun run tauri:build
```

Tauri 产物位于 `src-tauri/target/release/bundle/`。如需使用下述按平台选择的默认打包格式，请运行仓库打包脚本。

### 收集桌面分发包

打包脚本需要 Bash 和 `jq`；Windows 请在 Git Bash 中执行。

```bash
bun run package:desktop
```

产物收集到 `dist-desktop/`，本地产品名称和应用版本来自 `src-tauri/tauri.conf.json`。

| 构建平台 | 默认收集产物 |
| --- | --- |
| macOS | 仅 `.app`，DMG 和 ZIP 需显式开启。 |
| Windows | MSI 和 NSIS `.exe`。 |
| Linux | DEB、AppImage；安装 `rpmbuild` 时额外生成 RPM。 |

可选的 macOS 格式：

```bash
PACKAGE_DMG=1 PACKAGE_ZIP=1 bun run package:desktop
```

`SKIP_BUILD=1` 仅收集已有产物。`PACKAGE_PLATFORM` 只覆盖平台检测，不配置交叉编译。分发签名与公证需要单独配置。

[桌面发布工作流](./.github/workflows/release.yml)支持版本标签和手动运行、原生构建、源码归档及校验和；所需任务全部通过后才发布。产物和配置参见[发布说明](./doc/desktop-release/README.md)；工作流配置存在不代表 Release 已经发布。

## 架构与验证范围

- 桌面 AI 请求经 Rust 代理，浏览器开发模式经 Vite 代理。
- 每个画框在独立的 `iframe srcdoc` 文档中渲染。
- 生成页面使用基于 Token 的[权威样式表](./src/styles/base.css)，与编辑器自身的 Tailwind 样式隔离。
- 稳定 DOM 标识、手动样式覆盖层和 History 保护局部编辑。
- 当前重构具备单测、浏览器和 macOS 原生验收记录；Windows/Linux 原生实机验收仍是已记录的缺口，构建目标配置不能替代实机验证。

各版本实现与验收记录见[当前工作流状态](./doc/design-workflow-refactor/current.md)。

## 许可证

[Apache License 2.0](./LICENSE)。软件按“现状”提供，具体条款与责任限制以许可证为准。
