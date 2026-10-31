import { CRAFT_DEFERENCE_PREAMBLE, renderCraftSection } from '../craft';
import type { GenerationIntent } from '../promptBuilder';
import { selectDesignRules } from './selector';
import type { RuleQuery, RuleSelection } from './types';

const boundedPrefix='### DESIGN REFERENCES\n仅在已授权范围参考以下建议；当前主题、保护范围和本请求的输出协议优先。\n';
const craftPrefix=`### CRAFT REFERENCES:\n${CRAFT_DEFERENCE_PREAMBLE}\n仅在授权范围内参考以下建议；当前主题、内容和保护合同优先。\n`;
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

/** Optional experimental adapter. Only the generic craft body is replaceable. */
export function buildContextualCraft(intent: GenerationIntent, query: RuleQuery): {body:string;selection:RuleSelection} {
  const baseline=renderCraftSection(intent);
  const eligible=(intent==='create_screen'&&query.operation==='create')||(intent==='modify_screen'&&['modify','restyle'].includes(query.operation));
  const selection=selectDesignRules({...query,operation:eligible?query.operation:'answer',maxChars:Math.max(0,Math.min(query.maxChars,baseline.length-craftPrefix.length))});
  return {body:renderFrozenCraft(intent,selection),selection};
}
export function renderFrozenCraft(intent:GenerationIntent,selection:RuleSelection):string {
  const baseline=renderCraftSection(intent);if(!selection.body)return baseline;
  const body=craftPrefix+selection.body;if(body.length>baseline.length)throw Error('冻结规则超过原有工艺窗口，未发送模型。');return body;
}
