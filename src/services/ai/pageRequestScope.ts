/** Routing-only view. Never substitute this for the user's full request in model input. */
interface Specification {start:number; title:string; line:number}
const pageHeading=/^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?(?:P\d{1,3}(?:[ \t]+|[:：._-][ \t]*)|(?:页面|page)[ \t]*[0-9一二三四五六七八九十]+[ \t]*[:：])[ \t]*(.{1,100})$/i;
const contentSection=/(?:核心功能|功能定位|交互需求|交互逻辑|页面结构|展示内容|字段与业务限制|用户操作|必须设计的状态|返回与恢复|布局要点)/g;
function inspect(request:string){
 const lines:Array<{text:string;start:number}>=[];let offset=0,fence:string|undefined,referenceLevel:number|undefined;
 for(const raw of request.split('\n')){
  const start=offset;offset+=raw.length+1;
  // Rich-text pastes can escape Markdown punctuation. Offsets still refer to original input.
  const text=raw.replace(/\\([#*`|.\-])/g,'$1').replace(/\\\s*$/,'').trimEnd();
  const marker=/^\s*(`{3,}|~{3,})/.exec(text)?.[1];
  if(marker){if(!fence)fence=marker[0];else if(marker[0]===fence)fence=undefined;lines.push({text:'',start});continue;}
  if(fence||/^\s*>/.test(text)){lines.push({text:'',start});continue;}
  const heading=/^\s*(#{1,6})\s+(.+)/.exec(text);
  if(heading){
   if(referenceLevel!==undefined&&heading[1].length<=referenceLevel)referenceLevel=undefined;
   if(/^(?:参考(?:资料|页面|附录)?|归档参考|关联页面|附录|示例|references?|appendix)\s*[:：]?/i.test(heading[2]))referenceLevel=heading[1].length;
  }
  lines.push({text:referenceLevel===undefined?text:'',start});
 }
 const headings:Specification[]=lines.flatMap((line,index)=>{const match=pageHeading.exec(line.text);return match?[{start:line.start,title:match[1].replace(/\*\*$/,'').trim(),line:index}]:[];});
 const specs=headings.filter((heading,index)=>{
  const body=lines.slice(heading.line+1,headings[index+1]?.line).map(line=>line.text).join('\n');
  return new Set(body.match(contentSection)??[]).size>=2;
 });
 return {specs,text:lines.map(line=>line.text).join('\n')};
}
/** Extractable delivery pages: each must have a page title and concrete content sections. */
export function extractPageSpecifications(request:string):Array<{title:string;start:number}>{
 return inspect(request).specs.map(({title,start})=>({title,start}));
}
export function pageSpecificationStart(request:string):number{
 const first=inspect(request).specs[0];if(first)return first.start;
 // Preserve the original, less structured numbered-page reference protection.
 const heading=/^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?(?:页面|page)[ \t]*[0-9一二三四五六七八九十]+[ \t]*[:：]/im.exec(request);
 return heading&&/(?:核心功能|功能定位|交互需求|交互逻辑|页面结构)/.test(request.slice(heading.index+heading[0].length))?heading.index:-1;
}
/**
 * Multi-page only when ≥2 extractable pages (title + concrete content) exist.
 * Inventory counts, “分别出画板”, and bare “生成N个页面” without extractable specs stay single-page.
 */
export function pageCountRoutingText(request:string):string{
 const count=inspect(request).specs.length;
 return count>=2?`生成${count}个页面`:'生成1个页面';
}
