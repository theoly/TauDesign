import React,{useRef,useState} from 'react';
import {useT} from '../../stores/useLocaleStore';
import type { ImageAttachment } from '../../types/referenceImage';
import { cropReferenceImage,type CropRect } from '../../utils/referenceCrop';

export function ReferenceRegionDialog({source,onApply,onClose}:{source:ImageAttachment;onApply:(image:ImageAttachment)=>void;onClose:()=>void}) {
  const t=useT();
  const image=useRef<HTMLImageElement>(null),drag=useRef<{x:number;y:number}>();
  const [size,setSize]=useState({width:0,height:0}),[rect,setRect]=useState<CropRect>({x:0,y:0,width:0,height:0});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const valid=Object.values(rect).every(Number.isInteger)&&rect.x>=0&&rect.y>=0&&rect.width>=8&&rect.height>=8&&rect.width*rect.height<=16_000_000&&rect.x+rect.width<=size.width&&rect.y+rect.height<=size.height;
  const point=(e:React.PointerEvent)=>{const box=image.current!.getBoundingClientRect();return {x:Math.max(0,Math.min(size.width,Math.round((e.clientX-box.left)/box.width*size.width))),y:Math.max(0,Math.min(size.height,Math.round((e.clientY-box.top)/box.height*size.height)))};};
  const move=(e:React.PointerEvent)=>{if(!drag.current)return;const end=point(e),start=drag.current;setRect({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)});};
  const apply=async()=>{if(!valid||busy)return;setBusy(true);setError('');try{onApply(await cropReferenceImage(source,rect));}catch(cause){setError(String(cause instanceof Error?cause.message:cause));}finally{setBusy(false);}};
  return <div role="dialog" aria-modal="true" aria-label={t('chat.regionTitle')} className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-4" onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
    <div className="w-full max-w-4xl max-h-[94vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">{t('chat.regionTitle')}</h2><button type="button" onClick={onClose} aria-label={t('chat.regionCloseAria')}>×</button></div>
      <p className="text-slate-400">{t('chat.regionHint')}</p>
      <div className="overflow-auto bg-slate-950 rounded p-2 text-center">
        <div className="relative inline-block align-top touch-none select-none cursor-crosshair" data-testid="reference-region-surface"
          onPointerDown={e=>{if(!size.width||busy)return;e.preventDefault();drag.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);}}
          onPointerMove={move} onPointerUp={e=>{move(e);drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
          onPointerCancel={()=>{drag.current=undefined;}}>
          <img ref={image} src={source.dataUrl} alt={t('chat.regionAlt')} draggable={false} className="block max-w-full max-h-[58vh] object-contain"
            onLoad={e=>{const img=e.currentTarget;setSize({width:img.naturalWidth,height:img.naturalHeight});setRect({x:0,y:0,width:img.naturalWidth,height:img.naturalHeight});}}
            onError={()=>setError(t('chat.regionLoadError'))}/>
          {size.width>0&&<div className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/10" aria-label={t('chat.regionSelectionAria')}
            style={{left:`${rect.x/size.width*100}%`,top:`${rect.y/size.height*100}%`,width:`${rect.width/size.width*100}%`,height:`${rect.height/size.height*100}%`,boxShadow:'0 0 0 9999px rgb(0 0 0 / .25)',clipPath:'inset(-1px)'}}/>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">{(['x','y','width','height'] as const).map(key=><label key={key} className="space-y-1">{({x:'X',y:'Y',width:t('chat.regionAxisWidth'),height:t('chat.regionAxisHeight')})[key]}
        <input aria-label={t('chat.regionInputAria',{key})} type="number" value={rect[key]} min={key==='x'||key==='y'?0:8} disabled={busy||!size.width}
          onChange={e=>setRect(prev=>({...prev,[key]:Number(e.target.value)}))} className="block w-24 rounded bg-slate-950 border border-slate-700 px-2 py-1.5"/></label>)}</div>
      <p className="text-slate-400">{t('chat.regionSizeLine',{ow:size.width,oh:size.height,rw:rect.width,rh:rect.height})}</p>
      {error&&<p role="alert" className="text-rose-300">{error}</p>}
      <div className="flex justify-end flex-wrap gap-2">
        <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-slate-800">{t('common.cancel')}</button>
        <button type="button" disabled={busy||!size.width} onClick={()=>onApply({name:source.name,dataUrl:source.dataUrl})} className="px-3 py-2 rounded bg-slate-800">{t('chat.regionUseFull')}</button>
        <button type="button" disabled={!valid||busy} onClick={apply} className="px-3 py-2 rounded bg-blue-600 disabled:opacity-40">{busy?t('chat.regionCropping'):t('chat.regionUseSelected')}</button>
      </div>
    </div>
  </div>;
}
