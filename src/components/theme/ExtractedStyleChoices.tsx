import React from 'react';
import type {DesignSystem} from '../../types/designSystem';
import {BACKGROUND_ROLES,BACKGROUND_LABELS} from '../../types/themeBackground';
import {compileThemeBackground} from '../../utils/themeBackground';
import {resolveThemeColors} from '../../utils/semanticColors';
import type {PageStyleAnalysis,StyleSelection} from '../../services/import/pageStyleExtraction';

export function ExtractedStyleChoices({analysis,selection,onChange,theme,mode,disabled=false}:{analysis:PageStyleAnalysis;selection:StyleSelection;onChange:(selection:StyleSelection)=>void;theme:DesignSystem;mode:'light'|'dark';disabled?:boolean}) {
 const colors=resolveThemeColors(theme.tokens,mode).values;
 return <fieldset disabled={disabled} className="space-y-3 disabled:opacity-50" aria-label="选择提取的风格项">
  <p className="text-xs leading-relaxed text-slate-400">只更新勾选的项目；每个背景角色最多选择一个。另一明暗模式和未勾选的参数保持原样。</p>
  {BACKGROUND_ROLES.map(role=>{
   const candidates=analysis.backgrounds.filter(c=>c.role===role);if(!candidates.length)return null;
   const current=compileThemeBackground(theme.tokens.backgrounds?.[role]?.[mode]!)??(role==='page'?colors.background:role==='primaryAction'?colors.primary:colors.surface);
   return <div key={role} className="rounded-lg border border-slate-700 p-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><strong>{BACKGROUND_LABELS[role]}</strong><span className="flex items-center gap-2 text-slate-400">当前<span className="h-6 w-16 rounded border border-white/10" style={{background:current}}/></span></div>
    <div className="space-y-2">{candidates.map(candidate=><label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded bg-slate-950/50 p-2 text-xs">
     <input type="checkbox" aria-label={`选择${BACKGROUND_LABELS[role]} · ${candidate.selector}`} checked={selection.backgroundIds.includes(candidate.id)} onChange={event=>onChange({...selection,backgroundIds:event.target.checked?[...selection.backgroundIds.filter(id=>(selection.backgroundRoles?.[id]??analysis.backgrounds.find(c=>c.id===id)?.role)!==(selection.backgroundRoles?.[candidate.id]??role)),candidate.id]:selection.backgroundIds.filter(id=>id!==candidate.id)})}/>
     <span className="h-10 w-20 shrink-0 rounded border border-white/10" style={{background:compileThemeBackground(candidate.paint)??undefined}}/>
     <span className="min-w-0 flex-1 break-words"><span className="block">{candidate.paint.kind==='gradient'?'渐变':'纯色'} · {candidate.confidence==='high'?'来源明确':'需核对用途'}</span><span className="mt-1 block text-slate-500">来源：{candidate.selector}</span><select aria-label={`应用位置 ${candidate.selector}`} className="mt-2 max-w-full rounded bg-slate-800 p-1" value={selection.backgroundRoles?.[candidate.id]??role} onChange={e=>{const chosen=e.target.value as typeof role;onChange({...selection,backgroundRoles:{...selection.backgroundRoles,[candidate.id]:chosen},backgroundIds:selection.backgroundIds.filter(id=>id===candidate.id||(selection.backgroundRoles?.[id]??analysis.backgrounds.find(c=>c.id===id)?.role)!==chosen)});}}>{BACKGROUND_ROLES.map(destination=><option key={destination} value={destination}>{BACKGROUND_LABELS[destination]}</option>)}</select></span>
    </label>)}</div>
   </div>;
  })}
  {!!analysis.fields.length&&<div className="flex flex-wrap gap-3 text-xs">{analysis.fields.map(field=><label key={field} className="flex items-center gap-2"><input type="checkbox" checked={selection.fields.includes(field)} onChange={event=>onChange({...selection,fields:event.target.checked?[...selection.fields,field]:selection.fields.filter(f=>f!==field)})}/>{{primary:'品牌主色',typography:'字体',radius:'操作圆角'}[field]}</label>)}</div>}
  {!!analysis.warnings.length&&<details className="text-xs text-slate-500"><summary className="cursor-pointer">提取说明 · {analysis.warnings.length}项</summary><ul className="mt-2 space-y-1">{analysis.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
 </fieldset>;
}
