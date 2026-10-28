import React,{useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {repairCompressedBodyCards} from '../../utils/textLayoutRepair';
import {captureModificationSnapshot,isModificationSnapshotCurrent} from '../../services/ai/modificationReview';
import {checkGenerationQuality,qualitySummary} from '../../services/ai/generationQuality';
import {buildDesignTaskContract} from '../../services/ai/designWorkflow';
import {localEditExecutionRecord} from '../../services/ai/designExecutionRecord';

export function TextLayoutRepairDialog({screenId,textNids,onClose}:{screenId:string;textNids:string[];onClose:()=>void}){
 const [preview]=useState(()=>{
  try{
   const s=useProjectStore.getState(),screen=s.screens[screenId];
   if(!screen||screen.metadata?.importedHtml||s.stagedScreen)throw Error('页面状态已变化，请先完成当前候选并重新检查。');
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
   if(s.stagedScreen||!isModificationSnapshotCurrent(s,preview.snapshot))throw Error('原页面或工程已变化，请关闭并重新检查。');
   const screen=s.screens[screenId],request=`仅将${preview.repair.count}张建议卡片改为纵向正文布局，顶部操作组允许整体换行；保留节点结构、文案和其它区域。`;
   const contract=buildDesignTaskContract({intent:'modify_screen',request,target:screen,deviceProfile:s.settings.deviceProfile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem,
    allowedChanges:preview.repair.rootNids.map(nid=>'element:'+nid),protectedNids:s.getProtectedNids(screenId)});
   s.stageScreenChange(screenId,preview.repair.html,`${screen.name}（布局修复候选）`,request,contract,
    localEditExecutionRecord({html:preview.repair.html,qualityReport:preview.quality,mode:'local',targetNids:preview.repair.rootNids,operationCount:preview.repair.count}));
   s.panToScreen(screenId);onClose();
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 };
 return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-6" role="dialog" aria-modal="true" aria-label="预览纵向布局修复">
  <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-200">
   <h2 className="font-semibold">预览纵向布局修复</h2>
   {preview.repair&&<><p>将 {preview.repair.count} 张卡片的正文放到独立一行，顶部操作组空间不足时整体换行。</p><p className="text-slate-400">仅修改容器类名，保留节点、文案和其它区域。先生成副本对比，渲染复检通过后可采纳，采纳后可撤销。</p></>}
   {(preview.error||error)&&<p role="alert" className="text-rose-300">{error||preview.error}</p>}
   <div className="flex justify-end gap-3"><button type="button" onClick={onClose}>取消</button><button type="button" disabled={!preview.repair||Boolean(error)} onClick={stage} className="rounded-lg bg-blue-600 px-3 py-2 disabled:opacity-50">生成修复副本</button></div>
  </div>
 </div>;
}
