import type {StagedCandidateData} from '../storage/candidateRepository';
import type {CandidateDeliveryReport} from './candidateValidation';
import type {PageCreationState} from './pageCreationValidation';
import type {ProjectStorage} from '../storage/projectStorage';
import type {RenderedQualityReport} from '../../utils/renderedQuality';
import type {Screen} from '../../types/project';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {contentFingerprint} from './designWorkflow';
import {resolveWorkflowValidation,inspectWorkflowStructure} from './workflowValidation';
import {proposeStyleRepair,type PageRepairModel} from './controlledStyleRepair';
import type {PageRepairRecord} from './pageRepairRecord';
import {checkGenerationSourceSafety,checkGenerationQuality,qualitySummary} from './generationQuality';
import {formRuleScope} from './formBehaviorChanges';
import {inspectDesignEntities,designEntitySummary} from './designEntityValidation';
import {libraryReferenceIssue,verifyLibraryReferenceFiles} from './designLibraryReference';
import {inspectProjectAssetReferences,referencedProjectAssets,verifyProjectAssetFiles,screenForAssetAudit} from './projectAssetIntegrity';
import {PageRenderCheck} from './pageRenderCheck';
import {knowledgeFingerprint} from './projectKnowledge';
import {pageCreationContext} from './pageCreationValidation';

export interface CandidateRepairInput {
 state:PageCreationState;candidate:StagedCandidateData;delivery:CandidateDeliveryReport;render?:RenderedQualityReport;
}
/** Live checks and an explicit, narrow contract are required even when a historical report says passed. */
export function candidateRepairEligibility(input:CandidateRepairInput):{allowed:boolean;message:string;allowedNids:string[];protectedNids:string[]} {
 const {state,candidate,delivery,render}=input,task=candidate.workflowContract;
 const fail=(message:string)=>({allowed:false,message,allowedNids:[],protectedNids:[]});
 if(Object.hasOwn(candidate,'repair'))return fail('本候选已有修复尝试记录，不能重复请求；请重新发起修改。');
 if(!task||!resolveWorkflowValidation(task,'candidate').ok||!['modify','restyle'].includes(task.operation))return fail('缺少有效的旧页修改合同，不能自动推断修复范围。');
 if(candidate.projectFingerprint!==knowledgeFingerprint(state))return fail('候选对应的项目知识、Token 或手动样式已变化。');
 const baseline=state.screens[candidate.targetScreenId];
 if(!baseline||task.target?.id!==candidate.targetScreenId||task.target.baselineFingerprint!==contentFingerprint(baseline.htmlContent)||candidate.baselineFingerprint!==contentFingerprint(baseline.htmlContent))return fail('原页或任务基线已变化。');
 const required=['task','source','quality','structure','entities','assets','asset_files'] as const;
 if(required.some(id=>delivery.checks.find(c=>c.id===id)?.status!=='passed'))return fail('请先通过任务、源码、结构、设计实体和资源检查。');
 const errors=render?.findings.filter(f=>f.severity==='error')??[];
 if(render?.status!=='complete'||!errors.length||errors.length>8||errors.some(f=>!f.nid||!['render_action_zero_size','render_action_invisible_label'].includes(f.code)))return fail('当前实际渲染问题不属于可受控修复的控件尺寸或字号问题。');
 const doc=parseHtmlCopy(candidate.newHtml).doc;
 const nodes=Array.from(doc.body.querySelectorAll('[data-nid]'));
 const find=(nid:string)=>{const matches=nodes.filter(n=>n.getAttribute('data-nid')===nid);return matches.length===1?matches[0]:undefined;};
 const scope=task.allowedChanges.length&&task.allowedChanges.every(c=>c.startsWith('element:'))?task.allowedChanges.map(c=>c.slice(8)):[];
 const whole=task.allowedChanges.includes(`screen:${candidate.targetScreenId}`)||(task.workflowId==='restyle-page'&&task.allowedChanges.length===1&&task.allowedChanges[0]==='visual-style-only');
 if(!scope.length&&!whole)return fail('任务没有明确的节点或整页授权。');
 const focus=task.elementNid?find(task.elementNid):undefined;
 if(task.elementNid&&!focus)return fail('选中根节点缺失或不唯一。');
 const roots=scope.map(find);if(roots.some(r=>!r))return fail('授权根节点缺失或不唯一。');
 const local=candidate.executionRecord?.localEdit?.targetNids;
 const localRoots=local?.map(find);
 if(localRoots&&(!localRoots.length||localRoots.some(r=>!r)))return fail('原局部修改范围缺失或不唯一。');
 const protectedNids=[...new Set([...task.protectedNids,...Object.entries(state.overrides??{}).filter(([key])=>key.startsWith(`${baseline.id}:`)).map(([,ov])=>ov.nid)])];
 const allowedNids=[...new Set(errors.map(f=>f.nid!))];
 if(allowedNids.length>3)return fail('每次最多修复三个报错控件。');
 for(const nid of allowedNids){
  const el=find(nid);
  if(!el||!el.matches('button,a[href],[role="button"],input[type="submit"],input[type="button"]')||(!el.textContent?.trim()&&!el.querySelector('svg,img,.icon')&&!el.getAttribute('value')))return fail('报错目标缺失、不唯一或不是有内容的操作控件。');
  if((focus&&!focus.contains(el))||(scope.length&&!roots.some(r=>r!.contains(el)))||(localRoots&&!localRoots.some(r=>r!.contains(el))))return fail('报错控件位于本次局部修改授权之外。');
  if(protectedNids.some(p=>{const protectedNodes=nodes.filter(n=>n.getAttribute('data-nid')===p);return protectedNodes.some(n=>n.contains(el)||el.contains(n));}))return fail('控件、其祖先或内容包含手动样式/保护节点，请手动调整。');
 }
 return {allowed:true,message:'仅修复授权报错控件自身的尺寸、字号和内边距；最多一次请求，输出预算1800 Token。',allowedNids,protectedNids};
}
export type CandidateRepairResult={status:'ready';html:string;repair:PageRepairRecord;render:RenderedQualityReport}|{status:'blocked';message:string;repair?:PageRepairRecord};
/** Validates source, original contract, entities, actual files, exact L4 and a new independent iframe. No state writes. */
export async function repairCandidate(input:CandidateRepairInput,storage:ProjectStorage,options:{isCurrent:()=>boolean;signal?:AbortSignal;model:PageRepairModel;onAttempt?:(record:PageRepairRecord)=>Promise<void>}):Promise<CandidateRepairResult> {
 const eligibility=candidateRepairEligibility(input);if(!eligibility.allowed)return {status:'blocked',message:eligibility.message};
 const {state,candidate}=input,task=candidate.workflowContract!,baseline=state.screens[candidate.targetScreenId] as Screen;
 const current=()=>!options.signal?.aborted&&options.isCurrent();
 const guard=()=>{if(!current())throw Error('修复已取消或候选/工程上下文已变化。');};
 const policy={deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,designSystem:state.designSystem};
 const makeScreen=(html:string):Screen=>({...baseline,name:candidate.screenName,htmlContent:html,metadata:{...baseline.metadata,...(candidate.navigationTitle?{navigationTitle:candidate.navigationTitle}:{})}});
 const validate=async(html:string)=>{
  guard();const libraryIssue=libraryReferenceIssue(state);if(libraryIssue)throw Error(libraryIssue);
  const source=checkGenerationSourceSafety(html,policy);if(!source.passed)throw Error(qualitySummary(source));
  const quality=checkGenerationQuality(html,{...policy,baselineHtml:baseline.htmlContent,protectedNids:eligibility.protectedNids,modificationRequest:candidate.modificationRequest,formRuleRoots:formRuleScope(task)});if(!quality.passed)throw Error(qualitySummary(quality));
  const structure=inspectWorkflowStructure(task,baseline.htmlContent,html,policy);if(!structure.passed)throw Error(structure.message);
  const entities=inspectDesignEntities(html,{components:state.components,pageIds:Object.keys(state.screens),baselineHtml:baseline.htmlContent});if(!entities.passed)throw Error(designEntitySummary(entities));
  const screen=screenForAssetAudit(makeScreen(html),state.overrides??{}),assets=Object.values(state.assets);
  const references=inspectProjectAssetReferences([screen],assets);if(references.length)throw Error(references[0].message);
  const files=[...await verifyProjectAssetFiles(storage,referencedProjectAssets(screen,assets)),...await verifyLibraryReferenceFiles(storage,state)];
  guard();if(files.length)throw Error(files[0].message);
 };
 let receipt:PageRepairRecord|undefined;
 try{
  await validate(candidate.newHtml);
  const proposal=await proposeStyleRepair({state,html:candidate.newHtml,contract:task,render:input.render!,context:pageCreationContext(state)},
   {...options,allowedNids:eligibility.allowedNids,protectedNids:eligibility.protectedNids});
  if(proposal.status!=='proposed')return {status:'blocked',message:proposal.message,repair:proposal.repair};
  receipt=proposal.record;guard();options.model.onPhase?.('verifying');guard();await validate(proposal.html);
  const render=await PageRenderCheck.inspect({screen:makeScreen(proposal.html),settings:state.settings,designSystem:state.designSystem,assets:Object.values(state.assets),
   overrides:Object.fromEntries(Object.entries(state.overrides??{}).filter(([key])=>key.startsWith(`${baseline.id}:`)))},storage,{signal:options.signal});
  guard();if(render.status!=='complete'||render.findings.some(f=>f.severity==='error'))throw Error(render.findings.find(f=>f.severity==='error')?.message??render.reason??'实际渲染复验未完整通过。');
  const previous=new Set(input.render!.findings.map(f=>JSON.stringify([f.code,f.nid,f.severity])));
  const introduced=render.findings.find(f=>!previous.has(JSON.stringify([f.code,f.nid,f.severity])));if(introduced)throw Error(`修复引入新的渲染问题：${introduced.message}`);
  await validate(proposal.html);guard();
  return {status:'ready',html:proposal.html,render,repair:{...receipt,status:'repaired',checkedAt:Date.now(),message:'一次控件样式修复完成；全部独立复验通过，仍需采纳候选。'}};
 }catch(error){
  const message=error instanceof Error?error.message:'修复失败。';
  return {status:'blocked',message,repair:receipt?{...receipt,status:options.signal?.aborted?'cancelled':'blocked',checkedAt:Date.now(),message}:undefined};
 }
}
