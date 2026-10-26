import React,{useEffect,useRef,useState} from 'react';
import type {MultiPageItem,MultiPageReview} from '../../services/ai/multiPageContract';
import {validateVariantItems,validateMultiPageItems} from '../../services/ai/multiPageContract';
import {pageCreationContext} from '../../services/ai/pageCreationValidation';
import {useProjectStore} from '../../stores/useProjectStore';
const labels={pending:'待生成',generating:'正在生成与检查',checked:'已验收，等待统一加入',applied:'已加入画布',failed:'未通过'};
export function MultiPagePlanCard({review,disabled,onConfirm,onCancel}:{review:MultiPageReview;disabled:boolean;onConfirm:(pages:MultiPageItem[])=>Promise<void>;onCancel:()=>void}){
 const project=useProjectStore(),[pages,setPages]=useState<MultiPageItem[]>(()=>structuredClone(review.plan?.pages??[])),[busy,setBusy]=useState(false),lock=useRef(false);
 useEffect(()=>{setPages(structuredClone(review.plan?.pages??[]));},[review.plan?.id]);
 const variants=review.plan?.kind==='variants',unit=variants?'个方案':'页',item=variants?'方案':'页';
 const stale=review.status==='ready'&&review.plan?.contextFingerprint!==pageCreationContext(project);
 let issue='';try{if(review.status==='ready'){if(variants)validateVariantItems(pages);else validateMultiPageItems(pages);}}catch(error){issue=error instanceof Error?error.message:'计划无效';}
 const change=(id:string,update:Partial<MultiPageItem>)=>setPages(current=>current.map(p=>p.id===id?{...p,...update}:p));
 return <section data-testid="multi-page-plan" className="space-y-3 rounded-xl border border-blue-900 bg-slate-950 p-3 text-xs text-slate-300">
  <h3 className="font-semibold text-slate-100">{variants?'同页方案比较':'多页面计划'}</h3>
  <p role="status" className="whitespace-pre-wrap text-slate-400">{review.message}</p>
  {review.status==='ready'&&<>
   <p className="text-slate-500">{variants?`确认 ${pages.length} 个方案；可编辑各方案差异，至少保留2个。全部通过后并排新增，不覆盖原页，不更改项目主题。`:`确认 ${pages.length} 页；可修改页面要求与关联、移除不需要的页面。全部页面通过检查后一起加入画布。`}</p>
   <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
    {pages.map((page,index)=><details key={page.id} open={index===0} className="space-y-2 rounded-lg border border-slate-800 p-2">
     <summary className="cursor-pointer break-words font-medium">{index+1}. {page.name||'未命名页面'}</summary>
     <label className="block space-y-1">{variants?'方案名称':'页面名称'}<input aria-label={`第${index+1}${item}名称`} maxLength={20} disabled={busy||disabled} value={page.name} onChange={e=>change(page.id,{name:e.target.value})} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"/></label>
     <label className="block space-y-1">{variants?'共同功能与本方案差异':'本页要求'}<textarea aria-label={`第${index+1}${item}要求`} maxLength={1600} disabled={busy||disabled} value={page.requirements} onChange={e=>change(page.id,{requirements:e.target.value})} rows={3} className="w-full resize-y rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"/></label>
     {!variants&&<fieldset disabled={busy||disabled} className="space-y-1"><legend className="mb-1 text-slate-500">本页需要关联的页面</legend>{pages.filter(p=>p.id!==page.id).map(target=><label key={target.id} className="flex items-start gap-2 break-words text-slate-400"><input type="checkbox" aria-label={`${page.name} → ${target.name}`} checked={page.links.includes(target.id)} onChange={e=>change(page.id,{links:e.target.checked?[...page.links,target.id]:page.links.filter(id=>id!==target.id)})}/>{target.name}</label>)}</fieldset>}
     <button type="button" disabled={busy||disabled||pages.length<=(variants?2:1)} onClick={()=>setPages(current=>current.filter(p=>p.id!==page.id).map(p=>({...p,links:p.links.filter(id=>id!==page.id)})))} className="text-slate-500 hover:text-red-300 disabled:opacity-40">{variants?'移除此方案':'移除此页'}：{page.name}</button>
    </details>)}
   </div>
   {(issue||stale)&&<p role="alert" className="text-amber-300">{stale?'工程或设计上下文已变化，请取消后重新规划。':issue}</p>}
   <button type="button" disabled={disabled||busy||stale||Boolean(issue)} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{await onConfirm(structuredClone(pages));}finally{lock.current=false;setBusy(false);}}} className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-40">确认计划并生成 {pages.length} {unit}</button>
  </>}
  {!!review.progress?.length&&<ol className="space-y-2">{review.progress.map((page,index)=><li key={page.itemId} className="rounded-lg border border-slate-800 p-2"><p className="break-words">{index+1}. {page.name} · <span className={page.status==='failed'?'text-red-300':page.status==='applied'?'text-emerald-300':'text-blue-300'}>{labels[page.status]}</span></p>{page.message&&<p className="mt-1 break-words text-slate-400">{page.message}</p>}</li>)}</ol>}
  {['planning','ready','running'].includes(review.status)&&<button type="button" onClick={onCancel} className="ml-2 text-slate-400 hover:text-slate-200">{variants?'取消方案任务':'取消多页面任务'}</button>}
  {['blocked','cancelled'].includes(review.status)&&<p className="text-slate-500">{variants?'本批次未加入方案。可调整需求后重新发送方案请求。':'本批次未加入页面。可调整需求后重新发送多页面请求。'}</p>}
 </section>;
}
