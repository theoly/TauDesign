import type {RuleFeature} from './types';

/** Conservative DOM semantics inside exact authorized roots; request words never invent a target. */
export function targetRuleFeatures(html:string,nids:readonly string[]):RuleFeature[]{
 const doc=new DOMParser().parseFromString(html,'text/html'),all=Array.from(doc.querySelectorAll('[data-nid]'));
 if(!nids.length||new Set(nids).size!==nids.length)return [];
 const roots=nids.map(nid=>all.filter(el=>el.getAttribute('data-nid')===nid));
 if(roots.some(matches=>matches.length!==1))return [];
 return nodeFeatures(new Set(roots.flatMap(([root])=>[root,...Array.from(root.querySelectorAll('*'))])));
}
/** Only for an already authorized/read-only page, never to invent a new page's functions. */
export function pageRuleFeatures(html:string):RuleFeature[]{return nodeFeatures(new DOMParser().parseFromString(html,'text/html').body.querySelectorAll('*'));}
function nodeFeatures(nodes:Iterable<Element>):RuleFeature[]{
 const features=new Set<RuleFeature>();
 for(const el of nodes){
  if(el.matches('.badge,.badge-count,.badge-dot'))features.add('badge');
  if(el.matches('button,.btn,[role="button"]'))features.add('button');
  if(el.matches('input,select,textarea,form'))features.add('form');
  if(el.matches('svg,.icon,.icon-box'))features.add('icon');
  if(el.matches('.chip,.tag'))features.add('tags');
  if(el.matches('img,video,picture'))features.add('media');
  if(el.matches('p,article,textarea')&&(el.textContent?.trim().length??0)>=80)features.add('long-copy');
 }
 return [...features].sort();
}
