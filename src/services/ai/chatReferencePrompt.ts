/** Parse chat reference wrappers as data; the actual target still comes from the project resolver. */
export function parseReferencedElement(text:string):{nid:string;tagName:string;screenName?:string}|null {
  const match=text.match(/\[引用元素\s+nid="([^"]+)"(?:\s+画框="([^"]*)")?(?:\s+标签=<([^>]+)>)?\]/);
  if(match)return {nid:match[1],screenName:match[2]||undefined,tagName:match[3]||'element'};
  const fallback=text.match(/nid="([^"]+)"/);
  return fallback&&text.includes('元素片段:')?{nid:fallback[1],tagName:'element'}:null;
}
export function extractCleanUserPrompt(rawText:string):string {
  if(!rawText.includes('引用元素')&&!rawText.includes('元素片段:'))return rawText;
  let cleaned=rawText.replace(/^\[引用元素[^\]]*\]\s*/i,'');
  cleaned=cleaned.replace(/^元素片段:\s*<[\s\S]*?>[\s\S]*?(?=\n\n([^\n<])|$)/i,'');
  if(cleaned.startsWith('元素片段:')){
    const parts=cleaned.split(/\n\n+/);
    cleaned=parts.length>1?parts.slice(1).join('\n\n'):cleaned.replace(/^元素片段:[^\n]*\n?/,'');
  }
  return cleaned.trim();
}
