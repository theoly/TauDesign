import {useState} from 'react';
import {useT} from '../../stores/useLocaleStore';
import {mediaDiagnosticsSnapshot} from '../../services/storage/mediaDiagnostics';
import {saveExportFile,textToBytes} from '../../utils/exportSaver';

/** An explicit local export; rendering this control never saves or sends diagnostics. */
export function MediaDiagnosticsButton(){
 const t=useT();
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const save=async()=>{
  if(saving)return;setSaving(true);setNotice('');
  try{
   const result=await saveExportFile({fileName:'media-diagnostics.json',bytes:textToBytes(JSON.stringify(mediaDiagnosticsSnapshot(),null,2)),mimeType:'application/json',filterName:t('assets.diagFilterName'),extensions:['json']});
   setNotice(result.status==='canceled'?t('assets.diagCanceled'):result.status==='saved'?t('assets.diagSaved'):t('assets.diagBrowserDownload'));
  }catch{setNotice(t('assets.diagFailed'));}finally{setSaving(false);}
 };
 return <span className="ml-2 inline-flex flex-wrap items-center gap-2">
  <button type="button" disabled={saving} onClick={event=>{event.stopPropagation();void save();}} className="mt-2 rounded border border-red-700 px-2 py-1 hover:bg-red-900 disabled:opacity-50">{saving?t('assets.diagSavingBtn'):t('assets.diagExportBtn')}</button>
  {notice&&<span role="status">{notice}</span>}
 </span>;
}
