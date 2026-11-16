/**
 * Measurable zero-tolerance visual rules (E6).
 * Conservative elevatable findings — prefer miss over mass false positives.
 */

import { parseHtmlCopy } from '../../utils/htmlDocument';
import { inspectText } from '../../utils/textNode';
import type { QualityFinding } from './generationQuality';
import type { RepairLane } from './findingPolicy';

const HEADING_SIZE = /\b(text-xl|text-2xl|text-3xl|text-4xl|text-5xl|text-6xl)\b/;
const SMALL_SIZE = /\b(text-xs|text-sm)\b/;
const MUTED = /\b(text-muted|text-secondary)\b/;
const SENTENCE_PUNCT = /[。！？.!?;；：:]/;
const CJK_RE = /[\u4e00-\u9fff]/g;

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

function headingText(el: Element): string {
  const direct = inspectText(el);
  if (direct.editable || direct.text.trim()) return direct.text.trim();
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function cjkCount(text: string): number {
  return (text.match(CJK_RE) ?? []).length;
}

function englishWordCount(text: string): number {
  const latin = text.replace(CJK_RE, ' ').match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g);
  return latin?.length ?? 0;
}

function isDisplayHeading(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') return true;
  return HEADING_SIZE.test(el.getAttribute('class') ?? '');
}

function headingTooLong(text: string): boolean {
  if (!text) return false;
  // Sentence-like titles (punctuation) are always too long for display headings.
  if (SENTENCE_PUNCT.test(text)) return true;
  const cjk = cjkCount(text);
  if (cjk > 0) return cjk > 8;
  return englishWordCount(text) > 6;
}

function looksLikeEyebrow(el: Element): boolean {
  if (!visible(el)) return false;
  const cls = el.getAttribute('class') ?? '';
  if (!SMALL_SIZE.test(cls) || !MUTED.test(cls)) return false;
  const text = headingText(el);
  if (!text || text.length > 24) return false;
  // Avoid labeling form labels / badges as eyebrows.
  const tag = el.tagName.toLowerCase();
  if (tag === 'label' || /\b(badge|tag|btn)\b/.test(cls)) return false;
  return true;
}

/**
 * Zero-tolerance visual blockers as elevatable warnings (not create hard-fails).
 */
export function inspectVisualBlockers(html: string): QualityFinding[] {
  const { doc } = parseHtmlCopy(html);
  const root = doc.body;
  if (!root) return [];
  const findings: QualityFinding[] = [];
  const seen = new Set<string>();

  const push = (finding: QualityFinding) => {
    const key = `${finding.code}:${finding.nid ?? ''}:${finding.actual}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const el of Array.from(root.querySelectorAll('h1,h2,h3,[class]'))) {
    if (!visible(el) || !isDisplayHeading(el)) continue;
    const text = headingText(el);
    if (!headingTooLong(text)) continue;
    push(
      elevatable(
        'visual_heading_too_long',
        '展示级标题过长或含完整句子标点，建议压缩为短词标题。',
        text.slice(0, 40),
        '≥text-xl / h1–h3：≤8 汉字或≤6 英文词，且无句读',
        'deterministic',
        el.getAttribute('data-nid') ?? undefined
      )
    );
  }

  for (const el of Array.from(root.querySelectorAll('h1,h2,h3,[class]'))) {
    if (!visible(el) || !isDisplayHeading(el)) continue;
    const prev = el.previousElementSibling;
    if (!prev || !looksLikeEyebrow(prev)) continue;
    // Only flag when the muted sibling is short and immediately above a real heading.
    push(
      elevatable(
        'visual_decorative_eyebrow',
        '标题上方出现装饰性 eyebrow（小字 muted），零容忍禁用。',
        headingText(prev).slice(0, 40),
        '去掉 eyebrow，直接短词标题',
        'deterministic',
        prev.getAttribute('data-nid') ?? el.getAttribute('data-nid') ?? undefined
      )
    );
  }

  // Conservative btn nowrap: only multi-token labels on .btn missing nowrap/text-nowrap.
  // Base .btn already sets white-space:nowrap; we only advise when class contract is incomplete
  // and the label is long enough that wrap risk is real.
  for (const el of Array.from(root.querySelectorAll('.btn'))) {
    if (!visible(el)) continue;
    const cls = el.getAttribute('class') ?? '';
    if (/\b(nowrap|text-nowrap)\b/.test(cls)) continue;
    const style = (el.getAttribute('style') ?? '').toLowerCase();
    if (/white-space\s*:\s*normal/.test(style)) {
      push(
        elevatable(
          'visual_btn_wrap_override',
          '按钮显式允许换行，长文案可能折行。',
          'white-space: normal',
          '使用 nowrap / text-nowrap，或让按钮组整体换行',
          'deterministic',
          el.getAttribute('data-nid') ?? undefined
        )
      );
      continue;
    }
    const text = headingText(el);
    // Advisory only for multi-token / longer-than-CTA labels (CTA budget is 2–6 CJK).
    const long =
      cjkCount(text) >= 6 ||
      englishWordCount(text) >= 3 ||
      /\s/.test(text.trim());
    if (!long) continue;
    push(
      elevatable(
        'visual_btn_missing_nowrap',
        '较长按钮文案未带 nowrap/text-nowrap 类，存在折行风险。',
        text.slice(0, 40),
        '.btn 附带 nowrap 或 text-nowrap',
        'deterministic',
        el.getAttribute('data-nid') ?? undefined
      )
    );
  }

  return findings;
}
