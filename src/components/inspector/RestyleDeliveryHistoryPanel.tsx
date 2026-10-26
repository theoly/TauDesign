import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import React,{useEffect,useState} from 'react';
import type {Screen} from '../../types/project';
import {contentFingerprint} from '../../services/ai/designWorkflow';
import {RestyleDeliveryRepository,restylePagePreviewId,type RestyleDeliveryRecord} from '../../services/storage/restyleDeliveryRepository';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {StoredPagePreview} from '../canvas/StoredPagePreview';
import {VisualEvidencePanel} from './VisualEvidencePanel';

const statuses={prepared:'状态待确认',applied:'已应用',aborted:'已取消'};
function PageVersion({record,index,projectId,folderPath}: {record:RestyleDeliveryRecord;index:number;projectId:string;folderPath?:string}) {
  const [open,setOpen]=useState(false),page=record.pages[index];
  return <details onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}} className="rounded border border-slate-800 p-2">
    <summary className="cursor-pointer text-slate-400">{page.after.name} · 前后版本与首屏图</summary>
    <StoredPagePreview preview={page.preview} projectId={projectId} folderPath={folderPath} owner={{kind:'delivery',id:restylePagePreviewId(record.id,index)}}
      name={`${page.after.name} · 重塑交付首屏预览`} active={open}/>
    <p className="mt-2 text-slate-500">修改前</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{page.before.htmlContent.slice(0,10000)}</pre>
    <p className="mt-2 text-slate-500">修改后</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{page.after.htmlContent.slice(0,10000)}</pre>
    <p className="text-[10px] text-slate-600">每版显示最多 10,000 字符，完整代码、样式和元数据保存在工程档案中。</p>
    {record.status==='applied'&&<VisualEvidencePanel projectId={projectId} folderPath={folderPath} kind="restyle" eventId={record.id} screenId={page.after.id}/>}
  </details>;
}
export function RestyleDeliveryHistoryPanel({projectId,folderPath,screen,revision,notice}: {
  projectId:string;folderPath?:string;screen?:Screen;revision:number;notice?:string|null;
}) {
  const [open,setOpen]=useState(false),[limit,setLimit]=useState(10),[refresh,setRefresh]=useState(0);
  const [state,setState]=useState<{key:string;records:RestyleDeliveryRecord[];invalidFiles:number;hasMore:boolean;error?:string}>();
  const key=JSON.stringify([projectId,folderPath,screen?.id,revision,limit,refresh]);
  const current=state?.key===key ? state : undefined;
  useEffect(()=>{setLimit(10);},[projectId,folderPath,screen?.id]);
  useEffect(()=>{
    if(!open)return;let active=true;
    void new RestyleDeliveryRepository(createProjectStorage(projectId,folderPath),projectId).list({screenId:screen?.id,limit})
      .then(result=>{if(active)setState({key,...result});})
      .catch(()=>{if(active)setState({key,records:[],invalidFiles:0,hasMore:false,error:'重塑交付记录读取失败，请重试。'});});
    return()=>{active=false;};
  },[key,open]);
  return <details className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px]" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
    <summary className="cursor-pointer font-semibold text-slate-300">重塑交付历史</summary>
    {open&&<div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2"><p className="min-w-0 flex-1 text-slate-500">历史证据仅供回溯，不表示当前页面已通过检查。</p>
        <button type="button" onClick={()=>setRefresh(value=>value+1)} className="shrink-0 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-slate-300">刷新</button></div>
      {notice&&<p role="alert" className="text-amber-300">{notice}</p>}
      {!current&&<p role="status" className="text-slate-500">正在读取重塑档案…</p>}
      {current?.error&&<p role="alert" className="text-amber-300">{current.error}</p>}
      {!!current?.invalidFiles&&<p role="alert" className="text-amber-300">{current.invalidFiles} 份损坏或不匹配记录未显示，其它记录可正常查看。</p>}
      {current&&!current.error&&!current.records.length&&<p className="text-slate-500">本次读取范围内暂无{screen?'此页面的':''}重塑记录。</p>}
      {current?.records.map(record=><details key={record.id} className="rounded-lg border border-slate-800 p-2">
        <summary className="cursor-pointer text-slate-300">{record.outcome.target.kind==='component'?'组件':'页面'} · {record.outcome.target.name} · {statuses[record.status]}
          <span className="mt-1 block text-[10px] text-slate-500">{new Date(record.createdAt).toLocaleString()}</span></summary>
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-wrap break-words text-slate-400">{typeof record.outcome.workflowContract?.request==='string'?record.outcome.workflowContract.request:'未记录原始请求；按当时项目设计系统重塑。'}</p>
          <ModificationReviewSource receipt={record.outcome.workflowContract?.modificationReview} />
          {record.batchId&&<p className="break-all text-slate-600">批次：{record.batchId}</p>}
          {record.status==='prepared'&&<p className="text-amber-300">准备档案已保存，应用状态未完成确认。</p>}
          {record.reason&&<p className="text-amber-300">{record.reason}</p>}
          {screen&&<p className="text-slate-500">{record.pages.some(p=>p.after.id===screen.id&&p.after.htmlContent===screen.htmlContent&&(p.after.scopedCss??'')===(screen.scopedCss??''))
            ?'当前 HTML/CSS 与此重塑版本一致。':'当前页面已与此重塑版本不同，可能已编辑或撤销。'}</p>}
          {record.component&&<details><summary className="cursor-pointer text-slate-400">组件前后模板 · {record.pages.length} 个受影响页面</summary>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-slate-500">{record.component.before.templateHtml.slice(0,10000)}</pre>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-slate-500">{record.component.after.templateHtml.slice(0,10000)}</pre>
          </details>}
          {record.pages.map((page,index)=>(!screen||page.after.id===screen.id)&&<PageVersion key={page.after.id} record={record} index={index} projectId={projectId} folderPath={folderPath}/>)}
          <details><summary className="cursor-pointer text-slate-400">交付时的实际验收证据</summary>
            {record.validation.pages.map(page=><div key={page.id} className="mt-2 text-slate-500"><p>{page.name} · {page.render?.status} · 检查 {page.render?.inspected} 个节点</p>
              {page.render?.findings.map((finding,index)=><p key={index} className="text-amber-300">{finding.message}</p>)}</div>)}
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">{JSON.stringify(record.validation,null,2).slice(0,10000)}</pre>
            <p className="break-all text-slate-600">设计来源：{record.designSystemOrigin?.sourceName??record.designSystem.name} · 设备：{record.settings.referenceDevice?.name??record.settings.deviceProfile}</p>
          </details>
          {record.outcome.executionRecord&&<details><summary className="cursor-pointer text-slate-400">生成执行记录</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">{JSON.stringify(record.outcome.executionRecord,null,2).slice(0,10000)}</pre></details>}
          <p className="break-all text-[10px] text-slate-600">档案：deliveries/restyle/{record.id}.json · 结果 {record.pages.map(p=>contentFingerprint(p.after.htmlContent)).join(' / ')}</p>
        </div>
      </details>)}
      {current?.hasMore&&limit<200&&<button type="button" className="text-blue-300" onClick={()=>setLimit(value=>value+10)}>读取更多历史</button>}
      {current?.hasMore&&limit>=200&&<p className="text-slate-500">已核对最近 200 次重塑；更早记录仍在工程 deliveries/restyle 目录中。</p>}
    </div>}
  </details>;
}
