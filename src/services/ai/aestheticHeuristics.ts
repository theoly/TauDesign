/**
 * Offline aesthetic heuristics (E6).
 * DOM-only proxies — never claim optical beauty or pixel acceptance.
 */

import { parseHtmlCopy } from '../../utils/htmlDocument';
import type { QualityFinding } from './generationQuality';
import type { RepairLane } from './findingPolicy';

const TYPE_SIZE_ORDER = [
  'text-xs',
  'text-sm',
  'text-md',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl'
] as const;

const GAP_ORDER = [
  'gap-0',
  'gap-1',
  'gap-2',
  'gap-3',
  'gap-4',
  'gap-5',
  'gap-6',
  'gap-8',
  'gap-10',
  'gap-12',
  'gap-16'
] as const;

const SURFACE_RE = /\b(card|glass|glass-strong|bg-surface-alt|surface-alt|shadow(?:-[\w-]+)?)\b/;

function elevatable(
  code: string,
  message: string,
  actual: string,
  expected: string,
  repairLane: RepairLane,
  nid?: string
): QualityFinding {
  return {
    code,
    severity: 'warning',
    message,
    actual,
    expected,
    repairLane,
    ...(nid ? { nid } : {})
  };
}

function visible(el: Element): boolean {
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  if (/\bdisplay\s*:\s*none\b/.test(style) || /\bvisibility\s*:\s*hidden\b/.test(style)) return false;
  if (el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function classTokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
}

function gapRank(el: Element): number | undefined {
  for (const token of classTokens(el)) {
    const idx = (GAP_ORDER as readonly string[]).indexOf(token);
    if (idx >= 0) return idx;
  }
  return undefined;
}

function typeRanks(doc: Document): number[] {
  const ranks = new Set<number>();
  for (const el of Array.from(doc.querySelectorAll('[class]'))) {
    if (!visible(el)) continue;
    for (const token of classTokens(el)) {
      const idx = (TYPE_SIZE_ORDER as readonly string[]).indexOf(token);
      if (idx >= 0) ranks.add(idx);
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') ranks.add(TYPE_SIZE_ORDER.indexOf('text-3xl'));
    else if (tag === 'h2') ranks.add(TYPE_SIZE_ORDER.indexOf('text-2xl'));
    else if (tag === 'h3') ranks.add(TYPE_SIZE_ORDER.indexOf('text-xl'));
  }
  return [...ranks].sort((a, b) => a - b);
}

function hasH1BodyContrast(ranks: number[]): boolean {
  if (ranks.length < 2) return false;
  return ranks[ranks.length - 1]! - ranks[0]! >= 2;
}

function hasSurfaceDepth(doc: Document): boolean {
  for (const el of Array.from(doc.querySelectorAll('[class]'))) {
    if (!visible(el)) continue;
    if (SURFACE_RE.test(el.getAttribute('class') ?? '')) return true;
  }
  return false;
}

function cardSignature(el: Element): string {
  const classes = classTokens(el)
    .filter(c => !c.startsWith('p-') && !c.startsWith('m-') && !/^gap-/.test(c))
    .sort()
    .join(' ');
  return classes || 'card';
}

/**
 * Run offline aesthetic heuristics. All findings are elevatable warnings.
 */
export function inspectAestheticHeuristics(html: string): QualityFinding[] {
  const { doc } = parseHtmlCopy(html);
  const root = doc.body;
  if (!root) return [];
  const findings: QualityFinding[] = [];

  const ranks = typeRanks(doc);
  const typeOk = ranks.length >= 3 || hasH1BodyContrast(ranks);
  if (!typeOk) {
    findings.push(
      elevatable(
        'aesthetic_type_scale',
        '页面字号阶梯偏平，建议至少三档字号或标题与正文拉开两档。',
        ranks.length ? `字号档位 ${ranks.length}` : '未检测到字号类或语义标题',
        '≥3 档字号，或 h1/标题与正文至少差两档',
        'polish'
      )
    );
  }

  const gapEls = Array.from(root.querySelectorAll('[class]')).filter(el => visible(el) && gapRank(el) !== undefined);
  const gapRanks = [...new Set(gapEls.map(el => gapRank(el)!))];
  const onlyGap2 = gapRanks.length === 1 && gapRanks[0] === (GAP_ORDER as readonly string[]).indexOf('gap-2');
  let sectionBeatsInner = false;
  for (const el of gapEls) {
    const parentRank = gapRank(el);
    if (parentRank === undefined) continue;
    for (const child of Array.from(el.children)) {
      const childRank = gapRank(child);
      if (childRank !== undefined && parentRank > childRank) {
        sectionBeatsInner = true;
        break;
      }
    }
    if (sectionBeatsInner) break;
  }
  if (gapEls.length > 0 && (onlyGap2 || (!sectionBeatsInner && gapRanks.length < 2))) {
    findings.push(
      elevatable(
        'aesthetic_section_gap',
        '区块节奏偏平：避免整页单一 gap-2，组间应大于组内间距。',
        onlyGap2 ? '整页仅 gap-2' : `间距档位 ${gapRanks.length}`,
        '组间 gap 大于组内；至少两档间距',
        'style'
      )
    );
  }

  const textured = hasSurfaceDepth(doc);
  if (!textured) {
    findings.push(
      elevatable(
        'aesthetic_surface_depth',
        '页面缺少表面层级（card / shadow / glass / surface-alt）。',
        '纯平面',
        '至少一种 card、shadow*、glass 或 surface-alt',
        'polish'
      )
    );
  }

  const primaries = Array.from(root.querySelectorAll('.btn-primary, button.btn-primary, a.btn-primary')).filter(visible);
  if (primaries.length === 0) {
    findings.push(
      elevatable(
        'aesthetic_primary_cta_missing',
        '未见可见的主操作 btn-primary，主次权重不清晰。',
        '0 个 btn-primary',
        '单一可见主 CTA（btn-primary）',
        'polish'
      )
    );
  } else if (primaries.length >= 3) {
    findings.push(
      elevatable(
        'aesthetic_primary_cta_crowd',
        '可见主按钮过多，主操作被等权稀释。',
        `${primaries.length} 个 btn-primary`,
        '通常保留 1 个主 CTA，次操作降权',
        'style',
        primaries[0]?.getAttribute('data-nid') ?? undefined
      )
    );
  }

  const cards = Array.from(root.querySelectorAll('.card')).filter(visible);
  if (cards.length >= 4) {
    const sigs = cards.map(cardSignature);
    const counts = new Map<string, number>();
    for (const s of sigs) counts.set(s, (counts.get(s) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    // Equal-weight wall: ≥4 cards sharing the same class signature with no featured/primary marker.
    if (dominant && dominant[1] >= 4 && !cards.some(c => /featured|primary|highlight|hero|shadow-lg|shadow-glow/.test(c.getAttribute('class') ?? ''))) {
      findings.push(
        elevatable(
          'aesthetic_equal_card_wall',
          '并列卡片视觉权重过于均质，缺少主次锚点。',
          `${dominant[1]} 张同权卡片`,
          '突出一张主卡或拉开阴影/边框层级',
          'polish'
        )
      );
    }
  }

  // Combo: zero texture + zero hierarchy → elevatable polish (create does not hard-fail solely on this).
  if (!textured && !typeOk) {
    findings.push(
      elevatable(
        'aesthetic_zero_texture_hierarchy',
        '零微质感且零字号层级：建议走 polish 提升阶梯，而非直接判定交付失败。',
        '无表面层级 + 扁平字号',
        '补表面层级并拉开标题/正文字号',
        'polish'
      )
    );
  }

  return findings;
}
