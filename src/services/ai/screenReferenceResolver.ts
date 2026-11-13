import { explicitlyRequestsPageRedesign } from './pageRedesignIntent';

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

interface QuotedText {name:string;start:number;end:number;unclosed?:true}
const quotePairs:Record<string,string>={'"':'"','“':'”','「':'」','『':'』','《':'》'};
const referenceCue=/(?:参考|基于|仿照|沿用|复用|读取|分析)(?:现有|原有|已有|原)?(?:页面|画框)?\s*$/;
/** Tokenize top-level pairs first: a closing ASCII quote is never a new reference opener. */
function quotedText(text:string):QuotedText[]{
 const spans:QuotedText[]=[],stack:string[]=[];let start=-1;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='\n'||ch==='\r'){if(stack.length)spans.push({name:text.slice(start+1,i).trim(),start,end:i,unclosed:true});stack.length=0;start=-1;continue;}
  if(ch==='\\'&&text[i+1]!=='\n'&&text[i+1]!=='\r'){i++;continue;}
  if(stack.length&&ch===stack.at(-1)){
   stack.pop();if(!stack.length){spans.push({name:text.slice(start+1,i).trim(),start,end:i+1});start=-1;}continue;
  }
  if(quotePairs[ch]){if(!stack.length)start=i;stack.push(quotePairs[ch]);}
 }
 if(stack.length)spans.push({name:text.slice(start+1).trim(),start,end:text.length,unclosed:true});
 return spans;
}
const cueBefore=(text:string,position:number)=>referenceCue.test(text.slice(0,position).trimEnd().slice(-32));
const targetCueBefore=(text:string,position:number)=>/(?:参考|基于|仿照|沿用|复用|读取|分析|修改|调整|优化|润色|更新|重构|重做|改进|把|将)(?:现有|原有|已有|原)?(?:页面|画框)?\s*["“「『《]?\s*$/.test(text.slice(0,position).trimEnd().slice(-32));
/** Shared by routing and context enrichment, including exact unknown-reference diagnostics. */
export function quotedScreenReferences(text:string):QuotedText[]{
 return quotedText(text).filter(span=>(span.name||span.unclosed)&&cueBefore(text,span.start));
}
/** Numbered page requirements describe the new UI; document titles/copy are not implicit targets. */
function pageSpecificationStart(text:string):number{
 const heading=/^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?(?:页面|page)[ \t]*[0-9一二三四五六七八九十]+[ \t]*[:：]/im.exec(text);
 return heading&&/(?:核心功能|功能定位|交互需求|交互逻辑|页面结构)/.test(text.slice(heading.index+heading[0].length))?heading.index:-1;
}

export function resolveScreenReferences(rawPrompt:string,screens:Record<string,ReferenceScreenIdentity>):ScreenReferenceResolution {
  const result:ScreenReferenceResolution={ids:[],mentionIds:[],unmatchedNames:[],ambiguousNames:[]};
  const text=rawPrompt.toLocaleLowerCase();
  const entries=Object.entries(screens).filter(([,s])=>s.name.trim());
  const names=[...new Set(entries.map(([,s])=>normalized(s.name)))].sort((a,b)=>b.length-a.length);
  const quotations=quotedText(rawPrompt),quotedAt=new Map(quotations.map(span=>[span.start,span]));
  const specificationStart=pageSpecificationStart(text);
  const used:Array<[number,number]>=[];
  const add=(name:string,mention:boolean,explicitId?:string)=>{
    const matches=explicitId ? [[explicitId,screens[explicitId]] as const] : entries.filter(([,s])=>normalized(s.name)===normalized(name));
    if(matches.length===1){const id=matches[0][0];if(!result.ids.includes(id))result.ids.push(id);if(mention&&!result.mentionIds.includes(id))result.mentionIds.push(id);}
    else if(matches.length>1){if(!result.ambiguousNames.includes(name))result.ambiguousNames.push(name);}
    else if(!result.unmatchedNames.includes(name))result.unmatchedNames.push(name);
  };
  const missingQuote=()=>{const message='页名引号未闭合，请补全后重试';if(!result.unmatchedNames.includes(message))result.unmatchedNames.push(message);};
  // Parse known names first so spaces and punctuation inside the actual name are preserved.
  for(let position=0;position<text.length;position++){
    if(text[position]!=='@'||position>0&&/[\w.]/.test(text[position-1]))continue;
    const rest=text.slice(position+1);
    const id=Object.keys(screens).sort((a,b)=>b.length-a.length).find(id=>rest.startsWith(id.toLowerCase())&&boundary(rest.slice(id.length)));
    const name=names.find(name=>rest.startsWith(name)&&boundary(rest.slice(name.length)));
    if(id&&(!name||id.length>=name.length)){add(id,true,id);used.push([position,position+id.length+1]);continue;}
    if(name){add(name,true);used.push([position,position+name.length+1]);continue;}
    const quoted=quotedAt.get(position+1);
    if(quoted?.unclosed){missingQuote();used.push([position,quoted.end]);continue;}
    const unknown=quoted?.name??rest.match(/^[^\s@，,。！？?；;：:、]+/)?.[0];
    if(unknown){add(unknown,true);used.push([position,quoted?.end??position+unknown.length+1]);}
  }
  // A quoted page after an explicit reading/reference verb is an exact reference too.
  for(const span of quotations)if((span.name||span.unclosed)&&cueBefore(rawPrompt,span.start)){if(span.unclosed)missingQuote();else add(span.name,false);}
  // Limit bare-name source matching before a subsequent create command so a new title
  // cannot replace the source in “参考A，创建…B”. Mentions remain explicit anywhere.
  // When creating a page, only bare names immediately following a reference cue before the create command count.
  const isRedesign = explicitlyRequestsPageRedesign(text) && !/(?:根据|参考|依据|基于|按)(?:图片|附件|截图|参考图|样张|设计图|附图)/.test(text);
  const pageCreateMatch = isRedesign ? null : text.match(/(?:创建|新建|生成|新增|设计|做)(?:一个|一张|个|张)?(?:新的?)?[^，。！？；\n]{0,24}?(?:页面|画框|页)(?!面?的?(?:标题|字号|颜色|按钮))/);
  const createIndex=pageCreateMatch?pageCreateMatch.index!:-1;

  const candidates:Array<{name:string;start:number;end:number}>=[];
  for(const name of names){
    if(name.length<2)continue;
    let from=0,index:number;
    while((index=text.indexOf(name,from))>=0){
      from=index+name.length;
      if(used.some(([a,b])=>index>=a&&index<b))continue;
      if(specificationStart>=0&&index>=specificationStart&&!targetCueBefore(rawPrompt,index))continue;
      if(createIndex>=0){
        // 在新建指令场景下：
        // 1. 位于新建动词之后的名字是新建目标或说明，不可作为参考源
        if(index>=createIndex)continue;
        // 2. 位于新建动词之前的名字，必须紧随参考语义前缀才构成参考源
        const prefix=text.slice(Math.max(0,index-24),index);
        if(!/(?:参考|基于|仿照|照着|沿用|复用|借鉴|根据)\s*(?:现有|原有|已有|原)?(?:页面|画框)?\s*$/.test(prefix))continue;
      }
      candidates.push({name,start:index,end:index+name.length});
    }
  }
  candidates.sort((a,b)=>a.start-b.start||b.name.length-a.name.length);
  const covered:Array<[number,number]>=[];
  for(const candidate of candidates){if(covered.some(([a,b])=>candidate.start>=a&&candidate.end<=b))continue;covered.push([candidate.start,candidate.end]);add(candidate.name,false);}
  return result;
}
