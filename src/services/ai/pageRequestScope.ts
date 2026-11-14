/** Routing-only view. Never substitute this for the user's full request in model input. */
interface Specification {start:number; title:string; line:number}
const pageHeading=/^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?(?:P\d{1,3}(?:[ \t]+|[:：._-][ \t]*)|(?:页面|page)[ \t]*[0-9一二三四五六七八九十]+[ \t]*[:：])[ \t]*(.{1,100})$/i;
const contentSection=/(?:核心功能|功能定位|交互需求|交互逻辑|页面结构|展示内容|字段与业务限制|用户操作|必须设计的状态|返回与恢复|布局要点)/g;
const multiScope=/(?:多个|多)页面|多画框|(?:[2-9]|\d{2,}|[二两三四五六七八九十百千万亿])\s*(?:个|张)?(?:新)?(?:页面|画框|页)|(?:整套|全套|一套)[^\n]{0,14}(?:页面|设计)|(?:所有|全部)(?:关联|相关)?页面|(?:页面|页)\s*[、和及与]\s*[^\n]{0,20}(?:页面|页)|\b(?:multiple|several|[2-9]|\d{2,})\s+(?:new\s+)?(?:pages|screens)\b|\b(?:pages|screens)\b/i;
const directCommand=/^(?:(?:本轮|本次|这次|现在)[，,:： \t]*)?(?:请\s*)?(?:只|仅)?(?:(?:同时|一并|一起|批量|一次性|分别)\s*)?(?:新建|创建|生成|设计|制作|做|输出|交付(?=全部|所有))(?!中|时|的|后|默认|规范|指南|规则|说明)/;
const modifiedCommand=/^(?:(?:本轮|本次|这次|现在)\s*)?(?:请\s*)?(?:将|把|按照|按|根据|依照|对)[^，,。\n]{0,40}(?:生成|创建|设计|拆分成|拆分为|拆成|拆为)/;
const negatedCommand=/(?:不要|不必|无需|不用|别)\s*(?:再)?(?:生成|创建|设计|拆)/;
function explicitBatchCommand(clause:string):boolean{
 return multiScope.test(clause)&&(directCommand.test(clause)||modifiedCommand.test(clause)&&!negatedCommand.test(clause)||/^(?:please\s+)?(?:create|generate|design|build)\b/i.test(clause));
}
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
export function pageSpecificationStart(request:string):number{
 const first=inspect(request).specs[0];if(first)return first.start;
 // Preserve the original, less structured numbered-page reference protection.
 const heading=/^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?(?:页面|page)[ \t]*[0-9一二三四五六七八九十]+[ \t]*[:：]/im.exec(request);
 return heading&&/(?:核心功能|功能定位|交互需求|交互逻辑|页面结构)/.test(request.slice(heading.index+heading[0].length))?heading.index:-1;
}
export function pageCountRoutingText(request:string):string{
 const {specs,text}=inspect(request);if(!specs.length)return request;
 // Inventory statements such as “交付共28页” are project background when accompanied
 // by a specific page spec. Independent positive batch instructions remain authoritative.
 const commands=text.split(/[。！？；;\n]/).map(clause=>clause.trim().replace(/^(?:[-*]\s+|\d+[.)]\s+)/,''))
  .filter(explicitBatchCommand);
 // Normalize explicit split commands too: the legacy router requires a creation verb.
 return commands.length?commands.join('\n')+'\n生成多个页面':`生成${specs.length}个页面`;
}
