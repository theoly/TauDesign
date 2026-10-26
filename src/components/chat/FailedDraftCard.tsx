import React, { useEffect, useState } from 'react';
import type { SavedQualityDraft } from '../../services/storage/qualityDraftRepository';
import { draftRepairTargets, type DraftLabel } from '../../services/ai/qualityDraft';
import { useProjectStore } from '../../stores/useProjectStore';

export function FailedDraftCard({value,saved,busy,notice,onSuggest,onRepair,onRegenerate}: {
  value:SavedQualityDraft;saved?:boolean;busy?:boolean;notice?:string;
  onSuggest:()=>void;onRepair:(labels:DraftLabel[])=>void;onRegenerate:()=>void;
}) {
  const baseline=useProjectStore(state=>value.decision.targetScreenId?state.screens[value.decision.targetScreenId]?.htmlContent:undefined);
  const targets=draftRepairTargets(value.draft,baseline);
  const defaults=()=>Object.fromEntries(targets.map(t=>[t.nid,value.suggestions?.find(l=>l.nid===t.nid)?.text||t.originalLabel]));
  const [labels,setLabels]=useState<Record<string,string>>(defaults),[focus,setFocus]=useState<string>(),[code,setCode]=useState(false);
  const suggestionKey=JSON.stringify(value.suggestions);
  useEffect(()=>setLabels(defaults()),[value.draft.fingerprint,suggestionKey]);
  const errors=value.draft.quality.findings.filter(f=>f.severity==='error'),warnings=value.draft.quality.findings.filter(f=>f.severity==='warning');
  const locked=busy||value.status==='resolved';
  return <section aria-label="未通过验收的页面草稿" className="mt-2 p-3 space-y-3 rounded-xl border border-amber-700/50 bg-slate-900 text-xs text-slate-300">
    <div className="font-semibold text-slate-100">{value.status==='resolved'?'原失败草稿 · 已完成修复':'页面已生成，暂未通过验收'}</div>
    <p><span className="text-rose-300">{errors.length} 项阻断</span> · <span className="text-amber-300">{warnings.length} 项警告</span></p>
    <p className="text-[11px] text-slate-400">{saved?'失败草稿已保存，可重新打开查看。':'草稿尚未保存至磁盘。'} 原页面未改变，草稿不能采纳。实际排版尚未验收。</p>
    {errors.map((f,index)=><div key={index} className="text-[11px] text-rose-200">
      {f.message} {f.nid&&<button type="button" onClick={()=>{setCode(true);setFocus(f.nid);}} className="text-blue-300 underline">定位源码 [{f.nid}]</button>}
    </div>)}
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
    {!targets.length&&<p className="text-[11px] text-slate-400">此类问题暂不支持安全文本修复，请查看源码后调整要求重新生成。</p>}
    {notice&&<p role="status" className="text-[11px] text-amber-200 break-words">{notice}</p>}
    <div className="flex gap-3 text-[11px]">
      <button type="button" onClick={()=>setCode(!code)} className="text-blue-300">{code?'收起源码':'查看草稿源码'}</button>
      <button type="button" onClick={onRegenerate} disabled={busy} className="text-slate-300 disabled:opacity-40">从头重新生成</button>
    </div>
    {code&&<div className="space-y-2">
      {focus&&<pre aria-label="定位的错误节点" className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-amber-700/50 rounded p-2 text-[10px]">{targets.find(t=>t.nid===focus)?.fragment??`节点 ${focus}，请在完整源码中查找。`}</pre>}
      <pre aria-label="失败草稿源码" className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-slate-950 rounded p-2 text-[10px] select-text">{value.draft.html}</pre>
    </div>}
  </section>;
}
