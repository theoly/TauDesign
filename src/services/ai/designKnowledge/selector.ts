import { DESIGN_RULE_CATALOG } from './catalog';
import type { DesignRule, RuleQuery, RuleSelection } from './types';
import {DesignRuleSafety,ruleSafetyIssue} from './safety';

/** Identity only, never a security signature. Rules are bundled trusted application data. */
export function ruleFingerprint(value: unknown): string {
  const text = JSON.stringify(value); let hash = 2166136261;
  for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),16777619);
  return (hash >>> 0).toString(16).padStart(8,'0');
}
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function matchesRuleAlias(request: string, alias: string): boolean {
  request=normalize(request);
  const term = normalize(alias);
  if (/[\u3400-\u9fff]/u.test(term)) return request.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,'i').test(request);
}
export function renderRule(rule: DesignRule): string {
  return `\n[${rule.id}@${rule.version}] ${rule.title}：${rule.guidance}`;
}
/** Deterministic alias baseline. Intentionally no broad fuzzy fallback for local edits. */
export function selectDesignRules(query: RuleQuery, catalog: readonly DesignRule[] = DESIGN_RULE_CATALOG): RuleSelection {
  const result: RuleSelection = { version:1,attempts:1,catalogFingerprint:ruleFingerprint(catalog),queryFingerprint:ruleFingerprint(query),selected:[],omitted:[],fallback:'none',body:'' };
  if (query.preserveSource || ['answer','theme-proposal','import'].includes(query.operation)) return {...result,fallback:'excluded-workflow'};
  if (!Number.isFinite(query.maxChars) || query.maxChars < 0) return {...result,fallback:'budget'};
  if (query.scope === 'element' && !query.features?.length) return {...result,fallback:'unknown-target'};
  const request = normalize(query.request);
  const safety=DesignRuleSafety.read();
  const ranked = catalog.filter(r => r.status !== 'deprecated' && !ruleSafetyIssue([r],safety) &&
    (!r.scope.operations.length || r.scope.operations.includes(query.operation)) && (!r.scope.devices.length || r.scope.devices.includes(query.device)) &&
    (query.scope !== 'element' || r.triggers.some(f => query.features!.includes(f))))
    .map(rule => {
      const aliases = rule.aliases.filter(a => matchesRuleAlias(request,a));
      const explicit = matchesRuleAlias(request,rule.id);
      const known = rule.triggers.some(f => query.features?.includes(f));
      // A concrete defect phrase outranks multiple broad page-kind aliases.
      const specificity = aliases.reduce((max,a)=>Math.max(max,normalize(a).length),0);
      return {rule,score:(explicit?1000:0)+(known?100:0)+specificity*2+Math.min(aliases.length,3),reason:explicit?'explicit-id':known?'target-feature':aliases.join(' / ')};
    }).filter(r => r.score > 0 && (r.rule.status !== 'supplemental' || r.rule.triggers.some(f => query.features?.includes(f))))
    .sort((a,b)=>b.score-a.score || a.rule.id.localeCompare(b.rule.id));
  for (const {rule,reason} of ranked) {
    if (result.selected.some(s=>s.rule.conflictsWith.includes(rule.id) || rule.conflictsWith.includes(s.rule.id))) continue;
    const body = renderRule(rule);
    if (result.selected.length >= 3) { result.omitted.push({id:rule.id,reason:'limit'}); continue; }
    if (result.body.length + body.length > Math.floor(query.maxChars)) { result.omitted.push({id:rule.id,reason:'budget'}); continue; }
    // Snapshot: caller/catalog mutations cannot change a frozen selection.
    result.selected.push({rule:structuredClone(rule),fingerprint:ruleFingerprint(rule),reason}); result.body += body;
  }
  if (!result.selected.length) result.fallback = result.omitted.length ? 'budget' : 'no-match';
  return result;
}

/** Narrowing must come from the same authorized analysis, never from catalog instructions. */
export function selectWithNarrowRetry(query:RuleQuery,narrowedRequest?:string):RuleSelection {
  const initial=selectDesignRules(query);
  if(initial.fallback!=='no-match'||!narrowedRequest?.trim()||normalize(narrowedRequest)===normalize(query.request)) return initial;
  // Device/operation/target/budget are immutable across the one allowed local retry.
  return {...selectDesignRules({...query,request:narrowedRequest}),attempts:2};
}
