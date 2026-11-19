import {formRuleScope} from './formBehaviorChanges';
import {checkGenerationQuality,type QualityOptions,type QualityReport} from './generationQuality';
import type {DesignTaskContract} from './designWorkflow';

type StagedQualityContract=Pick<DesignTaskContract,'wholePageRedesign'|'elementNid'|'allowedChanges'> & Partial<DesignTaskContract>;

/** Shared quality options for staged candidates — toolbar, delivery report, and evidence must use the same gate. */
export function stagedCandidateQualityOptions(input:{
  deviceProfile:QualityOptions['deviceProfile'];
  useCustomNavigation?:boolean;
  designSystem?:QualityOptions['designSystem'];
  baselineHtml?:string;
  protectedNids?:string[];
  modificationRequest?:string;
  workflowContract?:StagedQualityContract;
  mediaCss?:string;
  requireExternalMedia?:boolean;
}):QualityOptions{
  return {
    requireExternalMedia:input.requireExternalMedia??true,
    mediaCss:input.mediaCss,
    deviceProfile:input.deviceProfile,
    useCustomNavigation:input.useCustomNavigation,
    designSystem:input.designSystem,
    wholePageRedesign:input.workflowContract?.wholePageRedesign,
    contentTask:input.workflowContract as DesignTaskContract|undefined,
    baselineHtml:input.baselineHtml,
    protectedNids:input.protectedNids,
    modificationRequest:input.modificationRequest,
    formRuleRoots:formRuleScope(input.workflowContract),
  };
}

export function checkStagedCandidateQuality(html:string,input:Parameters<typeof stagedCandidateQualityOptions>[0]):QualityReport{
  return checkGenerationQuality(html,stagedCandidateQualityOptions(input));
}
