import React,{useEffect,useRef,useState} from 'react';
import type {ReferenceEvidence} from '../../services/ai/referenceEvidence';
import {validReferenceEvidence} from '../../services/ai/referenceEvidence';
import {useProjectStore} from '../../stores/useProjectStore';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {createMediaResourceSession} from '../../services/storage/mediaResourceSession';
import {referenceBytes,sha256} from '../../utils/referenceImagePreparation';
import {useT} from '../../stores/useLocaleStore';

/** Read-only, content-verified previews; no data URL is put into the rendered document. */
export function ReferenceImagePreview({evidence}:{evidence:ReferenceEvidence}){
 const t=useT();
 const projectId=useProjectStore(s=>s.id),folderPath=useProjectStore(s=>s.folderPath);
 const session=useRef<ReturnType<typeof createMediaResourceSession>|null>(null),sequence=useRef(0);
 const [preview,setPreview]=useState<{url?:string;caption?:string;error?:string;loading?:boolean}>({});
 useEffect(()=>{const value=createMediaResourceSession();session.current=value;setPreview({});return ()=>{sequence.current++;session.current=null;void value.close().catch(()=>{});};},[evidence.fingerprint,projectId,folderPath]);
 const show=async(path:string,hash:string,caption:string)=>{
  const owner=session.current,attempt=++sequence.current;if(!owner)return;setPreview({loading:true,caption});
  const current=()=>session.current===owner&&sequence.current===attempt;
  try{const storage=createProjectStorage(projectId,folderPath),bytes=storage.readBinaryLimited?await storage.readBinaryLimited(path,32*1024*1024):await storage.readBinary(path);
   if(!current())return;if(!bytes)throw Error(t('chat.refImgMissing'));
   const mime='image/'+path.split('.').at(-1)!.replace('jpg','jpeg');
   if(await sha256(referenceBytes(`data:${mime};base64,${bytes}`).bytes)!==hash)throw Error(t('chat.refImgChanged'));
   if(!current())return;const url=await owner.url(path,bytes,mime);if(current())setPreview({url,caption});
  }catch(error){if(current())setPreview({error:error instanceof Error?error.message:t('chat.refImgFailed')});}
 };
 return <div className="space-y-2"><div className="flex flex-wrap gap-2">
  <button type="button" onClick={()=>void show(evidence.sourcePath,evidence.sourceSha256,t('chat.refImgOriginalCaption',{w:evidence.width,h:evidence.height}))} className="rounded border border-slate-700 px-2 py-1">{t('chat.refImgViewOriginal')}</button>
  {evidence.parts.map((p,i)=><button key={p.relPath+':'+i} type="button" onClick={()=>void show(p.relPath,p.sha256,t('chat.refImgPartCaption',{kind:p.overview?t('chat.refImgPartOverview'):t('chat.refImgPartDetail'),w:p.width,h:p.height,x:p.rect.x,y:p.rect.y,rw:p.rect.width,rh:p.rect.height}))} className="rounded border border-slate-700 px-2 py-1">{t('chat.refImgViewPart',{index:i+1,overviewSuffix:p.overview?t('chat.refImgPartOverviewTag'):''})}</button>)}
 </div>{preview.loading&&<p role="status">{t('chat.refImgChecking')}</p>}{preview.error&&<p role="alert" className="text-amber-300">{preview.error}</p>}{preview.url&&<figure><img src={preview.url} alt={preview.caption} className="max-h-64 max-w-full object-contain"/><figcaption className="mt-1 text-slate-500">{preview.caption}</figcaption></figure>}</div>;
}
export function ReferenceEvidenceCard({evidence,reused,busy,onCorrect}:{evidence?:ReferenceEvidence;reused?:boolean;busy?:boolean;onCorrect:(text:string)=>void}){
 const t=useT();
 const [correction,setCorrection]=useState('');
 if(!validReferenceEvidence(evidence))return null;
 const o=evidence.observation;
 return <details className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-4 text-slate-300">
  <summary className="cursor-pointer">{t('chat.referenceEvidenceSummary',{reused:reused?t('chat.referenceEvidenceReused'):'',fields:t('chat.referenceEvidenceFields',{count:o.fields.length}),parts:evidence.parts.length>1?t('chat.referenceEvidenceParts',{count:evidence.parts.length}):''})}</summary>
  <div className="mt-2 space-y-2"><p>{o.summary}</p>
   <p className="text-slate-500 break-all">{t('chat.refImgMetaLine',{w:evidence.width,h:evidence.height,sha:evidence.sourceSha256.slice(0,12),model:evidence.parser.model})}</p>
   <ReferenceImagePreview evidence={evidence}/>
   {o.groups.map((g,i)=><p key={i}><strong>{g.title}</strong>：{g.items.join('、')}（{g.position}）</p>)}
   {o.fields.length>0&&<ul>{o.fields.map((f,i)=><li key={i}>{f.group} / {f.label}{f.required?t('chat.refImgRequiredTag'):''} · {f.type}{f.value?` · ${f.value}`:''}</li>)}</ul>}
   <details><summary className="cursor-pointer">{t('chat.refImgTextsSummary')}</summary><div className="max-h-48 overflow-y-auto whitespace-pre-wrap">{[...o.texts,...o.visual].join('\n')}</div></details>
   {o.uncertainties.length>0&&<p className="text-amber-300">{t('chat.refImgUncertainties',{items:o.uncertainties.join('；')})}</p>}
   <p className="text-slate-500">{t('chat.refImgReuseNote')}</p>
   <label className="block">{t('chat.refImgCorrectionLabel')}<textarea aria-label={t('chat.refImgCorrectionAria')} value={correction} onChange={e=>setCorrection(e.target.value)} maxLength={2000} rows={2} disabled={busy} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"/></label>
   <button type="button" disabled={busy||!correction.trim()} onClick={()=>onCorrect(correction.trim())} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">{t('chat.refImgCorrectionBtn')}</button>
  </div>
 </details>;
}
