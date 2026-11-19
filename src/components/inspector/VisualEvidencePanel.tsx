import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {createVisualTask,importVisualEvidence,listVisualEvidence,readVisualImage,type VisualEvidence,type VisualOwner} from '../../services/storage/visualEvidence';
import {saveExportFile,textToBytes} from '../../utils/exportSaver';
import {useT} from '../../stores/useLocaleStore';

function EvidenceImages({record,folderPath}:{record:VisualEvidence;folderPath?:string}){
 const t=useT();
 const [open,setOpen]=useState(false),[images,setImages]=useState<Record<string,string>>(),[error,setError]=useState('');
 const roleLabel=(role:'reference'|'actual'|'diff')=>role==='reference'?t('inspector.evidenceImageReference'):role==='actual'?t('inspector.evidenceImageActual'):t('inspector.evidenceImageDiff');
 useEffect(()=>{if(!open)return;let active=true;setError('');setImages(undefined);
  const storage=createProjectStorage(record.owner.projectId,folderPath);
  void Promise.all((['reference','actual','diff'] as const).map(async role=>[role,await readVisualImage(storage,record,role)] as const))
   .then(entries=>{if(active)setImages(Object.fromEntries(entries));}).catch(error=>{if(active)setError(error instanceof Error?error.message:t('inspector.evidenceImageReadError'));});
  return()=>{active=false;};
 },[open,record,folderPath]);
 return <details onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
  <summary className="cursor-pointer text-slate-400">{t('inspector.evidenceImagesSummary')}</summary>
  {open&&<div className="mt-2 space-y-2">{error?<p role="alert" className="text-amber-300">{error}</p>:!images?<p role="status">{t('inspector.evidenceImagesLoading')}</p>:
   (['reference','actual','diff'] as const).map(role=><figure key={role}><figcaption className="text-slate-500">{roleLabel(role)}</figcaption>
    <img className="mt-1 h-auto max-h-72 max-w-full rounded border border-slate-800 object-contain" src={images[role]} alt={`${record.owner.screenId} · ${role}`} onError={()=>setError(t('inspector.evidenceImageDecodeError'))}/></figure>)}</div>}
 </details>;
}
export function VisualEvidencePanel({projectId,folderPath,kind,eventId,screenId}:{projectId:string;folderPath?:string;kind:VisualOwner['kind'];eventId:string;screenId:string}){
 const t=useT();
 const statusLabel=(status:VisualEvidence['status'])=>({passed:t('inspector.evidenceStatusPassed'),failed:t('inspector.evidenceStatusFailed'),initialized:t('inspector.evidenceStatusInitialized')})[status];
 const owner:VisualOwner={projectId,kind,eventId,screenId},key=JSON.stringify([owner,folderPath]);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<{key:string;records:VisualEvidence[];invalidFiles:number;task?:string;taskError?:string}>();
 const current=useRef(key),active=useRef(true),working=useRef<number>(),epoch=useRef(0);current.current=key;
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{epoch.current++;working.current=undefined;setBusy(false);setData(undefined);setError('');setNotice('');},[key]);
 const check=()=>{const state=useProjectStore.getState();if(!active.current||current.current!==key||state.id!==projectId||state.folderPath!==folderPath)throw Error(t('inspector.evidenceProjectSwitched'));};
 useEffect(()=>{if(!open)return;let cancelled=false;
  const storage=createProjectStorage(projectId,folderPath);
  void(async()=>{const result=await listVisualEvidence(storage,owner);let task:string|undefined,taskError:string|undefined;
   try{task=(await createVisualTask(storage,owner)).fingerprint;}catch(error){taskError=error instanceof Error?error.message:t('inspector.evidenceTaskReadError');}
   if(!cancelled)setData({key,...result,task,taskError});
  })().catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:t('inspector.evidenceVisualReadError'));});
  return()=>{cancelled=true;};
 },[open,key,refresh,projectId,folderPath]);
 const run=async(action:(check:()=>void)=>Promise<void>)=>{if(working.current!==undefined)return;const token=++epoch.current;working.current=token;setBusy(true);setError('');setNotice('');
  const checked=()=>{check();if(epoch.current!==token)throw Error(t('inspector.evidenceOpCancelled'));};
  try{checked();await action(checked);}catch(error){if(active.current&&current.current===key&&epoch.current===token)setError(error instanceof Error?error.message:t('inspector.evidenceVisualTaskFailed'));}
  finally{if(working.current===token)working.current=undefined;if(active.current&&current.current===key&&epoch.current===token)setBusy(false);}};
 const exportTask=()=>run(async check=>{
  const task=await createVisualTask(createProjectStorage(projectId,folderPath),owner);check();
  const saved=await saveExportFile({fileName:`visual-task-${eventId}-${screenId}.json`,bytes:textToBytes(JSON.stringify(task,null,2)),mimeType:'application/json',filterName:t('inspector.evidenceVisualTaskFilter'),extensions:['json']});check();
  setNotice(saved.status==='canceled'?t('inspector.evidenceSaveCancelled'):t('inspector.evidenceExportDone'));
 });
 const importFiles=(files:File[])=>run(async check=>{
  if(files.length!==4||new Set(files.map(file=>file.name)).size!==4)throw Error(t('inspector.evidenceImportWrongFiles'));
  const json=files.find(file=>file.name==='result.json');if(!json||json.size>64*1024)throw Error(t('inspector.evidenceImportJsonError'));
  const images=new Map<string,Uint8Array>();for(const file of files.filter(file=>file!==json)){
   if(file.size>8*1024*1024)throw Error(t('inspector.evidencePngTooLarge'));images.set(file.name,new Uint8Array(await file.arrayBuffer()));check();}
  const result=await importVisualEvidence(createProjectStorage(projectId,folderPath),owner,await json.text(),images,{check});check();
  setRefresh(value=>value+1);setNotice(result.duplicate?t('inspector.evidenceImportDuplicate'):t('inspector.evidenceImportSaved',{label:statusLabel(result.record.status)}));
 });
 const shown=data?.key===key?data:undefined;
 return <details aria-label={t('inspector.evidenceVisualAria',{screenId})} className="rounded border border-slate-800 p-2" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
  <summary className="cursor-pointer text-slate-400">{t('inspector.evidenceVisualSummary')}</summary>
  {open&&<div className="mt-2 space-y-2">
   <p className="text-amber-300">{t('inspector.evidenceVisualDisclaimer')}</p>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={exportTask} className="rounded bg-slate-800 px-2 py-1 text-blue-300 disabled:opacity-50">{t('inspector.evidenceVisualExport')}</button>
    <label className="cursor-pointer rounded bg-slate-800 px-2 py-1 text-blue-300">{t('inspector.evidenceVisualImport')}<input aria-label={t('inspector.evidenceVisualImportAria')} className="sr-only" type="file" accept=".json,.png" multiple disabled={busy} onChange={event=>{const files=Array.from(event.target.files??[]);event.currentTarget.value='';if(files.length)void importFiles(files);}}/></label></div>
   <p className="break-words text-slate-500">{t('inspector.evidenceVisualOfflineCmd')}</p>
   {busy&&<div className="flex items-center gap-2"><p role="status">{t('inspector.evidenceVisualProcessing')}</p><button type="button" className="text-slate-400" onClick={()=>{epoch.current++;working.current=undefined;setBusy(false);setNotice(t('inspector.evidenceOpCancelledNotice'));}}>{t('inspector.evidenceVisualCancelOp')}</button></div>}{error&&<p role="alert" className="text-amber-300">{error}</p>}{notice&&<p role="status" className="text-blue-300">{notice}</p>}
   {!shown&&!error&&<p role="status">{t('inspector.evidenceVisualLoading')}</p>}
   {!!shown?.invalidFiles&&<p role="alert" className="text-amber-300">{t('inspector.evidenceVisualInvalidFiles',{count:shown.invalidFiles})}</p>}
   {shown?.taskError&&<p role="alert" className="text-amber-300">{shown.taskError}</p>}
   {shown&&!shown.records.length&&<p className="text-slate-500">{t('inspector.evidenceVisualNoReport')}</p>}
   {shown?.records.map(record=><article key={record.id} className="space-y-1 rounded border border-slate-800 p-2">
    <p className={record.status==='passed'?'text-emerald-300':'text-amber-300'}>{t('inspector.evidenceVisualChangeRatio',{label:statusLabel(record.status),percent:(record.metrics.ratio*100).toFixed(4)})}</p>
    <p className="break-all text-slate-500">{record.owner.screenId} · {record.width}×{record.height} · {record.environment.browser} {record.environment.version} · {record.environment.platform}/{record.environment.machine}</p>
    <p className="text-slate-500">{t('inspector.evidenceVisualMetricsLine',{changed:record.metrics.changedPixels,total:record.metrics.totalPixels,time:new Date(record.capturedAt).toLocaleString()})}</p>
    <p className="text-slate-500">{shown.task===record.taskFingerprint?t('inspector.evidenceVisualTaskMatch'):t('inspector.evidenceVisualTaskMismatch')}</p>
    <EvidenceImages record={record} folderPath={folderPath}/>
   </article>)}
  </div>}
 </details>;
}