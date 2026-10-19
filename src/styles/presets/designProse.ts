import techBlueRaw from './DESIGN.tech-blue.md?raw';
import minimalistSlateRaw from './DESIGN.minimalist-slate.md?raw';
import vibrantVioletRaw from './DESIGN.vibrant-violet.md?raw';
import emeraldNatureRaw from './DESIGN.emerald-nature.md?raw';
import { DesignProse } from '../../types/designSystem';

const neutralProse = (presetId: string, title: string, tone: string, note: string): DesignProse => ({
  presetId, title, tone, source: 'builtin_preset',
  rulesMarkdown: `# ${title}\n## 1. 设计哲学与基调 (Vision & Tone)\n${note}\n## 2. 60-30-10 配色法则 (Color Strategy)\n以中性背景和卡片表面为主，品牌色约5–10%用于主操作与选中；不是硬性面积配额。色值遵循当前 Token，状态色只表达状态。\n## 3. 排版节奏与信息密度\n遵循设备档位及当前 typography、spacing、radius、density。\n## 4. 严禁事项与负面约束\n禁止无意义彩色指标、满屏品牌底、写死颜色或正文低对比。`
});

export const BUILTIN_DESIGN_PROSES: Record<string, DesignProse> = {
  'neutral-modern': neutralProse('neutral-modern', '现代中性微质感', '克制冷灰', '中性留白、轻边框与精细阴影；不用科技辉光。'),
  'ant-blue': neutralProse('ant-blue', '经典企业级', '清晰规整', '列表表格与明确层级，蓝色仅作行动强调，避免营销渐变。'),
  'supabase-emerald': neutralProse('supabase-emerald', '极客黑绿', '克制开发者风', '黑绿为风格意向；具体明暗遵循工程模式，绿色用于品牌强调而非所有文字。'),
  'tech-blue': {
    presetId: 'tech-blue',
    title: '现代科技质感',
    tone: 'Linear / Stripe 工业科技风',
    rulesMarkdown: techBlueRaw,
    source: 'builtin_preset'
  },
  'minimalist-slate': {
    presetId: 'minimalist-slate',
    title: '极简性冷淡',
    tone: 'Apple / Vercel 极简单色风',
    rulesMarkdown: minimalistSlateRaw,
    source: 'builtin_preset'
  },
  'vibrant-violet': {
    presetId: 'vibrant-violet',
    title: '温润活力',
    tone: 'Airbnb / Duolingo 温暖圆润风',
    rulesMarkdown: vibrantVioletRaw,
    source: 'builtin_preset'
  },
  'emerald-nature': {
    presetId: 'emerald-nature',
    title: '极客赛博',
    tone: 'Cyber / High-Tech 高密数据大屏风',
    rulesMarkdown: emeraldNatureRaw,
    source: 'builtin_preset'
  }
};

/**
 * 获取指定主题的内置散文契约。若未指定或不存在，默认回退至 tech-blue
 */
export function getBuiltinDesignProse(presetId?: string): DesignProse {
  const key = presetId?.replace(/^theme-/, '');
  if (key && BUILTIN_DESIGN_PROSES[key]) {
    return BUILTIN_DESIGN_PROSES[key];
  }
  return BUILTIN_DESIGN_PROSES['tech-blue'];
}
