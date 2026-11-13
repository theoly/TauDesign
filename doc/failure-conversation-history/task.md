# 任务清单

| ID | 工作 | 影响 | 状态 |
| --- | --- | --- | --- |
| FCH01 | 定位0请求与已通过回执后的分区消息缺失 | workflowSources、pageTaskGeneration | [x] 已核对只读失败档案 |
| FCH02 | 分区布局显式传递图片证据、补真实编码回放 | Pipeline/生成策略/分区 | [x] |
| FCH03 | 有界只读失败记录、JSONL去重及历史补入 | conversationStore/schema、任务档案 | [x] |
| FCH04 | 所有活动对话失败存档、重开诊断与复用文本 | useAIEngineChat/ChatDrawer | [x] |
| FCH05 | 增量、浏览器、顺序全量/类型/构建与归档 | 回归及check/test | [x] 3751测试，类型/构建及8组浏览器通过 |
