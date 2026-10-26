import type { EngineMessage } from '../core/types';
interface ConversationEntry {
  sender:'user'|'assistant';
  text:string;
  displayText?:string;
  screenName?:string;
  htmlOutput?:string;
  isGenerating?:boolean;
}
/** Retain recent language context; page snapshots, never historical generated HTML, are authoritative. */
export function buildConversationContext(entries:ConversationEntry[]):EngineMessage[] {
  const history:EngineMessage[]=[];
  let remaining=6000;
  for(const entry of [...entries].reverse()){
    if(entry.isGenerating||history.length>=8||remaining<=0)continue;
    let content=entry.displayText||entry.text;
    if(entry.sender==='assistant'&&(entry.htmlOutput||content.includes('<artifact'))){
      content=entry.screenName?`上一轮已处理页面：${entry.screenName}`:'上一轮已返回页面设计；以当前页面快照为准。';
    }
    if(content.includes('data:image/'))content='[上一轮含图片参考；历史二进制不重复注入]';
    content=content.trim().slice(0,Math.min(1200,remaining));
    if(!content)continue;
    history.unshift({role:entry.sender,content});remaining-=content.length;
  }
  return history;
}
