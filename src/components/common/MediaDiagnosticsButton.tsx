import {useState} from 'react';
import {mediaDiagnosticsSnapshot} from '../../services/storage/mediaDiagnostics';
import {saveExportFile,textToBytes} from '../../utils/exportSaver';

/** An explicit local export; rendering this control never saves or sends diagnostics. */
export function MediaDiagnosticsButton(){
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const save=async()=>{
  if(saving)return;setSaving(true);setNotice('');
  try{
   const result=await saveExportFile({fileName:'media-diagnostics.json',bytes:textToBytes(JSON.stringify(mediaDiagnosticsSnapshot(),null,2)),mimeType:'application/json',filterName:'资源诊断 JSON',extensions:['json']});
   setNotice(result.status==='canceled'?'已取消诊断保存。':result.status==='saved'?'资源诊断已保存。':'资源诊断已交由浏览器下载。');
  }catch{setNotice('资源诊断保存失败，请重试。');}finally{setSaving(false);}
 };
 return <span className="ml-2 inline-flex flex-wrap items-center gap-2">
  <button type="button" disabled={saving} onClick={event=>{event.stopPropagation();void save();}} className="mt-2 rounded border border-red-700 px-2 py-1 hover:bg-red-900 disabled:opacity-50">{saving?'正在保存诊断…':'导出资源诊断'}</button>
  {notice&&<span role="status">{notice}</span>}
 </span>;
}
