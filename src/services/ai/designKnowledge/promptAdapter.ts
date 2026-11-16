import { CRAFT_DEFERENCE_PREAMBLE, renderCraftSection } from '../craft';
import type { GenerationIntent } from '../promptBuilder';
import { selectDesignRules } from './selector';
import type { RuleQuery, RuleSelection } from './types';

const boundedPrefix='### DESIGN REFERENCES\n仅在已授权范围参考以下建议；当前主题、保护范围和本请求的输出协议优先。\n';
/** Additive scene appendix — never replaces baseline craft titles/bodies (create path). */
const sceneAppendixPrefix=`\n\n#### CONTEXTUAL SCENE RULES\n${CRAFT_DEFERENCE_PREAMBLE}\n以下为追加场景建议；上方基线工艺标题与条款始终有效，不得整段替换。\n`;
/** Replace-within-window prefix for restyle/polish craft swap (must not grow the polish prompt). */
const craftReplacePrefix=`### CRAFT REFERENCES:\n${CRAFT_DEFERENCE_PREAMBLE}\n仅在授权范围内参考以下建议；当前主题、内容和保护合同优先。\n`;
/** Soft cap for scene rules appended after baseline craft (E5 additive). */
export const SCENE_CRAFT_ADDITIVE_BUDGET = 720;

export type FrozenCraftMode = 'additive' | 'replace';

/** JSON/fragment callers can replace their reference window without loading an HTML output contract. */
export function renderBoundedGuidance(baseline:string,selection:RuleSelection):string {
  if(!selection.body)return baseline;
  const body=boundedPrefix+selection.body;
  if(body.length>baseline.length)throw new Error('冻结设计规则超出本请求的参考窗口，未发送模型。');
  return body;
}
export function buildBoundedGuidance(baseline:string,query:RuleQuery):{body:string;selection:RuleSelection} {
  const selection=selectDesignRules({...query,maxChars:Math.max(0,Math.min(query.maxChars,baseline.length-boundedPrefix.length))});
  return {body:renderBoundedGuidance(baseline,selection),selection};
}

/**
 * Experimental adapter.
 * - create: additive scene appendix (E5)
 * - modify/restyle polish: replace-within baseline craft window (must not grow prompt)
 */
export function buildContextualCraft(
  intent: GenerationIntent,
  query: RuleQuery,
  mode?: FrozenCraftMode
): {body:string;selection:RuleSelection} {
  // Restyle/polish must replace-within craft window; create/modify stay additive (E5 titles).
  const strategy: FrozenCraftMode =
    mode ?? (query.operation === 'restyle' ? 'replace' : 'additive');
  const baseline = renderCraftSection(intent);
  const eligible =
    (intent === 'create_screen' && query.operation === 'create') ||
    (intent === 'modify_screen' && ['modify', 'restyle'].includes(query.operation)) ||
    query.operation === 'restyle';
  const maxChars =
    strategy === 'additive'
      ? Math.max(0, Math.min(query.maxChars, SCENE_CRAFT_ADDITIVE_BUDGET))
      : Math.max(0, Math.min(query.maxChars, Math.max(0, baseline.length - craftReplacePrefix.length)));
  const selection = selectDesignRules({
    ...query,
    operation: eligible ? query.operation : 'answer',
    maxChars
  });
  return { body: renderFrozenCraft(intent, selection, strategy), selection };
}

export function renderFrozenCraft(
  intent: GenerationIntent,
  selection: RuleSelection,
  mode: FrozenCraftMode = 'additive'
): string {
  const baseline = renderCraftSection(intent);
  if (!selection.body) return baseline;
  if (mode === 'replace') {
    const body = craftReplacePrefix + selection.body;
    if (body.length > baseline.length) throw Error('冻结规则超过原有工艺窗口，未发送模型。');
    return body;
  }
  const appendix = `${sceneAppendixPrefix}${selection.body.trim()}`;
  if (appendix.length > sceneAppendixPrefix.length + SCENE_CRAFT_ADDITIVE_BUDGET + 64) {
    throw Error('冻结规则超过场景附加窗口，未发送模型。');
  }
  return baseline + appendix;
}
