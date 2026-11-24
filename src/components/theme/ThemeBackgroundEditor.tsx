import React,{useState,useEffect} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {BACKGROUND_ROLES,type BackgroundRole} from '../../types/themeBackground';
import {compileThemeBackground,parseThemeBackground} from '../../utils/themeBackground';
import {useT} from '../../stores/useLocaleStore';

export function ThemeBackgroundEditor(){
 const t=useT();
 const roleLabels:Record<BackgroundRole,string>={page:t('theme.bgRolePage'),primaryAction:t('theme.bgRolePrimaryAction'),decorativeSurface:t('theme.bgRoleDecorative')};
 const {designSystem,settings,setDesignSystem,designLibraryBinding}=useProjectStore();
 const [role,setRole]=useState<BackgroundRole>('page'),[editing,setEditing]=useState(false),[value,setValue]=useState(''),[error,setError]=useState('');
 const paint=designSystem.tokens.backgrounds?.[role]?.[settings.colorMode],current=paint&&compileThemeBackground(paint),parsed=parseThemeBackground(value);
 useEffect(()=>{setEditing(false);setError('');},[settings.colorMode,designSystem.id]);
 const begin=(selected:BackgroundRole)=>{setRole(selected);setValue(compileThemeBackground(designSystem.tokens.backgrounds?.[selected]?.[settings.colorMode]!)??'linear-gradient(180deg, #fff3ea 0%, #ffffff 100%)');setError('');setEditing(true);};
 const save=()=>{if(!parsed)return;try{const next=structuredClone(designSystem);next.tokens.backgrounds??={};next.tokens.backgrounds[role]??={};next.tokens.backgrounds[role]![settings.colorMode]=parsed;setDesignSystem(next);setEditing(false);}catch(e){setError(e instanceof Error?e.message:t('theme.extractApplyFailedErr'));}};
 const clear=()=>{const next=structuredClone(designSystem);if(next.tokens.backgrounds?.[role])delete next.tokens.backgrounds[role]![settings.colorMode];setDesignSystem(next);setEditing(false);};
 return <fieldset disabled={designLibraryBinding?.mode==='pinned_reference'} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4"><legend className="px-1 text-xs font-semibold text-slate-300">{t('theme.bgLegend')}</legend>
  <p className="text-[11px] text-slate-500">{t('theme.bgIntro')}</p>
  <div className="grid grid-cols-3 gap-2">{BACKGROUND_ROLES.map(key=><button type="button" key={key} onClick={()=>begin(key)} className="rounded border border-slate-700 p-2 text-left text-[11px]"><span className="mb-2 block h-7 rounded" style={{background:compileThemeBackground(designSystem.tokens.backgrounds?.[key]?.[settings.colorMode]!)??designSystem.tokens.colors[key==='page'?'background':'surface'][settings.colorMode]}}/>{roleLabels[key]}<span className="mt-1 block text-slate-500">{designSystem.tokens.backgrounds?.[key]?.[settings.colorMode]?t('theme.bgSetEdit'):t('theme.bgFollowSolid')}</span></button>)}</div>
  {editing&&<div className="space-y-2"><label className="block text-xs">{roleLabels[role]}<textarea aria-label={t('theme.bgExpressionAria')} rows={3} value={value} onChange={e=>setValue(e.target.value)} className="mt-2 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"/></label><p className="text-[11px] text-slate-500">{t('theme.bgExpressionHint')}</p><div aria-label={t('theme.bgPreviewAria')} className="h-16 rounded border border-slate-700" style={{background:parsed?compileThemeBackground(parsed)??undefined:current??undefined}}/>{(!parsed||error)&&<p role="alert" className="text-xs text-amber-300">{error||t('theme.bgInvalidExpression')}</p>}<div className="flex gap-2 text-xs"><button disabled={!parsed} onClick={save} className="rounded bg-blue-600 px-3 py-1.5 disabled:opacity-40">{t('theme.bgSaveBtn')}</button><button onClick={clear} className="rounded bg-slate-800 px-3 py-1.5">{t('theme.bgResetSolidBtn')}</button><button onClick={()=>setEditing(false)} className="px-2">{t('common.cancel')}</button></div></div>}
 </fieldset>;
}
