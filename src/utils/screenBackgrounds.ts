import type {Screen} from '../types/project';
import {BACKGROUND_ROLES} from '../types/themeBackground';
import {compileThemeBackground} from './themeBackground';
import {transformStyleSheet} from '../services/import/htmlImportCss';

const variables={page:'page',primaryAction:'primary-action',decorativeSurface:'decorative-surface'} as const;
/** Runtime selectors are restricted to stable node identities or document roots. */
export function screenBackgroundCss(screen:Pick<Screen,'metadata'>,mode:'light'|'dark',overrides=''):string {
 const policy=screen.metadata?.themeBackgrounds;if(!policy)return '';
 const declarations:string[]=[],bindings:string[]=[];
 const manual=new Set<string>();transformStyleSheet(overrides,d=>{if(/^background(?:-|$)/.test(d.property))manual.add(d.selector.trim());});
 for(const role of BACKGROUND_ROLES){
  const paint=policy.snapshot?.[role]?.[mode],value=paint&&compileThemeBackground(paint);
  if(value)declarations.push(`--background-${variables[role]}:${value};`);
  if(role==='page'&&value)declarations.push(`--background-page-full-height:${paint?.kind==='gradient'?1:0};`);
  if(role==='primaryAction'&&value){declarations.push(`--background-primary-hover-filter:${paint?.kind==='gradient'?'brightness(.94)':'none'};`,`--background-primary-active-filter:${paint?.kind==='gradient'?'brightness(.86)':'none'};`);}
  const selectors=policy.bindings?.[role]??[];
  if(selectors.some(selector=>manual.has(selector)))continue;
  for(const selector of selectors){
   if(!/^(?:body|html|\[data-(?:nid|export-id)="[\w-]+"\])$/.test(selector))continue;
   bindings.push(`${selector}{background:var(--background-${variables[role]})!important;}`);
  }
 }
 return `${declarations.length?`:root{${declarations.join('')}}`:''}${bindings.length?`@layer taudesign-theme-sync {${bindings.join('\n')}}`:''}`;
}

/** An explicit inspector background color represents a solid background unless an image is also set. */
export function manualBackgroundResetCss(css:string):string {
 const rules=new Map<string,Set<string>>();transformStyleSheet(css,d=>{const properties=rules.get(d.selector)??new Set<string>();properties.add(d.property);rules.set(d.selector,properties);});
 return [...rules].filter(([selector,properties])=>/^\[data-(?:nid|export-id)="[\w-]+"\]$/.test(selector.trim())&&properties.has('background-color')&&!properties.has('background-image')&&!properties.has('background')).map(([selector])=>`${selector}{background-image:none!important;}`).join('\n');
}

export function syncScreenBackgroundStyle(doc:Document,css:string):void {
 if(!doc.querySelector('style[data-taudesign-runtime="theme-background-layer"]')){const layer=doc.createElement('style');layer.setAttribute('data-taudesign-runtime','theme-background-layer');layer.textContent='@layer taudesign-theme-sync;';doc.head.prepend(layer);}
 let slot=doc.querySelector('style[data-taudesign-runtime="theme-backgrounds"]') as HTMLStyleElement|null;
 if(!slot){slot=doc.createElement('style');slot.setAttribute('data-taudesign-runtime','theme-backgrounds');const overrides=doc.querySelector('style[data-taudesign-runtime="overrides"]');if(overrides)doc.head.insertBefore(slot,overrides);else doc.head.append(slot);}
 slot.textContent=css;
}
