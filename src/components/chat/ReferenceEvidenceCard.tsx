import React,{useEffect,useRef,useState} from 'react';
import type {ReferenceEvidence} from '../../services/ai/referenceEvidence';
import {validReferenceEvidence} from '../../services/ai/referenceEvidence';
import {useProjectStore} from '../../stores/useProjectStore';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {createMediaResourceSession} from '../../services/storage/mediaResourceSession';
import {referenceBytes,sha256} from '../../utils/referenceImagePreparation';

/** Read-only, content-verified previews; no data URL is put into the rendered document. */
export function ReferenceImagePreview({evidence}:{evidence:ReferenceEvidence}){
 const projectId=useProjectStore(s=>s.id),folderPath=useProjectStore(s=>s.folderPath);
 const session=useRef<ReturnType<typeof createMediaResourceSession>|null>(null),sequence=useRef(0);
 const [preview,setPreview]=useState<{url?:string;caption?:string;error?:string;loading?:boolean}>({});
 useEffect(()=>{const value=createMediaResourceSession();session.current=value;setPreview({});return ()=>{sequence.current++;session.current=null;void value.close().catch(()=>{});};},[evidence.fingerprint,projectId,folderPath]);
 const show=async(path:string,hash:string,caption:string)=>{
  const owner=session.current,attempt=++sequence.current;if(!owner)return;setPreview({loading:true,caption});
  const current=()=>session.current===owner&&sequence.current===attempt;
  try{const storage=createProjectStorage(projectId,folderPath),bytes=storage.readBinaryLimited?await storage.readBinaryLimited(path,32*1024*1024):await storage.readBinary(path);
   if(!current())return;if(!bytes)throw Error('图片文件不存在，请重新解析参考图。');
   const mime='image/'+path.split('.').at(-1)!.replace('jpg','jpeg');
   if(await sha256(referenceBytes(`data:${mime};base64,${bytes}`).bytes)!==hash)throw Error('图片字节已变化，未展示不匹配的副本。');
   if(!current())return;const url=await owner.url(path,bytes,mime);if(current())setPreview({url,caption});
  }catch(error){if(current())setPreview({error:error instanceof Error?error.message:'图片预览失败。'});}
 };
 return <div className="space-y-2"><div className="flex flex-wrap gap-2">
  <button type="button" onClick={()=>void show(evidence.sourcePath,evidence.sourceSha256,`原图 ${evidence.width}×${evidence.height}`)} className="rounded border border-slate-700 px-2 py-1">查看原图</button>
  {evidence.parts.map((p,i)=><button key={p.relPath+':'+i} type="button" onClick={()=>void show(p.relPath,p.sha256,`${p.overview?'总览':'细节'} ${p.width}×${p.height}；原图区域 x=${p.rect.x}, y=${p.rect.y}, ${p.rect.width}×${p.rect.height}`)} className="rounded border border-slate-700 px-2 py-1">查看发送片段 {i+1}{p.overview?'（总览）':''}</button>)}
 </div>{preview.loading&&<p role="status">正在核对图片文件…</p>}{preview.error&&<p role="alert" className="text-amber-300">{preview.error}</p>}{preview.url&&<figure><img src={preview.url} alt={preview.caption} className="max-h-64 max-w-full object-contain"/><figcaption className="mt-1 text-slate-500">{preview.caption}</figcaption></figure>}</div>;
}
export function ReferenceEvidenceCard({evidence,reused,busy,onCorrect}:{evidence?:ReferenceEvidence;reused?:boolean;busy?:boolean;onCorrect:(text:string)=>void}){
 const [correction,setCorrection]=useState('');
 if(!validReferenceEvidence(evidence))return null;
 const o=evidence.observation;
 return <details className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-4 text-slate-300">
  <summary className="cursor-pointer">参考图解析{reused?' · 已复用':''} · {o.fields.length} 个字段{evidence.parts.length>1?` · ${evidence.parts.length} 个观察片段`:''}</summary>
  <div className="mt-2 space-y-2"><p>{o.summary}</p>
   <p className="text-slate-500 break-all">原图 {evidence.width}×{evidence.height} · SHA-256 {evidence.sourceSha256.slice(0,12)} · {evidence.parser.model}</p>
   <ReferenceImagePreview evidence={evidence}/>
   {o.groups.map((g,i)=><p key={i}><strong>{g.title}</strong>：{g.items.join('、')}（{g.position}）</p>)}
   {o.fields.length>0&&<ul>{o.fields.map((f,i)=><li key={i}>{f.group} / {f.label}{f.required?'（必填）':''} · {f.type}{f.value?` · ${f.value}`:''}</li>)}</ul>}
   <details><summary className="cursor-pointer">识别原文与视觉约束</summary><div className="max-h-48 overflow-y-auto whitespace-pre-wrap">{[...o.texts,...o.visual].join('\n')}</div></details>
   {o.uncertainties.length>0&&<p className="text-amber-300">待核对：{o.uncertainties.join('；')}</p>}
   <p className="text-slate-500">后续代码请求复用这些资料，不重复发送图片。解析不能证明后台功能或精确视觉一致。</p>
   <label className="block">补充或更正（保留原解析，作为新的用户要求）<textarea aria-label="更正图片解析" value={correction} onChange={e=>setCorrection(e.target.value)} maxLength={2000} rows={2} disabled={busy} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"/></label>
   <button type="button" disabled={busy||!correction.trim()} onClick={()=>onCorrect(correction.trim())} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">按更正要求重新生成</button>
  </div>
 </details>;
}
