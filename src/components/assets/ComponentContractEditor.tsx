import React,{useRef,useState} from 'react';
import type {ComponentDefinition,SlotDef} from '../../types/project';
import {useProjectStore} from '../../stores/useProjectStore';
import {libraryMemberLocked} from '../../services/ai/designLibraryReference';
import {checkGenerationSourceSafety} from '../../services/ai/generationQuality';
import {htmlIsComplete} from '../../utils/htmlCompleteness';
import {compileComponentTemplate} from '../../utils/componentTemplate';

export function ComponentContractEditor({component}:{component:ComponentDefinition}) {
 const projectId=useProjectStore(s=>s.id),binding=useProjectStore(s=>s.designLibraryBinding);
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(Boolean(component.templateContract));
 const [html,setHtml]=useState(component.templateHtml),[slots,setSlots]=useState(JSON.stringify(component.slotDefs??[],null,2)),[message,setMessage]=useState('');
 const baseline=useRef({projectId,component:JSON.stringify(component)}),locked=libraryMemberLocked({designLibraryBinding:binding},'components',component.id);
 const begin=()=>{baseline.current={projectId,component:JSON.stringify(component)};setEnabled(Boolean(component.templateContract));setHtml(component.templateHtml);setSlots(JSON.stringify(component.slotDefs??[],null,2));setMessage('');setOpen(true);};
 const save=()=>{
  try{
   const s=useProjectStore.getState();
   if(s.id!==baseline.current.projectId||JSON.stringify(s.components[component.id])!==baseline.current.component)throw Error('工程或组件定义已变化，请取消后重新打开配置。');
   let defs:SlotDef[];try{defs=JSON.parse(slots);}catch{throw Error('插槽 JSON 格式不正确。');}
   if(!Array.isArray(defs))throw Error('插槽须为 JSON 数组。');
   const next={...component,templateHtml:html,slotDefs:defs,templateContract:enabled?{version:1 as const}:undefined};
   // Disabling strict mode does not permit saving unsafe HTML through this editor.
   if(!htmlIsComplete(html)||!checkGenerationSourceSafety(html).passed)throw Error('模板HTML不完整或不安全。');
   if(defs.length>20||defs.some(d=>!d||typeof d.slotName!=='string'||typeof d.selector!=='string'||!['text','image','node'].includes(d.type)||typeof d.defaultContent!=='string'))throw Error('插槽定义字段或数量无效。');
   if(enabled)compileComponentTemplate(next);
   s.updateComponent(component.id,{templateHtml:html,slotDefs:defs,templateContract:next.templateContract});setOpen(false);setMessage('复用约束已保存；原页面保持不变，可按需同步实例。');
  }catch(error){setMessage(error instanceof Error?error.message:'保存失败。');}
 };
 return <section className="space-y-2 text-[11px]" aria-label={`${component.name}复用约束`}>
  <div className="flex flex-wrap items-center gap-2">
   <span className="text-slate-500">v{component.version??1} · {component.templateContract?'模板与插槽校验':'兼容复用'}</span>
   {!open&&<button type="button" disabled={locked} onClick={begin} title={locked?'设计库参考只读，请先转为项目副本':undefined} className="rounded bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-40">配置复用约束</button>}
  </div>
  {locked&&<p className="text-slate-500">固定版本参考只读，请先转为项目副本。</p>}
  {open&&<div className="space-y-2 select-text">
   <label className="flex gap-2 text-slate-300"><input type="checkbox" checked={enabled} disabled={locked} onChange={e=>setEnabled(e.target.checked)}/>启用固定模板与插槽校验</label>
   <p className="text-slate-500">固定区域须保持一致。文本槽仅改文字，图片槽仅改图片内容，节点槽仅改容器内部。保存后版本递增，不自动改页面。</p>
   <label className="block text-slate-400">模板 HTML<textarea aria-label="组件模板 HTML" value={html} onChange={e=>setHtml(e.target.value)} disabled={locked} className="mt-1 h-28 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-300"/></label>
   <label className="block text-slate-400">插槽 JSON<textarea aria-label="组件插槽 JSON" value={slots} onChange={e=>setSlots(e.target.value)} disabled={locked} className="mt-1 h-28 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-300"/></label>
   <p className="break-words text-slate-500">例：{JSON.stringify([{slotName:'title',selector:'[data-slot="title"]',type:'text',defaultContent:'标题'}])}。在模板目标节点添加 data-slot="title"；根节点可用 :scope。默认内容取自模板。</p>
   <div className="flex gap-2"><button type="button" disabled={locked} onClick={save} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">保存复用约束</button><button type="button" onClick={()=>{setOpen(false);setMessage('');}} className="rounded bg-slate-800 px-2 py-1 text-slate-300">取消配置</button></div>
  </div>}
  {message&&<p role="status" className="text-amber-300">{message}</p>}
 </section>;
}
