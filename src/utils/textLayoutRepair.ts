import {parseHtmlCopy} from './htmlDocument';
import {inspectText} from './textNode';

/** Deterministic native list-item repair only. The caller stages a copy; this never writes a project. */
export function repairCompressedBodyCards(html:string, textNids:string[], protectedNids:string[]=[]){
 const parsed=parseHtmlCopy(html),elements=Array.from(parsed.doc.querySelectorAll('[data-nid]'));
 const find=(nid:string)=>{const matches=elements.filter(el=>el.getAttribute('data-nid')===nid);if(matches.length!==1)throw Error('节点已变化或标识不唯一，请重新检查。');return matches[0];};
 const roots=new Map<Element,{header:Element;actions:Element}>(),protectedSet=new Set(protectedNids);
 for(const nid of [...new Set(textNids)]){
  const text=find(nid),root=text.parentElement;
  if(!root?.classList.contains('list-item')||root.children.length!==2||root.lastElementChild!==text||inspectText(text).text.replace(/\s/g,'').length<20)throw Error('此布局不能通过安全的局部类名修改修复，请针对该区域调整。');
  const header=root.firstElementChild!,actions=header.lastElementChild;
  if(!header.classList.contains('row')||!actions?.classList.contains('row')||!actions.querySelector('button,a[href],[role="button"]')||text.querySelector('button,a[href],[role="button"]')||!root.getAttribute('data-nid'))throw Error('此卡片不符合可安全修复的正文/操作结构。');
  for(const node of [root,header,actions,text]){
   if(node.hasAttribute('style'))throw Error('卡片包含自定义行内布局，请先核对样式后调整。');
   for(let cur:Element|null=node;cur;cur=cur.parentElement)if(protectedSet.has(cur.getAttribute('data-nid')??''))throw Error('卡片包含受手动样式保护的节点，未修改。');
  }
  if(Array.from(root.querySelectorAll('[data-nid]')).some(el=>protectedSet.has(el.getAttribute('data-nid')!)))throw Error('卡片包含受手动样式保护的节点，未修改。');
  roots.set(root,{header,actions});
 }
 if(!roots.size)throw Error('没有可修复的建议卡片。');
 for(const [root,{header,actions}] of roots){
  root.classList.remove('list-item','row');root.classList.add('col','gap-2');
  if(!Array.from(root.classList).some(c=>/^p[xytrbl]?-/.test(c)))root.classList.add('px-4','py-3');
  header.classList.add('wrap');actions.classList.remove('flex-none','flex-1');actions.classList.add('flex-auto','min-w-0','wrap','justify-end');
 }
 return {html:parsed.serialize(),rootNids:[...roots.keys()].map(el=>el.getAttribute('data-nid')!),count:roots.size};
}
