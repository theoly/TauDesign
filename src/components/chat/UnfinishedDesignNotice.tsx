import React,{useEffect,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {listDesignTaskIndex} from '../../services/storage/designTaskRepository';
import {useT} from '../../stores/useLocaleStore';

/** Opening a project only reads its index. No model, draft recovery or page mutation. */
export function UnfinishedDesignNotice({onOpen,refreshKey=0}:{onOpen:()=>void;refreshKey?:number}){
 const t=useT();
 const projectId=useProjectStore(s=>s.id),folderPath=useProjectStore(s=>s.folderPath),key=JSON.stringify([projectId,folderPath]);
 const [value,setValue]=useState<{key:string;pending:number;invalid:number;hasMore:boolean;error?:boolean}>(),[dismissed,setDismissed]=useState('');
 useEffect(()=>{let active=true;void listDesignTaskIndex(createProjectStorage(projectId,folderPath),projectId).then(index=>{if(active)setValue({key,pending:index.totalMatching,invalid:index.invalid.length,hasMore:index.hasMore});}).catch(()=>{if(active)setValue({key,pending:0,invalid:0,hasMore:false,error:true});});return()=>{active=false;};},[projectId,folderPath,key,refreshKey]);
 if(!value||value.key!==key||dismissed===key||!value.error&&!value.pending&&!value.invalid&&!value.hasMore)return null;
 const invalidPart=value.invalid?t('chat.unfinishedInvalidPart',{invalid:value.invalid}):'';
 const morePart=value.hasMore?t('chat.unfinishedMorePart'):'';
 return <aside aria-label={t('chat.unfinishedAria')} className="border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
  <div className="flex items-start justify-between gap-2"><p>{value.error?t('chat.unfinishedError'):t('chat.unfinishedCount',{pending:value.pending,invalidPart,morePart})}</p><button type="button" aria-label={t('chat.unfinishedCloseAria')} onClick={()=>setDismissed(key)} className="shrink-0 px-1 text-slate-500 hover:text-slate-200">×</button></div>
  <p className="mt-1">{t('chat.unfinishedNoAuto')}<button type="button" onClick={onOpen} className="ml-2 text-blue-300 hover:underline">{t('chat.unfinishedViewTasks')}</button></p>
 </aside>;
}
