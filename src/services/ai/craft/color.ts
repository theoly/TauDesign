import { CraftRule } from './types';

export const colorCraft: CraftRule = {
  slug: 'color',
  title: '色彩平衡与对比度 (Color Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 背景用中性色，卡片用 surface，分组用 surface-alt；品牌强调约 5–10%，勿满屏铺色。
- 配色兼顾可见性与美观度，前景与实际背景须清晰区分，遵循视觉层级中的配色原则。
- 普通字号正文、副文本对比度均 >= 4.5:1；大字可 >= 3:1。
- 严禁在无语义支撑处滥用多重鲜艳色；语义色（成功绿色、告警黄色、危险红色）仅在对应状态指示中出现。`
};
