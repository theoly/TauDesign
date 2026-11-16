import { listActiveMothers } from './catalog';
import type {
  MotherMatchQuery,
  MotherPage,
  MotherRegionExcerpt,
  MotherSelection
} from './types';

/** Local match refuse threshold (0–100 scale). pageKind alone (+35) is below this. */
export const MOTHER_SCORE_THRESHOLD = 40;

const SCORE_PAGE_KIND = 35;
const SCORE_ALIAS = 12;
const SCORE_FEATURE = 10;
const SCORE_DENSITY = 8;
const SCORE_APPLICABLE = 5;
const SCORE_VARIANT = 10;
const SCORE_ALIAS_CAP = 24;
const SCORE_FEATURE_CAP = 20;
const SCORE_APPLICABLE_CAP = 10;

function normalize(text: string | undefined): string {
  return (text ?? '').normalize('NFKC').toLowerCase();
}

function includesAny(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => {
    const n = normalize(needle);
    return n.length > 0 && haystack.includes(n);
  });
}

function variantBonus(mother: MotherPage, requestText: string): number {
  const id = mother.meta.id;
  const text = normalize(requestText);
  let bonus = 0;
  if (/-table(?:$|-)/.test(id) && /表格|table|数据表/.test(text)) bonus += SCORE_VARIANT;
  if (/-cards?(?:$|-)/.test(id) && /卡片|card|卡片列表|宫格/.test(text)) bonus += SCORE_VARIANT;
  if (/-hero(?:$|-)/.test(id) && /英雄|hero|首屏/.test(text)) bonus += SCORE_VARIANT;
  if (/-sidebar(?:$|-)/.test(id) && /侧栏|sidebar|侧边栏/.test(text)) bonus += SCORE_VARIANT;
  if (/-wizard(?:$|-)/.test(id) && /向导|步骤|wizard/.test(text)) bonus += SCORE_VARIANT;
  return Math.min(SCORE_VARIANT, bonus);
}

/** Score one mother against a query (device already filtered). */
export function scoreMother(mother: MotherPage, query: MotherMatchQuery): number {
  const request = normalize(query.requestText);
  let score = 0;

  if (query.pageKind && query.pageKind !== 'unknown' && mother.meta.pageKind === query.pageKind) {
    score += SCORE_PAGE_KIND;
  }

  const aliasHits = includesAny(request, mother.meta.aliases);
  score += Math.min(SCORE_ALIAS_CAP, aliasHits.length * SCORE_ALIAS);

  const queryFeatures = (query.features ?? []).map((f) => normalize(f)).filter(Boolean);
  if (queryFeatures.length) {
    const motherFeatures = new Set(mother.meta.features.map((f) => normalize(f)));
    const hits = queryFeatures.filter((f) => motherFeatures.has(f)).length;
    score += Math.min(SCORE_FEATURE_CAP, hits * SCORE_FEATURE);
  } else {
    // Soft feature recall from request text against mother feature tokens.
    const soft = includesAny(request, mother.meta.features);
    score += Math.min(SCORE_FEATURE_CAP, soft.length * Math.floor(SCORE_FEATURE / 2));
  }

  if (query.density && query.density === mother.meta.density) {
    score += SCORE_DENSITY;
  }

  const applicableHits = includesAny(request, mother.meta.applicableWhen);
  score += Math.min(SCORE_APPLICABLE_CAP, applicableHits.length * SCORE_APPLICABLE);

  score += variantBonus(mother, query.requestText ?? '');

  if (typeof mother.meta.qualityScore === 'number' && Number.isFinite(mother.meta.qualityScore)) {
    score += Math.min(5, Math.max(0, Math.floor(mother.meta.qualityScore / 20)));
  }

  return score;
}

function isBlockedByNotApplicable(mother: MotherPage, requestText: string): boolean {
  const request = normalize(requestText);
  if (!request) return false;
  return mother.meta.notApplicableWhen.some((phrase) => {
    const p = normalize(phrase);
    return p.length > 0 && request.includes(p);
  });
}

function pickRegions(mother: MotherPage, query: MotherMatchQuery): MotherRegionExcerpt[] {
  if (!mother.regions.length) return [];
  const request = normalize(query.requestText);
  const features = new Set((query.features ?? []).map((f) => normalize(f)));

  const ranked = mother.regions
    .map((region) => {
      let hit = 0;
      const role = normalize(region.role);
      if (features.has(role) || request.includes(role)) hit += 2;
      if (role === 'filters' && (features.has('filters') || /筛选|过滤|filter/.test(request))) hit += 3;
      if (role === 'header' && (features.has('toolbar') || /工具条|标题|toolbar|header/.test(request))) {
        hit += 2;
      }
      for (const feature of mother.meta.features) {
        if (normalize(feature).includes(role) || role.includes(normalize(feature))) hit += 1;
      }
      return { region, hit };
    })
    .sort((a, b) => b.hit - a.hit || a.region.role.localeCompare(b.region.role));

  const selected = ranked.filter((item) => item.hit > 0).slice(0, 2).map((item) => item.region);
  if (selected.length) return selected;
  // Default: first two regions by role name for structure prior when nothing matched.
  return [...mother.regions].sort((a, b) => a.role.localeCompare(b.role)).slice(0, 2);
}

/**
 * Match one mother (+ optional ≤2 regions).
 * Hard rules: attachment → null; device filter; score &lt; 40 → refuse.
 */
export function matchMother(
  query: MotherMatchQuery,
  pool?: MotherPage[]
): MotherSelection | null {
  if (query.hasAttachment) return null;

  const mothers = (pool ?? listActiveMothers()).filter(
    (m) => m.meta.status === 'active' && m.meta.device === query.device
  );

  if (query.userMotherId) {
    const manual = mothers.find((m) => m.meta.id === query.userMotherId);
    if (!manual) return null;
    return {
      mother: manual,
      score: 100,
      regions: pickRegions(manual, query),
      reason: `manual:${manual.meta.id}`
    };
  }

  const candidates = mothers.filter((m) => !isBlockedByNotApplicable(m, query.requestText ?? ''));
  if (!candidates.length) return null;

  let best: { mother: MotherPage; score: number } | null = null;
  for (const mother of candidates) {
    const score = scoreMother(mother, query);
    if (!best || score > best.score || (score === best.score && mother.meta.id < best.mother.meta.id)) {
      best = { mother, score };
    }
  }

  if (!best || best.score < MOTHER_SCORE_THRESHOLD) return null;

  return {
    mother: best.mother,
    score: best.score,
    regions: pickRegions(best.mother, query),
    reason: `score:${best.score};kind:${best.mother.meta.pageKind}`
  };
}
