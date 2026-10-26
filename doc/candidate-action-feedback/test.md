# 候选按钮验收 · 2026-10-26

本次修复将7/8交付检查的结构阻断直接展示在画布，禁用按钮明确置灰。只有结构为唯一阻断时显示用户确认框，确认绑定候选与当前项目上下文。替换、保留两版分别记录显式结构确认模式，仍经过安全、质量、资源、渲染、档案及History管道；旧force-replace兼容保留，新的严格确认不通过该旧模式绕过质量检查。

## 验证

- 红灯：新增用例初跑1通过/4失败，evidence/red.log。
- 定向：48通过/0失败，227断言，覆盖新确认模式、旧采纳兼容、丢弃、资源/质量阻断、上下文失效、档案与撤销重做。evidence/targeted.log。
- 最终全量：`bun test` 2,143通过/0失败，186文件，13,679断言；日志存在既有React act提示，不作为失败或无警告声明。evidence/full-test.log。
- `bun run type-check`、`bun run build` 顺序通过。evidence/type-check.log、build.log。
- `cargo test --lib --manifest-path src-tauri/Cargo.toml` 24通过/0失败。evidence/rust.log。
- Chromium/WebKit各4场景，合计8场景全部通过、无pageerror：真实点击丢弃、确认替换、确认保留两版、重新暂存使确认失效。同时检查空格勾选和滚轮不平移画布，实际iframe门禁、PNG预览、交付档案和History撤销重做。evidence/browser.json、browser-final.log和截图。
- 独立代码复核未发现可操作问题；评审者另跑新增7项测试通过。事件实测依据浏览器报告，不以静态评审替代。

## 原工程证据与范围

最初只读当前候选确认新增/丢失各10节点导致结构阻断。临时副本加载后还发现当前已保存工程与该候选任务上下文不同，task检查也阻断；没有重写任务合同强行放行。在后续复测时，源工程的candidates/current.json已不存在，因此真实候选最终操作场景明确跳过，不声明其采纳成功。最终按钮采纳证据来自独立夹具，两种浏览器均通过。文件桥接严格限制临时目录，未向源工程写入，未发送工程内容给模型。

初次浏览器验证还遇到外部原生构建生成HTML触发Vite整页热更新；最终测试隔离HMR客户端并保持真实CSS注入，运行应用组件及iframe检查。只隔离开发热更新，不模拟交付门禁。脚本与夹具保留在scripts/verify-candidate-actions.py、test/fixtures/candidate-actions.html，可复跑。

本轮为浏览器和Rust回归，不声明macOS原生完整点击验收、Windows/Linux实机验证或此前42入口全矩阵在新版本复跑。运行证据位于本地evidence目录，不纳入版本控制。

最终297个生产/验证文件源码指纹：2310a60d95a94bd3e4d62b91c3b3f9787f162ed0761b6cf492f33be66de5d81e，逐文件清单见evidence/source.json。提交前清理两份TSX文件的行尾空格后，再次完整执行单测→类型→构建，全部通过。
