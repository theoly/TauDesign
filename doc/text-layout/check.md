# 验收
- [x] 原错误可检出；严重挤压为error并定位正文，边界为warning，正常/竖排/表格/裁字声明/变换不误报。
- [x] 精确局部修复不改变DOM/文案/NID/其它区域；保护节点、过期原页不得修改；一个History提交可撤销。
- [x] 生成规则提供可落地纵向卡片合同；正常list-item不受影响。
- [x] 320/390/430及长按钮/正文在Chromium/WebKit通过；实际工程修复范围和原页/候选状态有明确记录。
- [x] bun test、type-check、build通过；证据与边界归档。


证据（2026-10-28）：
- 几何规则与反例：test/rendered_quality.test.ts；布局修复/保护/重复NID/过期/确认：test/text_layout_repair.test.tsx。定向87通过，evidence/all-targeted.log。
- scripts/verify-text-layout.py / test/fixtures/text-layout.html：Chromium/WebKit各320/390/430原样及长文案/长按钮；原样三卡均检出、修复后正文宽度比例>70%、按钮在卡片内；严重错误候选采纳禁用；确认后原页保持到采纳、1条History采纳并可撤销/重做。evidence/browser.json、browser-final.log及截图。
- 实际已安装桌面：通过原有UI复制/重命名并为副本三卡设display:block；project.json与history.json只读核对证实3条覆盖与历史存在；原页HTML指纹未改变。evidence/native-project.json，桌面画面在对话中已复查。未直接写用户工程文件。
- 最终全量2207/0、类型、构建通过，evidence/full-verified.log、type-check.log、build.log；git diff --check通过。

排错记录：Happy DOM的WebKit计算属性输入补齐；全量Prompt预算/契约关键句回归打回后修复，未放宽测试。测试环境保留既有React act提示。当前安装版本需重新构建更新，才能显示本轮新检测/副本入口；实际工程的修复副本已可直接查看。

## 完成度复核补充
- [x] 2026-10-28复制画框entry修复；单测、双引擎及真实macOS保存/重开/清单读取通过，见../refactor-finalization/test.md。
- [~] 原合并交付项拆分：Git与Windows/Linux打包按用户要求排除，GitHub Release状态不作为本轮阻断。
- [x] 2026-10-28：install.json记录完整旧版备份及全包一致性；安装二进制SHA-256 4d57c7b133c3484f2df49f4bba32c434189200955ac680830c8638106263a4df，codesign严格校验通过。
- [x] 2026-10-28：installed-macos.md及其AX/侧车/历史/磁盘/导出证据；检出3项→8/8候选→采纳0项，退出新进程重开后History可用，HTML/390×2228原生PNG通过。原工程30页HTML/ID/覆盖不变。
- [x] 2026-10-28：source指纹一致，report.json/cleanup.ax.txt/restored-user.ax.txt与文档链接及diff检查通过；测试工程仅从最近列表移除，文件保留。
