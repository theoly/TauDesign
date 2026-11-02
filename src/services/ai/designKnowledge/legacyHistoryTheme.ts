import {colorRoleKeys} from '../../../types/colorRoles';

type Data=Record<string,unknown>;
const object=(v:unknown):v is Data=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const text=(v:unknown)=>typeof v==='string'&&!/data:[^;,]+;base64,/i.test(v);
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const optional=(v:unknown,check:(v:unknown)=>boolean)=>v===undefined||check(v);
const fields=(v:unknown,required:Record<string,(v:unknown)=>boolean>,extra:Record<string,(v:unknown)=>boolean>={}):boolean=>
 object(v)&&Object.keys(v).every(k=>Object.hasOwn(required,k)||Object.hasOwn(extra,k))&&
 Object.entries(required).every(([k,check])=>check(v[k]))&&Object.entries(extra).every(([k,check])=>optional(v[k],check));
const dictionary=(v:unknown,check:(v:unknown)=>boolean)=>object(v)&&Object.values(v).every(check);
const pair=(v:unknown)=>fields(v,{light:text,dark:text});
const numericMap=(v:unknown)=>dictionary(v,number);
const stringMap=(v:unknown)=>dictionary(v,text);
function paint(value:unknown):boolean {
 if(!object(value))return false;
 const source=(v:unknown)=>fields(v,{kind:k=>k==='page'||k==='html-import',name:text,selector:text,fingerprint:text});
 if(value.kind==='solid')return fields(value,{kind:k=>k==='solid',color:text},{source});
 const stop=(v:unknown)=>fields(v,{color:text},{position:number});
 const layer=(v:unknown)=>fields(v,{kind:k=>k==='linear'||k==='radial',stops:s=>Array.isArray(s)&&s.length>=2&&s.length<=64&&s.every(stop)},{geometry:text});
 return fields(value,{kind:k=>k==='gradient',layers:l=>Array.isArray(l)&&l.length>0&&l.length<=16&&l.every(layer)},{fallback:text,source});
}
const backgrounds=(v:unknown)=>fields(v,{},Object.fromEntries(['page','primaryAction','decorativeSurface'].map(k=>[k,(m:unknown)=>fields(m,{}, {light:paint,dark:paint})])));
const binding=(v:unknown)=>object(v)&&(v.source==='custom'?fields(v,{source:s=>s==='custom',value:text}):
 fields(v,{source:s=>s==='alias',role:r=>typeof r==='string'&&colorRoleKeys.includes(r as typeof colorRoleKeys[number])}));
const roles=(v:unknown)=>fields(v,{},Object.fromEntries(['light','dark'].map(k=>[k,(m:unknown)=>fields(m,{},Object.fromEntries(colorRoleKeys.map(r=>[r,binding])))])));
const colors=(v:unknown)=>fields(v,{primary:stringMap,neutral:stringMap,success:text,warning:text,danger:text,
 background:pair,surface:pair,surfaceAlt:pair,textPrimary:pair,textSecondary:pair,border:pair});
const typography=(v:unknown)=>fields(v,{fontFamilySans:text,fontFamilyMono:text,sizes:numericMap,weights:numericMap,lineHeights:numericMap});
const radius=(v:unknown)=>fields(v,Object.fromEntries(['none','sm','md','lg','xl','full'].map(k=>[k,text])));
// Pre-A2 snapshots may contain string shadows or omit the later blur/personality fields.
const shadows=(v:unknown)=>fields(v,{sm:s=>text(s)||pair(s),md:s=>text(s)||pair(s),lg:s=>text(s)||pair(s)},
 Object.fromEntries(['soft','card','glow'].map(k=>[k,(s:unknown)=>text(s)||pair(s)])));
const tokens=(v:unknown)=>fields(v,{colors,typography,spacing:numericMap,radius,shadows},{backgrounds,colorRoles:roles,
 blur:b=>fields(b,{sm:text,md:text,lg:text}),personality:p=>fields(p,{density:d=>d==='compact'||d==='standard'||d==='relaxed',borderAlpha:number})});

/** Shape-only allowlist for a frozen legacy payload. Never compile, default, normalize or execute it. */
export function isLegacyHistoryTheme(value:unknown):boolean {
 return fields(value,{id:text,name:text,tokens},{tokenVersion:number,tokenFingerprint:text});
}
