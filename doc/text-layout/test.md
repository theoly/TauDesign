# 正文窄列布局防护与局部修复 · 验证报告

> **2026-10-28安装版补充已完成：** 当前macOS .app已构建、备份更新至/Applications，真实安装版新入口、8/8候选、采纳、撤销/重做、退出重开及HTML/原生PNG通过，见[完整报告](./installed-macos.md)。与最近2,212单测/42入口的源码指纹一致，本次未重复全部测试；下文保留初次布局专项的执行范围和当时安装状态。

2026-10-28，macOS，Bun 1.3.5，Vite 6。修复范围为横向操作组挤压长正文，不声明全面审美检测。

## 交付
- 通用布局合同压缩复用，移动端规则按档位注入：长正文卡片纵向分区，操作组及按钮可整体换行，正常.list-item默认语义不变。不提高Prompt预算，不改用户指定文案。
- 实际iframe检测`render_compressed_body`：直接正文至少20个非空白字符，横排Flex父级内有占用至少45%宽度的可见操作兄弟且横向邻接；正文<=45%容器且<=10em、至少4行才提示；<=6em、<=40%且>=5行为error。表格、代码、竖排、声明省略、复杂变换等不作该推断。阈值是本缺陷的有限启发式，不等于所有窄列都有错误。
- 原生非候选页面的渲染检查中可“预览本页纵向布局修复”→“生成修复副本”。只对可确认的list-item/header/actions/body结构开放；DOMParser副本精确改class，保留结构/文本/资产。保护、重复目标、行内布局和过期状态拒绝；已有候选和导入页不套用此类名修复。候选再次经过原交付门禁，严重渲染错误不能采纳，采纳走History。

## 验证
- `bun test`：**2207通过、0失败**，197文件、14006断言，44.96秒；`evidence/full-verified.log`。
- `bun run type-check`：通过；`evidence/type-check.log`。
- `bun run build`：通过，3.21秒；`evidence/build.log`。
- 87项定向回归通过：几何真阳性/反例、局部修改安全/来源白名单、确认/过期、原组件合同和Prompt预算，`evidence/all-targeted.log`。
- `scripts/verify-text-layout.py`：真实页面只读源内容，实际InfiniteCanvas/srcdoc/候选门禁/History，Chromium和WebKit各320、390、430。每个宽度均检出原三卡窄列；修复正文宽度>卡片70%；4倍长文案和“复制这条建议/采用并填入聊天”按钮未挤出卡片。严重错误候选不可采纳，修复后可确认采纳，1条History可撤销/重做，原工程源HTML未写入，无pageerror。`evidence/browser.json`、browser-final.log、*-candidate.png、*-fixed.png。
- 桌面实页：已安装应用没有本轮新入口，故经现有UI创建**AI红娘对话牵线（布局修复）**，保留原页。副本三卡各一条`display:block` L4覆盖恢复自然流，复制、改名及三条属性调整均在history.json持久化；未直接写工程文件。原页HTML SHA256仍为`c1a15931873aab3929e71b8d3f56d0ab75f3d009780f69ac87928942b074d2e3`。只读核对见`evidence/native-project.json`。真实桌面效果已在对话中复查，原版窄列和修复副本并排可见。桌面副本的3条覆盖与新版候选的一次History采纳是分别验证的路径。
- `git diff --check`通过。

## 打回与边界
首次定向失败是Happy DOM缺少-webkit-line-clamp计算值，补齐测试输入后用真实WebKit确认排除；首次全量新增规则超过12000字符Prompt预算，随后压缩又触发两条原组件合同关键句断言，恢复关键句并去重后全部通过，未放宽测试。先前失败日志仍保留。

没有向AI发送用户内容，没有整体重写用户页面或全局修改列表样式。实际安装应用需重新构建更新才能使用本轮新检测/修复入口；当前真实工程修复副本已经保存。Windows/Linux原生UI与完整HTML/PNG像素导出未在本轮重新验收；继续使用原共享渲染/导出链。既有React act环境提示未清理，不宣称无测试环境警告。

**ACCEPTANCE: PASS（上述实现与验证范围）。** 最终源码清单和指纹：`evidence/source.json`。
