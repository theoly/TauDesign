import {validMultiPageScope,type MultiPageScope} from './multiPageContract';
import type {DesignTaskContract} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import {WORKFLOW_CATALOG,type WorkflowDescriptor,type WorkflowValidationStage} from './workflowCatalog';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {normalizeMobileNavigation,type MobileNavigationPolicy} from '../../utils/mobileNavigation';
import {compareStructure} from '../../utils/structureGuard';
import {checkStructureIntegrity} from './engine/pipeline/interceptors/guardInterceptor';
import {validReferenceImageIdentity,validLibrarySourceIdentity,creationSourceStages} from './workflowSources';
import {analyzePipelineIntent} from './engine/pipeline/interceptors/intentInterceptor';

export interface WorkflowValidationPlan {version:1;workflowId:string;fingerprint:string;stages:WorkflowValidationStage[]}
export interface WorkflowStageCheck {id:WorkflowValidationStage;status:'passed'|'blocked'|'pending';message:string}
export interface WorkflowValidationReport {plan:WorkflowValidationPlan;status:'ready'|'blocked'|'pending';checks:WorkflowStageCheck[]}
const bottomLine:WorkflowValidationStage[]=['source-safety','quality','asset-references','asset-files','render','design-entities'];
function nodeContract(node:Node):unknown {
  if(node.nodeType===3){const text=node.parentElement?.matches('pre,textarea,style')?(node.textContent??''):(node.textContent??'').replace(/\s+/g,' ').trim();return text?['text',text]:null;}
  if(node.nodeType!==1)return null;
  const el=node as Element;
  return [el.namespaceURI,el.localName,Array.from(el.attributes).map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)),
    Array.from(el.localName==='template'?(el as HTMLTemplateElement).content.childNodes:el.childNodes).map(nodeContract).filter(value=>value!==null)];
}
export function createWorkflowValidationPlan(workflow:WorkflowDescriptor,multiPage?:MultiPageScope):WorkflowValidationPlan {
  const canvas=['create','modify','restyle','import'].includes(workflow.operation);
  const stages=[...new Set([...(canvas?bottomLine:[]),...(workflow.operation==='analyze'?[['plan-multiple-pages','plan-page-variants'].includes(workflow.id)?'page-plan-schema' as const:'analysis-schema' as const]:[]),...(['modify','restyle'].includes(workflow.operation)?['structure' as const]:[]),...(workflow.operation==='import'?['import-preview' as const]:[]),...creationSourceStages(workflow.id),...(multiPage?['multi-page-scope' as const]:[]),...workflow.validationStages])];
  return {version:1,workflowId:workflow.id,stages,fingerprint:contentFingerprint(JSON.stringify([1,workflow.id,workflow.operation,
    workflow.strategy,workflow.requiredContext,workflow.protectedScope,stages]))};
}
export function resolveWorkflowValidation(contract:DesignTaskContract|undefined,purpose:'candidate'|'batch'|'structured'|'create'|'import'|'analysis'|'page-plan'):
  {ok:true;plan:WorkflowValidationPlan;workflow?:WorkflowDescriptor}|{ok:false;message:string} {
  if(!contract){
    if(purpose==='structured'||purpose==='create'||purpose==='import'||purpose==='analysis'||purpose==='page-plan')return {ok:false,message:'页面执行缺少明确任务合同。'};
    const stages:WorkflowValidationStage[]=[...bottomLine,...(purpose==='batch'?['structure' as const]:[])];
    return {ok:true,plan:{version:1,workflowId:`legacy-${purpose}`,stages,fingerprint:contentFingerprint(JSON.stringify(stages))}};
  }
  if(contract.version!==1 || !Object.hasOwn(WORKFLOW_CATALOG,contract.workflowId))return {ok:false,message:'未知或无效的工作流合同，不能应用页面。'};
  const workflow=WORKFLOW_CATALOG[contract.workflowId];
  if(contract.operation!==workflow.operation || contract.strategy!==workflow.strategy)return {ok:false,message:'工作流身份与合同操作或策略不匹配。'};
  const allowed=purpose==='page-plan'?['plan-multiple-pages','plan-page-variants'].includes(workflow.id):purpose==='analysis'?workflow.id==='review-page-modification'&&workflow.operation==='analyze'&&workflow.strategy==='review-first':purpose==='import'?workflow.operation==='import':purpose==='create'?workflow.operation==='create'&&workflow.strategy==='new-page':purpose==='batch'?workflow.operation==='restyle':
    ['modify','restyle'].includes(workflow.operation)&&workflow.strategy==='candidate-copy';
  if(!allowed)return {ok:false,message:'当前工作流没有授权此应用入口。'};
  if(typeof contract.request!=='string' || !contract.request.trim() || ((workflow.requiredContext.includes('target')||workflow.requiredContext.includes('source-html'))&&(!contract.target || typeof contract.target.id!=='string' ||
    typeof contract.target.baselineFingerprint!=='string')) || !contract.device || !['mobile','pc'].includes(contract.device.profile) ||
    !Number.isFinite(contract.device.frameWidth) || !Array.isArray(contract.allowedChanges) || contract.allowedChanges.some(c=>typeof c!=='string') ||
    !Array.isArray(contract.protectedNids) || contract.protectedNids.some(nid=>typeof nid!=='string') ||
    (workflow.requiredContext.includes('element') && (typeof contract.elementNid!=='string'||!contract.elementNid)))return {ok:false,message:'工作流合同缺少执行所需的目标、设备或授权上下文。'};
  if((creationSourceStages(workflow.id).includes('reference-input')&&!validReferenceImageIdentity(contract.referenceImage))||
    (creationSourceStages(workflow.id).includes('library-binding')&&(!validLibrarySourceIdentity(contract.librarySource)||!contract.designSystem)))return {ok:false,message:'工作流缺少有效的本轮参考图或设计库来源身份。'};
  if(contract.multiPage&&!validMultiPageScope(contract.multiPage))return {ok:false,message:'多页面任务范围无效。'};
  const plan=createWorkflowValidationPlan(workflow,contract.multiPage);
  if(contract.validationPlan!==undefined && JSON.stringify(contract.validationPlan)!==JSON.stringify(plan))return {ok:false,message:'工作流验收计划已变化或被修改，请重新生成候选。'};
  return {ok:true,plan,workflow};
}
export function evaluateWorkflowValidation(plan:WorkflowValidationPlan,evidence:Partial<Record<WorkflowValidationStage,Omit<WorkflowStageCheck,'id'>>>):WorkflowValidationReport {
  const checks=plan.stages.map(id=>({id,status:evidence[id]?.status??'blocked',message:evidence[id]?.message??`必要阶段 ${id} 没有可执行检查证据。`}));
  return {plan,status:checks.some(c=>c.status==='blocked')?'blocked':checks.some(c=>c.status==='pending')?'pending':'ready',checks};
}
export function isWorkflowValidationReport(value:unknown):value is WorkflowValidationReport {
  const r=value as WorkflowValidationReport|undefined;
  return Boolean(r && ['ready','blocked','pending'].includes(r.status) && r.plan?.version===1 && typeof r.plan.workflowId==='string' && typeof r.plan.fingerprint==='string' &&
    Array.isArray(r.plan.stages) && r.plan.stages.length<=16 && r.plan.stages.every(s=>typeof s==='string') && new Set(r.plan.stages).size===r.plan.stages.length &&
    Array.isArray(r.checks) && r.checks.length===r.plan.stages.length && r.checks.every((c,index)=>c && c.id===r.plan.stages[index] &&
      ['passed','blocked','pending'].includes(c.status) && typeof c.message==='string') &&
    r.status===(r.checks.some(c=>c.status==='blocked')?'blocked':r.checks.some(c=>c.status==='pending')?'pending':'ready'));
}

/** Recompute structure authorization against the actual baseline; stored model diagnostics are never proof. */
export function inspectWorkflowStructure(contract:DesignTaskContract,baseline:string,html:string,policy:MobileNavigationPolicy):{passed:boolean;message:string} {
  const before=normalizeMobileNavigation(baseline,policy).html,after=normalizeMobileNavigation(html,policy).html;
  if(contract.operation==='restyle'){
    const diff=compareStructure(before,after);return {passed:diff.ok,message:diff.reason??'纯润色元素树检查通过。'};
  }
  const scoped=contract.elementNid?[contract.elementNid]:contract.allowedChanges.length&&contract.allowedChanges.every(c=>c.startsWith('element:'))?contract.allowedChanges.map(c=>c.slice(8)):[];
  if(scoped.length){
    const original=parseHtmlCopy(before),candidate=parseHtmlCopy(after);
    const originalRoots:Element[]=[],candidateRoots:Element[]=[];
    for(const nid of [...new Set(scoped)]){
      const find=(doc:Document)=>Array.from(doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid);
      const a=find(original.doc),b=find(candidate.doc);
      if(a.length!==1||b.length!==1)return {passed:false,message:'授权根节点缺失或不唯一，无法核对局部范围。'};
      originalRoots.push(a[0]);candidateRoots.push(b[0]);
    }
    originalRoots.filter(el=>!originalRoots.some(parent=>parent!==el&&parent.contains(el))).forEach(el=>el.remove());
    candidateRoots.filter(el=>!candidateRoots.some(parent=>parent!==el&&parent.contains(el))).forEach(el=>el.remove());
    const diff=compareStructure(original.serialize(),candidate.serialize());
    const passed=diff.ok&&diff.textChanged===0&&JSON.stringify(nodeContract(original.doc.documentElement))===JSON.stringify(nodeContract(candidate.doc.documentElement));
    return {passed,message:passed?'修改限定在授权节点范围内。':'结果改变了授权范围外的结构、文案或属性。'};
  }
  const input={rawPrompt:contract.request,activeScreenId:contract.target!.id,decision:{intent:'modify_screen' as const,targetScreenId:contract.target!.id,reason:'合同已裁决'}};
  const analysis=analyzePipelineIntent(input);
  const check=checkStructureIntegrity({input,intent:'modify_screen',intentReason:'合同已裁决',hasExplicitStructuralChangeIntent:analysis.hasExplicitStructuralChangeIntent,
    targetScreen:{id:contract.target!.id,name:contract.target!.name,htmlContent:before,isSkeleton:false},referencedScreens:[],unmatchedMentions:[],
    activeRules:[],activeDecisions:[],assembledMessages:[],estimatedChars:0,isContextTrimmed:false,warnings:[]},after);
  return {passed:check.passed,message:check.reason??'页面结构符合本次授权。'};
}
