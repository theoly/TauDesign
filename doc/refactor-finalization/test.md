# 重构剩余项收口验证（2026-10-28）

> 后续安装版验收已补齐：当前macOS arm64 .app备份更新、实际UI布局候选/采纳/History/退出重开与HTML/原生PNG通过，见[安装版报告](../text-layout/installed-macos.md)。源码指纹未变。本页“未覆盖已安装桌面包”仅描述当时隔离开发窗口的验证范围，不能覆盖后续已完成证据。Git与Windows/Linux打包按用户新要求排除。

**结论：本轮代码缺陷和当前源码回归已闭环。Windows/Linux原生实机验收按用户明确选择保留缺口，不标为全部平台通过。**

## 修复

`addScreen` 按最终页面ID设置 entry，副本创建时不再继承旧页路径，且 entry 随同一 History 事务撤销重做。`normalizeToArtifactManifest` 始终派生 screens/{id}.html，与仓储实际读写一致。旧工程加载时在内存纠正，下一次正常保存同步 project.json 和 manifest；不直接批改用户工程、移动旧文件或回退读取原页。

5项新增回归在修复前1通过/4失败，证据[before.log](./evidence/before.log)；修复后与原Manifest、画布布局和工程迁移共48项通过，证据[targeted.log](./evidence/targeted.log)。包括缺少副本正文时拒绝拿原页冒充，以及保存不改变调用方快照。

## 最终源码与命令

采用原矩阵的生产/验证源码范围（src、Python脚本、Rust源/配置、Vite与package），317文件，指纹 `ec5d65be5a88e7362ee7ace03f1fbf205a0ac83c8d94492c8ce21dc35b9cb562`。最终顺序命令与矩阵的清单完全一致，运行后重新计算未变化：[source-final.json](./evidence/source-final.json)、[matrix/source.json](./evidence/matrix/source.json)、[final-audit.json](./evidence/final-audit.json)。该统计范围与此前布局专项包含额外测试文件的320文件清单不同，不直接用文件数推断代码增删。

| 验证 | 实际结果 | 证据 |
|---|---|---|
| bun test | **2,212通过 / 0失败**；198文件、14,034断言、42.72秒 | [完整日志](./evidence/full-final.log) |
| bun run type-check | 退出0，无类型诊断 | [日志](./evidence/type-final.log) |
| bun run build | 退出0，Vite3.03秒；主包1,439.92kB/gzip456.68kB | [日志](./evidence/build-final.log) |
| cargo test --locked | **24通过 / 0失败** | [日志](./evidence/rust.log) |
| 原21工作流×两引擎 | **42/42通过，0失败/超时**，09:44:59至09:48:15；逐份JSON及退出码核对 | [矩阵](./evidence/matrix/report.json)、[日志](./evidence/matrix.log) |
| 新增清单专项 | Chromium/WebKit各通过；真实Store/iframe/History/仓储及刷新重开，pageerror=0 | [Chromium](./evidence/manifest/chromium/report.json)、[WebKit](./evidence/manifest/webkit/report.json) |

全矩阵使用确定性模型/文件夹选择夹具及浏览器回退存储，执行真实应用代码；没有调用在线模型或打开用户真实工程，不能冒称本轮模型或原生系统对话框全链路。42份历史报告没有覆盖。本轮另将复跑器收录为 `scripts/verify-refactor-matrix.py`，要求空输出目录，防止覆盖历史结果。

## macOS真实原生专项

启动 `bun run dev` 后，通过覆盖配置启动 `bunx tauri dev --no-watch --config ...`；独立identifier、独立 `/private/tmp/taudesign-manifest-*` 工程及专用测试页，不打开主App入口或用户工程。

真实Tauri/Rust文件写入、复制/撤销/重做、文字修改、保存History后刷新整个WebView文档，读取旧错误entry并纠正，恢复History再撤销/重做，正常保存后逐项检查实际project.json/manifest/正文一致。通过真实导出链写出HTML和390×844原生PNG，engine=`native-webview-pdf`；HTML含副本文字且不含编辑NID/系统导航，PNG有475种颜色并已目视复核，非空白图。

证据：[原生结果与磁盘复核](./evidence/native/audit.json)、[原生窗口日志](./evidence/native-dev.log)、[HTML](./evidence/native/exports/copy.html)、[PNG](./evidence/native/exports/copy.png)。测试页 `test/fixtures/manifest-native.html` 的SHA-256为 `75ad0d6310b98bdb674356284d195b17bb5d1ee3a1d1b88e636345945f89ddb3`；输入配置和输出副本独立归档。

这是隔离开发窗口的原生专项，不是安装版完整用户界面/系统文件选择器复跑。没有覆盖已安装桌面包；没有commit/push或发布Release。

## 打回与边界

- 沙箱内启动服务/Chromium受到本机监听和Mach端口权限限制，改用获准的本机执行后通过，不改产品浏览器策略。
- 新专项首轮比较整页对象误把异步 measuredHeight、仓储补齐的清单字段及Python/JS间undefined/null视为业务改动。脚本改为逐项比较ID、entry、名称、坐标、HTML、CSS与metadata，规范空值；正文和路径断言未放宽。失败日志保留。
- 保留既有React act测试环境提示，不声明无所有警告。
- 用户明确回复“暂时没有，保留实机验收缺口”；Windows/Linux原生实机项继续未验收。系统WK不支持的PNG阴影兼容分支沿用既有警告边界。
- 最后补查本轮源码身份、报告、导航链接及git diff --check；停止本轮服务和原生验收进程。

本地evidence目录按项目既有规则忽略，不等于证据已随Git发布。
