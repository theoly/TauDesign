import { DesignSystemTokens } from '../../types/designSystem';
import { buildPrimaryRamp } from '../../utils/colorHarmony';

/**
 * 参考图风格提取落 Token (A3 / T-AE-29)。
 *
 * 多模态链路本就就绪（`aiService` 支持 `imageUrl`，OpenAI 与 Anthropic 两种协议
 * 均已实现；`ChatDrawer` 有 vision 角色路由）。真正缺的一直是**提取结果如何落盘**
 * ——在 A2 扩展 Token Schema 之前，`density`、`borderAlpha`、`blur`、
 * 分明暗的 `shadows` 都没有承接字段，提取出来也无处可放。
 *
 * 现在有了，所以本模块只做两件事：约束模型输出结构化 JSON，以及安全地合并回 Token。
 */

export const VISION_EXTRACT_PROMPT = `You are a design system analyst. Analyse the attached UI screenshot and extract its design tokens.

Report ONLY what you can actually observe. If a property is not determinable from the image, omit the key entirely — do NOT guess.

Reply with strictly valid JSON, no code fence, no commentary:
{
  "primary": "#rrggbb",           // dominant brand / action color
  "background": "#rrggbb",        // page background
  "surface": "#rrggbb",           // card / panel background
  "textPrimary": "#rrggbb",
  "textSecondary": "#rrggbb",
  "border": "#rrggbb",
  "radiusMd": "8px",              // typical corner radius of buttons / inputs
  "density": "compact" | "standard" | "relaxed",   // overall spacing rhythm
  "borderAlpha": 0.6,             // 0-1, how subtle borders appear
  "shadowStrength": "none" | "subtle" | "medium" | "strong",
  "isDark": true | false
}`;

export interface ExtractedStyle {
  primary?: string;
  background?: string;
  surface?: string;
  textPrimary?: string;
  textSecondary?: string;
  border?: string;
  radiusMd?: string;
  density?: 'compact' | 'standard' | 'relaxed';
  borderAlpha?: number;
  shadowStrength?: 'none' | 'subtle' | 'medium' | 'strong';
  isDark?: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const PX = /^\d{1,3}px$/;

/** 解析模型输出。宁可少提取也不接受脏值——脏值会污染整个设计系统 */
export function parseExtraction(raw: string): ExtractedStyle | null {
  const body = raw.replace(/```json|```/gi, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const out: ExtractedStyle = {};
  for (const k of ['primary', 'background', 'surface', 'textPrimary', 'textSecondary', 'border'] as const) {
    const v = obj[k];
    if (typeof v === 'string' && HEX.test(v.trim())) out[k] = v.trim().toLowerCase();
  }
  if (typeof obj.radiusMd === 'string' && PX.test(obj.radiusMd.trim())) out.radiusMd = obj.radiusMd.trim();
  if (obj.density === 'compact' || obj.density === 'standard' || obj.density === 'relaxed') out.density = obj.density;
  if (typeof obj.borderAlpha === 'number' && obj.borderAlpha >= 0 && obj.borderAlpha <= 1) {
    out.borderAlpha = Math.round(obj.borderAlpha * 100) / 100;
  }
  if (['none', 'subtle', 'medium', 'strong'].includes(String(obj.shadowStrength))) {
    out.shadowStrength = obj.shadowStrength as ExtractedStyle['shadowStrength'];
  }
  if (typeof obj.isDark === 'boolean') out.isDark = obj.isDark;

  return Object.keys(out).length > 0 ? out : null;
}

const SHADOW_BY_STRENGTH: Record<NonNullable<ExtractedStyle['shadowStrength']>, { light: string; dark: string }> = {
  none: { light: 'none', dark: 'none' },
  subtle: {
    light: '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
    dark: '0 1px 4px 0 rgba(0, 0, 0, 0.6)'
  },
  medium: {
    light: '0 4px 16px -2px rgba(15, 23, 42, 0.10)',
    dark: '0 4px 20px -2px rgba(0, 0, 0, 0.75)'
  },
  strong: {
    light: '0 12px 32px -6px rgba(15, 23, 42, 0.18)',
    dark: '0 16px 40px -8px rgba(0, 0, 0, 0.9)'
  }
};

/** 人类可读的变更清单，供确认卡片展示——绝不静默写入设计系统 */
export function describeExtraction(e: ExtractedStyle, current: DesignSystemTokens): string[] {
  const out: string[] = [];
  if (e.primary && e.primary !== current.colors.primary['500']) out.push(`主色 ${current.colors.primary['500']} → ${e.primary}`);
  if (e.radiusMd && e.radiusMd !== current.radius.md) out.push(`圆角 md ${current.radius.md} → ${e.radiusMd}`);
  if (e.density && e.density !== current.personality.density) out.push(`间距密度 ${current.personality.density} → ${e.density}`);
  if (e.borderAlpha !== undefined && e.borderAlpha !== current.personality.borderAlpha) {
    out.push(`边框微妙度 ${current.personality.borderAlpha} → ${e.borderAlpha}`);
  }
  if (e.shadowStrength) out.push(`阴影强度 → ${e.shadowStrength}`);
  if (e.background) out.push(`背景色 → ${e.background}`);
  return out;
}

/**
 * 把提取结果合并进 Token。
 *
 * `isDark` 决定写入 ModePair 的哪一侧——preset 与 colorMode 正交（§2.3），
 * 从深色截图提取出的颜色应该落在 dark 侧，而不是把整套主题改成深色。
 */
export function applyExtraction(tokens: DesignSystemTokens, e: ExtractedStyle): DesignSystemTokens {
  const side = e.isDark ? 'dark' : 'light';
  const put = (pair: { light: string; dark: string }, v?: string) =>
    v ? { ...pair, [side]: v } : pair;

  const next: DesignSystemTokens = {
    ...tokens,
    colors: {
      ...tokens.colors,
      primary: e.primary ? buildPrimaryRamp(e.primary) : tokens.colors.primary,
      background: put(tokens.colors.background, e.background),
      surface: put(tokens.colors.surface, e.surface),
      textPrimary: put(tokens.colors.textPrimary, e.textPrimary),
      textSecondary: put(tokens.colors.textSecondary, e.textSecondary),
      border: put(tokens.colors.border, e.border)
    },
    radius: e.radiusMd ? { ...tokens.radius, md: e.radiusMd } : tokens.radius,
    personality: {
      density: e.density ?? tokens.personality.density,
      borderAlpha: e.borderAlpha ?? tokens.personality.borderAlpha
    }
  };

  if (e.shadowStrength) {
    const s = SHADOW_BY_STRENGTH[e.shadowStrength];
    next.shadows = { ...tokens.shadows, soft: s, card: s, md: s };
  }
  return next;
}

export const EXTRACTED_STYLE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    primary: { type: 'string', description: 'dominant brand / action hex color e.g. #3b82f6' },
    background: { type: 'string', description: 'page background hex color e.g. #0f172a' },
    surface: { type: 'string', description: 'card / panel background hex color e.g. #1e293b' },
    textPrimary: { type: 'string', description: 'primary text hex color e.g. #f8fafc' },
    textSecondary: { type: 'string', description: 'secondary text hex color e.g. #94a3b8' },
    border: { type: 'string', description: 'border hex color e.g. #334155' },
    radiusMd: { type: 'string', description: 'corner radius in px e.g. 8px' },
    density: { type: 'string', enum: ['compact', 'standard', 'relaxed'] },
    borderAlpha: { type: 'number', minimum: 0, maximum: 1 },
    shadowStrength: { type: 'string', enum: ['none', 'subtle', 'medium', 'strong'] },
    isDark: { type: 'boolean' }
  }
};

export async function extractTokensWithEngine(
  engine: { generateObject: <T>(schema: Record<string, unknown>, options: any) => Promise<T> },
  provider: any,
  model: string,
  imageDataUrl: string
): Promise<ExtractedStyle | null> {
  try {
    const rawResult = await engine.generateObject<Record<string, unknown>>(
      EXTRACTED_STYLE_SCHEMA,
      {
        provider,
        model,
        messages: [
          {
            role: 'user',
            content: VISION_EXTRACT_PROMPT,
            imageUrl: imageDataUrl
          }
        ]
      }
    );
    if (!rawResult || typeof rawResult !== 'object') return null;
    return parseExtraction(JSON.stringify(rawResult));
  } catch (err) {
    console.warn('extractTokensWithEngine error:', err);
    return null;
  }
}

