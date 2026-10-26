import type {Screen} from '../../types/project';
import type {ProjectStorage} from '../storage/projectStorage';
import {contentFingerprint,type DesignTaskContract} from './designWorkflow';
import {prepareNewPage,pageCreationContext,type PageCreationState,type PreparedNewPage} from './pageCreationValidation';
import {proposeStyleRepair,type PageRepairModel} from './controlledStyleRepair';
export type {PageRepairModel} from './controlledStyleRepair';

/** New-page delivery retains all gates after the common style-only proposal. */
export async function prepareNewPageWithRepair(state:PageCreationState,screen:Screen,contract:DesignTaskContract,storage:ProjectStorage,
 options:{isCurrent:()=>boolean;signal?:AbortSignal;repair?:PageRepairModel}):Promise<PreparedNewPage> {
 const snapshot=structuredClone({id:state.id,folderPath:state.folderPath,settings:state.settings,designSystem:state.designSystem,designSystemOrigin:state.designSystemOrigin,
 designLibraryBinding:state.designLibraryBinding,components:state.components,assets:state.assets,screens:state.screens,overrides:state.overrides,decisions:state.decisions,projectDocuments:state.projectDocuments});
 const task=structuredClone(contract),current=()=>!options.signal?.aborted&&options.isCurrent();
 const first=await prepareNewPage(snapshot,structuredClone(screen),task,storage,{isCurrent:current,signal:options.signal});
 if(first.status==='ready'||!first.renderFailure||!options.repair||!current()||task.operation!=='create')return first;
 const {screen:normalized,render}=first.renderFailure;
 const proposal=await proposeStyleRepair({state:snapshot,html:normalized.htmlContent,contract:task,render,context:pageCreationContext(snapshot)},
 {...options,model:{...options.repair,provider:structuredClone(options.repair.provider)}});
 if(proposal.status==='skipped')return first;
 if(proposal.status!=='proposed')return {status:'blocked',message:proposal.message,repair:proposal.repair};
 let record=proposal.record;
 try{
   options.repair.onPhase?.('verifying');
   const verified=await prepareNewPage(snapshot,{...normalized,htmlContent:proposal.html},task,storage,{isCurrent:current,signal:options.signal});
   if(!current())throw Error('修复已取消或工程上下文已变化，未加入页面。');
   if(verified.status!=='ready')throw Error(`修复后完整复验未通过：${verified.message}`);
   const previous=new Set(render.findings.map(f=>JSON.stringify([f.code,f.nid,f.severity])));
   const introduced=verified.evidence.render.findings.find(f=>!previous.has(JSON.stringify([f.code,f.nid,f.severity])));
   if(introduced)throw Error(`修复引入了新的渲染问题：${introduced.message}`);
   record={...record,status:'repaired',afterHtmlFingerprint:contentFingerprint(verified.screen.htmlContent),checkedAt:Date.now(),message:'已完成一次控件样式修复，源码、实体、资源和新的iframe检查全部通过。'};
   return {...verified,evidence:{...verified.evidence,repair:record}};
 }catch(error){
   const message=error instanceof Error?error.message:'修复失败。';
   return {status:'blocked',message:`已尝试一次受控修复，结果未应用：${message}`,repair:{...record,status:options.signal?.aborted?'cancelled':'blocked',checkedAt:Date.now(),message}};
 }
}
