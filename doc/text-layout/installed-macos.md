# macOS安装版补充交付（2026-10-28）

**ACCEPTANCE: PASS（本机macOS arm64安装版）。** 用户要求完成剩余任务并排除Git及Windows/Linux打包；本轮完成当前macOS构建、更新安装和新入口实际UI闭环，不发布GitHub Release。

## 构建与安装

源码仍为 `ec5d65be5a88e7362ee7ace03f1fbf205a0ac83c8d94492c8ce21dc35b9cb562`，317文件逐项核对与[最近完整验收](../refactor-finalization/test.md)一致。因此沿用该源已执行的2,212单测、24Rust、类型/构建及42/42浏览器矩阵，不冒称本次重跑全部测试。本次新执行 `bun run package:desktop`：TypeScript/Vite通过，Vite2.94秒，Rust release编译18.81秒，输出macOS arm64 .app，未生成DMG或ZIP。[构建日志](./evidence/installed-macos/package.log)

打包初产物只有链接器签名，严格整包校验未通过；本次对交付的.app补本地ad-hoc整包签名，`codesign --verify --deep --strict`通过。没有Apple开发者签名/公证，也未改系统安全设置。[签名日志](./evidence/installed-macos/sign.log)

先通过实际UI保存并退出旧应用，确认旧进程停止，再分阶段替换安装目录。当前安装路径 `/Applications/TauDesign.app` 与 `dist-desktop/TauDesign.app` 全部文件哈希一致，已签名二进制SHA-256为 `4d57c7b133c3484f2df49f4bba32c434189200955ac680830c8638106263a4df`。

旧安装完整保留于 `doc/text-layout/evidence/installed-macos/backup/TauDesign.app`，新旧文件清单、签名及备份路径见[安装记录](./evidence/installed-macos/install.json)。版本号仍为工程配置的0.0.1，没有修改tag或发布元数据。

## 安装版真实UI验收

从 `/Applications/TauDesign.app` 启动，通过真实系统文件夹选择器打开独立测试工程。测试工程只复制既有复现HTML及设计系统；没有调用在线AI，也没有恢复用户已删除的页面。

1. 新版实际iframe检出 **3项窄列阻断**，正文67px/4.2em，占卡片28%，为7/7/5行；新修复入口可见。[界面](./evidence/installed-macos/before.ax.txt)、[截图](./evidence/installed-macos/before.png)
2. 点击“预览本页纵向布局修复”，显示3张卡片；点击“生成修复副本”，原页保持到采纳，候选侧车和独立预览写入磁盘，实际交付检查 **8/8** 后按钮可用。[预览](./evidence/installed-macos/preview.ax.txt)、[候选](./evidence/installed-macos/candidate.ax.txt)、[侧车](./evidence/installed-macos/candidate-before-accept.json)
3. 点击采纳后，磁盘正文与候选newHtml完全一致；渲染阻断降为0，采纳只有 **1条History**。撤销后恢复原HTML精确哈希并重新检出3项，重做后恢复候选且0项阻断。[采纳](./evidence/installed-macos/accepted.ax.txt)、[撤销](./evidence/installed-macos/undone.ax.txt)、[重做](./evidence/installed-macos/redone.ax.txt)、[历史](./evidence/installed-macos/accepted-history.json)
4. DOM复核仅9处class改变，元素层级、全部文案、NID和非class属性保持。[语义对照](./evidence/installed-macos/dom-check.json)
5. 经安装版导出面板和系统保存对话框输出45,534字节自包含HTML，以及 **390×2228** 整页PNG（441,577字节）。UI显示“原生整页渲染”，不是浏览器兼容回退；PNG已目视检查三张卡片完整换行，无原窄列，非空白图。HTML不含编辑NID或顶部系统导航。[导出UI](./evidence/installed-macos/export.ax.txt)、[HTML](./evidence/installed-macos/project.aidesign/installed-layout.html)、[PNG](./evidence/installed-macos/project.aidesign/installed-layout.png)
6. 返回管理页保存并退出，确认进程结束；重新启动安装版并重开工程，修复正文、清单路径及History恢复。再次通过真实UI撤销/重做，原HTML与修复HTML均精确复原，诊断随之3→0。[重开](./evidence/installed-macos/reopened.ax.txt)、[重开撤销](./evidence/installed-macos/reopened-undo.ax.txt)、[重开重做](./evidence/installed-macos/reopened-redo.ax.txt)

## 清理与范围

通过“从列表移除（仅移出列表，不删除工程数据）”移除测试工程最近入口，验收工程和证据保留；已返回原工程正在查看的“AI红娘对话牵线（布局修复）”。原工程仍30页，页面ID集合、所有页面HTML哈希和L4覆盖与本次开始时一致，不恢复已删页、不直接写用户工程。[清理](./evidence/installed-macos/cleanup.ax.txt)、[恢复原页](./evidence/installed-macos/restored-user.ax.txt)、[最终机器核对](./evidence/installed-macos/report.json)

Git提交/推送/tag/GitHub Release及Windows/Linux打包按本次要求排除；Windows/Linux原生实机验收继续保留此前用户确认的环境缺口。macOS Intel和远程分发公证未在本机执行，不将arm64实测扩写为全部平台。

本轮无产品代码变动，只有文档收口、构建产物、安装和真实UI验收。证据与应用包按既有规则本地忽略，不表示已经随Git发布。
