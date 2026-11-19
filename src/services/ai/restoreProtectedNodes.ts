import {parseHtmlCopy} from '../../utils/htmlDocument';

/** Depth of an element under body (shallow parents restore first). */
function depth(el:Element):number{let n=0;for(let p:Element|null=el;p;p=p.parentElement)n++;return n;}

/**
 * Deterministic one-shot repair: reinstate L4-protected subtrees from the baseline.
 * Missing or class/style-drifted protected nodes are replaced; never loops or calls the model.
 */
export function restoreProtectedNodes(html:string,baselineHtml:string|undefined,protectedNids:string[]|undefined):string{
  if(!baselineHtml||!protectedNids?.length)return html;
  const unique=[...new Set(protectedNids.filter(Boolean))];
  if(!unique.length)return html;
  const baseline=parseHtmlCopy(baselineHtml).doc;
  const copy=parseHtmlCopy(html);
  const doc=copy.doc;
  const targets=unique.flatMap(nid=>{
    const nodes=Array.from(baseline.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid);
    return nodes.length===1?[{nid,el:nodes[0]}]:[];
  }).sort((a,b)=>depth(a.el)-depth(b.el));
  let changed=false;
  for(const {nid,el} of targets){
    // Skip if an already-restored ancestor now contains this nid.
    if(Array.from(doc.querySelectorAll('[data-nid]')).some(node=>node.getAttribute('data-nid')===nid)){
      const current=Array.from(doc.querySelectorAll('[data-nid]')).find(node=>node.getAttribute('data-nid')===nid)!;
      if(current.getAttribute('class')===el.getAttribute('class')&&current.getAttribute('style')===el.getAttribute('style'))continue;
      current.replaceWith(el.cloneNode(true));changed=true;continue;
    }
    const parent=el.parentElement;
    const parentNid=parent?.getAttribute?.('data-nid')??undefined;
    let host:Element|null=parentNid?Array.from(doc.querySelectorAll('[data-nid]')).find(node=>node.getAttribute('data-nid')===parentNid)??null:null;
    if(!host){
      // Walk up baseline ancestors until one exists in the draft.
      for(let ancestor=parent;ancestor&&ancestor!==baseline.body;ancestor=ancestor.parentElement){
        const id=ancestor.getAttribute('data-nid');
        if(!id)continue;
        host=Array.from(doc.querySelectorAll('[data-nid]')).find(node=>node.getAttribute('data-nid')===id)??null;
        if(host)break;
      }
    }
    host=host??doc.body;
    const clone=el.cloneNode(true) as Element;
    // Prefer original sibling order when the previous sibling still exists.
    const prev=el.previousElementSibling?.getAttribute('data-nid');
    const prevNode=prev?Array.from(host.children).find(child=>child.getAttribute('data-nid')===prev):undefined;
    if(prevNode)prevNode.after(clone);else host.append(clone);
    changed=true;
  }
  return changed?copy.serialize():html;
}
