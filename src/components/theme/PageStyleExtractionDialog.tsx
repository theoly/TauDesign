import React,{useEffect,useMemo,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {extractPageStyle,mergeExtractedStyle,type PageStyleAnalysis,type StyleSelection} from '../../services/import/pageStyleExtraction';
import {styleApplicationKey} from '../../services/import/styleApplication';
import {buildThemePreview} from '../../utils/themePreview';
import {ExtractedStyleChoices} from './ExtractedStyleChoices';

export function PageStyleExtractionDialog({onClose}:{onClose:()=>void}) {
 const state=useProjectStore(),pages=Object.values(state.screens).filter(s=>s.metadata?.kind!=='specimen');
 const [sourceId,setSourceId]=useState(state.activeScreenId&&pages.some(p=>p.id===state.activeScreenId)?state.activeScreenId:pages[0]?.id??'');
 const [analysis,setAnalysis]=useState<PageStyleAnalysis>(),[expected,setExpected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [selection,setSelection]=useState<StyleSelection>({backgroundIds:[],fields:[]}),[syncIds,setSyncIds]=useState<string[]>([]);
 const readOnly=state.designLibraryBinding?.mode==='pinned_reference';
 const key=useMemo(()=>styleApplicationKey(state),[state.id,state.designSystem,state.screens,state.settings,state.overrides,state.designLibraryBinding]);
 useEffect(()=>{let current=true;setAnalysis(undefined);setSelection({backgroundIds:[],fields:[]});setError('');setBusy(true);
  const timer=setTimeout(()=>{try{const s=useProjectStore.getState(),source=s.screens[sourceId];if(!source)throw new Error('请先创建或导入一个页面。');const result=extractPageStyle(source,s.designSystem,s.settings.colorMode,s.settings.deviceProfile);if(current){setAnalysis(result);setExpected(styleApplicationKey(s));}}catch(e){if(current)setError(e instanceof Error?e.message:'提取失败');}finally{if(current)setBusy(false);}},0);
  return()=>{current=false;clearTimeout(timer);};
 },[sourceId,revision,state.id]);
 const stale=!!analysis&&expected!==key;
 const theme=useMemo(()=>analysis?mergeExtractedStyle(state.designSystem,analysis,selection,state.settings.colorMode):state.designSystem,[analysis,selection,state.designSystem,state.settings.colorMode]);
 const hasSelection=selection.backgroundIds.length+selection.fields.length>0;
 const apply=()=>{try{useProjectStore.getState().applyExtractedStyle(theme,syncIds,expected);onClose();}catch(e){setError(e instanceof Error?e.message:'应用失败');}};
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
  <section role="dialog" aria-modal="true" aria-label="从已有页面提取风格" className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl">
   <header className="flex items-center justify-between border-b border-slate-800 p-4"><div><h2 className="text-sm font-semibold">从已有页面提取风格</h2><p className="mt-1 text-xs text-slate-400">选择参考页面，按用途提取，确认后更新项目主题。</p></div><button aria-label="关闭风格提取" onClick={onClose} className="rounded px-2 py-1 text-slate-400">✕</button></header>
   <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-2">
    <div className="space-y-4"><label className="block text-xs">参考页面<select aria-label="参考页面" value={sourceId} onChange={e=>setSourceId(e.target.value)} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2">{pages.map(page=><option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
     {readOnly&&<p role="alert" className="text-xs text-amber-300">当前设计库参考为只读，请先转为项目副本。</p>}
     {stale&&<div role="alert" className="text-xs text-amber-300">页面或主题已变化，请重新分析后确认。<button className="ml-2 underline" onClick={()=>setRevision(v=>v+1)}>重新分析</button></div>}
     {busy&&<p role="status" className="text-xs text-slate-400">正在分析来源样式…</p>}{error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
     {analysis&&<ExtractedStyleChoices analysis={analysis} selection={selection} onChange={setSelection} theme={state.designSystem} mode={state.settings.colorMode} disabled={readOnly||stale}/>}
     <details className="rounded-lg border border-slate-700 p-3 text-xs"><summary className="cursor-pointer">同步已有页面背景 · 已选择{syncIds.length}页</summary><p className="my-2 text-slate-400">默认仅用于后续新页。未选择的旧页面保留原背景；已有手动背景覆盖仍优先。同步仅绑定背景角色，不改业务文案或布局。</p><div className="max-h-36 space-y-2 overflow-y-auto">{pages.map(page=><label key={page.id} className="flex items-center gap-2"><input type="checkbox" checked={syncIds.includes(page.id)} onChange={e=>setSyncIds(e.target.checked?[...syncIds,page.id]:syncIds.filter(id=>id!==page.id))}/>{page.name}</label>)}</div></details>
    </div>
    <div className="space-y-3"><p className="text-xs text-slate-400">统一基座预览 · {state.settings.colorMode==='light'?'浅色':'深色'}模式</p><div className="grid grid-cols-2 gap-2">{[{title:'当前主题',theme:state.designSystem},{title:'应用所选风格后',theme}].map(item=><div key={item.title}><h3 className="mb-2 text-xs">{item.title}</h3><iframe title={item.title} srcDoc={buildThemePreview(item.theme.tokens,state.settings.colorMode,state.settings.deviceProfile)} className="h-[440px] w-full rounded-lg border border-slate-700 bg-white"/></div>)}</div></div>
   </div>
   <footer className="flex justify-end gap-2 border-t border-slate-800 p-4"><button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs">取消</button><button disabled={!hasSelection||busy||stale||readOnly} onClick={apply} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium disabled:bg-slate-800 disabled:text-slate-500">应用所选风格</button></footer>
  </section>
 </div>;
}
