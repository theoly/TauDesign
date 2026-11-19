import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import {DesignGuidanceCard} from '../chat/DesignGuidanceCard';
import React,{useEffect,useMemo,useState} from 'react';
import type {Screen} from '../../types/project';
import {contentFingerprint} from '../../services/ai/designWorkflow';
import {RestyleDeliveryRepository,restylePagePreviewId,type RestyleDeliveryRecord} from '../../services/storage/restyleDeliveryRepository';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {StoredPagePreview} from '../canvas/StoredPagePreview';
import {VisualEvidencePanel} from './VisualEvidencePanel';
import {useLocaleStore, useT} from '../../stores/useLocaleStore';

function PageVersion({record,index,projectId,folderPath}: {record:RestyleDeliveryRecord;index:number;projectId:string;folderPath?:string}) {
  const t=useT();
  const [open,setOpen]=useState(false),page=record.pages[index];
  return <details onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}} className="rounded border border-slate-800 p-2">
    <summary className="cursor-pointer text-slate-400">{t('inspector.deliveryPageVersionSummary',{name:page.after.name})}</summary>
    <StoredPagePreview preview={page.preview} projectId={projectId} folderPath={folderPath} owner={{kind:'delivery',id:restylePagePreviewId(record.id,index)}}
      name={t('inspector.deliveryPagePreviewName',{name:page.after.name})} active={open}/>
    <p className="mt-2 text-slate-500">{t('inspector.deliveryBeforeShort')}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{page.before.htmlContent.slice(0,10000)}</pre>
    <p className="mt-2 text-slate-500">{t('inspector.deliveryAfterShort')}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{page.after.htmlContent.slice(0,10000)}</pre>
    <p className="text-[10px] text-slate-600">{t('inspector.deliveryRestyleCodeTruncation')}</p>
    {record.status==='applied'&&<VisualEvidencePanel projectId={projectId} folderPath={folderPath} kind="restyle" eventId={record.id} screenId={page.after.id}/>}
  </details>;
}
export function RestyleDeliveryHistoryPanel({projectId,folderPath,screen,revision,notice}: {
  projectId:string;folderPath?:string;screen?:Screen;revision:number;notice?:string|null;
}) {
  const t=useT();
  const locale=useLocaleStore(s=>s.locale);
  const statuses=useMemo(()=>({prepared:t('inspector.deliveryStatusPrepared'),applied:t('inspector.deliveryStatusApplied'),aborted:t('inspector.deliveryStatusAborted')}),[locale,t]);
  const [open,setOpen]=useState(false),[limit,setLimit]=useState(10),[refresh,setRefresh]=useState(0);
  const [state,setState]=useState<{key:string;records:RestyleDeliveryRecord[];invalidFiles:number;hasMore:boolean;error?:string}>();
  const key=JSON.stringify([projectId,folderPath,screen?.id,revision,limit,refresh]);
  const current=state?.key===key ? state : undefined;
  useEffect(()=>{setLimit(10);},[projectId,folderPath,screen?.id]);
  useEffect(()=>{
    if(!open)return;let active=true;
    void new RestyleDeliveryRepository(createProjectStorage(projectId,folderPath),projectId).list({screenId:screen?.id,limit})
      .then(result=>{if(active)setState({key,...result});})
      .catch(()=>{if(active)setState({key,records:[],invalidFiles:0,hasMore:false,error:t('inspector.deliveryRestyleReadError')});});
    return()=>{active=false;};
  },[key,open]);
  return <details className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px]" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
    <summary className="cursor-pointer font-semibold text-slate-300">{t('inspector.deliveryRestyleTitle')}</summary>
    {open&&<div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2"><p className="min-w-0 flex-1 text-slate-500">{t('inspector.deliveryRestyleDisclaimer')}</p>
        <button type="button" onClick={()=>setRefresh(value=>value+1)} className="shrink-0 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-slate-300">{t('inspector.deliveryRefresh')}</button></div>
      {notice&&<p role="alert" className="text-amber-300">{notice}</p>}
      {!current&&<p role="status" className="text-slate-500">{t('inspector.deliveryRestyleLoading')}</p>}
      {current?.error&&<p role="alert" className="text-amber-300">{current.error}</p>}
      {!!current?.invalidFiles&&<p role="alert" className="text-amber-300">{t('inspector.deliveryRestyleInvalidFiles',{count:current.invalidFiles})}</p>}
      {current&&!current.error&&!current.records.length&&<p className="text-slate-500">{screen?t('inspector.deliveryRestyleEmptyScreen'):t('inspector.deliveryRestyleEmptyAny')}</p>}
      {current?.records.map(record=><details key={record.id} className="rounded-lg border border-slate-800 p-2">
        <summary className="cursor-pointer text-slate-300">{record.outcome.target.kind==='component'?t('inspector.deliveryTargetComponent'):t('inspector.deliveryTargetPage')} · {record.outcome.target.name} · {statuses[record.status]}
          <span className="mt-1 block text-[10px] text-slate-500">{new Date(record.createdAt).toLocaleString()}</span></summary>
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-wrap break-words text-slate-400">{typeof record.outcome.workflowContract?.request==='string'?record.outcome.workflowContract.request:t('inspector.deliveryRestyleNoRequest')}</p>
          <ModificationReviewSource receipt={record.outcome.workflowContract?.modificationReview} />
          <DesignGuidanceCard contract={record.outcome.workflowContract} historical/>
          {record.batchId&&<p className="break-all text-slate-600">{t('inspector.deliveryBatchLabel',{batchId:record.batchId})}</p>}
          {record.status==='prepared'&&<p className="text-amber-300">{t('inspector.deliveryRestylePreparedHint')}</p>}
          {record.reason&&<p className="text-amber-300">{record.reason}</p>}
          {screen&&<p className="text-slate-500">{record.pages.some(p=>p.after.id===screen.id&&p.after.htmlContent===screen.htmlContent&&(p.after.scopedCss??'')===(screen.scopedCss??''))
            ?t('inspector.deliveryRestyleMatches'):t('inspector.deliveryRestyleDiffers')}</p>}
          {record.component&&<details><summary className="cursor-pointer text-slate-400">{t('inspector.deliveryComponentTemplate',{count:record.pages.length})}</summary>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-slate-500">{record.component.before.templateHtml.slice(0,10000)}</pre>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-slate-500">{record.component.after.templateHtml.slice(0,10000)}</pre>
          </details>}
          {record.pages.map((page,index)=>(!screen||page.after.id===screen.id)&&<PageVersion key={page.after.id} record={record} index={index} projectId={projectId} folderPath={folderPath}/>)}
          <details><summary className="cursor-pointer text-slate-400">{t('inspector.deliveryRestyleValidation')}</summary>
            {record.validation.pages.map(page=><div key={page.id} className="mt-2 text-slate-500"><p>{t('inspector.deliveryRestyleInspectNodes',{name:page.name,status:page.render?.status??'',count:page.render?.inspected??0})}</p>
              {page.render?.findings.map((finding,index)=><p key={index} className="text-amber-300">{finding.message}</p>)}</div>)}
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">{JSON.stringify(record.validation,null,2).slice(0,10000)}</pre>
            <p className="break-all text-slate-600">{t('inspector.deliveryRestyleDesignOrigin',{source:record.designSystemOrigin?.sourceName??record.designSystem.name,device:record.settings.referenceDevice?.name??record.settings.deviceProfile})}</p>
          </details>
          {record.outcome.executionRecord&&<details><summary className="cursor-pointer text-slate-400">{t('inspector.deliveryRestyleExecutionRecord')}</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">{JSON.stringify(record.outcome.executionRecord,null,2).slice(0,10000)}</pre></details>}
          <p className="break-all text-[10px] text-slate-600">{t('inspector.deliveryRestyleArchiveLine',{id:record.id,fingerprints:record.pages.map(p=>contentFingerprint(p.after.htmlContent)).join(' / ')})}</p>
        </div>
      </details>)}
      {current?.hasMore&&limit<200&&<button type="button" className="text-blue-300" onClick={()=>setLimit(value=>value+10)}>{t('inspector.deliveryRestyleLoadMore')}</button>}
      {current?.hasMore&&limit>=200&&<p className="text-slate-500">{t('inspector.deliveryRestyleLimitReached')}</p>}
    </div>}
  </details>;
}