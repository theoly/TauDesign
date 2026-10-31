import { WORKFLOW_CATALOG } from '../workflowCatalog';
import type { DesignRule } from './types';

const features = new Set(['long-copy','badge','button','tags','person','form','gradient','fixed-region','media','list','detail','dashboard','pricing','conversation','empty','state','icon','spacing','typography','color']);
const operations = new Set(Object.values(WORKFLOW_CATALOG).map(w => w.operation));
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
/** Strictly data-only: no eval, selectors or checker code is loaded from rules. */
export function validateRuleCatalog(value: unknown, whitelist: (device: 'pc' | 'mobile') => readonly string[], options:{allowExternalConflicts?:boolean;purpose?:'catalog'|'history'}={}): string[] {
  if (!Array.isArray(value) || value.length > 200) return ['catalog: expected at most 200 rules'];
  const errors: string[] = [], rules: DesignRule[] = [];
  for (const [index, candidate] of value.entries()) {
    const r = candidate as DesignRule | undefined;
    if (!r || typeof r !== 'object' || !text(r.id) || !/^[A-Z]{2}-\d{2}$/.test(r.id) || !Number.isInteger(r.version) || r.version < 1 ||
      !['active','supplemental','deprecated'].includes(r.status) || r.tier !== 'contextual' || !text(r.title) || !strings(r.aliases) || !r.aliases.length ||
      !r.scope || !strings(r.scope.operations) || !r.scope.operations.every(o => operations.has(o)) || !strings(r.scope.devices) || !r.scope.devices.every(d => ['pc','mobile'].includes(d)) ||
      !strings(r.scope.components) || !r.scope.components.every(f => features.has(f)) || !strings(r.triggers) || !r.triggers.every(f => features.has(f)) ||
      !strings(r.conflictsWith) || !text(r.guidance) || !strings(r.exceptions) ||
      !Array.isArray(r.examples) || !r.examples.length || !r.examples.every(e => e && text(e.positive) && text(e.negative)) ||
      !Array.isArray(r.implementation) || !r.implementation.length || !r.implementation.every(i => i && ['native-token','registered-source-css'].includes(i.mode) && strings(i.classes)) ||
      r.validation?.kind !== 'human' || r.validation.severity !== 'advisory' || !text(r.source?.title) || !text(r.source.locator) || !text(r.source.revision) || r.source.reuse !== 'original-summary' ||
      !text(r.reviewedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt) || (r.replacedBy !== undefined && !text(r.replacedBy))) {
      errors.push(`rule[${index}]: invalid schema`); continue;
    }
    // Catalog prose/examples are never executable, but reject active-content recommendations too.
    if (/<\s*script\b|javascript:|\bon\w+\s*=/i.test(JSON.stringify(r))) errors.push(`${r.id}: unsafe example`);
    for (const implementation of r.implementation) if (implementation.mode === 'native-token'&&options.purpose!=='history') {
      for (const device of r.scope.devices.length ? r.scope.devices : ['pc','mobile'] as const) {
        const allowed = new Set(whitelist(device));
        for (const name of implementation.classes) if (!allowed.has(name)) errors.push(`${r.id}: unknown ${device} class ${name}`);
      }
    }
    rules.push(r);
  }
  const byId = new Map(rules.map(r => [r.id,r]));
  if (byId.size !== rules.length) errors.push('catalog: duplicate rule id');
  for (const r of rules) {
    for (const id of r.conflictsWith) if (id === r.id || (!byId.has(id)&&!options.allowExternalConflicts)) errors.push(`${r.id}: invalid conflict ${id}`);
    if (r.replacedBy && (r.status !== 'deprecated' || !byId.has(r.replacedBy))) errors.push(`${r.id}: invalid replacement`);
    const seen = new Set<string>([r.id]); let next = r.replacedBy;
    while (next && byId.has(next)) {
      if (seen.has(next)) { errors.push(`${r.id}: replacement cycle`); break; }
      seen.add(next); next = byId.get(next)?.replacedBy;
    }
  }
  return errors;
}
