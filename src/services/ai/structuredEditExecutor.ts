import type { DesignSystem } from '../../types/designSystem';
import type { ProjectSettings } from '../../types/project';
import type { AIEngineCore, StreamTextOptions } from './engine/core/types';
import {TaskBudget,withTaskBudget} from './taskBudget';
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
import type {RuleFeature} from './designKnowledge/types';
import {targetRuleFeatures} from './designKnowledge/targetFeatures';
import {buildBoundedGuidance} from './designKnowledge/promptAdapter';
import {selectTokenGuidance} from './designKnowledge/tokenWindow';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from './designKnowledge/receipt';
import {renderComponentContracts} from './componentContracts';
import {requiresFunctionalPlanning,requiresElementStructure} from './functionalModification';
import {preparePageTaskPlan,pageTaskPlanIssue} from './pageTaskPlan';
import {validateRegionTargets} from './regionCopyModification';
import {referenceImageIdentity} from './workflowSources';
import {createChatTaskBudget} from './taskBudgetPolicy';
import type {TextReference} from './textFileContext';
import type {ImageAttachment} from '../../types/referenceImage';

export interface StructuredEditOptions {
  mode:'element'|'local'|'region';
  screen:{id:string;name:string;htmlContent:string};request:string;contract:DesignTaskContract;
  settings:Pick<ProjectSettings,'deviceProfile'|'frameWidth'|'useCustomNavigation'>;
  designSystem:DesignSystem;colorMode:'light'|'dark';
  elementNid?:string;local?:{operations:LocalEditOperation[];allowedNids:string[];supplement?:boolean};regionNids?:string[];
  protectedNids?:string[];allowText?:boolean;
  binding?:{provider:StreamTextOptions['provider'];model:string};imageUrl?:string;projectKnowledge?:string;context?:string;
  signal?:AbortSignal;isCurrent:()=>boolean;
  taskBudget?:TaskBudget;textReferences?:TextReference[];attachment?:ImageAttachment;
  onPhase?:(phase:'planning'|'editing')=>void;
  /** Internal opt-in; output-specific adapters never alter authorization or response schemas. */
  contextualGuidance?:{features?:RuleFeature[]};
}
export type StructuredEditResult = {contract:DesignTaskContract;executionRecord:DesignExecutionRecord;taskBudget?:import('./taskBudget').TaskBudgetSnapshot} & (
  {status:'ready';html:string;qualityReport:QualityReport;targetNids:string[];operationCount:number} |
  {status:'failed'|'cancelled'|'stale';message:string}
);
class Interrupted extends Error {constructor(readonly status:'cancelled'|'stale',message:string){super(message);}}

/** All structured edit entry points share this read-only executor. Staging, History and persistence stay in their existing owners. */
export async function executeStructuredEdit(core:AIEngineCore|undefined,options:StructuredEditOptions):Promise<StructuredEditResult> {
  const {signal,isCurrent,taskBudget,onPhase,...data}=options;
  let budget=taskBudget,ownsBudget=false;
  const input=structuredClone(data),contract=input.contract;
  const guard=()=>{
    if(signal?.aborted)throw new Interrupted('cancelled','局部修改已取消。');
    if(!isCurrent())throw new Interrupted('stale','原页面或工程已变化，请重新分析或指定目标。');
  };
  const finish=(result:StructuredEditResult):StructuredEditResult=>{if(ownsBudget)budget?.close();return {...result,...(budget?{taskBudget:budget.snapshot()}:{})};};
  try {
    guard();
    const task=resolveWorkflowValidation(contract,'structured',{preflight:true});
    if(!task.ok)throw new Error(task.message);
    // Entity/file/render checks are recomputed by the shared candidate delivery gate.
    if(task.plan.stages.some(stage=>!['source-safety','quality','structure','asset-references','asset-files','render','design-entities'].includes(stage)))throw new Error('结构化执行器不支持工作流要求的必要阶段。');
    const workflow=task.workflow!;
    if(contract.target?.id!==input.screen.id || contract.target.baselineFingerprint!==contentFingerprint(input.screen.htmlContent))throw new Error('修改合同与目标或原页基线不匹配。');
    if(contract.device.profile!==input.settings.deviceProfile || contract.device.frameWidth!==input.settings.frameWidth)throw new Error('修改合同与工程设备不匹配。');
    const protectedNids=[...new Set([...contract.protectedNids,...(input.protectedNids??[])])];
    const styleOnly=workflow.operation==='restyle';
    const functional=!styleOnly&&requiresFunctionalPlanning(input.request);
    const elementStructure=!styleOnly&&input.mode==='element'&&requiresElementStructure(input.request);
    const structural=input.mode==='region'||elementStructure;
    if(functional&&input.mode==='local')throw new Error('有限局部修改仅支持样式与明确文案；新增字段或交互请明确选择完整区块范围，不会自动扩大到整页。');
    const allowText=styleOnly ? false : input.allowText;
    if(styleOnly && input.mode!=='local')throw new Error('纯润色仅支持受限局部样式操作。');
    const requested=input.mode==='element' ? [input.elementNid] : input.mode==='region' ? input.regionNids : input.local?.allowedNids;
    if(!requested?.length || requested.some(nid=>typeof nid!=='string'||!nid.trim()))throw new Error('缺少明确的局部授权目标。');
    if(input.mode==='element' ? contract.elementNid!==input.elementNid : Boolean(contract.elementNid))throw new Error('元素合同与执行模式或引用范围不匹配。');
    if(!styleOnly && !contract.allowedChanges.includes(`screen:${input.screen.id}`) &&
      requested.some(nid=>!contract.allowedChanges.includes(`element:${nid}`)))throw new Error('局部目标超出任务合同的已授权范围。');
    if(functional&&(contract.allowedChanges.length!==requested.length||contract.allowedChanges.some(scope=>!requested.some(nid=>scope===`element:${nid}`))))throw new Error('功能规划与本次完整区块范围不一致。');
    const source=checkGenerationSourceSafety(input.screen.htmlContent,input.settings);
    if(!source.passed)throw new Error(qualitySummary(source));
    const html=normalizeMobileNavigation(input.screen.htmlContent,input.settings).html;
    const nodes=Array.from(parseHtmlCopy(html).doc.body.querySelectorAll('[data-nid]'));
    if(new Set(requested).size!==requested.length || requested.some(nid=>nodes.filter(el=>el.getAttribute('data-nid')===nid).length!==1))throw new Error(`${input.mode==='element'?'引用元素':'授权节点'}不存在或标识不唯一，未请求模型。`);
    if(structural)validateRegionTargets(html,requested as string[],{device:input.settings.deviceProfile,protectedNids,allowedNids:requested as string[],modificationRequest:input.request});
    const needsModel=input.mode!=='local'||input.local?.supplement;
    if(needsModel && (!core||!input.binding))throw new Error('请先配置可用的 AI Provider 以执行结构化修改。');
    if((needsModel||functional||contract.designGuidance)&&contract.request!==input.request)throw new Error('当前指令与冻结任务合同不匹配，请重新发起修改。');
    const protocol=structural?'fragment-json':'finite-json';
    if(contract.designGuidance&&(!needsModel||(contract.designGuidance.protocol??'finite-json')!==protocol))throw new Error('设计规则快照与当前结构化输出协议不匹配。');
    if(needsModel&&!budget){const count=structural?requested.length:1;const perRequest=structural?4096:input.mode==='element'?2048:1800;
      budget=functional?createChatTaskBudget():new TaskBudget({maxRequests:count,maxRequestedOutputTokens:count*perRequest,maxDurationMs:count*900000,maxRequestDurationMs:900000});ownsBudget=true;}
    if(functional){
      if(input.imageUrl&&!input.attachment)throw new Error('参考图功能修改缺少实际附件身份，请重新附图。');
      if(contract.referenceImage&&!input.attachment)throw new Error('冻结功能规划缺少原参考图片，请重新附图。');
      if(input.attachment){
        if(input.imageUrl&&input.imageUrl!==input.attachment.dataUrl)throw new Error('参考图与当前修改附件不匹配。');
        const identity=referenceImageIdentity(input.attachment),old=contract.referenceImage;
        if(old&&(old.name!==identity.name||old.fingerprint!==identity.fingerprint||JSON.stringify(old.region)!==JSON.stringify(identity.region)))throw new Error('业务规划参考图片已变化。');
        contract.referenceImage={...old,...identity};
      }
      if(!contract.pageTaskPlan){guard();onPhase?.('planning');
        contract.pageTaskPlan=await preparePageTaskPlan(core!,{contract,provider:input.binding!.provider,model:input.binding!.model,budget:budget!,baselineHtml:input.screen.htmlContent,
          regionNids:requested as string[],projectKnowledge:input.projectKnowledge,textReferences:input.textReferences,attachment:input.attachment,useCustomNavigation:input.settings.useCustomNavigation,signal,isCurrent});
      }
      const issue=pageTaskPlanIssue(contract);if(issue)throw new Error(issue);
      if(contract.pageTaskPlan.request.providerId!==input.binding!.provider.id||contract.pageTaskPlan.request.model!==input.binding!.model)throw new Error('功能规划使用的模型已变化。');
      if(contract.pageTaskPlan.plan.questions.length)throw new Error(`区块功能规划有待确认的问题：${contract.pageTaskPlan.plan.questions.join('；')}`);
    }else if(contract.pageTaskPlan)throw new Error('本次有限修改不能复用其它功能规划。');
    if(input.contextualGuidance&&needsModel&&!contract.designGuidance){
      const query={request:input.request,operation:contract.operation,device:contract.device.profile,scope:'element' as const,features:input.contextualGuidance.features??targetRuleFeatures(html,requested as string[]),maxChars:10000};
      const selection=input.mode==='element'&&!structural?buildBoundedGuidance(renderComponentContracts(false,input.request),query).selection:
        selectTokenGuidance(compileTokensToCss(input.designSystem.tokens,input.colorMode),query);
      contract.designGuidance=makeGuidancePacket(contract,selection,protocol);
    }
    guard();if(needsModel)onPhase?.('editing');
    const evidenceCore=contract.designGuidance?withGuidanceReceipts(core!,contract,contract.designGuidance):core;
    const requestCore=budget?withTaskBudget(evidenceCore!,budget):evidenceCore;
    // Guard every request, including each region. A non-cooperating model cannot return a stale partial result.
    const guardedCore:AIEngineCore={
      streamText:request=>{guard();return requestCore!.streamText(request);},
      async generateObject<T>(schema:Record<string,unknown>,request:Omit<StreamTextOptions,'jsonSchema'>):Promise<T>{
        guard();const result=await requestCore!.generateObject<T>(schema,request);guard();return result;
      }
    };
    const common={...input.binding!,signal,html,request:input.request,device:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
      designSystem:input.designSystem,mode:input.colorMode,protectedNids,imageUrl:input.attachment?.dataUrl??input.imageUrl,projectKnowledge:input.projectKnowledge,pageTaskPlan:contract.pageTaskPlan,guidanceSelection:contract.designGuidance?.selection};
    let candidate:{html:string;qualityReport:QualityReport;targetNids:string[];operations?:LocalEditOperation[]};
    if(elementStructure)candidate=await generateRegionCopyEdits(guardedCore,{...common,targetNids:[input.elementNid!],allowedNids:[input.elementNid!],preserveInteractionAttributes:true,modificationRequest:input.request});
    else if(input.mode==='element')candidate=await generateElementCopyEdits(guardedCore,{...common,targetNid:input.elementNid!,context:input.context,guidanceSelection:contract.designGuidance?.selection});
    else if(input.mode==='region')candidate=await generateRegionCopyEdits(guardedCore,{...common,targetNids:input.regionNids!,allowedNids:input.regionNids!,modificationRequest:input.request});
    else {
      let operations=input.local!.operations;
      if(input.local!.supplement)operations=mergeLocalEditOperations(operations,await generateSupplementedLocalEdits(guardedCore,
        {...common,allowedNids:input.local!.allowedNids,allowText}));
      guard();candidate=applyLocalCopyEdits(html,operations,{device:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
        allowedNids:input.local!.allowedNids,protectedNids,allowText});
    }
    guard();
    const guidanceIssue=guidancePacketIssue(contract);
    if(guidanceIssue)throw new Error(guidanceIssue);
    const safe=checkGenerationSourceSafety(candidate.html,input.settings);
    const qualityReport=checkGenerationQuality(candidate.html,{deviceProfile:input.settings.deviceProfile,useCustomNavigation:input.settings.useCustomNavigation,
      designSystem:input.designSystem,baselineHtml:html,protectedNids,preserveNids:!structural,modificationRequest:input.request,formRuleRoots:requested as string[]});
    // Region validation treats even removed secondary operations as errors; do not downgrade its findings.
    for(const finding of candidate.qualityReport.findings)if(finding.severity==='error')qualityReport.findings.push(finding);
    qualityReport.passed=!qualityReport.findings.some(f=>f.severity==='error');
    if(!safe.passed||!qualityReport.passed)throw new Error(qualitySummary(!safe.passed?safe:qualityReport));
    if(styleOnly){const diff=compareStructure(html,candidate.html);if(!diff.ok||diff.textChanged)throw new Error('纯润色不能改变元素树或文案。');}
    const operationCount=candidate.operations?.length??candidate.targetNids.length;
    guard();return finish({status:'ready',html:candidate.html,qualityReport,targetNids:candidate.targetNids,operationCount,contract,
      executionRecord:localEditExecutionRecord({html:candidate.html,qualityReport,mode:input.mode,targetNids:candidate.targetNids,operationCount,...(elementStructure?{structural:true as const}:{})})});
  }catch(error){
    let failure=error;
    try {guard();} catch(interruption){failure=interruption;}
    const status=failure instanceof Interrupted?failure.status:'failed';
    const message=failure instanceof Error?failure.message:'结构化局部修改失败，原页未修改。';
    return finish({status,message,contract,executionRecord:{source:'local-edit',rawResponse:'',continuationCount:0,warnings:[],errorMessage:message}});
  } finally {if(ownsBudget)budget?.close();}
}
