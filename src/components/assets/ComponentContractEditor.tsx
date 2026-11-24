import React,{useRef,useState} from 'react';
import type {ComponentDefinition,SlotDef} from '../../types/project';
import {useProjectStore} from '../../stores/useProjectStore';
import {libraryMemberLocked} from '../../services/ai/designLibraryReference';
import {checkGenerationSourceSafety} from '../../services/ai/generationQuality';
import {htmlIsComplete} from '../../utils/htmlCompleteness';
import {compileComponentTemplate} from '../../utils/componentTemplate';
import {useT} from '../../stores/useLocaleStore';

export function ComponentContractEditor({component}:{component:ComponentDefinition}) {
 const t=useT();
 const projectId=useProjectStore(s=>s.id),binding=useProjectStore(s=>s.designLibraryBinding);
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(Boolean(component.templateContract));
 const [html,setHtml]=useState(component.templateHtml),[slots,setSlots]=useState(JSON.stringify(component.slotDefs??[],null,2)),[message,setMessage]=useState('');
 const baseline=useRef({projectId,component:JSON.stringify(component)}),locked=libraryMemberLocked({designLibraryBinding:binding},'components',component.id);
 const begin=()=>{baseline.current={projectId,component:JSON.stringify(component)};setEnabled(Boolean(component.templateContract));setHtml(component.templateHtml);setSlots(JSON.stringify(component.slotDefs??[],null,2));setMessage('');setOpen(true);};
 const save=()=>{
  try{
   const s=useProjectStore.getState();
   if(s.id!==baseline.current.projectId||JSON.stringify(s.components[component.id])!==baseline.current.component)throw Error(t('assets.contractContextChanged'));
   let defs:SlotDef[];try{defs=JSON.parse(slots);}catch{throw Error(t('assets.contractSlotJsonError'));}
   if(!Array.isArray(defs))throw Error(t('assets.contractSlotArrayError'));
   const next={...component,templateHtml:html,slotDefs:defs,templateContract:enabled?{version:1 as const}:undefined};
   // Disabling strict mode does not permit saving unsafe HTML through this editor.
   if(!htmlIsComplete(html)||!checkGenerationSourceSafety(html).passed)throw Error(t('assets.contractHtmlUnsafeError'));
   if(defs.length>20||defs.some(d=>!d||typeof d.slotName!=='string'||typeof d.selector!=='string'||!['text','image','node'].includes(d.type)||typeof d.defaultContent!=='string'))throw Error(t('assets.contractSlotFieldError'));
   if(enabled)compileComponentTemplate(next);
   s.updateComponent(component.id,{templateHtml:html,slotDefs:defs,templateContract:next.templateContract});setOpen(false);setMessage(t('assets.contractSavedNotice'));
  }catch(error){setMessage(error instanceof Error?error.message:t('assets.contractSaveFailed'));}
 };
 return <section className="space-y-2 text-[11px]" aria-label={t('assets.contractSectionAria',{name:component.name})}>
  <div className="flex flex-wrap items-center gap-2">
   <span className="text-slate-500">v{component.version??1} · {component.templateContract?t('assets.contractTemplateMode'):t('assets.contractCompatMode')}</span>
   {!open&&<button type="button" disabled={locked} onClick={begin} title={locked?t('assets.contractReadonlyTitle'):undefined} className="rounded bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-40">{t('assets.contractConfigBtn')}</button>}
  </div>
  {locked&&<p className="text-slate-500">{t('theme.libraryReadonlyTitle')}。</p>}
  {open&&<div className="space-y-2 select-text">
   <label className="flex gap-2 text-slate-300"><input type="checkbox" checked={enabled} disabled={locked} onChange={e=>setEnabled(e.target.checked)}/>{t('assets.contractEnableCheckbox')}</label>
   <p className="text-slate-500">{t('assets.contractConstraintHint')}</p>
   <label className="block text-slate-400">{t('assets.contractTemplateHtmlLabel')}<textarea aria-label={t('assets.contractTemplateHtmlAria')} value={html} onChange={e=>setHtml(e.target.value)} disabled={locked} className="mt-1 h-28 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-300"/></label>
   <label className="block text-slate-400">{t('assets.contractSlotJsonLabel')}<textarea aria-label={t('assets.contractSlotJsonAria')} value={slots} onChange={e=>setSlots(e.target.value)} disabled={locked} className="mt-1 h-28 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-300"/></label>
   <p className="break-words text-slate-500">{t('assets.contractExampleHint',{example:JSON.stringify([{slotName:'title',selector:'[data-slot="title"]',type:'text',defaultContent:'Title'}])})}</p>
   <div className="flex gap-2"><button type="button" disabled={locked} onClick={save} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">{t('assets.contractSaveBtn')}</button><button type="button" onClick={()=>{setOpen(false);setMessage('');}} className="rounded bg-slate-800 px-2 py-1 text-slate-300">{t('assets.contractCancelBtn')}</button></div>
  </div>}
  {message&&<p role="status" className="text-amber-300">{message}</p>}
 </section>;
}
