import { CraftRule } from './types';

export const colorCraft: CraftRule = {
  slug: 'color',
  title: '色彩平衡与对比度 (Color Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 遵循经典 60-30-10 空间主从色彩配比：60% 背景基座主色，30% 卡片/容器次级层次色，10% 高对比强调色 (var(--color-primary) 或 .btn-primary)，严禁满屏铺满高饱和纯色。
- 配色兼顾可见性与美观度，前景与实际背景须清晰区分，遵循视觉层级中的配色原则。
- 文本与背景对比度下限：正文文字对比度必须满足 WCAG AA 规范 (>= 4.5:1)，弱化副文本必须满足 >= 3:1。
- 严禁在无语义支撑处滥用多重鲜艳色；语义色（成功绿色、告警黄色、危险红色）仅在对应状态指示中出现。`
};
