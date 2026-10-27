import type { ComputedBoxModel, ComputedLayoutInfo } from '../stores/useProjectStore';

export const INSPECTOR_PROPERTIES = (`display position top right bottom left z-index width height min-width max-width min-height max-height aspect-ratio
flex-direction flex-wrap flex-grow flex-shrink flex-basis align-self justify-self align-items justify-content gap row-gap column-gap grid-template-columns grid-template-rows box-sizing
padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left overflow overflow-x overflow-y
font-family font-size font-weight line-height letter-spacing color text-align text-decoration text-transform white-space text-overflow word-break
background-color background-image background-size background-position background-repeat border border-width border-style border-color pointer-events text-decoration-line
border-top-width border-right-width border-bottom-width border-left-width border-top-style border-right-style border-bottom-style border-left-style
border-top-color border-right-color border-bottom-color border-left-color border-radius border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius
box-shadow opacity visibility mix-blend-mode filter backdrop-filter transform rotate scale object-fit object-position`).split(/\s+/);

export interface InspectorSnapshot {
  styles: Record<string,string>;
  authored: Record<string,string>;
  parentDisplay: string;
  parentDirection: string;
  pageColors: string[];
  tokens: Record<string,string>;
  geometry: {top:number;left:number;width:number;height:number;parentTop:number;parentLeft:number;parentBorderTop:number;parentBorderLeft:number;parentScrollTop:number;parentScrollLeft:number};
}

export function collectInspectorStyle(el: Element): InspectorSnapshot {
  const editorClasses=['aidesign-selected','aidesign-hovered','aidesign-quality-target'].filter(name=>el.classList.contains(name));
  editorClasses.forEach(name=>el.classList.remove(name));
  try {return collectUnadornedStyle(el);} finally {editorClasses.forEach(name=>el.classList.add(name));}
}

function collectUnadornedStyle(el:Element):InspectorSnapshot {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const style = win?.getComputedStyle(el) ?? (el as HTMLElement).style;
  const parent = el.parentElement && win?.getComputedStyle(el.parentElement);
  const styles: Record<string,string> = {}, authored: Record<string,string> = {}, tokens: Record<string,string> = {};
  for (const prop of INSPECTOR_PROPERTIES) {
    styles[prop] = style?.getPropertyValue(prop).trim() || '';
    const inline = (el as HTMLElement).style?.getPropertyValue(prop);
    if (inline) authored[prop] = inline;
  }
  // CSS transforms become matrices in getComputedStyle. Recover an equivalent authored
  // function list, never a non-effective rule, to keep simple rotations editable.
  const Matrix = (win as unknown as { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly })?.DOMMatrixReadOnly;
  if (Matrix && styles.transform && styles.transform !== 'none') {
    const effective = new Matrix(styles.transform);
    const equivalent = (value:string) => {
      try {
        const candidate = new Matrix(value);
        return ['a','b','c','d','e','f'].every(key => Math.abs((candidate as unknown as Record<string,number>)[key] - (effective as unknown as Record<string,number>)[key]) < 1e-6);
      } catch {return false;}
    };
    if (authored.transform && !equivalent(authored.transform)) delete authored.transform;
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('selectorText' in rule && 'style' in rule) {
          const r=rule as CSSStyleRule;
          try { if (r.style.transform && el.matches(r.selectorText) && equivalent(r.style.transform)) authored.transform=r.style.transform; } catch { /* unsupported selector */ }
        } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(doc.styleSheets)) {try {visit(sheet.cssRules);} catch { /* Cross-origin styles remain computed-only. */ }}
  }
  // Typed OM preserves computed auto / percentages rather than resolved pixel widths.
  const typed = (el as unknown as {computedStyleMap?:()=>Map<string,{toString():string}>}).computedStyleMap?.();
  for (const prop of ['width','height']) {
    const value=typed?.get(prop)?.toString();
    if(value && !authored[prop]) authored[prop]=value;
  }
  // Only variables physically present in the document's CSS are offered.
  const sheets = Array.from(doc.querySelectorAll('style')).filter(s=>!['editor-chrome','inspector-preview'].includes(s.getAttribute('data-taudesign-runtime') ?? '')).map(s => s.textContent ?? '').join('\n');
  const root = win?.getComputedStyle(doc.documentElement);
  for (const match of sheets.matchAll(/(--(?:td-import-)?(?:color|font|space|radius|shadow|blur)-[\w-]+)\s*:/g)) {
    const value = root?.getPropertyValue(match[1]).trim();
    if (value) tokens[match[1]] = value;
  }
  const colors = new Set<string>();
  // Authored colors are enough for the palette; avoid computed style reads across every node.
  for (const m of sheets.matchAll(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)) colors.add(m[0]);
  for (const node of Array.from(doc.querySelectorAll('[style]'))) {
    const s = (node as HTMLElement).style;
    for (const prop of ['color','background-color','border-color']) {
      const value = s?.getPropertyValue(prop); if (value && !value.includes('var(')) colors.add(value);
    }
  }
  const rect=el.getBoundingClientRect();
  // The containing block for absolute placement is the nearest positioned ancestor.
  let containing=el.parentElement;
  while(containing && containing !== doc.documentElement && win?.getComputedStyle(containing).position === 'static') containing=containing.parentElement;
  const parentRect=containing?.getBoundingClientRect();
  const containingStyle=containing && win?.getComputedStyle(containing);
  const geometry={top:rect.top,left:rect.left,width:(el as HTMLElement).offsetWidth||rect.width,height:(el as HTMLElement).offsetHeight||rect.height,
    parentTop:parentRect?.top ?? 0,parentLeft:parentRect?.left ?? 0,
    parentBorderTop:parseFloat(containingStyle?.borderTopWidth ?? '')||0,parentBorderLeft:parseFloat(containingStyle?.borderLeftWidth ?? '')||0,
    parentScrollTop:containing?.scrollTop ?? win?.scrollY ?? 0,parentScrollLeft:containing?.scrollLeft ?? win?.scrollX ?? 0};
  return { styles, authored, geometry, parentDisplay: parent?.display || 'block', parentDirection: parent?.flexDirection || 'row', pageColors: Array.from(colors).slice(0,32), tokens };
}

export function collectNodePresentation(el: Element) : {computedBox:ComputedBoxModel;computedLayout:ComputedLayoutInfo;inspector:InspectorSnapshot} {
  const inspector = collectInspectorStyle(el), s = inspector.styles;
  const rect = el.getBoundingClientRect();
  const number = (name: string) => parseFloat(s[name]) || 0;
  const layout: ComputedLayoutInfo = {display:s.display || 'block'};
  for (const prop of INSPECTOR_PROPERTIES) {
    const key = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    (layout as unknown as Record<string,string>)[key] = s[prop];
  }
  return {inspector,computedLayout:layout,computedBox:{
    width:number('width') || rect.width || 0,height:number('height') || rect.height || 0,top:rect.top,left:rect.left,
    padding:{top:number('padding-top'),right:number('padding-right'),bottom:number('padding-bottom'),left:number('padding-left')},
    margin:{top:number('margin-top'),right:number('margin-right'),bottom:number('margin-bottom'),left:number('margin-left')}
  }};
}

const SHORTHANDS: Record<string,string[]> = {
  'border-radius':['border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius'],
  padding:['padding-top','padding-right','padding-bottom','padding-left'], margin:['margin-top','margin-right','margin-bottom','margin-left'],
  gap:['row-gap','column-gap'], background:['background-color','background-image','background-position','background-size','background-repeat'],
  border:['border-width','border-style','border-color', ...['top','right','bottom','left'].flatMap(side => ['width','style','color'].map(p=>`border-${side}-${p}`))],
  'border-width':['border-top-width','border-right-width','border-bottom-width','border-left-width'],
  'border-style':['border-top-style','border-right-style','border-bottom-style','border-left-style'],
  'border-color':['border-top-color','border-right-color','border-bottom-color','border-left-color']
};

export function mergeInspectorDeclarations(previous:Record<string,string>, patch:Record<string,string>):Record<string,string> {
  const next = Object.keys(patch).length ? {...previous} : {};
  for (const [prop,value] of Object.entries(patch)) {
    if (value) {
      for (const child of SHORTHANDS[prop] ?? []) if (!(child in patch)) delete next[child];
      // Reinsert edited longhands after shorthand to preserve their cascade priority.
      delete next[prop]; next[prop]=value;
    } else delete next[prop];
  }
  return next;
}

export function setInspectorPreview(doc:Document,nid:string,patch:Record<string,string>) {
  clearInspectorPreview(doc);
  const style=doc.createElement('style'); style.setAttribute('data-taudesign-runtime','inspector-preview');
  const selector = nid.replace(/["\\\n\r]/g, c=>`\\${c.charCodeAt(0).toString(16)} `);
  style.textContent=`[data-nid="${selector}"] { ${Object.entries(patch).filter(([,v])=>v).map(([p,v])=>`${p}: ${v} !important;`).join(' ')} }`;
  doc.head.append(style);
  reconcileInlinePriority(doc, (doc.querySelector('style[data-taudesign-runtime="overrides"]')?.textContent ?? '') + '\n' + style.textContent);
}
export function clearInspectorPreview(doc:Document) {
  doc.querySelector('style[data-taudesign-runtime="inspector-preview"]')?.remove();
  reconcileInlinePriority(doc, doc.querySelector('style[data-taudesign-runtime="overrides"]')?.textContent ?? '');
}

const inlineBaseline = new WeakMap<Document, Map<HTMLElement,string>>();
/** Render/export copies may lower inline !important so L4 wins; source HTML stays intact. */
export function reconcileInlinePriority(doc:Document, css:string) {
  css=(doc.querySelector('style[data-taudesign-runtime="theme-backgrounds"]')?.textContent??'')+'\n'+(doc.querySelector('style[data-taudesign-runtime="overrides"]')?.textContent??'')+'\n'+css;
  const previous=inlineBaseline.get(doc);
  previous?.forEach((value,el)=>{el.style.cssText=value;});
  const changed=new Map<HTMLElement,string>();
  for (const match of css.matchAll(/\[(data-nid|data-export-id)="([^"\\]+)"\]\s*\{([^}]+)\}/g)) {
    const el=Array.from(doc.querySelectorAll<HTMLElement>(`[${match[1]}]`)).find(node=>node.getAttribute(match[1])===match[2]);
    if(!el) continue;
    const probe=doc.createElement('span').style; probe.cssText=match[3];
    for(let i=0;i<probe.length;i++) {
      const property=probe.item(i);
      for(const prop of [property,...SHORTHANDS[property] ?? []]) {
        if(el.style.getPropertyPriority(prop)!=='important') continue;
        if(!changed.has(el)) changed.set(el,el.style.cssText);
        el.style.setProperty(prop,el.style.getPropertyValue(prop),'');
      }
    }
  }
  for(const match of css.matchAll(/(?:^|[{}])\s*(body|html)\s*\{([^}]+)\}/g)){
    const el=doc.querySelector<HTMLElement>(match[1]);if(!el)continue;
    const probe=doc.createElement('span').style;probe.cssText=match[2];
    for(let i=0;i<probe.length;i++){const property=probe.item(i);for(const prop of [property,...SHORTHANDS[property]??[]])if(el.style.getPropertyPriority(prop)==='important'){if(!changed.has(el))changed.set(el,el.style.cssText);el.style.setProperty(prop,el.style.getPropertyValue(prop),'');}}
  }
  inlineBaseline.set(doc,changed);
}

export function findScreenElement(screenId:string,nid:string):Element|null {
  for (const iframe of Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-inspector-screen]'))) {
    if(iframe.getAttribute('data-inspector-screen') !== screenId) continue;
    const el=Array.from(iframe.contentDocument?.querySelectorAll('[data-nid]') ?? []).find(e=>e.getAttribute('data-nid')===nid);
    if(el) return el;
  }
  return null;
}

export function isEscapedInspectorValue(prop:string,value:string):boolean {
  if(!value || value==='none' || value==='transparent' || value==='currentColor' || value==='inherit' || value==='initial' || value==='unset') return false;
  if(value.includes('var(')) return false;
  return /color|radius|shadow/.test(prop) || /^(background|background-image)$/.test(prop) && /gradient\(/.test(value);
}
