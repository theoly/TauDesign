# 渐变主题与页面提取验收

时间：2026-10-27（Asia/Shanghai）。原始诊断见analysis.md，当前功能已实现。

## 交付行为

- 设计系统侧栏和完整主题编辑器同名入口“从已有页面提取风格”，共用来源、用途、选择和预览面板；支持用户明确指定局部渐变的目标角色。
- 背景角色分page/primaryAction/decorativeSurface，明暗模式独立，兼容原纯色颜色Token；安全编译线性、径向、多层渐变和透明色标。不支持/危险/不确定CSS明确保留而非猜测。
- 只合并选中风格，来源跟随背景保存。旧页同步独立选择，未选页保留背景快照；手动L4纯色取消渐变图层，source重要样式仅在运行/导出副本降低优先级，原HTML不改。
- 已有工程导入也可明确选择更新主题，默认关闭。主题和页面/资产/旧页背景快照一次History提交，取消或上下文变化拒绝。
- 主题编辑器可编辑、预览、保存和恢复背景；新页面Prompt和body默认继承，渐变页面至少填满当前参考视口。画布热注入不重载iframe，独立HTML内部nid转换为导出标识后背景绑定仍有效。

## 测试与修复记录

按task.md先红后绿；evidence目录保留解析/提取/应用/UI/导入/导出以及复核修复日志。

独立复核问题已修复并补回归：径向位置同轴冲突、legacy RGB单位混用、渐变按钮缺少交互反馈、变量缺省悬空、首个局部卡片误判页面、主色变化未冻结旧页、L4背景被渐变覆盖、inline重要图片未降低、导出标识丢绑定。浏览器还发现History只支持整页/位置补丁，metadata嵌套补丁会损毁回放；已改为整页补丁并验证导入撤销重做保留正文/位置。短内容渐变页补齐视口填充。

最终共同全量：**2,180通过/0失败**、193文件；类型和构建顺序通过。完整命令日志在../restyle-progress/evidence/full-test.log、type-check.log、build.log。既有React act提示如实保留。

双浏览器实际运行scripts/verify-style-extraction.py：
- 两个入口、选择角色/旧页、应用和撤销重做；原iframe文档身份不变。
- 目标背景/按钮computed background-image存在渐变，未选旧页为none；导出HTML对应背景一致且内部data-nid已移除。
- 真正执行兼容PNG导出，Chromium/WebKit分别生成并检查PNG；没有冒充原生PNG。
- PC hover/active滤镜为brightness(0.94)/brightness(0.86)，L4手动纯色压掉渐变。
- 已有工程导入默认未选风格，显式选择后确认可导入，撤销移除新页且不损坏旧页。
- 只读分析用户指定工程中的“充值魔方点/编辑资料/网络异常”，识别按钮/装饰/页面角色；未写源工程、未向模型发送内容。

详见evidence/browser.json、browser-final.log、*-gradient-export.png和截图。解析支持有限的明确色值与百分比，不支持hsl/现代空间RGB/calc/conic/未知变量等会返回待核对说明；源页仍保留。条件/动态样式不等同浏览器计算样式，分类不宣称完整视觉审美通过。

原生完整桌面交互和Windows/Linux实机不在本轮范围。ACCEPTANCE: PASS（以上范围）。

最终生产/验证源码清单：evidence/source.json，308文件，SHA256 87d5d1a563fe3c88acfd2fd695cb9b5ec4f7d065f436e0578a2b8c1711d42f7e。
