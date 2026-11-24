import React,{useState} from 'react';
import {useT} from '../../stores/useLocaleStore';
import {useProjectStore} from '../../stores/useProjectStore';
import {repairCompressedBodyCards} from '../../utils/textLayoutRepair';
import {captureModificationSnapshot,isModificationSnapshotCurrent} from '../../services/ai/modificationReview';
import {checkGenerationQuality,qualitySummary} from '../../services/ai/generationQuality';
import {buildDesignTaskContract} from '../../services/ai/designWorkflow';
import {localEditExecutionRecord} from '../../services/ai/designExecutionRecord';

export function TextLayoutRepairDialog({screenId,textNids,onClose}:{screenId:string;textNids:string[];onClose:()=>void}){
 const t=useT();
 const [preview]=useState(()=>{
  try{
   const s=useProjectStore.getState(),screen=s.screens[screenId];
   if(!screen||screen.metadata?.importedHtml||s.stagedScreen)throw Error(t('repair.layoutStateChanged'));
   const snapshot=captureModificationSnapshot(s,screenId),repair=repairCompressedBodyCards(screen.htmlContent,textNids,s.getProtectedNids(screenId));
   const quality=checkGenerationQuality(repair.html,{designSystem:s.designSystem,deviceProfile:s.settings.deviceProfile,useCustomNavigation:s.settings.useCustomNavigation,baselineHtml:screen.htmlContent,preserveNids:true,protectedNids:s.getProtectedNids(screenId)});
   if(!quality.passed)throw Error(qualitySummary(quality));
   return {snapshot,repair,quality};
  }catch(e){return {error:e instanceof Error?e.message:String(e)};}
 });
 const [error,setError]=useState('');
 const stage=()=>{
  try{
   if(!preview.repair||!preview.snapshot||!preview.quality)throw Error(preview.error);
   const s=useProjectStore.getState();
   if(s.stagedScreen||!isModificationSnapshotCurrent(s,preview.snapshot))throw Error(t('repair.layoutSnapshotStale'));
   const screen=s.screens[screenId],request=`仅将${preview.repair.count}张建议卡片改为纵向正文布局，顶部操作组允许整体换行；保留节点结构、文案和其它区域。`;
   const contract=buildDesignTaskContract({intent:'modify_screen',request,target:screen,deviceProfile:s.settings.deviceProfile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem,
    allowedChanges:preview.repair.rootNids.map(nid=>'element:'+nid),protectedNids:s.getProtectedNids(screenId)});
   s.stageScreenChange(screenId,preview.repair.html,`${screen.name}${t('repair.layoutStagedTitleSuffix')}`,request,contract,
    localEditExecutionRecord({html:preview.repair.html,qualityReport:preview.quality,mode:'local',targetNids:preview.repair.rootNids,operationCount:preview.repair.count}));
   s.panToScreen(screenId);onClose();
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 };
 return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-6" role="dialog" aria-modal="true" aria-label={t('repair.layoutDialogTitle')}>
  <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-200">
   <h2 className="font-semibold">{t('repair.layoutDialogTitle')}</h2>
   {preview.repair&&<><p>{t('repair.layoutDialogSummary',{count:preview.repair.count})}</p><p className="text-slate-400">{t('repair.layoutDialogDetail')}</p></>}
   {(preview.error||error)&&<p role="alert" className="text-rose-300">{error||preview.error}</p>}
   <div className="flex justify-end gap-3"><button type="button" onClick={onClose}>{t('common.cancel')}</button><button type="button" disabled={!preview.repair||Boolean(error)} onClick={stage} className="rounded-lg bg-blue-600 px-3 py-2 disabled:opacity-50">{t('repair.layoutGenerateBtn')}</button></div>
  </div>
 </div>;
}
