import {explicitFieldLabels,inspectExplicitFieldLabels} from './explicitFieldContent';
import type {DesignTaskContract} from './designWorkflow';
import type {RenderedQualityReport} from '../../utils/renderedQuality';
import {isRenderedQualityReport} from './evidenceSchema';
import {explicitActionTexts,inspectExplicitActionTexts,sourceActionTargets} from './explicitActionContent';

const ordinary=new Set(['render_action_zero_size','render_action_invisible_label']);
/** A literal-visibility error may reuse the style-only protocol, never a text operation. */
export function styleRepairErrorNids(doc:Document,task:DesignTaskContract,render:RenderedQualityReport):string[]|undefined{
  if(!isRenderedQualityReport(render)||render.status!=='complete')return;
  if(inspectExplicitFieldLabels(doc,explicitFieldLabels(task)).length)return;
  const errors=render.findings.filter(f=>f.severity==='error');
  if(!errors.length||errors.length>8||errors.some(f=>!f.nid))return;
  const nids=[...new Set(errors.map(f=>f.nid!))];if(nids.length>3)return;
  const declared=explicitActionTexts(task),literalTargets=new Map<string,Element>();
  if(declared.length&&inspectExplicitActionTexts(doc,declared).length)return;
  if(declared.length){
    for(const requirement of declared){
      const targets=sourceActionTargets(doc,requirement),nid=targets.length===1?targets[0].getAttribute('data-nid'):undefined;
      if(nid)literalTargets.set(nid,targets[0]);
    }
  }
  for(const failure of errors){
    if(ordinary.has(failure.code))continue;
    if(failure.code!=='required_action_text_missing')return;
    const target=literalTargets.get(failure.nid!);if(!target)return;
    const ownStyle=(target as HTMLElement).style;
    const ownZero=['font-size','width','height','max-width','max-height'].some(property=>/^0(?:px|em|rem|%|pt)?$/i.test(ownStyle.getPropertyValue(property).trim()));
    if(!ownZero&&!errors.some(other=>other.nid===failure.nid&&ordinary.has(other.code)))return;
  }
  return nids;
}
