# 页面保存与重开验收

日期：2026-11-15。

- [x] 只读工程在规划/生成之前停止，不调用模型：`test/page_creation_chat.test.tsx`；工具入口拒绝只读且不启动渲染：`test/single_page_publication.test.ts`。
- [x] AI新建等待正文、索引、资源和History原子发布。暂停存盘期间无内存新页/History/checkpoint；模拟磁盘失败原快照不变；提交回执丢失时只核验、不重复写入：`test/single_page_publication.test.ts`。
- [x] 保存后重开可见新页，可撤销/重做；历史消息显式删除后重新检查补挂可存盘并重开：`test/single_page_publication.test.ts`、`test/screen_mounting_bug.test.tsx`。
- [x] 新建来源、取消、资源与修改候选门禁保留，继续调用原页面校验和原生条件发布；现有 `page_creation`、`page_creation_repair` 与候选发布回归覆盖。
- [x] 缺页原因明确列出缺失数量与页面名，不误报为排序损坏；空画布显示恢复说明并禁用新建按钮：`test/project_authoring.test.tsx`、`test/project_empty_recovery.test.tsx`。
- [x] 实际工程恢复有备份与指纹，原归档保留。5页正文与legacy逐字节一致，7次新生成正文业务文本保留；节点ID规范化不宣称字节一致。无模型调用，无覆盖用户后续编辑。
- [x] 实际macOS应用从工程列表打开后显示12页和对应iframe内容，雷达图资源可读。之后工程发生真实删除、新建、移动等操作，只读观察留档，不重放旧恢复计划。
- [x] 最终全量测试、类型检查、生产构建通过，见 `test.md`。

## 增量验收与打回

定向5文件26项、163断言通过（1.401秒，`evidence/focused.log`）。先前全盘审计发现两份旧测试夹具没有真实保存会话；夹具改为正常创建工程并等待初始存盘，不放宽生产保护。

历史补挂回归触发旧任务发布凭据重复，修复为每次提交独立发布身份并记录实际页面ID；已有页面/在途同任务仍拒绝重复创建。另修正对话动作枚举，最终类型检查重新执行。

## 真实数据恢复证据与限制

工程：`/Users/theoly/workspace/cowork/starfate`。

备份：`.recovery-backups/1794700123067/`，包括原受管文件、原会话；`legacy/`未动。首次恢复尝试将历史资源误列为页面依赖被原生门禁拒绝，索引/历史未改；修正恢复工具的依赖分类后成功。没有放宽产品资源路径校验。

本地证据（不入Git）：`evidence/source-manifest.json`、`recovery-plan.json`、`recovery-bundle.json`、`applied.json`、`recovered-pages.json`、`data-check.json`。临时恢复驱动复用项目现有Rust文件锁、快照身份校验、原子发布与恢复日志，未向产品添加通用写入后门。

恢复是数据找回，不代表重新完成视觉/业务验收。真实桌面重开验证使用已安装应用，未声称新源码已安装；本次源码修复由最终测试/类型/构建验证。

最终全盘证据：`evidence/full-test.log`、`type-check.log`、`build.log`，3,927项全通过、TypeScript零错误、生产构建成功；`git diff --check`通过。测试运行时部分既有React act提示不作为真实浏览器验证证据，未隐藏或跳过用例。
