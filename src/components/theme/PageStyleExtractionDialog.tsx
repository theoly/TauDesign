import React,{useEffect,useMemo,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {extractPageStyle,mergeExtractedStyle,type PageStyleAnalysis,type StyleSelection} from '../../services/import/pageStyleExtraction';
import {styleApplicationKey} from '../../services/import/styleApplication';
import {buildThemePreview} from '../../utils/themePreview';
import {ExtractedStyleChoices} from './ExtractedStyleChoices';
import {useT} from '../../stores/useLocaleStore';

export function PageStyleExtractionDialog({onClose}:{onClose:()=>void}) {
 const t=useT();
 const state=useProjectStore(),pages=Object.values(state.screens).filter(s=>s.metadata?.kind!=='specimen');
 const [sourceId,setSourceId]=useState(state.activeScreenId&&pages.some(p=>p.id===state.activeScreenId)?state.activeScreenId:pages[0]?.id??'');
 const [analysis,setAnalysis]=useState<PageStyleAnalysis>(),[expected,setExpected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [selection,setSelection]=useState<StyleSelection>({backgroundIds:[],fields:[]}),[syncIds,setSyncIds]=useState<string[]>([]);
 const readOnly=state.designLibraryBinding?.mode==='pinned_reference';
 const key=useMemo(()=>styleApplicationKey(state),[state.id,state.designSystem,state.screens,state.settings,state.overrides,state.designLibraryBinding]);
 useEffect(()=>{let current=true;setAnalysis(undefined);setSelection({backgroundIds:[],fields:[]});setError('');setBusy(true);
  const timer=setTimeout(()=>{try{const s=useProjectStore.getState(),source=s.screens[sourceId];if(!source)throw new Error(t('theme.extractNeedPageErr'));const result=extractPageStyle(source,s.designSystem,s.settings.colorMode,s.settings.deviceProfile);if(current){setAnalysis(result);setExpected(styleApplicationKey(s));}}catch(e){if(current)setError(e instanceof Error?e.message:t('theme.extractFailedErr'));}finally{if(current)setBusy(false);}},0);
  return()=>{current=false;clearTimeout(timer);};
 },[sourceId,revision,state.id]);
 const stale=!!analysis&&expected!==key;
 const theme=useMemo(()=>analysis?mergeExtractedStyle(state.designSystem,analysis,selection,state.settings.colorMode):state.designSystem,[analysis,selection,state.designSystem,state.settings.colorMode]);
 const hasSelection=selection.backgroundIds.length+selection.fields.length>0;
 const apply=()=>{try{useProjectStore.getState().applyExtractedStyle(theme,syncIds,expected);onClose();}catch(e){setError(e instanceof Error?e.message:t('theme.extractApplyFailedErr'));}};
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
  <section role="dialog" aria-modal="true" aria-label={t('theme.extractTitle')} className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl">
   <header className="flex items-center justify-between border-b border-slate-800 p-4"><div><h2 className="text-sm font-semibold">{t('theme.extractTitle')}</h2><p className="mt-1 text-xs text-slate-400">{t('theme.extractSubtitle')}</p></div><button aria-label={t('theme.extractCloseAria')} onClick={onClose} className="rounded px-2 py-1 text-slate-400">✕</button></header>
   <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-2">
    <div className="space-y-4"><label className="block text-xs">{t('theme.extractRefPageLabel')}<select aria-label={t('theme.extractRefPageLabel')} value={sourceId} onChange={e=>setSourceId(e.target.value)} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2">{pages.map(page=><option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
     {readOnly&&<p role="alert" className="text-xs text-amber-300">{t('theme.extractReadonlyAlert')}</p>}
     {stale&&<div role="alert" className="text-xs text-amber-300">{t('theme.extractStaleAlert')}<button className="ml-2 underline" onClick={()=>setRevision(v=>v+1)}>{t('theme.extractReanalyzeBtn')}</button></div>}
     {busy&&<p role="status" className="text-xs text-slate-400">{t('theme.extractAnalyzingStatus')}</p>}{error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
     {analysis&&<ExtractedStyleChoices analysis={analysis} selection={selection} onChange={setSelection} theme={state.designSystem} mode={state.settings.colorMode} disabled={readOnly||stale}/>}
     <details className="rounded-lg border border-slate-700 p-3 text-xs"><summary className="cursor-pointer">{t('theme.extractSyncSummary',{count:syncIds.length})}</summary><p className="my-2 text-slate-400">{t('theme.extractSyncHint')}</p><div className="max-h-36 space-y-2 overflow-y-auto">{pages.map(page=><label key={page.id} className="flex items-center gap-2"><input type="checkbox" checked={syncIds.includes(page.id)} onChange={e=>setSyncIds(e.target.checked?[...syncIds,page.id]:syncIds.filter(id=>id!==page.id))}/>{page.name}</label>)}</div></details>
    </div>
    <div className="space-y-3"><p className="text-xs text-slate-400">{t('theme.extractPreviewLabel',{mode:state.settings.colorMode==='light'?t('layout.light'):t('layout.dark')})}</p><div className="grid grid-cols-2 gap-2">{[{title:t('theme.extractCurrentThemeTitle'),theme:state.designSystem},{title:t('theme.extractNextThemeTitle'),theme}].map(item=><div key={item.title}><h3 className="mb-2 text-xs">{item.title}</h3><iframe title={item.title} srcDoc={buildThemePreview(item.theme.tokens,state.settings.colorMode,state.settings.deviceProfile)} className="h-[440px] w-full rounded-lg border border-slate-700 bg-white"/></div>)}</div></div>
   </div>
   <footer className="flex justify-end gap-2 border-t border-slate-800 p-4"><button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs">{t('common.cancel')}</button><button disabled={!hasSelection||busy||stale||readOnly} onClick={apply} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium disabled:bg-slate-800 disabled:text-slate-500">{t('theme.extractApplySelected')}</button></footer>
  </section>
 </div>;
}
