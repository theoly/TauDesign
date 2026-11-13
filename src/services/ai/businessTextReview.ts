import {parseHtmlCopy} from '../../utils/htmlDocument';
import {inspectText} from '../../utils/textNode';
import {contentFingerprint} from './designWorkflow';
import type {FailedPageDraft} from './qualityDraft';
import type {PageRedesignSource} from './pageRedesignSource';
import type {QualityFinding} from './generationQuality';

export interface BusinessTextChoice {sourceNid:string;targetNid:string;before:string;after:string}
export interface ReviewedBusinessText extends BusinessTextChoice {regionNid:string}
/** User decisions about particular copy only; never a permission to delete a region or change controls. */
export interface BusinessTextReview {version:1;sourceFingerprint:string;draftFingerprint:string;changes:ReviewedBusinessText[]}
const keys=(v:object,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const nid=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&Boolean(v.trim())&&v.length<=400&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
export function validBusinessTextChoice(v:unknown):v is BusinessTextChoice {const c=v as BusinessTextChoice;return Boolean(c&&nid(c.sourceNid)&&nid(c.targetNid)&&text(c.before)&&text(c.after));}
export function validBusinessTextReview(v:unknown):v is BusinessTextReview {
 const r=v as BusinessTextReview;
 return Boolean(r&&keys(r,['version','sourceFingerprint','draftFingerprint','changes'])&&r.version===1&&typeof r.sourceFingerprint==='string'&&/^[a-f0-9]{8}$/.test(r.sourceFingerprint)&&typeof r.draftFingerprint==='string'&&/^[a-f0-9]{8}$/.test(r.draftFingerprint)&&Array.isArray(r.changes)&&r.changes.length>0&&r.changes.length<=8&&r.changes.every(c=>validBusinessTextChoice(c)&&nid(c.regionNid)&&keys(c,['sourceNid','targetNid','before','after','regionNid']))&&new Set(r.changes.map(c=>c.sourceNid)).size===r.changes.length&&new Set(r.changes.map(c=>c.targetNid)).size===r.changes.length);
}
type NodeIndex=Map<string,Element|null>;
function indexNodes(doc:Document):NodeIndex {const index:NodeIndex=new Map();for(const el of Array.from(doc.querySelectorAll('[data-nid]'))){const id=el.getAttribute('data-nid')!;index.set(id,index.has(id)?null:el);}return index;}
function plain(el:Element):boolean {
 if(!inspectText(el).editable||el.closest('script,style,template,noscript,svg,button,a[href],input,select,textarea,option,label,[role],summary,output,progress,meter'))return false;
 for(let cur:Element|null=el;cur;cur=cur.parentElement){const style=(cur as HTMLElement).style;if(cur.hasAttribute('hidden')||cur.getAttribute('aria-hidden')==='true'||cur.classList.contains('hidden')||cur.classList.contains('sr-only')||style?.display==='none'||['hidden','collapse'].includes(style?.visibility)||style?.opacity==='0')return false;}
 return true;
}
function unprotected(el:Element,index:NodeIndex,protectedNids:string[]){return !protectedNids.some(id=>{const node=index.get(id);return node&&(node.contains(el)||el.contains(node));});}
function sourceText(source:PageRedesignSource,index:NodeIndex,id:string){
 const items=source.texts.filter(item=>item.nid===id),el=index.get(id);
 return items.length===1&&text(items[0].text)&&el&&plain(el)&&unprotected(el,index,source.protectedNodes.map(n=>n.nid))&&inspectText(el).text===items[0].text.trim()?items[0].text:undefined;
}
/** UI candidates are observations; submitting them always goes through prepareBusinessTextReview again. */
export function businessTextReviewChoices(source:PageRedesignSource,baseline:string,draft:FailedPageDraft){
 const old=indexNodes(parseHtmlCopy(baseline).doc),next=parseHtmlCopy(draft.html).doc,index=indexNodes(next);
 const sources=[...new Set(draft.quality.findings.filter(f=>f.code==='redesign_content_missing'&&f.severity==='error').map(f=>f.nid).filter((id):id is string=>Boolean(id)))].flatMap(id=>{const before=sourceText(source,old,id);return before?[{sourceNid:id,before}]:[];});
 const targets=Array.from(next.body.querySelectorAll('[data-nid]')).filter(el=>plain(el)&&text(inspectText(el).text)&&index.get(el.getAttribute('data-nid')!)===el&&unprotected(el,index,source.protectedNodes.map(n=>n.nid))).map(el=>{const regionNids:string[]=[];for(let p:Element|null=el;p;p=p.parentElement){const id=p.getAttribute('data-nid');if(id)regionNids.push(id);}return {targetNid:el.getAttribute('data-nid')!,text:inspectText(el).text,regionNids};});
 return {sources,targets};
}
function validateSource(source:PageRedesignSource,baseline:string,review:BusinessTextReview){
 if(!validBusinessTextReview(review)||review.sourceFingerprint!==source.sourceFingerprint)throw Error('文案确认来源无效或原页面已变化。');
 const old=indexNodes(parseHtmlCopy(baseline).doc);
 for(const c of review.changes)if(sourceText(source,old,c.sourceNid)!==c.before)throw Error('文案确认的原节点或完整原文不匹配。');
}
export function prepareBusinessTextReview(source:PageRedesignSource,baseline:string,draft:FailedPageDraft,selected:string[],choices:BusinessTextChoice[],previous?:BusinessTextReview):BusinessTextReview|undefined {
 if(previous)validateSource(source,baseline,previous);
 if(!Array.isArray(choices)||choices.length>8)throw Error('每次最多确认8项业务文案。');
 if(!choices.length)return previous?structuredClone(previous):undefined;
 if(contentFingerprint(draft.html)!==draft.fingerprint)throw Error('文案确认的草稿已变化。');
 const available=businessTextReviewChoices(source,baseline,draft),index=indexNodes(parseHtmlCopy(draft.html).doc);
 const additions=choices.map(c=>{
  if(!validBusinessTextChoice(c)||!keys(c,['sourceNid','targetNid','before','after'])||!available.sources.some(s=>s.sourceNid===c.sourceNid&&s.before===c.before))throw Error('请逐项确认唯一原节点和完整旧新文案。');
  const target=index.get(c.targetNid),regions=selected.map(id=>index.get(id)).filter((el):el is Element=>Boolean(el));
  const roots=target?regions.filter(el=>el.contains(target)):[];
  if(!target||roots.length!==1||!available.targets.some(t=>t.targetNid===c.targetNid))throw Error('替换文案必须对应所选未保护区域内的可见非交互文本。');
  return {...c,regionNid:roots[0].getAttribute('data-nid')!};
 });
 const changes=[...(previous?.changes??[]).filter(c=>!additions.some(a=>a.sourceNid===c.sourceNid)),...additions];
 const review:BusinessTextReview={version:1,sourceFingerprint:source.sourceFingerprint,draftFingerprint:draft.fingerprint,changes};
 validateSource(source,baseline,review);return review;
}
/** Validate the exact target on every whole-page check, including saved candidates and later repairs. */
export function inspectBusinessTextReview(source:PageRedesignSource,baseline:string,html:string,review:BusinessTextReview):QualityFinding[]{
 validateSource(source,baseline,review);const index=indexNodes(parseHtmlCopy(html).doc);
 return review.changes.flatMap(c=>{const target=index.get(c.targetNid),root=index.get(c.regionNid);
  return target&&root?.contains(target)&&plain(target)&&unprotected(target,index,source.protectedNodes.map(n=>n.nid))&&inspectText(target).text===c.after.trim()?[]:[{code:'redesign_text_review_not_applied',severity:'error' as const,nid:c.targetNid,message:'逐项确认的新文案未在指定草稿文本节点完整呈现。',actual:c.before,expected:c.after}];
 });
}

/** Pixel/layout observations supplement source checks; uncertain text never satisfies explicit user copy. */
export function inspectBusinessTextRendering(doc:Document,review:BusinessTextReview,observe:(el:Element)=>{text:string;uncertain?:boolean}):QualityFinding[]{
 if(!validBusinessTextReview(review))return [{code:'render_text_review_invalid',severity:'error',message:'逐项文案确认结构无效，不能进行渲染验收。',actual:'确认合同无效',expected:'重新核对原文与目标节点'}];
 const index=indexNodes(doc);
 return review.changes.flatMap(c=>{
  const target=index.get(c.targetNid),root=index.get(c.regionNid),observed=target&&root?.contains(target)?observe(target):undefined;
  if(observed&&!observed.uncertain&&observed.text.trim()===c.after.trim())return [];
  return [{code:observed?.uncertain?'render_text_review_unverified':'render_text_review_missing',severity:'error' as const,nid:c.targetNid,message:observed?.uncertain?'逐项确认文案的完整可见性尚未验证。':'逐项确认文案未在指定节点完整可见。',actual:observed?.uncertain?'存在裁切、变换或不支持的文字效果':'目标缺失、隐藏或未绘制完整文字',expected:c.after}];
 });
}
