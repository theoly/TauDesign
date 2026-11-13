import {parseHtmlCopy} from '../../utils/htmlDocument';
/** A page-level authorization may be narrowed to a unique existing form, never expanded to an ancestor. */
export function functionalRegionTarget(html:string,protectedNids:string[]=[]):string|undefined{
 const doc=parseHtmlCopy(html).doc,forms=Array.from(doc.querySelectorAll('form[data-nid],fieldset[data-nid],[role="form"][data-nid]'));
 const roots=forms.filter(el=>!forms.some(parent=>parent!==el&&parent.contains(el)));
 if(roots.length!==1)return;
 const root=roots[0],nid=root.getAttribute('data-nid');if(!nid||root===doc.body||root.localName==='main'||protectedNids.some(id=>root.getAttribute('data-nid')===id||Array.from(root.querySelectorAll('[data-nid]')).some(node=>node.getAttribute('data-nid')===id)))return;
 if(Array.from(doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid).length!==1)return;
 return nid;
}
