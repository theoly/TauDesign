/** Shared exact reference matching for routing and prompt enrichment. No first-page/fuzzy fallback. */
export interface ReferenceScreenIdentity { id:string; name:string; htmlContent:string }
export interface ScreenReferenceResolution {
  ids:string[];
  mentionIds:string[];
  unmatchedNames:string[];
  ambiguousNames:string[];
}
const normalized=(value:string)=>value.trim().toLocaleLowerCase();
const boundary=(value:string)=>!value || /^[\s，,。.!！？?；;：:、"“”「」『』《》()（）\[\]]/.test(value) || /^(的|创建|新建|生成|设计|参考|调整|修改|优化)/.test(value);

export function resolveScreenReferences(rawPrompt:string,screens:Record<string,ReferenceScreenIdentity>):ScreenReferenceResolution {
  const result:ScreenReferenceResolution={ids:[],mentionIds:[],unmatchedNames:[],ambiguousNames:[]};
  const text=rawPrompt.toLocaleLowerCase();
  const entries=Object.entries(screens).filter(([,s])=>s.name.trim());
  const names=[...new Set(entries.map(([,s])=>normalized(s.name)))].sort((a,b)=>b.length-a.length);
  const used:Array<[number,number]>=[];
  const add=(name:string,mention:boolean,explicitId?:string)=>{
    const matches=explicitId ? [[explicitId,screens[explicitId]] as const] : entries.filter(([,s])=>normalized(s.name)===normalized(name));
    if(matches.length===1){const id=matches[0][0];if(!result.ids.includes(id))result.ids.push(id);if(mention&&!result.mentionIds.includes(id))result.mentionIds.push(id);}
    else if(matches.length>1){if(!result.ambiguousNames.includes(name))result.ambiguousNames.push(name);}
    else if(!result.unmatchedNames.includes(name))result.unmatchedNames.push(name);
  };
  // Parse known names first so spaces and punctuation inside the actual name are preserved.
  for(let position=0;position<text.length;position++){
    if(text[position]!=='@'||position>0&&/[\w.]/.test(text[position-1]))continue;
    const rest=text.slice(position+1);
    const id=Object.keys(screens).sort((a,b)=>b.length-a.length).find(id=>rest.startsWith(id.toLowerCase())&&boundary(rest.slice(id.length)));
    const name=names.find(name=>rest.startsWith(name)&&boundary(rest.slice(name.length)));
    if(id&&(!name||id.length>=name.length)){add(id,true,id);used.push([position,position+id.length+1]);continue;}
    if(name){add(name,true);used.push([position,position+name.length+1]);continue;}
    const quoted=rest.match(/^["“「『《]([^"”」』》]+)["”」』》]/);
    const unknown=quoted?.[1]??rest.match(/^[^\s@，,。！？?；;：:、]+/)?.[0];
    if(unknown){add(unknown,true);used.push([position,position+unknown.length+1]);}
  }
  // A quoted page after an explicit reading/reference verb is an exact reference too.
  for(const m of rawPrompt.matchAll(/(?:参考|基于|仿照|沿用|复用|读取|分析)(?:现有|原有|已有|原)?(?:页面|画框)?\s*[“「『"《]([^”」』"》]+)[”」』"》]/g))add(m[1],false);
  // Limit bare-name source matching before a subsequent create command so a new title
  // cannot replace the source in “参考A，创建…B”. Mentions remain explicit anywhere.
  const cue=text.search(/参考|基于|仿照|照着|沿用|复用|借鉴|根据/);
  const createAfter=cue<0?-1:text.slice(cue).search(/新建|创建|生成|新增|设计一个|做一个/);
  const end=createAfter>0?cue+createAfter:text.length;
  const candidates:Array<{name:string;start:number;end:number}>=[];
  for(const name of names){if(name.length<2)continue;let from=0,index:number;while((index=text.indexOf(name,from))>=0){from=index+name.length;if(index>=end||used.some(([a,b])=>index>=a&&index<b))continue;candidates.push({name,start:index,end:index+name.length});}}
  candidates.sort((a,b)=>a.start-b.start||b.name.length-a.name.length);
  const covered:Array<[number,number]>=[];
  for(const candidate of candidates){if(covered.some(([a,b])=>candidate.start>=a&&candidate.end<=b))continue;covered.push([candidate.start,candidate.end]);add(candidate.name,false);}
  return result;
}
