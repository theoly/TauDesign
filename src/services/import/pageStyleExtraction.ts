import type {DesignSystem} from '../../types/designSystem';
import type {Screen} from '../../types/project';
import {BACKGROUND_ROLES,type BackgroundRole,type ThemeBackground} from '../../types/themeBackground';
import {parseThemeBackground,compileThemeBackground} from '../../utils/themeBackground';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {getBaseCss} from '../../styles/baseCss';
import {buildScreenDocument} from '../../utils/screenDocument';
import {contentFingerprint} from '../ai/designWorkflow';
import {analyzeHtmlImport,declaredStyles,declaredValue} from './htmlImport';
import type {ImportDeclaration} from './htmlImportCss';
import {opaqueColor,pixelValue} from './htmlImportCss';
import {buildPrimaryRamp} from '../../utils/colorHarmony';

export type ExtractedStyleField='primary'|'typography'|'radius';
export interface BackgroundCandidate {id:string;role:BackgroundRole;selector:string;paint:ThemeBackground;confidence:'high'|'review';description:string}
export interface PageStyleAnalysis {screenId:string;name:string;fingerprint:string;backgrounds:BackgroundCandidate[];suggestedTheme:DesignSystem;fields:ExtractedStyleField[];warnings:string[]}
export interface StyleSelection {backgroundIds:string[];fields:ExtractedStyleField[];backgroundRoles?:Record<string,BackgroundRole>}

/** Resolve variables against their actual element scope. No stylesheet or script executes. */
function resolveVars(value:string,el:Element,declarations:ImportDeclaration[],stack:string[]=[]):string|undefined {
  if(stack.length>12)return;
  let out='',offset=0;
  while(offset<value.length){
    const start=value.indexOf('var(',offset);if(start<0)return out+value.slice(offset);
    out+=value.slice(offset,start);let end=start+4,depth=1;
    for(;end<value.length&&depth;end++){if(value[end]==='(')depth++;else if(value[end]===')')depth--;}
    if(depth)return;
    const body=value.slice(start+4,end-1),comma=body.indexOf(','),name=(comma<0?body:body.slice(0,comma)).trim();
    if(!/^--[\w-]+$/.test(name)||stack.includes(name))return;
    let current:Element|null=el,found:string|undefined;
    while(current){found=declaredValue(current,[name],declarations);if(found!==undefined)break;current=current.parentElement;}
    found??=comma<0?undefined:body.slice(comma+1).trim();if(found===undefined)return;
    const resolved=resolveVars(found,el,declarations,[...stack,name]);if(resolved===undefined)return;
    out+=resolved;offset=end;
  }
  return out;
}

function selector(el:Element):string|undefined {
  const nid=el.getAttribute('data-nid');
  return nid&&/^[\w-]+$/.test(nid)?`[data-nid="${nid}"]`:['body','html'].includes(el.localName)?el.localName:undefined;
}

/** Declared-style inference is conservative. Conditional/pseudo styles are reported, never guessed. */
export function extractPageStyle(screen:Screen,theme:DesignSystem,mode:'light'|'dark',device:'pc'|'mobile',kind:'page'|'html-import'='page'):PageStyleAnalysis {
  const fingerprint=contentFingerprint(JSON.stringify([screen.htmlContent,screen.scopedCss,screen.metadata?.themeBackgrounds]));
  const prepared=buildScreenDocument(screen,{tokensCss:compileTokensToCss(theme.tokens,mode,device),baseCss:getBaseCss(device),screenOverrides:'',deviceProfile:device,useCustomNavigation:true});
  const analyzed=analyzeHtmlImport(prepared,screen.name,{expandedResources:true});
  const doc=new DOMParser().parseFromString(prepared,'text/html'),declarations=declaredStyles(doc),warnings:string[]=[];
  if(declarations.some(d=>d.conditional))warnings.push('条件样式未用于静态提取，请在当前设备预览中确认。');
  const candidates:BackgroundCandidate[]=[],roots=new Set<Element>([doc.body,doc.documentElement]);
  let first:Element|null=doc.body.firstElementChild;
  for(let i=0;first&&i<4;i++){
    if(['style','script','meta','link'].includes(first.localName)){first=first.nextElementSibling;i--;continue;}
    const identity=`${first.getAttribute('class')??''} ${first.getAttribute('id')??''}`;
    const height=declaredValue(first,['min-height','height'],declarations);
    if(first.localName==='main'||/\b(?:page|app|screen|page-root|app-root)\b/.test(identity)||height&&/^(?:100(?:d|s|l)?vh|100%)$/.test(height.trim()))roots.add(first);
    first=first.firstElementChild;
  }
  doc.querySelectorAll('main,[role="main"]').forEach(el=>roots.add(el));
  for(const el of doc.querySelectorAll('body,body *,html')){
    if(candidates.length>=40)break;
    if(['img','svg','path','image','style','script','meta','link','input','textarea'].includes(el.localName))continue;
    const s=selector(el);if(!s)continue;
    const raw=declaredValue(el,['background','background-image'],declarations)??declaredValue(el,['background-color'],declarations);
    if(!raw||raw==='none'||raw==='transparent')continue;
    const value=resolveVars(raw,el,declarations);
    if(!value){if(/gradient|var\(/.test(raw))warnings.push(`${s} 的背景变量无法可靠解析，保留源样式。`);continue;}
    const paint=parseThemeBackground(value,theme.tokens.colors.background[mode]);
    if(!paint){if(/gradient|url\(/.test(value))warnings.push(`${s} 的复合背景或图片不作为主题渐变；保留源样式。`);continue;}
    const identity=`${el.getAttribute('class')??''} ${el.getAttribute('id')??''} ${el.getAttribute('role')??''}`;
    const fixed=declaredValue(el,['position'],declarations)==='fixed';
    if(/avatar|mask|overlay|veil|scrim|backdrop|photo|头像|遮罩/i.test(identity)||fixed)continue;
    const isAction=el.localName==='button'||el.getAttribute('role')==='button'||el.localName==='a'&&el.hasAttribute('href');
    const role:BackgroundRole=roots.has(el)?'page':isAction?'primaryAction':'decorativeSurface';
    if(role==='decorativeSurface'&&paint.kind!=='gradient')continue;
    paint.source={kind,name:screen.name,selector:s,fingerprint};
    const signature=role+compileThemeBackground(paint);if(role!=='page'&&candidates.some(c=>c.role+compileThemeBackground(c.paint)===signature))continue;
    candidates.push({id:contentFingerprint(s+signature),role,selector:s,paint,confidence:role==='decorativeSurface'?'review':'high',description:role==='page'?'页面背景':role==='primaryAction'?'操作元素背景':'局部装饰，仅在选择后应用'});
  }
  candidates.sort((a,b)=>Number(b.paint.kind==='gradient')-Number(a.paint.kind==='gradient'));
  const fields:ExtractedStyleField[]=[];
  const action=candidates.find(c=>c.role==='primaryAction'),actionPaint=action?.paint;
  const brand=actionPaint?opaqueColor(actionPaint.kind==='solid'?actionPaint.color:actionPaint.layers[0]?.stops[0]?.color??''):undefined;
  if(brand){analyzed.suggestedTheme.tokens.colors.primary=buildPrimaryRamp(brand);fields.push('primary');}
  const font=declaredValue(doc.body,['font-family'],declarations),resolvedFont=font&&resolveVars(font,doc.body,declarations);
  if(resolvedFont&&!/var\(|inherit|initial|unset/.test(resolvedFont)){analyzed.suggestedTheme.tokens.typography.fontFamilySans=resolvedFont;fields.push('typography');}
  const actionElement=action&&doc.querySelector(action.selector),radius=actionElement&&declaredValue(actionElement,['border-radius'],declarations),resolvedRadius=radius&&resolveVars(radius,actionElement!,declarations);
  if(resolvedRadius&&pixelValue(resolvedRadius)!==undefined){analyzed.suggestedTheme.tokens.radius.md=resolvedRadius;fields.push('radius');}
  if(!candidates.length)warnings.push('没有可可靠提取的背景。图片、遮罩和不支持的表达式仍保留在来源页面。');
  warnings.push('基于声明样式推断，未执行脚本；颜色/字体/圆角未明确提取到的值使用原分析器的候选值，请核对预览。');
  return {screenId:screen.id,name:screen.name,fingerprint,backgrounds:candidates,suggestedTheme:analyzed.suggestedTheme,fields,warnings:[...new Set(warnings)].slice(0,12)};
}

export function mergeExtractedStyle(current:DesignSystem,analysis:PageStyleAnalysis,selection:StyleSelection,mode:'light'|'dark'):DesignSystem {
  const next=structuredClone(current),roles=new Set<BackgroundRole>();
  for(const id of selection.backgroundIds){
    const candidate=analysis.backgrounds.find(c=>c.id===id);
    if(!candidate||!compileThemeBackground(candidate.paint))throw new Error('选中的背景候选无效，请重新分析。');
    const role=selection.backgroundRoles?.[id]??candidate.role;
    if(!BACKGROUND_ROLES.includes(role))throw new Error('背景用途无效，请重新选择。');
    if(roles.has(role))throw new Error('每个背景角色只能选择一个候选。');roles.add(role);
    next.tokens.backgrounds??={};next.tokens.backgrounds[role]??={};next.tokens.backgrounds[role]![mode]=structuredClone(candidate.paint);
  }
  for(const field of selection.fields){
    if(!analysis.fields.includes(field))throw new Error('所选风格项没有可靠的来源。');
    if(field==='primary'){
      next.tokens.colors.primary=structuredClone(analysis.suggestedTheme.tokens.colors.primary);
      if(next.tokens.colorRoles?.[mode]?.primary)next.tokens.colorRoles[mode]!.primary={source:'custom',value:next.tokens.colors.primary['500']};
    }
    if(field==='typography')next.tokens.typography.fontFamilySans=analysis.suggestedTheme.tokens.typography.fontFamilySans;
    if(field==='radius')next.tokens.radius.md=analysis.suggestedTheme.tokens.radius.md;
  }
  return next;
}
