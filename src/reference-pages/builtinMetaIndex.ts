/**
 * Browser-safe active builtin mother summaries (meta only).
 * Mirrors `listActiveMothers()` without pulling node:fs into the host UI bundle.
 *
 * Source of truth for bodies remains `mothers/{id}/`; this JSON is a UI index
 * regenerated when builtin metas change (see package scripts / E4b sealing).
 */
import type { MotherPageMeta } from './types';
import summaries from './builtinActiveSummaries.json';

/** Active builtin mothers as meta summaries for host UI listing. */
export function listActiveBuiltinMotherMeta(): MotherPageMeta[] {
  return (summaries as MotherPageMeta[])
    .filter((meta) => meta && meta.status === 'active' && meta.origin === 'builtin')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}
