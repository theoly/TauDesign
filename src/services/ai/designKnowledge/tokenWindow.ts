import type {RuleQuery,RuleSelection} from './types';
import {buildBoundedGuidance,renderBoundedGuidance} from './promptAdapter';

/** Only generated token CSS: discard indentation after declaration boundaries, never strings/comments/values. */
export function compactTokenCss(css:string):string {
 let result='',quote='',comment=false;
 for(let i=0;i<css.length;i++){
  const c=css[i],next=css[i+1];
  if(comment){result+=c;if(c==='*'&&next==='/'){result+=next;i++;comment=false;}continue;}
  if(quote){result+=c;if(c==='\\'&&next){result+=next;i++;}else if(c===quote)quote='';continue;}
  if(c==='/'&&next==='*'){result+='/*';i++;comment=true;continue;}
  if(c==='"'||c==="'"){quote=c;result+=c;continue;}
  if(/\s/.test(c)&&['{',';','}'].includes(result.at(-1)??'')){
   while(i+1<css.length&&/\s/.test(css[i+1]))i++;
   continue;
  }
  result+=c;
 }
 return result;
}
const savings=(tokens:string,format:'json'|'css'='json')=>format==='css'?tokens.length-compactTokenCss(tokens).length:JSON.stringify(tokens).length-JSON.stringify(compactTokenCss(tokens)).length;
export function selectTokenGuidance(tokens:string,query:RuleQuery,format:'json'|'css'='json'):RuleSelection {
 return buildBoundedGuidance(' '.repeat(Math.max(0,savings(tokens,format)-2)),query).selection;
}
/** Reserve two chars for the system-message separator, then check the actual serialized payload length. */
export function renderTokenGuidance<T extends {tokens:string}>(payload:T,selection?:RuleSelection):{payload:T;suffix:string} {
 if(!selection?.body)return {payload,suffix:''};
 const reference=renderBoundedGuidance(' '.repeat(Math.max(0,savings(payload.tokens)-2)),selection);
 const next={...payload,tokens:compactTokenCss(payload.tokens)},suffix=`\n\n${reference}`;
 if(JSON.stringify(next).length+suffix.length>JSON.stringify(payload).length)throw Error('规则超出本请求原有字符预算，未发送模型。');
 return {payload:next,suffix};
}
export function renderCssGuidance(tokens:string,selection?:RuleSelection):{css:string;suffix:string} {
 if(!selection?.body)return {css:tokens,suffix:''};
 const suffix=`\n\n${renderBoundedGuidance(' '.repeat(Math.max(0,savings(tokens,'css')-2)),selection)}`,css=compactTokenCss(tokens);
 if(css.length+suffix.length>tokens.length)throw Error('规则超过原Token CSS字符预算，未发送模型。');
 return {css,suffix};
}
