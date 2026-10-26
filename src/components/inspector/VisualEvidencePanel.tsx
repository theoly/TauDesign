import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {createVisualTask,importVisualEvidence,listVisualEvidence,readVisualImage,type VisualEvidence,type VisualOwner} from '../../services/storage/visualEvidence';
import {saveExportFile,textToBytes} from '../../utils/exportSaver';
const labels={passed:'像素复核通过',failed:'像素复核失败',initialized:'仅建立基准'};
function EvidenceImages({record,folderPath}:{record:VisualEvidence;folderPath?:string}){
 const [open,setOpen]=useState(false),[images,setImages]=useState<Record<string,string>>(),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;let active=true;setError('');setImages(undefined);
  const storage=createProjectStorage(record.owner.projectId,folderPath);
  void Promise.all((['reference','actual','diff'] as const).map(async role=>[role,await readVisualImage(storage,record,role)] as const))
   .then(entries=>{if(active)setImages(Object.fromEntries(entries));}).catch(error=>{if(active)setError(error instanceof Error?error.message:'图片读取失败。');});
  return()=>{active=false;};
 },[open,record,folderPath]);
 return <details onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
  <summary className="cursor-pointer text-slate-400">查看基准、实际与差异图</summary>
  {open&&<div className="mt-2 space-y-2">{error?<p role="alert" className="text-amber-300">{error}</p>:!images?<p role="status">正在读取视觉图片…</p>:
   (['reference','actual','diff'] as const).map(role=><figure key={role}><figcaption className="text-slate-500">{role==='reference'?'基准':role==='actual'?'实际截图':'差异图（外部生成）'}</figcaption>
    <img className="mt-1 h-auto max-h-72 max-w-full rounded border border-slate-800 object-contain" src={images[role]} alt={`${record.owner.screenId} · ${role}`} onError={()=>setError('视觉PNG无法解码。')}/></figure>)}</div>}
 </details>;
}
export function VisualEvidencePanel({projectId,folderPath,kind,eventId,screenId}:{projectId:string;folderPath?:string;kind:VisualOwner['kind'];eventId:string;screenId:string}){
 const owner:VisualOwner={projectId,kind,eventId,screenId},key=JSON.stringify([owner,folderPath]);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<{key:string;records:VisualEvidence[];invalidFiles:number;task?:string;taskError?:string}>();
 const current=useRef(key),active=useRef(true),working=useRef<number>(),epoch=useRef(0);current.current=key;
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{epoch.current++;working.current=undefined;setBusy(false);setData(undefined);setError('');setNotice('');},[key]);
 const check=()=>{const state=useProjectStore.getState();if(!active.current||current.current!==key||state.id!==projectId||state.folderPath!==folderPath)throw Error('工程或交付已切换，未关联视觉报告。');};
 useEffect(()=>{if(!open)return;let cancelled=false;
  const storage=createProjectStorage(projectId,folderPath);
  void(async()=>{const result=await listVisualEvidence(storage,owner);let task:string|undefined,taskError:string|undefined;
   try{task=(await createVisualTask(storage,owner)).fingerprint;}catch(error){taskError=error instanceof Error?error.message:'任务读取失败。';}
   if(!cancelled)setData({key,...result,task,taskError});
  })().catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:'视觉记录读取失败。');});
  return()=>{cancelled=true;};
 },[open,key,refresh]);
 const run=async(action:(check:()=>void)=>Promise<void>)=>{if(working.current!==undefined)return;const token=++epoch.current;working.current=token;setBusy(true);setError('');setNotice('');
  const checked=()=>{check();if(epoch.current!==token)throw Error('视觉操作已取消，未关联报告。');};
  try{checked();await action(checked);}catch(error){if(active.current&&current.current===key&&epoch.current===token)setError(error instanceof Error?error.message:'视觉任务失败。');}
  finally{if(working.current===token)working.current=undefined;if(active.current&&current.current===key&&epoch.current===token)setBusy(false);}};
 const exportTask=()=>run(async check=>{
  const task=await createVisualTask(createProjectStorage(projectId,folderPath),owner);check();
  const saved=await saveExportFile({fileName:`visual-task-${eventId}-${screenId}.json`,bytes:textToBytes(JSON.stringify(task,null,2)),mimeType:'application/json',filterName:'视觉任务',extensions:['json']});check();
  setNotice(saved.status==='canceled'?'已取消保存。':'已导出视觉任务。用离线对比工具生成结果后，选择result.json和三张PNG导入。');
 });
 const importFiles=(files:File[])=>run(async check=>{
  if(files.length!==4||new Set(files.map(file=>file.name)).size!==4)throw Error('请选择result.json、reference.png、actual.png、diff.png四个文件。');
  const json=files.find(file=>file.name==='result.json');if(!json||json.size>64*1024)throw Error('缺少result.json或报告超过64KiB。');
  const images=new Map<string,Uint8Array>();for(const file of files.filter(file=>file!==json)){
   if(file.size>8*1024*1024)throw Error('每张PNG最多8MiB。');images.set(file.name,new Uint8Array(await file.arrayBuffer()));check();}
  const result=await importVisualEvidence(createProjectStorage(projectId,folderPath),owner,await json.text(),images,{check});check();
  setRefresh(value=>value+1);setNotice(result.duplicate?'这份视觉报告已经关联，没有重复保存。':`${labels[result.record.status]}，已保存为历史证据。`);
 });
 const shown=data?.key===key?data:undefined;
 return <details aria-label={`${screenId} · 视觉基准记录`} className="rounded border border-slate-800 p-2" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}>
  <summary className="cursor-pointer text-slate-400">视觉基准记录</summary>
  {open&&<div className="mt-2 space-y-2">
   <p className="text-amber-300">历史视觉证据不解锁当前采纳。外部运行环境为报告声明，本机仅复核任务绑定与图片像素。</p>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={exportTask} className="rounded bg-slate-800 px-2 py-1 text-blue-300 disabled:opacity-50">导出视觉任务</button>
    <label className="cursor-pointer rounded bg-slate-800 px-2 py-1 text-blue-300">导入视觉结果<input aria-label="导入视觉结果文件" className="sr-only" type="file" accept=".json,.png" multiple disabled={busy} onChange={event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';if(files.length)void importFiles(files);}}/></label></div>
   <p className="break-words text-slate-500">离线命令：python3 scripts/verify-delivery-visual.py --job 任务.json --browser chromium --reference 基准.png --output 结果目录（首次加 --update-reference）</p>
   {busy&&<div className="flex items-center gap-2"><p role="status">正在处理视觉任务…</p><button type="button" className="text-slate-400" onClick={()=>{epoch.current++;working.current=undefined;setBusy(false);setNotice('已取消视觉操作。');}}>取消视觉操作</button></div>}{error&&<p role="alert" className="text-amber-300">{error}</p>}{notice&&<p role="status" className="text-blue-300">{notice}</p>}
   {!shown&&!error&&<p role="status">正在读取视觉记录…</p>}
   {!!shown?.invalidFiles&&<p role="alert" className="text-amber-300">{shown.invalidFiles}份损坏视觉记录未显示，原交付代码不受影响。</p>}
   {shown?.taskError&&<p role="alert" className="text-amber-300">{shown.taskError}</p>}
   {shown&&!shown.records.length&&<p className="text-slate-500">尚未关联视觉报告。</p>}
   {shown?.records.map(record=><article key={record.id} className="space-y-1 rounded border border-slate-800 p-2">
    <p className={record.status==='passed'?'text-emerald-300':'text-amber-300'}>{labels[record.status]} · {(record.metrics.ratio*100).toFixed(4)}% 变化</p>
    <p className="break-all text-slate-500">{record.owner.screenId} · {record.width}×{record.height} · {record.environment.browser} {record.environment.version} · {record.environment.platform}/{record.environment.machine}</p>
    <p className="text-slate-500">阈值0.5% · 噪声12 · {record.metrics.changedPixels}/{record.metrics.totalPixels}像素 · {new Date(record.capturedAt).toLocaleString()}</p>
    <p className="text-slate-500">{shown.task===record.taskFingerprint?'与此交付当前导出的视觉任务一致（历史记录）。':'视觉任务或资源已变化，请重新运行对比；保留此历史记录。'}</p>
    <EvidenceImages record={record} folderPath={folderPath}/>
   </article>)}
  </div>}
 </details>;
}
