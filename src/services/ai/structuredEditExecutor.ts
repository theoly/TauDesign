import type { DesignSystem } from '../../types/designSystem';
import type { ProjectSettings } from '../../types/project';
import type { AIEngineCore, StreamTextOptions } from './engine/core/types';
import type { DesignTaskContract } from './designWorkflow';
import { contentFingerprint } from './designWorkflow';
import {resolveWorkflowValidation} from './workflowValidation';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { parseHtmlCopy } from '../../utils/htmlDocument';
import { applyLocalCopyEdits,generateSupplementedLocalEdits,mergeLocalEditOperations,type LocalEditOperation } from './localCopyModification';
import { generateElementCopyEdits } from './elementCopyModification';
import { generateRegionCopyEdits } from './regionCopyModification';
import { checkGenerationSourceSafety,checkGenerationQuality,qualitySummary,type QualityReport } from './generationQuality';
import { compareStructure } from '../../utils/structureGuard';
import { localEditExecutionRecord,type DesignExecutionRecord } from './designExecutionRecord';

export interface StructuredEditOptions {
  mode:'element'|'local'|'region';
  screen:{id:string;name:string;htmlContent:string};request:string;contract:DesignTaskContract;
  settings:Pick<ProjectSettings,'deviceProfile'|'frameWidth'|'useCustomNavigation'>;
  designSystem:DesignSystem;colorMode:'light'|'dark';
  elementNid?:string;local?:{operations:LocalEditOperation[];allowedNids:string[];supplement?:boolean};regionNids?:string[];
  protectedNids?:string[];allowText?:boolean;
  binding?:{provider:StreamTextOptions['provider'];model:string};imageUrl?:string;projectKnowledge?:string;context?:string;
  signal?:AbortSignal;isCurrent:()=>boolean;
}
export type StructuredEditResult = {contract:DesignTaskContract;executionRecord:DesignExecutionRecord} & (
  {status:'ready';html:string;qualityReport:QualityReport;targetNids:string[];operationCount:number} |
  {status:'failed'|'cancelled'|'stale';message:string}
);
class Interrupted extends Error {constructor(readonly status:'cancelled'|'stale',message:string){super(message);}}

/** All structured edit entry points share this read-only executor. Staging, History and persistence stay in their existing owners. */
export async function executeStructuredEdit(core:AIEngineCore|undefined,options:StructuredEditOptions):Promise<StructuredEditResult> {
  const {signal,isCurrent,...data}=options;
  const input=structuredClone(data),contract=input.contract;
  const guard=()=>{
    if(signal?.aborted)throw new Interrupted('cancelled','局部修改已取消。');
    if(!isCurrent())throw new Interrupted('stale','原页面或工程已变化，请重新分析或指定目标。');
  };
  try {
    guard();
    const task=resolveWorkflowValidation(contract,'structured');
    if(!task.ok)throw new Error(task.message);
    // Entity/file/render checks are recomputed by the shared candidate delivery gate.
    if(task.plan.stages.some(stage=>!['source-safety','quality','structure','asset-references','asset-files','render','design-entities'].includes(stage)))throw new Error('结构化执行器不支持工作流要求的必要阶段。');
    const workflow=task.workflow!;
    if(contract.target?.id!==input.screen.id || contract.target.baselineFingerprint!==contentFingerprint(input.screen.htmlContent))throw new Error('修改合同与目标或原页基线不匹配。');
    if(contract.device.profile!==input.settings.deviceProfile || contract.device.frameWidth!==input.settings.frameWidth)throw new Error('修改合同与工程设备不匹配。');
    const protectedNids=[...new Set([...contract.protectedNids,...(input.protectedNids??[])])];
    const styleOnly=workflow.operation==='restyle';
    const allowText=styleOnly ? false : input.allowText;
    if(styleOnly && input.mode!=='local')throw new Error('纯润色仅支持受限局部样式操作。');
    const requested=input.mode==='element' ? [input.elementNid] : input.mode==='region' ? input.regionNids : input.local?.allowedNids;
    if(!requested?.length || requested.some(nid=>typeof nid!=='string'||!nid.trim()))throw new Error('缺少明确的局部授权目标。');
    if(input.mode==='element' ? contract.elementNid!==input.elementNid : Boolean(contract.elementNid))throw new Error('元素合同与执行模式或引用范围不匹配。');
    if(!styleOnly && !contract.allowedChanges.includes(`screen:${input.screen.id}`) &&
      requested.some(nid=>!contract.allowedChanges.includes(`element:${nid}`)))throw new Error('局部目标超出任务合同的已授权范围。');
    const source=checkGenerationSourceSafety(input.screen.htmlContent,input.settings);
    if(!source.passed)throw new Error(qualitySummary(source));
    const html=normalizeMobileNavigation(input.screen.htmlContent,input.settings).html;
    const nodes=Array.from(parseHtmlCopy(html).doc.body.querySelectorAll('[data-nid]'));
    if(new Set(requested).size!==requested.length || requested.some(nid=>nodes.filter(el=>el.getAttribute('data-nid')===nid).length!==1))throw new Error(`${input.mode==='element'?'引用元素':'授权节点'}不存在或标识不唯一，未请求模型。`);
    const needsModel=input.mode!=='local'||input.local?.supplement;
    if(needsModel && (!core||!input.binding))throw new Error('请先配置可用的 AI Provider 以执行结构化修改。');
    // Guard every request, including each region. A non-cooperating model cannot return a stale partial result.
    const guardedCore:AIEngineCore={
      streamText:request=>{guard();return core!.streamText(request);},
      async generateObject<T>(schema:Record<string,unknown>,request:Omit<StreamTextOptions,'jsonSchema'>):Promise<T>{
        guard();const result=await core!.generateObject<T>(schema,request);guard();return result;
      }
    };
    const common={...input.binding!,signal,html,request:input.request,device:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
      designSystem:input.designSystem,mode:input.colorMode,protectedNids,imageUrl:input.imageUrl,projectKnowledge:input.projectKnowledge};
    let candidate:{html:string;qualityReport:QualityReport;targetNids:string[];operations?:LocalEditOperation[]};
    if(input.mode==='element')candidate=await generateElementCopyEdits(guardedCore,{...common,targetNid:input.elementNid!,context:input.context});
    else if(input.mode==='region')candidate=await generateRegionCopyEdits(guardedCore,{...common,targetNids:input.regionNids!,allowedNids:input.regionNids!,modificationRequest:input.request});
    else {
      let operations=input.local!.operations;
      if(input.local!.supplement)operations=mergeLocalEditOperations(operations,await generateSupplementedLocalEdits(guardedCore,
        {...common,allowedNids:input.local!.allowedNids,allowText}));
      guard();candidate=applyLocalCopyEdits(html,operations,{device:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
        allowedNids:input.local!.allowedNids,protectedNids,allowText});
    }
    guard();
    const safe=checkGenerationSourceSafety(candidate.html,input.settings);
    const qualityReport=checkGenerationQuality(candidate.html,{deviceProfile:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
      designSystem:input.designSystem,baselineHtml:html,protectedNids,preserveNids:input.mode!=='region',modificationRequest:input.request});
    // Region validation treats even removed secondary operations as errors; do not downgrade its findings.
    for(const finding of candidate.qualityReport.findings)if(finding.severity==='error')qualityReport.findings.push(finding);
    qualityReport.passed=!qualityReport.findings.some(f=>f.severity==='error');
    if(!safe.passed||!qualityReport.passed)throw new Error(qualitySummary(!safe.passed?safe:qualityReport));
    if(styleOnly){const diff=compareStructure(html,candidate.html);if(!diff.ok||diff.textChanged)throw new Error('纯润色不能改变元素树或文案。');}
    const operationCount=candidate.operations?.length??candidate.targetNids.length;
    guard();return {status:'ready',html:candidate.html,qualityReport,targetNids:candidate.targetNids,operationCount,contract,
      executionRecord:localEditExecutionRecord({html:candidate.html,qualityReport,mode:input.mode,targetNids:candidate.targetNids,operationCount})};
  }catch(error){
    let failure=error;
    try {guard();} catch(interruption){failure=interruption;}
    const status=failure instanceof Interrupted?failure.status:'failed';
    const message=failure instanceof Error?failure.message:'结构化局部修改失败，原页未修改。';
    return {status,message,contract,executionRecord:{source:'local-edit',rawResponse:'',continuationCount:0,warnings:[],errorMessage:message}};
  }
}
