import { resolveScreenReferences } from '../../screenReferenceResolver';
import { buildPageReferenceSnapshot, type PageReferenceSnapshot, type PageReferenceSource } from './pageReferenceContext';
import type { StyleOverride } from '../../../../types/project';
export type ReferencedScreen=PageReferenceSnapshot;
export interface MentionResolveResult { referencedScreens:ReferencedScreen[];unmatchedMentions:string[];ambiguousNames:string[] }
export function resolveMentions(rawPrompt:string,screens:Record<string,PageReferenceSource>,options:{referenceScreenId?:string|null;overrides?:Record<string,StyleOverride>}={}):MentionResolveResult {
  const resolved=resolveScreenReferences(rawPrompt,screens);
  const ids=[...new Set([...(options.referenceScreenId&&screens[options.referenceScreenId]?[options.referenceScreenId]:[]),...resolved.ids])];
  return {referencedScreens:ids.map(id=>buildPageReferenceSnapshot(screens[id],options.overrides)),unmatchedMentions:resolved.unmatchedNames,ambiguousNames:resolved.ambiguousNames.filter(name=>!options.referenceScreenId || screens[options.referenceScreenId]?.name.trim().toLocaleLowerCase()!==name.trim().toLocaleLowerCase())};
}
