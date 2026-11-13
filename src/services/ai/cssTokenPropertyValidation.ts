import {COLOR_ROLES} from '../../types/colorRoles';
import type {QualityFinding} from './generationQuality';

const colors=new Set(Object.values(COLOR_ROLES).map(role=>`--color-${role[1]}`));
const nonColorProperty=/^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-(?:width|style)|outline-(?:width|style)|column-rule-(?:width|style))$/;
type Declaration=[property:string,value:string,important:boolean];
interface Block {declarations:Declaration[];selector?:string;el?:Element;root:boolean;conditional?:boolean}
/** Read-only CSS tokenizer. Strings, comments and function bodies never become declarations. */
function splitCss(text:string,separator:string):string[]{
 const result:string[]=[];let start=0,quote='',depth=0,comment=false;
 for(let i=0;i<text.length;i++){
  const c=text[i],n=text[i+1];if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
  if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}
  if(c==='/'&&n==='*'){comment=true;i++;continue;}if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='('||c==='[')depth++;if(c===')'||c===']')depth--;
  if(!depth&&c===separator){result.push(text.slice(start,i));start=i+1;}
 }
 result.push(text.slice(start));return result;
}
function declarations(text:string):Declaration[]{
 return splitCss(text,';').flatMap(part=>{
  const pieces=splitCss(part,':'),property=pieces.shift()?.replace(/\/\*[\s\S]*?\*\//g,'').trim();
  if(!property||!/^--[\w-]+$|^[a-zA-Z-]+$/.test(property)||!pieces.length)return [];
  const value=pieces.join(':'),priorityValue=value.replace(/\/\*[\s\S]*?\*\//g,'');
  const important=/!\s*important\s*$/i.test(priorityValue);
  return [[property.startsWith('--')?property:property.toLowerCase(),(important?priorityValue.replace(/\s*!\s*important\s*$/i,''):value).trim(),important] as Declaration];
 });
}
function blocks(doc:Document,additionalCss:string):Block[]{
 const result:Block[]=[],sources=[...Array.from(doc.querySelectorAll('style')).map(el=>el.textContent??''),additionalCss];
 const sheet=(text:string,conditional=false)=>{
  let start=0,open=-1,depth=0,paren=0,quote='',comment=false;
  for(let i=0;i<text.length;i++){
   const c=text[i],n=text[i+1];if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
   if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}
   if(c==='/'&&n==='*'){comment=true;i++;continue;}if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='('||c==='[')paren++;if(c===')'||c===']')paren--;
   if(paren)continue;
   if(c===';'&&!depth)start=i+1;
   if(c==='{'){if(!depth)open=i;depth++;}
   if(c==='}'&&depth&&!--depth){
    const selector=text.slice(start,open).replace(/\/\*[\s\S]*?\*\//g,'').trim(),body=text.slice(open+1,i);
    if(selector.startsWith('@'))sheet(body,true);
    else if(selector&&!body.includes('{'))result.push({declarations:declarations(body),selector,root:!conditional&&selector===':root',conditional});
    // Nested rules and custom property blocks are deliberately left unverified.
    start=i+1;
   }
  }
 };
 for(const text of sources)sheet(text);
 for(const el of Array.from(doc.querySelectorAll('[style]')).slice(0,5000)){const text=el.getAttribute('style')??'';sources.push(text);result.push({declarations:declarations(text),el,root:el===doc.documentElement});}
 // Unsupported nesting, typed registrations, escaped names and incomplete CSS
 // must not hide a possible legal override of an injected project color role.
 const parsed=new Map<string,number>();for(const block of result)for(const [name] of block.declarations)if(name.startsWith('--'))parsed.set(name,(parsed.get(name)??0)+1);
 const observed=new Map<string,number>(),uncertain=new Set<string>();
 for(const text of sources){
  for(const match of text.matchAll(/(--[\w-]+)\s*:/g))observed.set(match[1],(observed.get(match[1])??0)+1);
  for(const match of text.matchAll(/@property\s+(--[\w-]+)/g))uncertain.add(match[1]);
  if(text.includes('\\'))for(const name of colors)uncertain.add(name);
 }
 for(const [name,count] of observed)if(count>(parsed.get(name)??0))uncertain.add(name);
 if(uncertain.size)result.push({declarations:Array.from(uncertain,name=>[name,'__unverified_css_definition__',false]),root:false});
 return result;
}
function parts(value:string):string[]{
 const result:string[]=[];let start=0,depth=0,quote='';
 for(let i=0;i<value.length;i++){
  const c=value[i];if(quote){if(c===quote&&value[i-1]!=='\\')quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}if(c==='(')depth++;if(c===')')depth--;
  if(!depth&&/\s/.test(c)){if(i>start)result.push(value.slice(start,i));start=i+1;}
 }
 if(start<value.length)result.push(value.slice(start));return result;
}
function variable(value:string):string|undefined{
 if(!value.startsWith('var(')||!value.endsWith(')'))return;
 let depth=0,comma=-1;
 for(let i=4;i<value.length-1;i++){const c=value[i];if(c==='(')depth++;if(c===')'){if(!depth)return;depth--;}if(c===','&&!depth&&comma<0)comma=i;}
 const name=value.slice(4,comma<0?-1:comma).trim();return /^--[\w-]+$/.test(name)?name:undefined;
}
const colorLiteral=(value:string)=>/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^;{}]*\)|transparent|currentcolor|red|green|blue|black|white)$/i.test(value);

/** Only proves color → non-color border property mismatches. Never bans CSS variables in general. */
export function inspectCssTokenProperties(doc:Document,additionalCss=''):QualityFinding[]{
 // A linked stylesheet may legally redefine these custom properties; this
 // synchronous inspection must not fetch it or pretend to know its cascade.
 if(doc.querySelector('link[rel~="stylesheet"][href]'))return [];
 if([...Array.from(doc.querySelectorAll('style')).map(el=>el.textContent??''),additionalCss].some(css=>/@import\b/i.test(css)))return [];
 const all=blocks(doc,additionalCss),definitions=new Map<string,Array<{value:string;block:Block}>>();
 for(const block of all)for(const [property,value] of block.declarations){
  if(!property.startsWith('--'))continue;
  const defs=definitions.get(property)??[];defs.push({value,block});definitions.set(property,defs);
 }
 const isColor=(name:string,at:Block,seen=new Set<string>()):boolean=>{
  if(seen.has(name)||seen.size>12)return false;
  const next=new Set(seen).add(name),defs=definitions.get(name)??[];
  if(!colors.has(name)&&!defs.some(def=>def.block.root||def.block===at||Boolean(at.el&&def.block.el===at.el)))return false;
  if(!defs.length)return colors.has(name);
  // Any possible local override, unknown fallback or cycle defeats static proof.
  return defs.every(def=>{const ref=variable(def.value);return ref?isColor(ref,def.block,next):colorLiteral(def.value);});
 };
 const findings:QualityFinding[]=[];let inspected=0;
 const targetsByBlock=new Map<Block,Element[]>();
 for(const block of all){
  if(!block.el&&!block.selector)continue;
  try{targetsByBlock.set(block,block.el?[block.el]:Array.from(doc.querySelectorAll(block.selector!)).slice(0,100));}catch{/* Unknown selectors cannot establish a target. */}
 }
 const overlaps=(property:string,other:string)=>{
  if(other==='all'||property===other)return true;
  const family=property.startsWith('border')?'border':property.startsWith('outline')?'outline':'column-rule';
  if(other===family)return true;
  if(family==='border')return /^border-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?$/.test(other)||other.startsWith('border-')&&other.endsWith(property.endsWith('-width')?'-width':'-style');
  return false;
 };
 for(const block of all){
  // A syntactically valid conditional rule is not proof that it is active.
  if(block.conditional)continue;
  const targets=targetsByBlock.get(block)??[];
  if(!targets.length)continue;
  for(let index=0;index<block.declarations.length;index++){
   const [property,value]=block.declarations[index];
   if(++inspected>12000||!nonColorProperty.test(property))continue;
   // Do not infer the winning value across duplicate/overlapping shorthand
   // declarations. Their cascade can legitimately replace this declaration.
   if(block.declarations.slice(index+1).some(([name])=>overlaps(property,name)))continue;
   if(block.declarations.slice(0,index).some(([name,,important])=>important&&overlaps(property,name)))continue;
   if(!parts(value).some(part=>{const name=variable(part);return name&&isColor(name,block);}))continue;
   for(const el of targets){
    // Without implementing CSS cascade/specificity/layers, any competing
    // matching rule or inline shorthand is a potential legitimate winner.
    const competing=all.some(other=>other!==block&&targetsByBlock.get(other)?.includes(el)&&other.declarations.some(([name])=>overlaps(property,name)));
    if(!competing)finding(el,property,value,block.selector);
   }
  }
 }
 function finding(el:Element,property:string,value:string,selector?:string){
  const nid=el.getAttribute('data-nid')??el.closest('[data-nid]')?.getAttribute('data-nid')??undefined;
  const actual=`${property}: ${value}${selector?` (${selector})`:''}`;
  if(findings.some(f=>f.nid===nid&&f.actual===actual))return;
  findings.push({code:'css_token_property_type',severity:'error',nid,actual,expected:property.endsWith('style')?'边框线型使用solid/dashed等合法值；颜色Token仅用于颜色':'边宽使用合法长度或thin/medium/thick；颜色Token用于border-color',message:'颜色Token被用于不接受颜色的边框属性，浏览器会丢弃该声明。'});
 }
 return findings;
}
