import {isMultiPageDelivery} from '../../services/ai/multiPageContract';
import React,{useMemo} from 'react';
import {DesignGuidanceCard,RepairGuidanceSource} from '../chat/DesignGuidanceCard';
import {HistoricalDraftSource} from '../chat/HistoricalDraftSource';
import type {Screen} from '../../types/project';
import {createdPageFingerprint,isPageCreationEvidence} from '../../services/ai/pageCreationValidation';
import {PageTaskPlanCard} from '../chat/PageTaskPlanCard';
import {PageTaskCoverageCard} from '../chat/PageTaskCoverageCard';
import {useLocaleStore, useT} from '../../stores/useLocaleStore';
import type {MessageKey} from '../../i18n';

const STAGE_KEYS:Record<string,MessageKey>={'design-entities':'inspector.pageCreationStageDesignEntities','multi-page-scope':'inspector.pageCreationStageMultiPageScope','page-plan-schema':'inspector.pageCreationStagePagePlanSchema','reference-input':'inspector.pageCreationStageReferenceInput','library-binding':'inspector.pageCreationStageLibraryBinding','source-safety':'inspector.pageCreationStageSourceSafety',quality:'inspector.pageCreationStageQuality','asset-references':'inspector.pageCreationStageAssetReferences','asset-files':'inspector.pageCreationStageAssetFiles',render:'inspector.pageCreationStageRender',structure:'inspector.pageCreationStageStructure','analysis-schema':'inspector.pageCreationStageAnalysisSchema','import-preview':'inspector.pageCreationStageImportPreview'};

export function PageCreationEvidencePanel({screen}:{screen:Screen}) {
  const t=useT();
  const locale=useLocaleStore(s=>s.locale);
  const checkStatus=useMemo(()=>({passed:t('inspector.pageCreationCheckPassed'),pending:t('inspector.pageCreationCheckPending'),failed:t('inspector.pageCreationCheckFailed')}),[locale,t]);
  const raw=screen.metadata?.creationEvidence;
  if(raw===undefined)return null;
  if(!isPageCreationEvidence(raw))return <p className="rounded-lg border border-slate-800 p-3 text-xs text-amber-300">{t('inspector.pageCreationCorrupted')}</p>;
  const changed=createdPageFingerprint(screen)!==raw.pageFingerprint;
  const scope=raw.contract.multiPage,candidate=screen.metadata?.multiPageDelivery;
  const delivery=isMultiPageDelivery(candidate)&&scope?.planId===candidate.planId&&scope.planFingerprint===candidate.planFingerprint&&scope.kind===candidate.kind&&candidate.pages.some(p=>p.screenId===scope.screenId)?candidate:undefined;
  const variants=delivery?.kind==='variants',unit=variants?t('inspector.pageCreationVariantUnit'):t('inspector.pageCreationPageUnit');
  const historicalPage=delivery?.pages.find(p=>p.screenId===scope?.screenId);
  const stageLabel=(id:string)=>STAGE_KEYS[id]?t(STAGE_KEYS[id]):id;
  return <details className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
    <summary className="cursor-pointer font-medium text-slate-300">{t('inspector.pageCreationTitle')}</summary>
    <div className="mt-3 space-y-2 break-words text-slate-400">
      <DesignGuidanceCard contract={raw.contract} historical/>
      <HistoricalDraftSource execution={raw.execution}/>
      {raw.recovery&&<p className="break-all">{t('inspector.pageCreationRecovery',{rootTaskId:raw.recovery.rootTaskId,sourceTaskId:raw.recovery.sourceTaskId,sourceRootTaskId:raw.recovery.sourceRootTaskId})}</p>}
      <p>{t('inspector.pageCreationSnapshotHint')}{changed?` ${t('inspector.pageCreationContentChanged')}`:''}</p>
      <p>{new Date(raw.checkedAt).toLocaleString()} · {raw.contract.device?.profile} / {raw.contract.device?.frameWidth}px</p>
      <p>{delivery?.request??raw.contract.request}</p>
      <PageTaskPlanCard contract={raw.contract}/>
      {!changed&&<PageTaskCoverageCard contract={raw.contract} html={screen.htmlContent}/>}
      {delivery&&<><p>{t('inspector.pageCreationThisPage',{name:historicalPage!.name,index:delivery.pages.findIndex(p=>p.screenId===scope?.screenId)+1,total:delivery.pages.length,unit})}</p>
        <details><summary className="cursor-pointer">{raw.recovery?t('inspector.pageCreationRecoveryRequestSummary'):t('inspector.pageCreationLiveRequestSummary')}</summary><p className="mt-2 whitespace-pre-wrap">{raw.contract.request}</p></details></>}
      {raw.contract.referenceImage&&<p>{t('inspector.pageCreationReferenceImage',{name:raw.contract.referenceImage.name,fingerprint:raw.contract.referenceImage.fingerprint})}</p>}
      {raw.contract.librarySource&&<p>{t('inspector.pageCreationLibrarySource',{sourceProjectId:raw.contract.librarySource.sourceProjectId,mode:raw.contract.librarySource.mode==='pinned_reference'?t('inspector.pageCreationLibraryModePinned'):t('inspector.pageCreationLibraryModeCopy'),tokenVersion:raw.contract.librarySource.sourceTokenVersion,fingerprint:raw.contract.librarySource.sourceFingerprint})}</p>}
      <p className="break-all">{raw.workflow.plan.workflowId} · {raw.workflow.plan.fingerprint}</p>
      {raw.workflow.checks.map(check=><p key={check.id}>{stageLabel(check.id)}：{checkStatus[check.status as keyof typeof checkStatus]??check.status} · {check.message}</p>)}
      {screen.metadata?.multiPageDelivery!==undefined&&(delivery?<details><summary className="cursor-pointer">{variants?t('inspector.pageCreationVariantsPlan'):t('inspector.pageCreationMultiPagePlan')}</summary>
        <p>{t('inspector.pageCreationMultiPagePlanning',{attempts:delivery.planning.attempts,count:delivery.pages.length,unit,original:delivery.originalPageCount})}</p>
        <p>{delivery.request}</p>
        {delivery.pages.map(p=><p key={p.id} className="mt-1">{p.name}：{p.requirements}{p.links.length>0&&t('inspector.pageCreationPageLinks',{links:p.links.map(id=>delivery.pages.find(target=>target.id===id)!.name).join('、')})}</p>)}
      </details>:<p className="text-amber-300">{t('inspector.pageCreationCorruptedPlan')}</p>)}
      {raw.repair&&<details><summary className="cursor-pointer text-amber-300">{t('inspector.pageCreationRepairSummary')}</summary>
        <p>{t('inspector.pageCreationRepairScope')} {raw.repair.providerId} / {raw.repair.model}</p>
        <p className="break-all">{t('inspector.pageCreationRepairFingerprints',{before:raw.repair.beforeHtmlFingerprint??'',after:raw.repair.afterHtmlFingerprint??''})}</p>
        {raw.repair.initialRender.findings.filter(f=>f.severity==='error').map((f,i)=><p key={i}>{f.nid}：{f.message}</p>)}
        {raw.repair.operations.map((op,i)=><p key={i}>{op.nid} · {op.type} · {op.value}</p>)}
        {raw.repair.usage&&<p>{raw.repair.usageEstimated?t('inspector.pageCreationUsageEstimated',{input:raw.repair.usage.inputTokens,output:raw.repair.usage.outputTokens}):t('inspector.pageCreationUsageRecorded',{input:raw.repair.usage.inputTokens,output:raw.repair.usage.outputTokens})}</p>}
        <RepairGuidanceSource trace={raw.repair.guidance}/>
      </details>}
      <p>{t('inspector.pageCreationRenderSummary',{inspected:raw.render.inspected,count:raw.files.length})}</p>
      {!!raw.quality.findings.length&&<details><summary className="cursor-pointer">{t('inspector.pageCreationQualityFindings',{count:raw.quality.findings.length})}</summary>
        {raw.quality.findings.slice(0,20).map((finding,index)=><p key={index} className="mt-1 text-amber-300">{finding.message}</p>)}
      </details>}
    </div>
  </details>;
}