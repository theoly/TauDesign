import type {RenderedQualityReport} from '../../utils/renderedQuality';
import type {TokenUsage} from './engine/core/types';
import {isRepairGuidanceTrace,type RepairGuidanceTrace} from './designKnowledge/repairTrace';

export interface PageRepairOperation {nid:string;type:'set_styles'|'remove_styles';value:string}
export interface PageRepairRecord {
  version:1;attempts:1;status:'repaired'|'blocked'|'cancelled';checkedAt:number;
  contextFingerprint:string;beforeHtmlFingerprint:string;afterHtmlFingerprint?:string;
  providerId:string;model:string;requestFingerprint:string;initialRender:RenderedQualityReport;
  operations:PageRepairOperation[];usage?:TokenUsage;usageEstimated?:boolean;message?:string;
  guidance?:RepairGuidanceTrace;
}
export function isPageRepairRecord(value:unknown):value is PageRepairRecord {
  const r=value as PageRepairRecord|undefined,hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}$/.test(v);
  return Boolean(r&&r.version===1&&r.attempts===1&&['repaired','blocked','cancelled'].includes(r.status)&&Number.isFinite(r.checkedAt)&&
    hash(r.contextFingerprint)&&hash(r.beforeHtmlFingerprint)&&hash(r.requestFingerprint)&&
    (r.afterHtmlFingerprint===undefined||hash(r.afterHtmlFingerprint))&&(r.status!=='repaired'||r.afterHtmlFingerprint)&&
    typeof r.providerId==='string'&&r.providerId&&typeof r.model==='string'&&r.model&&
    r.initialRender?.status==='complete'&&Number.isFinite(r.initialRender.inspected)&&Array.isArray(r.initialRender.findings)&&
    r.initialRender.findings.every(f=>f&&typeof f.code==='string'&&typeof f.message==='string'&&typeof f.actual==='string'&&typeof f.expected==='string'&&['error','warning'].includes(f.severity)&&(f.nid===undefined||typeof f.nid==='string'))&&
    Array.isArray(r.operations)&&r.operations.length<=8&&(r.status!=='repaired'||r.operations.length>0)&&r.operations.every(op=>op&&typeof op.nid==='string'&&op.nid&&['set_styles','remove_styles'].includes(op.type)&&typeof op.value==='string'&&op.value.length<=512)&&
    (r.usage===undefined||[r.usage.inputTokens,r.usage.outputTokens].every(n=>Number.isFinite(n)&&n>=0))&&
    (r.usageEstimated===undefined||typeof r.usageEstimated==='boolean')&&(r.message===undefined||typeof r.message==='string')&&
    (r.guidance===undefined||(isRepairGuidanceTrace(r.guidance,r.status==='repaired')&&r.guidance.requests.every(request=>request.providerId===r.providerId&&request.model===r.model))));
}
