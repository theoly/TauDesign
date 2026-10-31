import type {DesignExecutionRecord} from './designExecutionRecord';
import {sameRecordedHtml,taskProvenanceIssue} from './taskProvenance';
import {isQualityReport} from './evidenceSchema';

/** Local text repair retains generation provenance, never a new rule dispatch. */
export function draftExecutionIssue(record:DesignExecutionRecord|undefined,resultHtml?:string):string|undefined {
 if(record?.draftRepair===undefined)return;
 const r=record.draftRepair;
 if(!r||record.source!=='local-edit'||record.rawResponse!==''||record.continuationCount!==0||typeof record.completeHtml!=='string'||
  typeof r.sourceFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(r.sourceFingerprint)||
  (r.sourceTaskId!==undefined&&(typeof r.sourceTaskId!=='string'||!r.sourceTaskId))||
  !Array.isArray(r.confirmedLabels)||!r.confirmedLabels.length||r.confirmedLabels.length>8||
  r.confirmedLabels.some(l=>!l||typeof l.nid!=='string'||!l.nid||typeof l.text!=='string'||!l.text.trim()||l.text.length>160)||
  new Set(r.confirmedLabels.map(l=>l.nid)).size!==r.confirmedLabels.length||
  (record.qualityReport!==undefined&&!isQualityReport(record.qualityReport))||
  (resultHtml!==undefined&&!sameRecordedHtml(record.completeHtml,resultHtml)))return '本地草稿修复记录无效。';
 for(const [source,kind] of [[r.historicalGuidanceSource,'rules'],[r.historicalPageTaskSource,'plan']] as const){
  if(source===undefined)continue;
  if(taskProvenanceIssue(source)||source.taskId!==r.sourceTaskId||(kind==='rules'?!source.designGuidance:!source.pageTaskPlan))return '草稿修复的历史来源无效或不属于原生成任务。';
 }
 if(r.historicalGuidanceSource&&r.historicalPageTaskSource&&r.historicalGuidanceSource.request!==r.historicalPageTaskSource.request)return '草稿修复的原规则与业务规划来源不一致。';
 return undefined;
}
