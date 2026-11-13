import {parseHtmlCopy} from '../../utils/htmlDocument';
import {draftRegionChoices,type DraftRegionRequest} from '../../services/ai/draftRegionRepair';
import React, { useEffect, useState, useMemo } from 'react';
import type { SavedQualityDraft } from '../../services/storage/qualityDraftRepository';
import { draftRepairTargets, type DraftLabel } from '../../services/ai/qualityDraft';
import { useProjectStore } from '../../stores/useProjectStore';
import {buildPageRedesignSource} from '../../services/ai/pageRedesignSource';
import {businessTextReviewChoices,type BusinessTextChoice} from '../../services/ai/businessTextReview';

export function FailedDraftCard({value,saved,busy,notice,onSuggest,onRepair,onRegenerate}: {
  value:SavedQualityDraft;saved?:boolean;busy?:boolean;notice?:string;
  onSuggest:()=>void;onRepair:(labels:DraftLabel[],region?:DraftRegionRequest)=>void;onRegenerate:()=>void;
}) {
  const baseline=useProjectStore(state=>value.decision.targetScreenId?state.screens[value.decision.targetScreenId]?.htmlContent:undefined);
  const targets=draftRepairTargets(value.draft,baseline);
  const defaults=()=>Object.fromEntries(targets.map(t=>[t.nid,value.suggestions?.find(l=>l.nid===t.nid)?.text||t.originalLabel]));
  const [labels,setLabels]=useState<Record<string,string>>(defaults),[focus,setFocus]=useState<string>(),[code,setCode]=useState(false);
  const suggestionKey=JSON.stringify(value.suggestions);
  useEffect(()=>setLabels(defaults()),[value.draft.fingerprint,suggestionKey]);
  const errors=value.draft.quality.findings.filter(f=>f.severity==='error'),warnings=value.draft.quality.findings.filter(f=>f.severity==='warning');
  const locked=busy||value.status==='resolved';
  const regions=draftRegionChoices(value.draft);
  const [selected,setSelected]=useState<string[]>([]),[instruction,setInstruction]=useState('');
  const [textChoices,setTextChoices]=useState<Record<string,{confirmed:boolean;targetNid:string;after:string}>>({});
  useEffect(()=>{setTextChoices({});setSelected([]);setInstruction('');},[value.id,value.draft.fingerprint]);
  const reviewChoices=useMemo(()=>{
    const contract=value.draft.pageTaskSource??value.draft.guidanceSource;
    if(!baseline||!contract?.wholePageRedesign)return {sources:[],targets:[]};
    try{return businessTextReviewChoices(buildPageRedesignSource(baseline,{deviceProfile:contract.device.profile,protectedNids:contract.protectedNids,useCustomNavigation:true}),baseline,value.draft);}catch{return {sources:[],targets:[]};}
  },[baseline,value.draft]);
  const availableTextTargets=reviewChoices.targets.filter(t=>selected.some(id=>t.regionNids.includes(id)));
  const confirmedTextChanges:BusinessTextChoice[]=reviewChoices.sources.filter(s=>textChoices[s.sourceNid]?.confirmed).map(s=>({sourceNid:s.sourceNid,before:s.before,targetNid:textChoices[s.sourceNid].targetNid,after:textChoices[s.sourceNid].after}));
  const invalidTextChoices=confirmedTextChanges.length>8||confirmedTextChanges.some(c=>!c.after.trim()||!availableTextTargets.some(t=>t.targetNid===c.targetNid))||new Set(confirmedTextChanges.map(c=>c.targetNid)).size!==confirmedTextChanges.length;
  const historicalReview=(value.draft.pageTaskSource??value.draft.guidanceSource)?.businessTextReview;
  const groups=Array.from(new Set(errors.map(f=>f.code))).map(code=>({code,items:errors.filter(f=>f.code===code)}));
  const sourceNode=(html:string|undefined,nid:string)=>{if(!html)return;const nodes=Array.from(parseHtmlCopy(html).doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid);return nodes.length===1?nodes[0].outerHTML:undefined;};
  const focused=useMemo(()=>{if(!focus)return;const current=sourceNode(value.draft.html,focus);if(current)return {label:'草稿节点',html:current};const original=sourceNode(baseline,focus);return original?{label:'原页面节点（草稿中未找到同一身份）',html:original}:undefined;},[focus,value.draft.html,baseline]);
  const findingRow=(f:typeof errors[number],index:number)=><div key={index} className="space-y-1 text-[11px] text-rose-200">
    <p>{f.message} {f.nid&&<button type="button" onClick={()=>{setCode(true);setFocus(f.nid);}} className="text-blue-300 underline">定位源码 [{f.nid}]</button>}</p>
    {f.actual&&<p className="whitespace-pre-wrap break-words text-slate-300">当前差异：{f.actual}</p>}
    {f.expected&&<p className="break-words text-slate-500">要求：{f.expected}</p>}
    {f.code==='redesign_content_missing'&&f.nid&&<button type="button" disabled={locked} onClick={()=>setInstruction(v=>[v,`保留原节点 ${f.nid} 的业务文案与语义，依据原业务片段恢复，不扩大修改范围。`].filter(Boolean).join('\n').slice(0,2000))} className="text-blue-300 disabled:opacity-40">将保留要求加入局部修复</button>}
  </div>;

  return <section aria-label="未通过验收的页面草稿" className="mt-2 p-3 space-y-3 rounded-xl border border-amber-700/50 bg-slate-900 text-xs text-slate-300">
    <div className="font-semibold text-slate-100">{value.status==='resolved'?'原失败草稿 · 已完成修复':'页面已生成，暂未通过验收'}</div>
    <p><span className="text-rose-300">{errors.length} 项阻断</span> · <span className="text-amber-300">{warnings.length} 项警告</span></p>
    <p className="text-[11px] text-slate-400">{saved?'失败草稿已保存，可重新打开查看。':'草稿尚未保存至磁盘。'} 原页面未改变，草稿不能采纳。实际排版尚未验收。</p>
    {historicalReview&&<details className="rounded border border-slate-700 p-2"><summary>已确认的逐项文案 · {historicalReview.changes.length} 项</summary>{historicalReview.changes.map(c=><p key={c.sourceNid} className="mt-2 whitespace-pre-wrap break-words">[{c.sourceNid} → {c.targetNid}] {c.before} → {c.after}</p>)}<p className="mt-1 text-slate-500">历史确认仍需当前来源和整页验收，不自动执行。</p></details>}
    {groups.map(group=>group.items.length>1?<details key={group.code} className="rounded border border-slate-700 p-2"><summary className="cursor-pointer text-rose-200">{group.code==='redesign_content_missing'?'原业务文案待核对':group.items[0].message} · {group.items.length} 项</summary><div className="mt-2 space-y-3">{group.items.map(findingRow)}</div></details>:<div key={group.code}>{findingRow(group.items[0],0)}</div>)}
    {targets.length>0&&<div className="space-y-2">
      <p className="text-[11px] text-slate-400">原文优先恢复；不明确的按钮请填写文案。AI建议须经你确认。</p>
      {targets.map(t=><label key={t.nid} className="block space-y-1 text-[11px]">
        <span>操作文案 [{t.nid}]</span>
        <input aria-label={`操作文案 ${t.nid}`} maxLength={160} value={labels[t.nid]??''} disabled={locked}
          onChange={e=>setLabels(prev=>({...prev,[t.nid]:e.target.value}))} placeholder="填写该按钮实际执行的操作"
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200"/>
      </label>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSuggest} disabled={locked||value.aiAttempted||!saved} className="px-2 py-1.5 rounded bg-slate-800 disabled:opacity-40">AI建议文案（限一次）</button>
        <button type="button" onClick={()=>onRepair(targets.map(t=>({nid:t.nid,text:labels[t.nid]??''})))}
          disabled={locked||targets.some(t=>!labels[t.nid]?.trim())} className="px-2 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40">确认文案并定点修复</button>
      </div>
    </div>}
    {regions.length>0&&<details className="rounded border border-slate-700 p-2">
      <summary className="cursor-pointer">在此草稿上局部修复</summary>
      <p className="mt-2 text-slate-400">选择最多3个区域，补充修复要求。其他区域保留，修复后重新验收整页。</p>
      <div className="max-h-36 overflow-y-auto">{regions.map(r=><label key={r.nid} className="flex items-center gap-2 py-1"><input type="checkbox" disabled={locked||(!selected.includes(r.nid)&&selected.length>=3)} checked={selected.includes(r.nid)} onChange={e=>setSelected(v=>e.target.checked?[...v,r.nid]:v.filter(n=>n!==r.nid))}/>{r.label} · {r.nid}</label>)}</div>
      {reviewChoices.sources.length>0&&<details className="my-2 rounded border border-slate-700 p-2">
        <summary className="cursor-pointer">逐项确认原文替换 · {reviewChoices.sources.length} 项可核对</summary>
        <p className="mt-2 text-slate-400">先选区域，再对应原文与草稿文本。勾选后仅确认该项替换，最多8项；未勾选仍需保留原文。按钮、字段和保护内容按原规则检查。</p>
        <div className="max-h-72 space-y-3 overflow-y-auto">{reviewChoices.sources.map(s=>{
          const c=textChoices[s.sourceNid]??{confirmed:false,targetNid:'',after:''};
          const change=(next:Partial<typeof c>)=>setTextChoices(v=>({...v,[s.sourceNid]:{...c,...next}}));
          return <div key={s.sourceNid} className="space-y-1 border-t border-slate-700 pt-2">
            <p className="whitespace-pre-wrap break-words text-slate-200">原文 [{s.sourceNid}]：{s.before}</p>
            <select aria-label={`对应草稿文本 ${s.sourceNid}`} value={c.targetNid} disabled={locked||!selected.length} onChange={e=>{const target=availableTextTargets.find(t=>t.targetNid===e.target.value);change({targetNid:e.target.value,after:target?.text??'',confirmed:false});}} className="w-full rounded border border-slate-700 bg-slate-950 p-1">
              <option value="">选择对应文本节点</option>{availableTextTargets.map(t=><option key={t.targetNid} value={t.targetNid}>{t.targetNid} · {t.text}</option>)}
            </select>
            <textarea aria-label={`确认替换文案 ${s.sourceNid}`} rows={2} maxLength={400} disabled={locked||!c.targetNid} value={c.after} onChange={e=>change({after:e.target.value,confirmed:false})} className="w-full rounded border border-slate-700 bg-slate-950 p-1"/>
            <label className="flex items-center gap-2"><input aria-label={`确认替换原文 ${s.sourceNid}`} type="checkbox" checked={c.confirmed} disabled={locked||!c.after.trim()||!availableTextTargets.some(t=>t.targetNid===c.targetNid)||(!c.confirmed&&confirmedTextChanges.length>=8)} onChange={e=>change({confirmed:e.target.checked})}/>确认该原文由此节点的新文案替代</label>
          </div>;
        })}</div>
      </details>}
      <textarea aria-label="草稿局部修复要求" rows={3} maxLength={2000} value={instruction} disabled={locked} onChange={e=>setInstruction(e.target.value)} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder="例如：在基础资料区补齐本页可填写的字段，保留只读实名信息"/>
      {invalidTextChoices&&<p role="status" className="text-amber-200">请核对已确认文案的区域、唯一目标和非空文字。</p>}
      <button type="button" disabled={locked||!selected.length||!instruction.trim()||invalidTextChoices} onClick={()=>onRepair([],{nids:selected,instruction,...(confirmedTextChanges.length?{textChanges:confirmedTextChanges}:{})})} className="mt-2 rounded bg-blue-600 px-2 py-1 disabled:opacity-40">修复所选草稿区域</button>
    </details>}
    {!targets.length&&<p className="text-[11px] text-slate-400">{regions.length?'此类问题不适用按钮文案修复，可在上方选择区域并补充修复要求。':'没有可安全单独修改的区域，请查看源码并缩小修改范围。'}</p>}
    {notice&&<p role="status" className="text-[11px] text-amber-200 break-words">{notice}</p>}
    <div className="flex gap-3 text-[11px]">
      <button type="button" onClick={()=>setCode(!code)} className="text-blue-300">{code?'收起源码':'查看草稿源码'}</button>
      <button type="button" onClick={onRegenerate} disabled={busy} className="text-slate-300 disabled:opacity-40">从头重新生成</button>
    </div>
    {code&&<div className="space-y-2">
      {focus&&<pre aria-label="定位的错误节点" className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-amber-700/50 rounded p-2 text-[10px]">{focused?`${focused.label}：\n${focused.html}`:`未找到唯一节点 ${focus}，请核对原页与完整草稿。`}</pre>}
      <pre aria-label="失败草稿源码" className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-slate-950 rounded p-2 text-[10px] select-text">{value.draft.html}</pre>
    </div>}
  </section>;
}
