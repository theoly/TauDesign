import type { CraftRule } from '../craft/types';

// One authored source; legacy craft modules remain compatibility exports.

export const typographyCraft: CraftRule = {
  slug: 'typography',
  title: '排版与文字阶梯 (Typography Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 层级靠字号/字重/对比：标题.text-xl/.text-2xl+.font-semibold，正文按设备，辅助.text-sm/.text-secondary。
- 长正文.leading-relaxed；金额混排.items-baseline；图标/按钮盒子居中；语义标题与表单标签保留。`
};

export const colorCraft: CraftRule = {
  slug: 'color',
  title: '色彩平衡与对比度 (Color Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 沿用项目主题与背景角色；前景匹配Token。正文对比>=4.5:1，大字>=3:1；必要时.bg-scrim。
- 状态用文字/图标/形状辅助，禁仅靠红绿。`
};

export const antiAiSlopCraft: CraftRule = {
  slug: 'anti-ai-slop',
  title: '反 AI 塑料感与审美负面清单 (Anti-AI-Slop Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 避免等权卡片海与无意义装饰渐变；优先留白/背景分组，必要时.border-subtle。
- 阴影表层级；沿用Token。功能图标仅已登记.icon/.icon-mask+aria-label，禁用emoji与内联SVG；更大面积用.icon-box。
- 图片保持比例；文字容器不固定高度裁切。`
};

export const layoutCraft: CraftRule = {
  slug: 'layout',
  title: '内容与空间 (Layout Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 新建先定目标/核心内容/主操作；空状态说明原因与下一步。
- 组内间距小于组间；沿用Token；不为填满拉伸；操作组不足则换行。
- 修改仅限已授权范围；不借美学新增节点/状态、删文案或重写整页，遵守当前任务与保护合同。`
};
