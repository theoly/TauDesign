import type {AIEngineCore,StreamTextOptions} from '../engine/core/types';
import type {DesignTaskContract} from '../designWorkflow';
import {ruleFingerprint,renderRule} from './selector';
import type {RuleSelection} from './types';
import {validateRuleCatalog} from './validation';
import {getBaseCss} from '../../../styles/baseCss';
import {extractClassWhitelist} from '../../../utils/cssCompiler';
import {workflowRulePolicy,type DesignRuleProtocol} from '../workflowCatalog';
import {taskRuleSafetyIssue,type RuleEvidencePurpose} from './safety';

export interface GuidanceRequestReceipt {
  requestId:string;parentTaskId:string;providerId:string;model:string;
  /** Optional for old text-only receipts. This is the core API, not a wire format claim. */
  outputProtocol?:'stream-text'|'json-object';
  messageFingerprint:string;injectedRuleIds:string[];
  status:'assembled'|'dispatched'|'completed'|'failed'|'cancelled';
  /** Only a failed analysis JSON parse may be superseded by a later schema-valid correction. */
  supersededByRequestId?:string;
}
export interface DesignGuidancePacket {
  version:1;bindingFingerprint:string;selection:RuleSelection;
  protocol?:DesignRuleProtocol;
  /** Application AIEngineCore semantic boundary, not provider acknowledgement. */
  requests:GuidanceRequestReceipt[];
}
export function guidanceBinding(contract:DesignTaskContract,protocol?:DesignRuleProtocol):string {
  return ruleFingerprint([contract.taskId,contract.request,contract.workflowId,contract.operation,contract.strategy,contract.target,
    contract.elementNid,contract.device,contract.designSystem,contract.designSystemOrigin,contract.librarySource,
    contract.allowedChanges,contract.protectedNids,contract.knowledgeSources,contract.knowledgeFingerprint,contract.generationMode,contract.multiPage,
    contract.referenceImage?[contract.referenceImage.name,contract.referenceImage.fingerprint,contract.referenceImage.region]:undefined,
    ...(contract.pageTaskPlan?['page-task-v1',contract.pageTaskPlan]:[]),...(protocol?['rule-protocol-v1',protocol]:[])]);
}
export function makeGuidancePacket(contract:DesignTaskContract,selection:RuleSelection,protocol?:DesignRuleProtocol):DesignGuidancePacket {
  return {version:1,bindingFingerprint:guidanceBinding(contract,protocol),selection:structuredClone(selection),requests:[],...(protocol?{protocol}:{})};
}
/** Reuse the existing core/transport; record every continuation or section request. */
export function withGuidanceReceipts(core:AIEngineCore,contract:DesignTaskContract,packet:DesignGuidancePacket,namespace?:'style-repair'):AIEngineCore {
  const begin=(options:StreamTextOptions,outputProtocol:NonNullable<GuidanceRequestReceipt['outputProtocol']>)=>{
      if(options.signal?.aborted)throw new DOMException('生成已取消','AbortError');
      const safety=taskRuleSafetyIssue(contract);if(safety)throw Error(safety);
      if(packet.requests.length>=64)throw Error('规则请求回执超过安全上限，未继续发送。');
      const system=options.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
      const receipt:GuidanceRequestReceipt={requestId:`${contract.taskId}:${namespace?`${namespace}:`:''}request-${packet.requests.length+1}`,parentTaskId:contract.taskId,
        providerId:options.provider.id,model:options.model,
        messageFingerprint:ruleFingerprint({model:options.model,providerId:options.provider.id,maxTokens:options.maxTokens,jsonSchema:options.jsonSchema,
          messages:options.messages.map(m=>({role:m.role,content:m.content,partial:m.partial,...(m.imageUrl?{imageFingerprint:ruleFingerprint(m.imageUrl)}:{})}))}),
        injectedRuleIds:packet.selection.selected.filter(s=>system.includes(renderRule(s.rule))).map(s=>s.rule.id),outputProtocol,status:'assembled'};
      packet.requests.push(receipt);
      const abort=()=>{if(receipt.status==='assembled'||receipt.status==='dispatched')receipt.status='cancelled';};
      options.signal?.addEventListener('abort',abort,{once:true});
      const settle=(status:'completed'|'failed')=>{
        options.signal?.removeEventListener('abort',abort);
        if(receipt.status==='assembled'||receipt.status==='dispatched')receipt.status=options.signal?.aborted?'cancelled':status;
      };
      return {receipt,abort,settle,dispatch:()=>{if(receipt.status!=='cancelled')receipt.status='dispatched';}};
  };
  return {
    async generateObject<T>(schema:Record<string,unknown>,options:Omit<StreamTextOptions,'jsonSchema'>):Promise<T>{
      const state=begin({...options,jsonSchema:schema},'json-object');
      try {
        // Keep the core's existing JSON parsing, finish-reason checks and transport.
        const pending=core.generateObject<T>(schema,options);
        state.dispatch();
        const result=await pending;
        if(options.signal?.aborted)throw new DOMException('生成已取消','AbortError');
        state.settle('completed');
        const safety=taskRuleSafetyIssue(contract);if(safety)throw Error(safety);
        return result;
      } catch(error){state.settle('failed');throw error;}
    },
    streamText(options:StreamTextOptions){
      const {abort,settle,dispatch}=begin(options,'stream-text');
      try {
        const stream=core.streamText(options);
        dispatch();
        const completed=Promise.all([stream.textPromise,stream.reasoningPromise,stream.usagePromise,stream.recoveryPromise,stream.finishReasonPromise]);
        return {...stream,abort:()=>{abort();stream.abort();},textPromise:completed.then(([text])=>{settle('completed');const safety=taskRuleSafetyIssue(contract);if(safety)throw Error(safety);return text;},error=>{settle('failed');throw error;})};
      } catch(error){settle('failed');throw error;}
    }
  };
}

/** Restored evidence uses the frozen snapshot, not the current catalog. */
export function guidancePacketIssue(contract:DesignTaskContract,requireCompleted=true,purpose:RuleEvidencePurpose='execute'):string|undefined {
  const packet=contract.designGuidance;
  if(packet===undefined)return purpose==='execute'?taskRuleSafetyIssue(contract):undefined;
  const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}$/.test(v);
  try {
    if(!packet||JSON.stringify(packet).length>24000||packet.version!==1||packet.bindingFingerprint!==guidanceBinding(contract,packet.protocol))return '设计规则与当前任务范围不匹配。';
    if(packet.protocol!==undefined&&!workflowRulePolicy(contract.workflowId).protocols.includes(packet.protocol))return '工作流不支持此设计规则输出协议。';
    const selection=packet.selection;
    if(!selection||selection.version!==1||![1,2].includes(selection.attempts)||!hash(selection.catalogFingerprint)||!hash(selection.queryFingerprint)||
      !Array.isArray(selection.selected)||selection.selected.length>3||!Array.isArray(selection.omitted)||selection.omitted.length>200||
      !['none','excluded-workflow','unknown-target','no-match','budget'].includes(selection.fallback)||typeof selection.body!=='string')return '设计规则选择快照无效。';
    const ids=selection.selected.map(s=>s.rule?.id);
    if(validateRuleCatalog(selection.selected.map(s=>s.rule),device=>extractClassWhitelist(getBaseCss(device)),{allowExternalConflicts:true,purpose:purpose==='history'?'history':'catalog'}).length)return '设计规则快照结构无效。';
    if(!['create','modify',...(packet.protocol?['restyle','analyze']:[])].includes(contract.operation)||selection.selected.some(s=>
      (s.rule.scope.operations.length&&!s.rule.scope.operations.includes(contract.operation))||
      (s.rule.scope.devices.length&&!s.rule.scope.devices.includes(contract.device.profile))))return '设计规则不适用于当前操作或设备。';
    if(new Set(ids).size!==ids.length||selection.selected.some(s=>!s.rule||!s.rule.id||s.rule.status==='deprecated'||s.fingerprint!==ruleFingerprint(s.rule)||typeof s.reason!=='string')||
      selection.body!==selection.selected.map(s=>renderRule(s.rule)).join('')||(ids.length>0)!==(selection.fallback==='none')||
      selection.omitted.some(s=>!s||typeof s.id!=='string'||!['budget','limit'].includes(s.reason)))return '设计规则正文或身份已变化。';
    if(selection.selected.some(s=>s.rule.conflictsWith.some(id=>ids.includes(id))))return '设计规则选择包含冲突。';
    if(!Array.isArray(packet.requests)||packet.requests.length>64||new Set(packet.requests.map(r=>r.requestId)).size!==packet.requests.length||packet.requests.some(r=>
      !r||typeof r.requestId!=='string'||!r.requestId||r.parentTaskId!==contract.taskId||typeof r.providerId!=='string'||!r.providerId||typeof r.model!=='string'||!r.model||!hash(r.messageFingerprint)||
      (r.outputProtocol!==undefined&&!['stream-text','json-object'].includes(r.outputProtocol))||
      !Array.isArray(r.injectedRuleIds)||new Set(r.injectedRuleIds).size!==r.injectedRuleIds.length||r.injectedRuleIds.some(id=>!ids.includes(id))||
      !['assembled','dispatched','completed','failed','cancelled'].includes(r.status)))return '设计规则请求回执无效。';
    if(packet.requests.some((r,index)=>{
      if(r.supersededByRequestId===undefined)return false;
      const next=packet.requests.findIndex(candidate=>candidate.requestId===r.supersededByRequestId),replacement=packet.requests[next];
      return contract.workflowId!=='review-page-modification'||packet.protocol!=='analysis-json'||r.status!=='failed'||r.outputProtocol!=='json-object'||
        typeof r.supersededByRequestId!=='string'||next<=index||replacement?.status!=='completed'||replacement.outputProtocol!=='json-object'||replacement.providerId!==r.providerId||replacement.model!==r.model;
    }))return '格式纠正回执的替代关系无效。';
    if(requireCompleted&&(!packet.requests.length||packet.requests.some(r=>(r.status!=='completed'&&!(r.status==='failed'&&r.supersededByRequestId))||ids.some(id=>!r.injectedRuleIds.includes(id)))))return '缺少完整且与实际请求一致的设计规则输入回执。';
  } catch {return '设计规则回执无法读取。';}
  return purpose==='execute'?taskRuleSafetyIssue(contract):undefined;
}
