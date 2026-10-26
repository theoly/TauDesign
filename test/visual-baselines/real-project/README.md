# 真实工程视觉基准

2026-10-25，来自用户指定smatch工程的只读快照。包含员工登录、外勤工作台、约见回访三页，每页三种移动参考设备，Chromium与WebKit分别管理。工程宽度始终390，预设换算视口为694/844/866高。环境、字体度量、源文件SHA256、页面/设备和每张图哈希在各浏览器manifest.json中。

每场景分别保存画布、独立HTML和真实PNG导出的图。基准保持来源已有缺陷，不能作为无设计问题的证明；报告保留头像低对比度与通知角标重叠warning。跨浏览器不互相比像素。初期仅覆盖移动工程；2026-10-25已补PC01基础工程，仍未覆盖物理设备或复杂真实PC业务布局。

安装requirements-visual-regression.txt及对应Playwright浏览器后，启动本地Vite。例（在仓库根目录）：

```bash
python3 scripts/verify-project-replay.py \
  --project /Users/theoly/workspace/cowork/smatch \
  --screen screen-1791970118246-t9qj \
  --screen screen-1791980074775-gmsc \
  --screen screen-1792026516007-f8ib \
  --browser chromium \
  --artifacts /tmp/taudesign-project-replay/chromium
```

WebKit将browser和artifacts改为webkit。普通复跑不带更新选项，任何缺基准/源或环境变化/损坏/像素差异均失败。只有在检查来源、设备和实际截图后显式添加`--update-baseline`才更新；初建状态baseline_initialized与正式passed分开。阈值默认0.5%，RGB噪声阈值12；尺寸必须一致。不要通过提高阈值掩盖已发现差异。

工具实际读取磁盘源工程、使用真实TS仓储迁移到临时磁盘目录并重开，再调用真实Store/渲染/导出函数。文件接口为Python受限桥接，不是原生文件对话框或Rust存储验证。只写临时目标、所选证据目录和显式允许更新的基准；来源写操作直接拒绝且运行前后核对输入哈希。不调用AI。

工具边界及像素失败测试：

```bash
python3 -m unittest discover -s scripts/tests -p 'test_project_replay.py'
```

完整实际回归和故意差异阻断结果见doc/design-workflow-refactor/test.md的2026-10-25真实工程回放记录。

## PC 基础工程补充（2026-10-25）
用户提供 `/Users/theoly/Desktop/a1/pc01`，真实PC档位但只有默认占位页，无项目文档/资产。pc-laptop/pc-standard/pc-wide三预设，在固定1440工程宽度下为810/900/810高（两种不同尺寸）。Chromium/WebKit分别基准，初建和人工截图检查后正式复跑18项0变化，源2个文件哈希不变。最终版本同时复跑既有移动54项，合计72项0变化。不能据此声称复杂PC布局或原生文件操作已完整验收。

```bash
python3 scripts/verify-project-replay.py --project /Users/theoly/Desktop/a1/pc01 \
  --browser chromium --device pc-laptop --device pc-standard --device pc-wide \
  --artifacts /tmp/taudesign-project-replay/pc-chromium
```

WebKit相应替换browser/artifacts。完整范围及入口证据见`doc/design-workflow-refactor/acceptance-matrix.md`。
