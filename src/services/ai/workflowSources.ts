import type {DesignTaskContract,DesignLibrarySourceIdentity,ReferenceImageIdentity} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import type {DesignLibraryBinding,ComponentDefinition} from '../../types/project';
import type {EngineMessage} from './engine/core/types';
import type {WorkflowStageCheck} from './workflowValidation';
import type {WorkflowValidationStage} from './workflowCatalog';
import {validReferenceRegion,type ImageAttachment} from '../../types/referenceImage';

/** Mandatory by executable route identity, independent of editable descriptor stage lists. */
export function creationSourceStages(id:string):WorkflowValidationStage[]{
  return id==='create-page-from-reference-library'?['reference-input','library-binding']:id==='create-page-from-reference'?['reference-input']:id==='create-page-from-library'?['library-binding']:[];
}
const fingerprint=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}$/.test(value);
export function validReferenceImageIdentity(value:unknown):value is ReferenceImageIdentity{
  const v=value as ReferenceImageIdentity|undefined;
  return Boolean(v&&typeof v.name==='string'&&v.name.trim()&&v.name.length<=200&&fingerprint(v.fingerprint)&&(v.region===undefined||validReferenceRegion(v.region)));
}
export function validLibrarySourceIdentity(value:unknown):value is DesignLibrarySourceIdentity{
  const v=value as DesignLibrarySourceIdentity|undefined;
  return Boolean(v&&['project_copy','pinned_reference'].includes(v.mode)&&typeof v.sourceProjectId==='string'&&v.sourceProjectId.trim()&&
    typeof v.sourceFingerprint==='string'&&v.sourceFingerprint&&Number.isInteger(v.sourceTokenVersion)&&v.sourceTokenVersion>0&&fingerprint(v.bindingFingerprint));
}
export function referenceImageIdentity(attachment:ImageAttachment):Pick<ReferenceImageIdentity,'name'|'fingerprint'|'region'>{
  if(typeof attachment.name!=='string'||!attachment.name.trim()||typeof attachment.dataUrl!=='string'||!/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(attachment.dataUrl))throw new Error('参考图片内容无效或格式不受支持，请重新上传 PNG、JPEG、WebP 或 GIF 图片。');
  if(attachment.region!==undefined&&!validReferenceRegion(attachment.region))throw Error('参考图选区信息无效，请重新选择。');
  return {name:attachment.name.trim().slice(0,200),fingerprint:contentFingerprint(attachment.dataUrl),...(attachment.region?{region:structuredClone(attachment.region)}:{})};
}
/** Use only the outgoing current-turn user message; older conversation images never count. */
export function recordReferenceInput(contract:DesignTaskContract,messages:EngineMessage[],providerId:string,model:string):string|undefined{
  const plannedPageModification=contract.operation==='modify'&&!contract.elementNid&&Boolean(contract.pageTaskPlan&&contract.referenceImage);
  if(!creationSourceStages(contract.workflowId).includes('reference-input')&&!plannedPageModification)return;
  const image=contract.referenceImage,last=messages[messages.length-1];
  if(!validReferenceImageIdentity(image)||!last||last.role!=='user'||!last.imageUrl||typeof last.content!=='string'||!last.content.includes(contract.request))return '本轮参考图片未进入实际模型消息，未执行生成。';
  try{if(referenceImageIdentity({name:image.name,dataUrl:last.imageUrl}).fingerprint!==image.fingerprint)return '本轮实际图片与任务参考图身份不匹配，未执行生成。';}
  catch(error){return error instanceof Error?error.message:'参考图片消息无效。';}
  image.inputReceipt={version:1,checkedAt:Date.now(),imageFingerprint:image.fingerprint,requestFingerprint:contentFingerprint(contract.request),
    messageFingerprint:contentFingerprint(last.content),providerId,model};
}
export function inspectReferenceInput(contract:DesignTaskContract):Omit<WorkflowStageCheck,'id'>{
  const image=contract.referenceImage,r=image?.inputReceipt;
  const ok=validReferenceImageIdentity(image)&&r?.version===1&&Number.isFinite(r.checkedAt)&&r.checkedAt>=0&&
    r.imageFingerprint===image.fingerprint&&r.requestFingerprint===contentFingerprint(contract.request)&&fingerprint(r.messageFingerprint)&&
    typeof r.providerId==='string'&&Boolean(r.providerId)&&typeof r.model==='string'&&Boolean(r.model);
  return {status:ok?'passed':'blocked',message:ok?r?.reusedFromTaskId?`本次仅修复草稿文字，沿用生成任务 ${r.reusedFromTaskId} 的参考图输入回执；未重新发送图片，不代表视觉相似度。`:`本轮图片「${image!.name}」已进入模型消息，指纹 ${image!.fingerprint}；此项仅验证输入，不代表视觉相似度。`:'缺少当前请求与参考图片一致的实际输入回执，请重新生成。'};
}

export function inspectCreationSources(contract:DesignTaskContract,state:{designLibraryBinding?:DesignLibraryBinding;components:Record<string,ComponentDefinition>},html:string):{
  checks:Partial<Record<WorkflowValidationStage,Omit<WorkflowStageCheck,'id'>>>;issue?:string;
}{
  const stages=creationSourceStages(contract.workflowId),checks:Partial<Record<WorkflowValidationStage,Omit<WorkflowStageCheck,'id'>>>={};
  const image=Boolean(contract.referenceImage),library=Boolean(state.designLibraryBinding);
  const expected=image?(library?'create-page-from-reference-library':'create-page-from-reference'):library?'create-page-from-library':'create-page';
  if(contract.workflowId!==expected)return {checks,issue:'创建工作流与当前参考图或设计库来源不匹配，请重新生成。'};
  if(stages.includes('reference-input')){
    const check=inspectReferenceInput(contract);checks['reference-input']=check;if(check.status!=='passed')return {checks,issue:check.message};
  }
  if(stages.includes('library-binding')){
    const binding=state.designLibraryBinding,source=contract.librarySource;
    let issue:string|undefined;
    if(!validLibrarySourceIdentity(source)||!binding||source.mode!==binding.mode||source.sourceProjectId!==binding.sourceProjectId||
      source.sourceFingerprint!==binding.sourceFingerprint||source.sourceTokenVersion!==binding.sourceTokenVersion||source.bindingFingerprint!==contentFingerprint(JSON.stringify(binding)))issue='设计库来源、模式或固定版本已变化，请基于当前绑定重新生成。';
    else{
      const doc=new DOMParser().parseFromString(html,'text/html');
      for(const node of Array.from(doc.querySelectorAll('[data-component-id]'))){
        const id=node.getAttribute('data-component-id')!,component=state.components[id],version=node.getAttribute('data-component-version');
        if(!id||!component){issue=`页面引用了当前设计库工程不存在的组件 ${id||'（空 ID）'}。`;break;}
        if(version!==null&&(!/^\d+$/.test(version)||Number(version)!==(component.version??1))){issue=`组件「${component.name}」的版本声明与当前定义不一致。`;break;}
      }
    }
    checks['library-binding']={status:issue?'blocked':'passed',message:issue??`当前${binding!.mode==='pinned_reference'?'固定版本只读参考':'项目副本'}身份匹配，页面组件引用及声明版本有效。`};
    if(issue)return {checks,issue};
  }else if(contract.librarySource)return {checks,issue:'创建合同包含与工作流不匹配的设计库来源。'};
  return {checks};
}
