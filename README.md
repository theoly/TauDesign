# TauDesign · 智能原型与设计工作台 / Intelligent Prototype & Design Studio

<p align="center">
  <img src="assets/brand/taudesign-mark.svg" alt="TauDesign" width="104" height="104" />
</p>

<p align="center">
  <img src="assets/screenshots/editor-workspace.png" alt="TauDesign 编辑器工作台 / TauDesign editor workspace" width="880" />
</p>

<p align="center">
  <sub>编辑器工作台截图（布局以当前版本为准）：左侧 AI 对话、中部无限画布、右侧页面 / 资源 / 设计系统 / 历史 / 元素属性<br>Workspace screenshot (layout may differ): AI chat on the left, infinite canvas in the middle, pages / assets / design system / history / element properties on the right</sub>
</p>

<p align="center">
  <strong>用自然语言创造专业级交互原型 · 人人皆可使用的 AI 原生高保真设计工具</strong><br>
  <strong>Create production-grade interactive prototypes with natural language · An AI-first high-fidelity design tool for everyone</strong>
</p>

<p align="center">
  <a href="#-简体中文">简体中文</a> &nbsp;|&nbsp; <a href="#-english">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Developer%20Preview%20%7C%20Active%20Development-amber" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?logo=apple" alt="Platform" />
  <img src="https://img.shields.io/badge/Architecture-100%25%20Local--First-emerald" alt="Local First" />
  <img src="https://img.shields.io/badge/Export-Self--Contained%20HTML%20%2F%20Retina%20PNG-indigo" alt="Export" />
  <img src="https://img.shields.io/badge/LLM-DeepSeek%20%7C%20OpenAI%20%7C%20Claude%20%7C%20Ollama-orange" alt="Models" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-green" alt="License" />
</p>

> ⚠️ **开发阶段提示与免责声明 / Early Preview & Disclaimer**
>
> - 🇨🇳 **中文**：TauDesign 当前处于**早期预览与快速迭代阶段 (Developer Preview / Alpha)**，非商业稳定发布版本。功能、界面与底层数据格式可能频繁变动。使用前请注意**定期备份重要工程数据**，由 AI 生成的界面建议经人工核查后使用。本项目按 Apache License 2.0 “按现状”提供，不承担任何明示或暗示的担保。
> - 🇬🇧 **English**: TauDesign is currently in **Developer Preview / Alpha stage** (active development, non-stable release). Features, UI layouts, and local data schemas may evolve rapidly. Please maintain **regular backups of your project folders**. AI outputs should be reviewed before production use. Distributed under the Apache License 2.0 "as-is" without warranty.

---

## 🇨🇳 简体中文

### 💡 为什么选择 TauDesign？

以往使用 AI 生成界面，常常面临三大痛点：**“毛坯感严重”**（样式简陋难以直接作为正式方案）、**“黑盒不可控”**（稍作修改就会破坏整体页面）以及**“一次性孤岛”**（无法像 Figma 那样在全局画板中纵览与精细微调）。

**TauDesign** 专为解决这些问题而设计：
- 🚀 **一句话秒级成页**：输入日常业务语言，AI 即刻根据专业 UI 规范生成具备细腻层次、排版与微质感的高保真原型；
- 🎨 **Figma 级别的无限多画框画板**：在同一张无限画布上同时构建登录、首页、详情、个人中心等整套完整用户旅程；
- 🖱️ **所见即所得的可视化点选精修**：看哪不顺眼点哪里，直观调节边距、颜色、对齐与文字，无需手写一行代码；
- ⚖️ **并排比选，告别无声覆盖**：AI 进行方案调整时自动在右侧生成新旧对照画框，采纳、保留两版或放弃尽由您决定；
- 🔒 **100% 数据归属您的本地电脑**：所有工程直接保存在您选择的本地文件夹中，隐私安全不出网，永久掌控自己的数字资产。

---

### ✨ 核心功能全景

#### 1. 🎨 无限多画框全景画板 (Infinite Canvas)
- **多页面全局漫游**：支持在超大画板中任意平移（按住空格拖动或触控板双指滑动）与缩放（10%–400%），宏观把握整个产品业务动线；
- **设备专属比例标尺**：创建工程时可选 **电脑端 (PC 1440px)** 或 **手机端 (Mobile 390px)**，杜绝错位变形；
- **首屏折线视口指引**：画框高度随内容自然撑开，同时虚线标出真实设备首屏分界线（电脑 900px / 手机 844px），兼顾长图设计与真实屏幕首屏体验；
- **实时小地图**：在左下角同步查看页面内容缩略图、画框分布、选中态和当前视口，点击或拖动快速定位；平移、缩放、修改内容和主题时自动更新；
- **智能防重叠与一键整理**：画框拖拽自动避让，点击顶栏「整理画板」可一键将所有页面整齐规范排版。

#### 2. 💬 懂设计的 AI 智能对话助手
- **全主流模型自由接入**：预设支持 DeepSeek（含 R1 深度思考推理模型）、OpenAI (GPT-4o)、Anthropic Claude、Google Gemini、阿里百炼等，亦支持本地运行的 Ollama / vLLM；
- **显式页面引用 (`@` 提到)**：在对话框输入 `@` 即可直接引用已有页面（如：“*参考 @登录页 的卡片阴影与配色，生成 @个人中心*”）；
- **思考过程透明可见**：支持展开与折叠大模型的高阶推理链，生成状态与意图实时指示；
- **一键置入对话**：在画框中选中任意按钮或卡片，点击「添加到对话」即可精准针对该元素进行专项 AI 调优。

#### 3. ⚖️ 方案并排比选 (Side-by-Side Adoption)
- 当您让 AI “调整这个页面的风格”或“重新设计布局”时，系统绝不会粗暴覆盖您的现有成果；
- 新方案将**自动平铺在原画框右侧**供您左右对比；
- 浮动工具栏提供三大从容决策路径：
  - **采纳新版**：将修改后的新版本替换原页面，旧版自动打上安全快照，随时支持 `Ctrl+Z` 撤销；
  - **两版都留**：保留新旧两张画框，便于与团队比对汇报或提供 A/B 方案；
  - **保留原版**：一键撤回新提案，原画框完好无损。

#### 4. 🎯 可视化属性检查器 (Inspector)
- **统一右侧标签栏**：页面、资源、设计系统、历史与元素属性集中切换；选中画布元素时自动展开「元素属性」，支持拖拽调宽和折叠；
- **精准点选高亮**：鼠标轻移即展示悬浮框，点击画框内任意元素即可激活检查器面板；
- **外边距与内边距 (Box Model)**：以专业盒模型图示呈现 Margin 与 Padding，支持纯数字输入、微调步进或 `auto` 居中，自动补齐标准 `px` 单位；
- **Flex 排版直观调节**：水平/垂直排列、左右对齐、两端对齐、网格间隙 (Gap) 一键切换；
- **安全行内编辑**：双击画框内的任意文本即可直接敲键盘修改文案（按 Enter 提交，Esc 取消），底层采用文本安全隔离引擎，绝不损坏原有组件与图标；
- **结构级联安全删除**：选中容器或组件后按下键盘 `Delete` / `Backspace` 键，即可一键将该容器及其内部所有子孙节点完整干净移除，同步清除多余样式覆盖。

#### 5. 💎 统一设计系统与主题风格 (Design System & Tokens)
- **4 套工业级精调预设**：开箱即用科技蓝 (Tech Blue)、深冷灰 (Cool Slate)、数字紫 (Digital Violet) 与森林绿 (Forest Green)；
- **一键切换明暗模式**：随时点击顶栏的「浅色 / 深色」按钮，画框内部所有颜色变量瞬间热重排，生成高保真暗黑模式界面；
- **Token 合规率检测 (Token Lint)**：实时检测画框内是否存在破坏规范的生硬手写色值，支持一键将游离色值规范化映射回品牌 Token；
- **工程设计记忆**：对话中达成的约定（如“*本工程所有主卡片必须具备 16px 圆角*”）将沉淀为工程规则，持续指导后续生成。

#### 6. 🖼️ 工程封面与资源中心 (Cover & Assets)
- **智能化工程卡片**：工程管理列表自动抓取首个画框的高清首屏作为封面预览，无画框时自动展示优雅字标；
- **画框一键设为封面**：在画框标题栏选中任意满意页面，点击「设为封面」图标即可将其锁定为该工程的代表性缩略图；
- **设计资产中心**：便捷插入精美矢量图标、高品质占位图片与预制组件。

#### 7. 📦 纯净无损交付与成果导出 (Export)
- **纯净单页 HTML 导出**：
  - 一键导出的 HTML 为**自包含单文件**（内嵌所有必需样式与字体声明）；
  - 双击该 HTML 文件，在任意电脑的 Chrome、Safari 或 Edge 浏览器中都能丝滑打开交互演示；
  - 导出时已自动剥离所有内部调试契约属性（`data-nid` 等），代码干净规整，工程师可以直接参考或切图开发；
  - 支持可选附带导出 Manifest 元数据侧车文件。
- **双轨高保真 PNG 导出**：
  - 桌面端优先走平台原生无头渲染器（WebKit PDF/快照），长图实测高度还原，绝不截断或大面积留白；
  - 内联 SVG 转换杜绝嵌套子图片屏蔽，卡片排版永不塌陷；
  - 支持 **1x / 2x / 3x** 物理像素矢量缩放，导出字迹线条锐利清晰；
  - 支持「导出完整滚动长图」或「仅截取设备首屏高度」，直接用于产品汇报与设计评审。

---

### 🚀 3 分钟快速上手

#### 第一步：配置您的 AI 助手密钥
1. 启动 TauDesign；
2. 点击右上角或设置面板中的 **「AI 模型设置」**；
3. 选择您常用的提供商（例如：**DeepSeek**、**阿里云百炼** 或 **OpenAI**）；
4. 填入您的 API Key（数据仅保存在本地受控存储中），点击「测试连通性」确认连接成功。
   > 💡 *如果您在本地运行了 Ollama，只需选择自定义端点并填入 `http://localhost:11434/v1` 即可零成本离线体验。*

#### 第二步：创建您的第一个设计工程
1. 在首页点击 **「新建工程」**；
2. 输入工程名称（如：“电商 App 核心流程”）；
3. 选择设备类型：
   - 📱 **移动端 (Mobile - 390px)**：适合 iOS / Android 手机原型；
   - 💻 **电脑端 (PC - 1440px)**：适合 Web 官网、SaaS 后台或桌面管理系统；
4. 选择工程保存文件夹（工程将以文件夹形式完整沉淀在您的电脑中）。

#### 第三步：输入需求，见证创意生成
在最左侧的 **AI 对话** 面板输入您的第一条设计构想，例如：
> “*设计一个现代极简风格的企业 SaaS 登录页面，包含企业邮箱登录、密码输入框、微信扫码切换 Tab 以及底部服务协议。*”

点击发送，AI 将在画板中为您快速建立第一个画框并开始流式渲染！

---

### 💡 常用提示词（Prompt）精选指南

| 目标场景 | 推荐提示词范例 |
| :--- | :--- |
| **全流程页面拓展** | “参考当前页面的风格，为我们的应用生成一个「用户充值与会员开通」页面，包含月卡/季卡/年卡横向比选卡片、权益对比列表以及底部固定的立即开通按钮。” |
| **局部细节微调** | 鼠标点击画框内的目标容器，输入：“*把刚才选中的卡片背景改为带毛玻璃微透明质感，边框改为淡蓝色微光，内部文字稍微拉开垂直间距。*” |
| **主题氛围重塑** | “*为当前工程切换到科技冷灰风格，并将所有主操作按钮的强调色强化，增强整体页面的高端商务质感。*” |
| **移动端专项优化** | “*当前移动端页面的底部结算栏需要在页面下方悬浮吸底，请确保包含安全区距离，并加入结算总价与高亮结账按钮。*” |

---

### ⌨️ 常用快捷键速查表 (Cheat Sheet)

| 按键操作 | 功能说明 | 适用场景 |
| :--- | :--- | :--- |
| **空格 + 鼠标左键拖动** | 自由平移漫游画板 | 全局画板 |
| **触控板双指滑动** | 平移画板（支持上下左右任意方向） | 全局画板 |
| **Cmd / Ctrl + 鼠标滚轮** | 以鼠标为中心平滑缩放画板 (10% ~ 400%) | 全局画板 |
| **Cmd / Ctrl + Z** | 撤销上一步操作 (支持画框修改、属性微调、删除恢复) | 全局工作台 |
| **Cmd / Ctrl + Shift + Z** | 重做下一步操作 | 全局工作台 |
| **单击画框内元素** | 选中节点并打开右侧属性检查器 | 画框内部 |
| **双击文本内容** | 进入就地行内文字编辑模式 | 画框文本 |
| **Enter (回车键)** | 确认并保存行内文字编辑 | 文本编辑中 |
| **Esc (退出键)** | 取消行内编辑并恢复原文字 | 文本编辑中 |
| **Delete / Backspace** | 级联安全删除选中的节点及其所有子元素 | 选中节点时 |
| **双击画框上方标题** | 就地重命名该画框名称 | 画框上方标题 |

---

### 🔒 隐私与数据安全承诺

TauDesign 秉承 **“本地优先 (Local-First)”** 理念：
- **工程数据完全归属用户**：您的工程以开放规范的本地文件夹（包含 `project.json`、页面 `screens/*.html` 及 `assets/` 附件）存储在您指定的硬盘目录中；
- **绝无云端数据回传**：除与您自行指定的 AI 服务商（如 DeepSeek、OpenAI）发送生成提示词外，本软件不向任何第三方服务器上传您的设计文档、画框内容或个人工程元数据；
- **API 密钥本地加密**：您的模型密钥仅保存在本机操作系统的安全存储中，绝不离开您的设备。

---

### ❓ 常见问题答疑 (FAQ)

<details>
<summary><strong>Q: 导出的单页 HTML 原型，发给客户或同事能在没有安装本软件的电脑上打开吗？</strong></summary>
<br>
<strong>完全可以。</strong> 导出的 HTML 原型采用完全自包含技术，所有的 CSS 样式、排版基座与字体图标定义均已内嵌。无论是发送给客户在微信/邮件中双击查看，还是放到内网服务器中演示，都能得到 100% 一致的高保真交互效果。
</details>

<details>
<summary><strong>Q: 为什么创建工程后不能随意在 PC 端和手机端之间切换？</strong></summary>
<br>
真正的专业 UI/UX 原型并非粗暴将网页压缩变形。PC 端（1440px 容器流、多列分栏、悬浮态）与移动端（390px 单列流、拇指操作热区、吸底导航栏、安全区留白）在交互语义和 AI 生成约束上截然不同。为了保证生成产物的严谨性与工业级保真度，每个工程固定一种设备档位。若需多端方案，可为同项目分别创建 PC 与 Mobile 两套工程。
</details>

<details>
<summary><strong>Q: 如果我删除了一个卡片容器，里面的子文本和按钮会怎么样？</strong></summary>
<br>
软件内置级联删除引擎。删除父容器时，其内部所有嵌套的子元素会被 100% 完整干净地同步移除，绝不会在页面底部残留孤儿标签或游离内容，同时多余的样式覆盖层也会被自动清除。如果不小心删错，随时按下 <code>Ctrl+Z</code> 即可瞬间完整恢复。
</details>

<details>
<summary><strong>Q: 如何接入我本地部署的开源大模型（如 Ollama / vLLM）？</strong></summary>
<br>
点击右上角「设置」→「AI 模型设置」，添加新配置时选择 <strong>Custom (兼容 OpenAI)</strong>，端点填入 <code>http://localhost:11434/v1</code>（Ollama 默认地址），模型名称输入本地已下载的模型（如 <code>qwen2.5-coder</code>），API Key 任意填写英文字符即可畅享完全离线的 AI 原型设计体验。
</details>

---

### ⚠️ 开发阶段与免责声明

在下载、编译或使用 TauDesign 之前，请仔细阅读以下免责与使用说明：

1. **早期开发阶段与非稳定性 (Developer Preview / Alpha)**：
   - 本项目目前处于活跃的早期开发阶段，**尚未发布正式商用稳定版本**；
   - 在使用过程中，您可能会遇到未预期的程序错误 (Bug)、界面渲染异常、偶发崩溃或多平台兼容性差异；
   - 软件的交互界面、设计系统 Token 规范、菜单结构及底层实现可能在后续更新中频繁优化与调整。
2. **工程数据安全与定期备份建议**：
   - TauDesign 采用本地文件夹机制（`*.aidesign`）存储工程。随着功能迭代，新旧版本之间的数据格式可能发生架构升级；
   - **强烈建议**：请勿将未经备份的重要设计成果作为本工具的单一存档。在体验与原型制作过程中，请务必定期将工程目录备份至外部安全存储介质。
3. **第三方 AI 服务与生成内容说明**：
   - TauDesign 为本地客户端软件，不托管或直接运行任何私有云端模型；所有原型代码均由用户自行配置的第三方提供商（如 DeepSeek、OpenAI、Anthropic、阿里百炼等）或本地运行的模型（如 Ollama）计算生成；
   - AI 生成的代码质量、排版布局及色彩表现直接受所选大模型的理解能力与提示词影响；
   - 开发者与贡献者不对 AI 产出内容的准确性、完整性、合法合规性以及潜在的知识产权风险承担保证或赔偿责任。
4. **开源许可条款 (Apache License 2.0)**：
   - 本项目基于 **Apache License 2.0** 开源，完整条款见仓库根目录的 [LICENSE](./LICENSE) 文件；
   - 依据该协议，您可获得永久、全球性、非独占、免费的著作权与专利使用许可；再分发本作品或其衍生作品时，须随附协议副本、保留原有版权声明，并对修改过的文件作出显著说明；
   - 软件按**“现状 (AS IS)”**提供，在适用法律允许的最大范围内，许可方与各贡献者不提供任何明示或暗示的担保（包括但不限于所有权、无侵权、适销性及特定用途适用性担保）；
   - 任何因使用、依赖或无法使用本软件所导致的直接、间接、特殊、偶然或继发性损失（包括但不限于商誉损失、数据丢失、业务中断、计算机故障或利润损失），许可方与各贡献者均不承担法律责任。

---

## 🇬🇧 English

### 💡 Why TauDesign?

Traditional AI UI generators often suffer from three major pain points: **"Rough & Unfinished"** (crude outputs that can never be delivered directly to stakeholders), **"Black-Box & Uncontrollable"** (one tiny prompt tweak ruins the entire layout), and **"One-Off Silos"** (isolated single pages lacking the bird's-eye view and precision tuning of Figma).

**TauDesign** is built from the ground up to solve these challenges:
- 🚀 **From Prompt to High-Fidelity in Seconds**: Express your product ideas in plain business language; TauDesign instantly synthesizes polished, token-compliant interactive screens with professional hierarchy and micro-textures.
- 🎨 **Figma-Grade Infinite Canvas**: Construct complete end-to-end user journeys (Sign-in, Dashboard, Details, Profile) side by side on an expansive infinite artboard.
- 🖱️ **Point-and-Click Visual Precision**: Click any element on canvas to tweak spacing, colors, alignment, and typography without writing a single line of CSS.
- ⚖️ **Side-by-Side Proposal Adoption**: When requesting AI adjustments, TauDesign lays out before-and-after artboards side by side. Adopt, keep both, or discard with full control.
- 🔒 **100% Local-First Data Sovereignty**: All projects live in your local file system (`*.aidesign` folder). Zero telemetry, zero cloud lock-in, and 100% offline ownership.

---

### ✨ Features at a Glance

#### 1. 🎨 Infinite Artboard Canvas
- **Fluid Pan & Zoom**: Pan freely (Hold Space + Drag or two-finger trackpad swipe) and zoom from 10% to 400% to keep the entire product architecture in sight.
- **Dedicated Device Profiles**: Choose between **Desktop (PC 1440px)** or **Mobile (390px)** upon project creation to prevent layout distortion.
- **Fold Line Viewport Guides**: Screen height expands naturally with content, overlaid with dashed lines indicating true fold lines (PC 900px / Mobile 844px).
- **Live Minimap**: Preview page content, artboard positions, the active screen and the current viewport. Click or drag to navigate; content, style, layout and viewport changes update automatically.
- **Collision Avoidance & Auto-Tidy**: Smooth dragging with intelligent collision avoidance; one-click "Tidy Up" neatly arranges all screens.

#### 2. 💬 Design-Native AI Assistant
- **Universal Provider Gateway**: Native presets for DeepSeek (including R1 reasoning), OpenAI (GPT-4o), Anthropic Claude, Google Gemini, and local LLMs via Ollama / vLLM.
- **Explicit Screen References (`@` mentions)**: Type `@` to reference existing screens (e.g., "*Match the card shadows and palette of @Login to design @Profile*").
- **Transparent Reasoning Chain**: Expand and inspect deep thinking steps with real-time status and intent classification.
- **Add Element to Chat**: Select any button or container on the canvas and click "Add to Chat" for surgical AI refinements.

#### 3. ⚖️ Side-by-Side Proposal Adoption
- AI modifications never silently overwrite your existing satisfactory work.
- New proposals appear side by side with the original artboard for instant visual comparison.
- Three decisive actions:
  - **Adopt New**: Replace the original screen with the new version (backed by automatic checkpoint and `Ctrl+Z` undo).
  - **Keep Both**: Keep both screens for team review or A/B variant presentations.
  - **Keep Original**: Discard the proposal; the original screen remains untouched.

#### 4. 🎯 Visual Property Inspector
- **Unified Right Sidebar**: Switch between pages, assets, design system, history and element properties. Selecting an element opens its properties; the sidebar supports resizing and collapsing.
- **Precise Element Selection**: Hover highlights and click-to-select with full DOM isolation.
- **Interactive Box Model**: Visual margin and padding controls with numerical inputs, step buttons, `auto` centering, and automatic `px` unit sanitization.
- **Flexbox & Grid Controls**: Toggle direction, alignment, justification, and gap with one click.
- **Safe Inline Text Editing**: Double-click any text inside the screen to edit in place (Enter to commit, Esc to cancel), protected by DOM text isolation engines.
- **Cascading Safe Deletion**: Press `Delete` or `Backspace` to cleanly remove the selected container and all nested children without leaving orphan DOM tags.

#### 5. 💎 Design System & Token Presets
- **4 Crafted Presets**: Tech Blue, Cool Slate, Digital Violet, and Forest Green.
- **Instant Light / Dark Mode**: Toggle between light and dark modes with real-time CSS variable re-compilation.
- **Token Lint Compliance**: Automated scanner detecting unstandardized colors with one-click token remediation.
- **Project Design Memory**: Agreements reached in chat (e.g., "*All cards must use 16px border-radius*") persist as rules governing future generations.

#### 6. 🖼️ Project Covers & Asset Hub
- **Smart Project Cards**: Automatically captures the first screen's above-the-fold viewport as the project cover, with elegant fallback typography for empty projects.
- **Set as Cover**: Select any screen and click "Set as Cover" to lock it as the project thumbnail.
- **Asset Library**: Insert curated vector icons, high-resolution placeholder images, and reusable component blocks.

#### 7. 📦 Pure & High-Fidelity Export
- **Self-Contained Single-Page HTML**:
  - Exports a clean, zero-dependency standalone `.html` file with all CSS variables and base stylesheets embedded.
  - Double-click to open and demonstrate in Chrome, Safari, or Edge on any machine.
  - Automatically strips internal attributes (`data-nid`), providing clean code ready for handoff.
  - Optional sidecar metadata export (`.manifest.json`).
- **Dual-Track High-Fidelity PNG Export**:
  - Desktop-native headless renderer (WebKit PDF/snapshot) capturing true measured content height without truncation or bottom blank spaces.
  - Inlined SVG conversion bypassing sub-resource sandbox blocks to eliminate card collapse.
  - Native **1x / 2x / 3x** Retina resolution scaling for crisp typography and vector borders.
  - Toggle between full-page scroll capture or fold-line viewport clipping.

---

### 🚀 Quick Start in 3 Minutes

#### Step 1: Configure Your AI Provider
1. Launch TauDesign;
2. Click **AI Settings** in the top-right corner;
3. Choose your preferred provider (**DeepSeek**, **Aliyun DashScope**, **OpenAI**, etc.);
4. Enter your API Key and click "Test Connection".
   > 💡 *If using Ollama locally, select Custom Endpoint and enter `http://localhost:11434/v1`.*

#### Step 2: Create Your First Project
1. Click **New Project** on the home screen;
2. Enter your project name (e.g., "E-Commerce Core Flow");
3. Select your device profile:
   - 📱 **Mobile (390px)**: iOS / Android prototypes;
   - 💻 **Desktop (1440px)**: Web dashboards, SaaS consoles, or desktop apps;
4. Select a local folder to store your project.

#### Step 3: Prompt & Generate
Use the **AI Chat** panel on the left to type your design concept:
> "*Design a minimalist SaaS login page with corporate email sign-in, password input, WeChat QR code tab switcher, and terms of service at the bottom.*"

Hit Send, and watch TauDesign construct your first screen on the canvas in real time!

---

### ⌨️ Keyboard Shortcuts (Cheat Sheet)

| Shortcut | Description | Context |
| :--- | :--- | :--- |
| **Space + Left Click Drag** | Pan canvas freely | Global Canvas |
| **Two-finger Trackpad Swipe** | Pan canvas in any direction | Global Canvas |
| **Cmd / Ctrl + Mouse Wheel** | Smooth zoom centered on cursor (10% - 400%) | Global Canvas |
| **Cmd / Ctrl + Z** | Undo last action (DOM, tokens, layout, deletes) | Workspace |
| **Cmd / Ctrl + Shift + Z** | Redo next action | Workspace |
| **Single Click Element** | Select node and open Property Inspector | Canvas Screen |
| **Double Click Text** | Enter inline text editing mode | Canvas Screen |
| **Enter** | Commit inline text edit | Text Editing |
| **Esc** | Cancel inline text edit | Text Editing |
| **Delete / Backspace** | Cascading delete of container and all children | Node Selected |
| **Double Click Screen Title** | Rename screen in place | Screen Header |

---

### 🔒 Privacy & Security Commitment

TauDesign is strictly built around a **Local-First** philosophy:
- **You Own Your Data**: Projects are stored as transparent local folders (containing `project.json`, `screens/*.html`, and `assets/`) on your drive.
- **Zero Cloud Leakage**: Outside of sending your prompts to your designated AI providers (e.g. DeepSeek, OpenAI), TauDesign never uploads your project files, canvas contents, or telemetry to any third-party server.
- **Secure Local Storage**: API keys are securely stored on your local machine and never transmitted elsewhere.

---

### ❓ FAQ

<details>
<summary><strong>Q: Can exported standalone HTML files be opened on computers without TauDesign installed?</strong></summary>
<br>
<strong>Yes, absolutely.</strong> Exported HTML files are 100% self-contained with all CSS variables, typography, and utility classes inlined. Anyone can double-click to view and interact in Chrome, Safari, or Edge without any dependencies.
</details>

<details>
<summary><strong>Q: Why can't I switch between Desktop and Mobile profiles after creating a project?</strong></summary>
<br>
Professional UI/UX design is not merely resizing browser viewports. Desktop (multi-column layouts, hover states, 1440px flow) and Mobile (390px single-column flow, thumb zones, sticky bottom bars, safe area insets) require fundamentally different UX semantics. Locking the device profile ensures AI generation constraints remain rigid and robust. For multi-platform projects, creating separate Desktop and Mobile projects is recommended.
</details>

<details>
<summary><strong>Q: What happens if I delete a card container?</strong></summary>
<br>
TauDesign features a cascading deletion engine. Deleting a parent container cleanly removes all nested text, buttons, and icons from the DOM tree without leaving orphan tags, while simultaneously cleaning up orphaned CSS overrides. You can always press <code>Ctrl+Z</code> to undo immediately.
</details>

<details>
<summary><strong>Q: How do I connect locally deployed open-source models (such as Ollama or vLLM)?</strong></summary>
<br>
Click "AI Settings" in the top-right corner. When adding a new configuration, choose <strong>Custom (OpenAI-Compatible)</strong>, set the endpoint to <code>http://localhost:11434/v1</code> (Ollama's default), input your downloaded model tag (e.g. <code>qwen2.5-coder</code>), and enter any placeholder string as the API Key to design completely offline.
</details>

---

### ⚠️ Development Status & Disclaimer

Please carefully review the following disclaimers before building, downloading, or running TauDesign:

1. **Active Development & Non-Stable Release (Developer Preview / Alpha)**:
   - This project is in its early, rapid-iteration phase and has **not reached a stable commercial or production 1.0 release**;
   - You may encounter unexpected bugs, layout and CSS rendering discrepancies, intermittent crashes, or platform-specific glitches;
   - User interfaces, design token definitions, menus, and internal implementation details are subject to frequent changes without notice.
2. **Data Safety & Regular Backup Recommendations**:
   - TauDesign organizes projects as transparent local directories (`*.aidesign`). As features and CSS whitelist standards evolve, local data structures may undergo architectural migrations;
   - **Strong Recommendation**: Never use early preview builds as the sole unbacked repository for critical deliverables. Always create regular external backups of your project directories.
3. **Third-Party AI Services & Output Notice**:
   - TauDesign operates strictly as a client-side interface tool and does not host or operate cloud AI models. All UI layouts and code are generated by third-party APIs configured by you (e.g., DeepSeek, OpenAI, Anthropic, Aliyun DashScope) or your local runtime (e.g., Ollama);
   - The quality, aesthetic accuracy, and code correctness of generated screens directly depend on the capabilities of the configured model and the provided prompts;
   - The authors and maintainers provide no warranties regarding the accuracy, fitness, legality, or IP compliance of any content synthesized by third-party AI models.
4. **Open-Source License & Limitation of Liability (Apache License 2.0)**:
   - TauDesign is released under the terms of the **Apache License 2.0**; the full text is available in the [LICENSE](./LICENSE) file at the root of this repository;
   - Subject to the terms of the License, You are granted a perpetual, worldwide, non-exclusive, no-charge copyright and patent license; when redistributing the Work or Derivative Works, You must include a copy of the License, retain the original copyright notices, and carry prominent notices on any modified files;
   - The software is provided on an **"AS IS" BASIS**, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE;
   - IN NO EVENT AND UNDER NO LEGAL THEORY SHALL ANY CONTRIBUTOR BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY DIRECT, INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES OF ANY CHARACTER ARISING AS A RESULT OF THIS LICENSE OR OUT OF THE USE OR INABILITY TO USE THE WORK (INCLUDING BUT NOT LIMITED TO LOSS OF GOODWILL, DATA LOSS, WORK STOPPAGE, COMPUTER FAILURE OR MALFUNCTION, OR ANY AND ALL OTHER COMMERCIAL DAMAGES OR LOSSES), EVEN IF SUCH CONTRIBUTOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

---

## 🛠️ 源码编译 / Build from Source

### 环境准备 / Prerequisites

前端使用 React + TypeScript + Vite，桌面壳使用 Tauri 2 + Rust。请先安装 [Bun](https://bun.sh/docs/installation)、Node.js 22（或其他满足 Vite 6 要求的版本）和 Git；桌面调试与打包还需通过 [rustup](https://rustup.rs/) 安装 Rust stable / Cargo。`src-tauri/Cargo.toml` 声明 Rust 最低版本为 1.77.2，实际构建应使用满足当前锁定依赖要求的 stable 工具链。

The frontend uses React, TypeScript and Vite; the desktop app uses Tauri 2 and Rust. Install Bun, Node.js 22 (or another Vite 6 compatible version) and Git. Desktop development also requires Rust stable and Cargo via rustup; the declared Rust minimum alone may not satisfy all locked dependencies.

桌面系统依赖 / Desktop system dependencies（详见 [Tauri 官方环境准备](https://v2.tauri.app/start/prerequisites/)）：

| 平台 / Platform | 构建环境 / Build environment |
| :--- | :--- |
| macOS | Xcode Command Line Tools（`xcode-select --install`）；桌面系统提供 WebKit。/ Xcode Command Line Tools; system WebKit. |
| Windows | Microsoft C++ Build Tools 的“使用 C++ 的桌面开发”工作负载、Windows SDK、WebView2 Runtime；Rust 使用 MSVC 工具链。/ C++ desktop workload, Windows SDK, WebView2 and MSVC Rust toolchain. |
| Linux | 按发行版安装 WebKitGTK 4.1 开发包、编译工具、OpenSSL 及 Tauri 系统依赖，具体包名见官方说明。/ Install WebKitGTK 4.1 development packages, build tools, OpenSSL and distribution-specific Tauri dependencies. |

### 1. 安装项目依赖 / Install dependencies

下载或克隆本仓库，在包含 `package.json` 的项目根目录运行以下命令。/ Download or clone this repository and run these commands from its root:

```bash
bun install
```

### 2. 本地调试 / Local development

仅调试前端 / Frontend only:

```bash
bun run dev
```

浏览器访问 `http://localhost:5173`。端口在 `vite.config.ts` 中固定为 5173，若已占用请先停止占用进程。浏览器模式通过 Vite 开发代理请求 AI；本地工程文件读写、原生对话框及原生 PNG 导出需使用桌面模式验证。

Open `http://localhost:5173`. The port is fixed; stop any existing server using it first. Browser development uses the Vite AI proxy. Verify native project storage, dialogs and PNG export in desktop mode.

启动完整桌面应用 / Run the desktop app:

```bash
bun run tauri dev
```

Tauri 会通过 `beforeDevCommand` 自动启动 Vite；不要同时另开一个 `bun run dev` 占用 5173。首次编译会下载 Rust 依赖并编译原生代码。API Key 可在应用内配置，编译本身不需要密钥。

Tauri starts Vite automatically. Do not start a second dev server on port 5173. The first run downloads and compiles Rust dependencies. API keys are configured inside the app and are not required to compile it.

### 3. 验证与生产构建 / Checks and production build

```bash
bun test
bun run type-check
bun run build
```

前端产物位于 `dist/`。`bun run build` 只构建前端；构建桌面安装包请执行 / Frontend assets go to `dist/`. To compile and bundle the desktop app:

```bash
bun run tauri:build
```

桌面产物位于 `src-tauri/target/release/bundle/`。Tauri 会自动先构建前端；原生构建和安装包应在目标操作系统上执行。/ Desktop bundles go to `src-tauri/target/release/bundle/`. Tauri builds the frontend automatically. Build native bundles on the target operating system.

### 4. 收集分发包 / Collect distribution packages

仓库提供额外打包脚本，需要 Bash 和 `jq`（Windows 在 Git Bash 中运行）。/ The distribution script requires Bash and `jq`; use Git Bash on Windows.

```bash
bun run package:desktop
```

脚本构建后将文件收集到 `dist-desktop/`，名称与版本取自 `src-tauri/tauri.conf.json`。/ The script builds and collects packages into `dist-desktop/`, using the name and version from `src-tauri/tauri.conf.json`.

| 运行平台 / Build host | 收集产物 / Collected artifacts |
| :--- | :--- |
| macOS | `.app`、`.dmg`、`.zip` |
| Windows | MSI、NSIS `.exe` |
| Linux | DEB、AppImage；检测到 `rpmbuild` 时额外生成 RPM / RPM when `rpmbuild` is available |

此脚本按当前平台选择打包格式，`PACKAGE_PLATFORM` 仅覆盖平台检测，不安装交叉编译工具链。/ `PACKAGE_PLATFORM` overrides platform detection only; it does not set up cross-compilation.

---

## 👨‍💻 Developer & Contributor Guide

If you are a full-stack engineer or open-source contributor interested in system architecture:
- Architecture Blueprint & Decisions (D1–D34): See [Product Requirements Document (`doc/prd.md`)](./doc/prd.md);
- Feature Specs & Test Suite Matrix: See [Documentation Index (`doc/README.md`)](./doc/README.md).

---

## 📄 License

Distributed under the [Apache License 2.0](./LICENSE) / 基于 [Apache License 2.0](./LICENSE) 开源。

```
Copyright 2026 TauDesign Authors theo@ukmms.org

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
