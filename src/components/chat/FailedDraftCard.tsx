import {UserFacingNotice} from '../common/UserFacingNotice';
import {userFacingMessage} from '../../utils/userFacingMessage';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {blockerRegionRepairPlan,draftRegionChoices,type DraftRegionRequest} from '../../services/ai/draftRegionRepair';
import React, { useEffect, useState, useMemo } from 'react';
import type { SavedQualityDraft } from '../../services/storage/qualityDraftRepository';
import { draftRepairTargets, type DraftLabel } from '../../services/ai/qualityDraft';
import { useProjectStore } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';
import {buildPageRedesignSource} from '../../services/ai/pageRedesignSource';
import {businessTextReviewChoices,type BusinessTextChoice} from '../../services/ai/businessTextReview';
import {findingSummary} from './QualityFindings';
import {findingDisposition} from '../../services/ai/findingPolicy';

export function FailedDraftCard({value,saved,busy,notice,compactActions=false,onSuggest,onRepair,onRegenerate}: {
  value:SavedQualityDraft;saved?:boolean;busy?:boolean;notice?:string;
  /** When true, omit the primary Fix-blockers CTA (shown at the latest-message dock instead). */
  compactActions?:boolean;
  onSuggest:()=>void;onRepair:(labels:DraftLabel[],region?:DraftRegionRequest)=>void;onRegenerate:()=>void;
}) {
  const t=useT();
  const baseline=useProjectStore(state=>value.decision.targetScreenId?state.screens[value.decision.targetScreenId]?.htmlContent:undefined);
  const targets=draftRepairTargets(value.draft,baseline);
  const defaults=()=>Object.fromEntries(targets.map(t=>[t.nid,value.suggestions?.find(l=>l.nid===t.nid)?.text||t.originalLabel]));
  const [labels,setLabels]=useState<Record<string,string>>(defaults),[focus,setFocus]=useState<string>(),[code,setCode]=useState(false);
  const suggestionKey=JSON.stringify(value.suggestions);
  useEffect(()=>setLabels(defaults()),[value.draft.fingerprint,suggestionKey]);
  const findings=value.draft.quality.findings;
  const errors=findings.filter(f=>findingDisposition(f)==='blocker'||findingDisposition(f)==='layout-risk');
  const locked=busy||value.status==='resolved';
  const regions=draftRegionChoices(value.draft);
  const blockerPlan=useMemo(()=>errors.length?blockerRegionRepairPlan(value.draft,baseline):null,[value.draft,baseline,findings]);
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
  const applyBlockerPlan=()=>{if(!blockerPlan||locked)return;setSelected(blockerPlan.nids);setInstruction(blockerPlan.instruction);onRepair([],blockerPlan);};
  const findingRow=(f:typeof errors[number],index:number)=><div key={index} className="space-y-1 text-[11px] text-rose-200">
    <div><UserFacingNotice message={f.message}/> {f.nid&&<button type="button" onClick={()=>{setCode(true);setFocus(f.nid);}} className="text-blue-300 underline">查看问题位置 [{f.nid}]</button>}</div>
    <details data-technical-details className="text-slate-400"><summary className="cursor-pointer">查看检查详情</summary>
    {f.actual&&<p className="whitespace-pre-wrap break-words text-slate-300">当前差异：{f.actual}</p>}
    {f.expected&&<p className="break-words text-slate-500">要求：{f.expected}</p>}
    </details>
    {f.code==='redesign_content_missing'&&f.nid&&<button type="button" disabled={locked} onClick={()=>setInstruction(v=>[v,`保留原节点 ${f.nid} 的业务文案与语义，依据原业务片段恢复，不扩大修改范围。`].filter(Boolean).join('\n').slice(0,2000))} className="text-blue-300 disabled:opacity-40">将保留要求加入局部修复</button>}
  </div>;

  const fixBlockersButton=errors.length>0&&regions.length>0?(
    <div data-testid="failed-draft-fix-blockers" className="space-y-2 rounded-lg border border-rose-800/50 bg-rose-950/20 p-2">
      <p className="text-[11px] text-slate-400">{t('failedDraft.fixBlockersHint')}</p>
      <button type="button" disabled={locked||!blockerPlan} onClick={applyBlockerPlan}
        title={blockerPlan?blockerPlan.nids.map(id=>regions.find(r=>r.nid===id)?.label??id).join('、'):t('failedDraft.fixBlockersUnavailable')}
        className="rounded bg-rose-600 px-3 py-1.5 font-medium text-white disabled:opacity-40">
        {t('failedDraft.fixBlockers')}{blockerPlan?` · ${blockerPlan.nids.length}`:''}
      </button>
      {!blockerPlan&&<p className="text-[11px] text-amber-200">{t('failedDraft.fixBlockersUnavailable')}</p>}
    </div>
  ):null;

  return <section aria-label={t('failedDraft.sectionAria')} className="mt-2 p-3 space-y-3 rounded-xl border border-amber-700/50 bg-slate-900 text-xs text-slate-300">
    <div className="font-semibold text-slate-100">{value.status==='resolved'?t('failedDraft.titleResolved'):t('failedDraft.titleBlocked')}</div>
    <p className="text-[11px] text-amber-200" data-testid="failed-draft-finding-summary">{findingSummary(findings)}</p>
    <p className="text-[11px] text-slate-400">{saved?t('failedDraft.savedHint'):t('failedDraft.unsavedHint')} {t('failedDraft.adoptionHint')}</p>
    {historicalReview&&<details className="rounded border border-slate-700 p-2"><summary>已确认的逐项文案 · {historicalReview.changes.length} 项</summary>{historicalReview.changes.map(c=><p key={c.sourceNid} className="mt-2 whitespace-pre-wrap break-words">[{c.sourceNid} → {c.targetNid}] {c.before} → {c.after}</p>)}<p className="mt-1 text-slate-500">历史确认仍需当前来源和整页验收，不自动执行。</p></details>}
    {groups.map(group=>group.items.length>1?<details key={group.code} className="rounded border border-slate-700 p-2"><summary className="cursor-pointer text-rose-200">{group.code==='redesign_content_missing'?'原业务文案待核对':userFacingMessage(group.items[0].message)} · {group.items.length} 项</summary><div className="mt-2 space-y-3">{group.items.map(findingRow)}</div></details>:<div key={group.code}>{findingRow(group.items[0],0)}</div>)}
    {targets.length>0&&<details className="rounded border border-slate-700 p-2" data-testid="failed-draft-action-labels">
      <summary className="cursor-pointer text-slate-300">{t('failedDraft.labelsSummary',{count:targets.length})}</summary>
      <p className="mt-2 text-[11px] text-slate-400">{t('failedDraft.labelHint')}</p>
      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {targets.map(target=><label key={target.nid} className="block space-y-1 text-[11px]">
          <span>{t('failedDraft.actionLabel',{nid:target.nid})}</span>
          <input aria-label={t('failedDraft.actionLabelAria',{nid:target.nid})} maxLength={160} value={labels[target.nid]??''} disabled={locked}
            onChange={e=>setLabels(prev=>({...prev,[target.nid]:e.target.value}))} placeholder={t('failedDraft.labelPlaceholder')}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200"/>
        </label>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onSuggest} disabled={locked||value.aiAttempted||!saved} className="px-2 py-1.5 rounded bg-slate-800 disabled:opacity-40">{t('failedDraft.aiSuggestOnce')}</button>
        <button type="button" onClick={()=>onRepair(targets.map(target=>({nid:target.nid,text:labels[target.nid]??''})))}
          disabled={locked||targets.some(target=>!labels[target.nid]?.trim())} className="px-2 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40">{t('failedDraft.confirmLabelsRepair')}</button>
      </div>
    </details>}
    {regions.length>0&&<details className="rounded border border-slate-700 p-2" open={Boolean(blockerPlan&&selected.length)}>
      <summary className="cursor-pointer">{t('failedDraft.localRepairSummary')}</summary>
      <p className="mt-2 text-slate-400">{t('failedDraft.localRepairHint')}</p>
      <div className="max-h-36 overflow-y-auto">{regions.map(r=><label key={r.nid} className="flex items-center gap-2 py-1"><input type="checkbox" disabled={locked||(!selected.includes(r.nid)&&selected.length>=3)} checked={selected.includes(r.nid)} onChange={e=>setSelected(v=>e.target.checked?[...v,r.nid]:v.filter(n=>n!==r.nid))}/>{r.label} · {r.nid}</label>)}</div>
      {reviewChoices.sources.length>0&&<details className="my-2 rounded border border-slate-700 p-2">
        <summary className="cursor-pointer">逐项确认原文替换 · {reviewChoices.sources.length} 项可核对</summary>
        <p className="mt-2 text-slate-400">先选区域，再对应原文与草稿文本。勾选后仅确认该项替换，最多8项；未勾选仍需保留原文。按钮、字段和保护内容按原规则检查。</p>
        <div className="max-h-72 space-y-3 overflow-y-auto">{reviewChoices.sources.map(s=>{
          const c=textChoices[s.sourceNid]??{confirmed:false,targetNid:'',after:''};
          const change=(next:Partial<typeof c>)=>setTextChoices(v=>({...v,[s.sourceNid]:{...c,...next}}));
          return <div key={s.sourceNid} className="space-y-1 border-t border-slate-700 pt-2">
            <p className="whitespace-pre-wrap break-words text-slate-200">原文 [{s.sourceNid}]：{s.before}</p>
            <select aria-label={`对应草稿文本 ${s.sourceNid}`} value={c.targetNid} disabled={locked||!selected.length} onChange={e=>{const target=availableTextTargets.find(row=>row.targetNid===e.target.value);change({targetNid:e.target.value,after:target?.text??'',confirmed:false});}} className="w-full rounded border border-slate-700 bg-slate-950 p-1">
              <option value="">选择对应文本节点</option>{availableTextTargets.map(row=><option key={row.targetNid} value={row.targetNid}>{row.targetNid} · {row.text}</option>)}
            </select>
            <textarea aria-label={`确认替换文案 ${s.sourceNid}`} rows={2} maxLength={400} disabled={locked||!c.targetNid} value={c.after} onChange={e=>change({after:e.target.value,confirmed:false})} className="w-full rounded border border-slate-700 bg-slate-950 p-1"/>
            <label className="flex items-center gap-2"><input aria-label={`确认替换原文 ${s.sourceNid}`} type="checkbox" checked={c.confirmed} disabled={locked||!c.after.trim()||!availableTextTargets.some(row=>row.targetNid===c.targetNid)||(!c.confirmed&&confirmedTextChanges.length>=8)} onChange={e=>change({confirmed:e.target.checked})}/>确认该原文由此节点的新文案替代</label>
          </div>;
        })}</div>
      </details>}
      <textarea aria-label={t('failedDraft.repairInstructionAria')} rows={3} maxLength={2000} value={instruction} disabled={locked} onChange={e=>setInstruction(e.target.value)} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder={t('failedDraft.repairInstructionPlaceholder')}/>
      {invalidTextChoices&&<p role="status" className="text-amber-200">请核对已确认文案的区域、唯一目标和非空文字。</p>}
      <button type="button" disabled={locked||!selected.length||!instruction.trim()||invalidTextChoices} onClick={()=>onRepair([],{nids:selected,instruction,...(confirmedTextChanges.length?{textChanges:confirmedTextChanges}:{})})} className="mt-2 rounded bg-blue-600 px-2 py-1 disabled:opacity-40">{t('failedDraft.repairSelectedRegions')}</button>
    </details>}
    {!targets.length&&<p className="text-[11px] text-slate-400">{regions.length?t('failedDraft.noLabelRepairWithRegions'):t('failedDraft.noSafeRegions')}</p>}
    {notice&&<p role="status" className="text-[11px] text-amber-200 break-words">{notice}</p>}
    {!compactActions&&fixBlockersButton}
    <div className="flex gap-3 text-[11px]">
      <button type="button" onClick={()=>setCode(!code)} className="text-blue-300">{code?t('failedDraft.hideSource'):t('failedDraft.viewSource')}</button>
      <button type="button" onClick={onRegenerate} disabled={busy} className="text-slate-300 disabled:opacity-40">{t('failedDraft.regenerate')}</button>
    </div>
    {code&&<div className="space-y-2">
      {focus&&<pre aria-label="定位的错误节点" className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-amber-700/50 rounded p-2 text-[10px]">{focused?`${focused.label}：\n${focused.html}`:`未找到唯一节点 ${focus}，请核对原页与完整草稿。`}</pre>}
      <pre aria-label={t('failedDraft.draftSourceAria')} className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-slate-950 rounded p-2 text-[10px] select-text">{value.draft.html}</pre>
    </div>}
  </section>;
}

/** Compact Fix-blockers CTA for the latest-message dock (outside tall draft history). */
export function FailedDraftFixBlockersDock({value,busy,onRepair}:{
  value:SavedQualityDraft;busy?:boolean;onRepair:(labels:DraftLabel[],region?:DraftRegionRequest)=>void;
}) {
  const t=useT();
  const baseline=useProjectStore(state=>value.decision.targetScreenId?state.screens[value.decision.targetScreenId]?.htmlContent:undefined);
  const findings=value.draft.quality.findings;
  const errors=findings.filter(f=>findingDisposition(f)==='blocker'||findingDisposition(f)==='layout-risk');
  const regions=draftRegionChoices(value.draft);
  const blockerPlan=useMemo(()=>errors.length?blockerRegionRepairPlan(value.draft,baseline):null,[value.draft,baseline,findings]);
  const locked=busy||value.status==='resolved';
  // Only surface when there are real blockers that map to repairable regions.
  if(value.status!=='blocked'||!errors.length||!regions.length||!blockerPlan)return null;
  return <aside data-testid="failed-draft-fix-blockers-dock" aria-label={t('failedDraft.fixBlockersDockAria')}
    className="mx-3 mb-2 rounded-xl border border-rose-700/60 bg-rose-950/40 px-3 py-2.5 shadow-lg">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-rose-100">{t('failedDraft.fixBlockersDockTitle')}</p>
        <p className="text-[11px] text-slate-400">{t('failedDraft.fixBlockersHint')}</p>
      </div>
      <button type="button" disabled={locked||!blockerPlan}
        title={blockerPlan?blockerPlan.nids.map(id=>regions.find(r=>r.nid===id)?.label??id).join('、'):t('failedDraft.fixBlockersUnavailable')}
        onClick={()=>{if(blockerPlan)onRepair([],blockerPlan);}}
        className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
        {t('failedDraft.fixBlockers')}{blockerPlan?` · ${blockerPlan.nids.length}`:''}
      </button>
    </div>
    {!blockerPlan&&<p className="mt-1 text-[11px] text-amber-200">{t('failedDraft.fixBlockersUnavailable')}</p>}
  </aside>;
}
