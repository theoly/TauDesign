import type { StyleOverride } from '../../../../types/project';

export interface PageReferenceSnapshot {
  id:string;
  name:string;
  /** Compatibility field: this now carries the actual document, not a text-stripped skeleton. */
  skeletonHtml:string;
  styles?:string;
  analysis?:string;
  format?:'full'|'compact';
}
export interface PageReferenceSource {id:string;name:string;htmlContent:string;scopedCss?:string}

/** Static evidence only. No source scripts run and no backend behavior is inferred. */
export function buildPageReferenceSnapshot(screen:PageReferenceSource,overrides:Record<string,StyleOverride>={}):PageReferenceSnapshot {
  const doc=new DOMParser().parseFromString(screen.htmlContent,'text/html');
  doc.querySelectorAll('script,iframe,object,embed').forEach(el=>el.remove());
  doc.querySelectorAll('*').forEach(el=>{for(const attribute of Array.from(el.attributes)){
    if(attribute.name.startsWith('on'))el.removeAttribute(attribute.name);
    if(attribute.value.startsWith('data:'))el.setAttribute(attribute.name,'[binary asset omitted]');
  }});
  const texts=(selector:string)=>[...new Set(Array.from(doc.querySelectorAll(selector)).map(el=>(el.textContent??'').trim().replace(/\s+/g,' ').slice(0,240)).filter(Boolean))].slice(0,24);
  const analysis=JSON.stringify({headings:texts('h1,h2,h3,legend'),actions:texts('button,[role="button"]'),
    fields:Array.from(doc.querySelectorAll('input,select,textarea')).slice(0,32).map(el=>({tag:el.tagName.toLowerCase(),type:el.getAttribute('type')??'',name:el.getAttribute('name')??'',label:el.getAttribute('aria-label')??el.getAttribute('placeholder')??'',required:el.hasAttribute('required'),disabled:el.hasAttribute('disabled')})),
    labels:texts('label,th'),navigation:Array.from(doc.querySelectorAll('a[href]')).slice(0,24).map(el=>({text:el.textContent?.trim(),href:el.getAttribute('href')})),
    evidenceNotice:'仅为可见UI与声明结构；不能证明后台流程、真实权限或可执行业务逻辑。'});
  const overrideCss=Object.entries(overrides).filter(([key])=>key.startsWith(`${screen.id}:`)).map(([,ov])=>{
    const selector=ov.nid.replace(/["\\]/g,'\\$&');
    return `[data-nid="${selector}"] { ${Object.entries(ov.declarations).filter(([,v])=>v).map(([p,v])=>`${p}: ${v} !important;`).join(' ')} }`;
  }).join('\n');
  return {id:screen.id,name:screen.name,skeletonHtml:doc.documentElement.outerHTML,
    styles:`/* 页面级 CSS */\n${screen.scopedCss??''}\n/* L4 用户当前覆盖，优先于页面基线 */\n${overrideCss}`,analysis,format:'full'};
}

/** Explicit bounded fallback, preserving valid markup, source styles and business evidence. */
export function compactPageReference(ref:PageReferenceSnapshot,limit=12000):PageReferenceSnapshot {
  const doc=new DOMParser().parseFromString(ref.skeletonHtml,'text/html');
  const css=Array.from(doc.querySelectorAll('style')).map(el=>el.textContent??'').join('\n');
  doc.querySelectorAll('style').forEach(el=>el.remove());
  doc.querySelectorAll('svg').forEach(svg=>svg.replaceChildren());
  doc.querySelectorAll('img').forEach(el=>el.removeAttribute('srcset'));
  const analysisBudget=Math.floor(limit*.25),styleBudget=Math.floor(limit*.45),htmlBudget=Math.floor(limit*.25);
  const excerpt=(text:string,max:number)=>text.length>max?text.slice(0,Math.max(0,max-40))+'\n[预算压缩：后续内容未包含]':text;
  const marker='/* L4';
  const split=(ref.styles??'').indexOf(marker);
  const baseline=css+'\n'+(split<0?(ref.styles??''):(ref.styles??'').slice(0,split));
  const overrides=split<0?'':(ref.styles??'').slice(split);
  const overrideBudget=Math.min(Math.floor(styleBudget*.55),overrides.length);
  const styles=excerpt(baseline,styleBudget-overrideBudget-2)+'\n'+excerpt(overrides,overrideBudget);
  if(doc.documentElement.outerHTML.length>htmlBudget){
    doc.head.replaceChildren();
    const main=doc.createElement('main');main.textContent='[完整DOM超出预算；请结合下方业务摘要与CSS，不能假定未提供细节]';doc.body.replaceChildren(main);
  }
  return {...ref,skeletonHtml:doc.documentElement.outerHTML,styles,analysis:excerpt(ref.analysis??'',analysisBudget),format:'compact'};
}
