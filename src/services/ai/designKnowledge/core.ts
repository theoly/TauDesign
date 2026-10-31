import type { CraftRule } from '../craft/types';

// One authored source; legacy craft modules remain compatibility exports.

export const typographyCraft: CraftRule = {
  slug: 'typography',
  title: '排版与文字阶梯 (Typography Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 层级同时靠字号、字重与对比：标题.text-xl/.text-2xl + .font-semibold，正文按设备档位，辅助.text-sm/.text-secondary；不靠极小字或透明度弱化信息。
- 长正文用.leading-relaxed，自然撑高；标题与单行按钮沿用基座行高。长段落左对齐、数值列右对齐；中文不照搬英文行长/字距。
- 金额与单位等混合字号用.items-baseline；图标与按钮仍按盒子居中，禁位移补偿。语义标题和表单标签保留，不因视觉弱化删除。`
};

export const colorCraft: CraftRule = {
  slug: 'color',
  title: '色彩平衡与对比度 (Color Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 沿用项目主题与背景角色，包括已选渐变；前景取匹配背景的Token，彩色底不机械套灰字或降低整块透明度。
- 正文/副文本对比度 >= 4.5:1，大字 >= 3:1；图片/渐变按实际叠加检查，必要时用.bg-scrim或Token实底承载文字。
- 状态需文字/图标/形状辅助，禁仅靠红绿；低优先状态用浅底深字，危险语义与视觉权重分开判断。`
};

export const antiAiSlopCraft: CraftRule = {
  slug: 'anti-ai-slop',
  title: '反 AI 塑料感与审美负面清单 (Anti-AI-Slop Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 避免等权卡片海、无意义装饰渐变；优先用留白和背景分组，必要时.border-subtle；保留输入边界与焦点可见性。
- 阴影表达层级：普通内容.shadow-none/轻阴影，浮层更高；沿用Token，不给每个容器重阴影。
- 功能图标用内联SVG .icon，不用emoji；需要更大视觉面积时用.icon-box，勿暴力放大图标。
- 图片保持比例并按主体裁切，预留加载/失败底色；文字容器不固定高度裁切。`
};

export const layoutCraft: CraftRule = {
  slug: 'layout',
  title: '内容与空间 (Layout Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 新建先确定用户目标、核心内容和主操作，再组织布局；空状态说明原因和下一步，仅在任务需要时呈现。
- 组内间距小于组间：标签贴近所属输入，标题贴近下方正文；沿用Token间距，不等距铺满。
- 不为填满画布拉伸内容，不按设备等比缩放所有元素；长文拥有独立宽度，操作组不足时换行。
- 修改仅限已授权范围；不借美学新增节点/状态、删文案或重写整页，遵守当前任务与保护合同。`
};
