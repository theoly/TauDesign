import React,{useEffect,useSyncExternalStore} from 'react';
import {getProjectPublication,subscribeProjectPublication} from '../../services/storage/projectPublication';

/** The final storage handoff is ordered; editing resumes after its actual result is known. */
export const ProjectPublicationOverlay:React.FC=()=>{
 const publication=useSyncExternalStore(subscribeProjectPublication,getProjectPublication,()=>null);
 useEffect(()=>{if(!publication)return;const block=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();};window.addEventListener('keydown',block,true);return()=>window.removeEventListener('keydown',block,true);},[publication]);
 if(!publication)return null;
 return <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]" role="status" aria-live="polite" aria-busy="true">
  <div className="max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-6 py-5 text-sm text-slate-200 shadow-xl">
   <div className="flex items-center gap-3"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" aria-hidden="true"/>正在保存已确认的设计</div>
   <p className="mt-2 break-words text-xs text-slate-400">{publication.label}</p>
   <p className="mt-3 text-xs text-slate-400">保存结果确认后即可继续编辑或切换工程。</p>
  </div>
 </div>;
};
