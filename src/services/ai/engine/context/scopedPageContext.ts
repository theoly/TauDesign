import type {StyleOverride} from '../../../../types/project';
import {parseHtmlCopy} from '../../../../utils/htmlDocument';
import {contentFingerprint} from '../../designWorkflow';

/** Read-only dependencies. None of these nodes grants an additional write target. */
export function buildScopedPageContext(input:{screenId:string;html:string;targetNids:readonly string[];scopedCss?:string;overrides?:Record<string,StyleOverride>}) {
 const {doc}=parseHtmlCopy(input.html),nodes=Array.from(doc.body.querySelectorAll('[data-nid]'));
 if(!input.targetNids.length||new Set(input.targetNids).size!==input.targetNids.length)throw Error('局部上下文缺少唯一授权目标。');
 const targets=input.targetNids.map(nid=>{
  const matches=nodes.filter(el=>el.getAttribute('data-nid')===nid);if(matches.length!==1)throw Error('局部上下文目标不存在或身份不唯一。');return matches[0];
 });
 const attributes=(el:Element)=>Object.fromEntries(Array.from(el.attributes).filter(a=>!a.name.startsWith('on')).map(a=>[a.name,a.value]));
 const ancestors=new Map<Element,{tag:string;attributes:Record<string,string>}>();
 const regions=targets.map(target=>{
  const chain:Element[]=[];let parent=target.parentElement;
  while(parent){if(chain.length>=64)throw Error('局部上下文的祖先深度超过64层，未删去必需布局信息。');chain.push(parent);ancestors.set(parent,{tag:parent.localName,attributes:attributes(parent)});parent=parent.parentElement;}
  return {nid:target.getAttribute('data-nid')!,fingerprint:contentFingerprint(target.outerHTML),characters:target.outerHTML.length,
   ancestorChain:chain.map(el=>({tag:el.localName,nid:el.getAttribute('data-nid')??undefined})),
   adjacent:Array.from(target.parentElement?.children??[]).filter(el=>el!==target).slice(0,8).map(el=>({tag:el.localName,nid:el.getAttribute('data-nid')??undefined,attributes:attributes(el),textSummary:(el.textContent??'').trim().slice(0,160)})),
   adjacentOmitted:Math.max(0,(target.parentElement?.children.length??1)-9)};
 });
 const styleRules=Array.from(doc.querySelectorAll('style')).map(el=>el.textContent??'');
 const externalStyles=Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).map(el=>el.getAttribute('href')).filter(Boolean);
 const css=[...styleRules,input.scopedCss??''].filter(Boolean).join('\n');
 const overrides=Object.entries(input.overrides??{}).filter(([key])=>key.startsWith(input.screenId+':')).map(([,value])=>structuredClone(value));
 return {version:1 as const,screenId:input.screenId,baselineFingerprint:contentFingerprint(input.html),targetNids:[...input.targetNids],
  regions,ancestors:[...ancestors.values()],sourceCss:css,sourceCssFingerprint:contentFingerprint(css),externalStyles,overrides,
  overrideFingerprint:contentFingerprint(JSON.stringify(overrides)),
  notice:'当前targetNids才是可修改范围。祖先、邻接摘要、来源CSS和L4均只读；摘要已明确截取，不能据此改写整页或推断省略内容。externalStyles只列地址，未声称已读取其内容。'};
}
