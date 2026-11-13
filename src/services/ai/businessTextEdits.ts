import {requestedProgressSummary} from './inlineFormContract';
/** Exact quoted replacements and an explicit summary count with a unique source identity. */
export interface BusinessTextEdit {version:1;nid:string;before:string;after:string;kind?:'progress-summary'}
export function compileBusinessTextEdits(items:Array<{nid?:string;text:string}>,request:string):BusinessTextEdit[]{
 const edits:BusinessTextEdit[]=[];
 for(const clause of request.split(/[\n。；;]/)){
  if(/不要|不得|禁止|不能|勿|不改|\b(?:not|never)\b/i.test(clause))continue;
  const matches=clause.matchAll(/[“「"]([^”」"\n]{1,400})[”」"]\s*(?:文案|文字|文本)?\s*(?:改为|改成|替换为|修改为)\s*[“「"]([^”」"\n]{1,400})[”」"]/g);
  for(const m of matches){
   if(!m[1].trim()||!m[2].trim())throw Error('明确替换的业务文案不能为空，请使用单独的删除授权。');
   const candidates=items.filter(item=>item.nid&&item.text.trim()===m[1].trim());
   if(candidates.length!==1)continue;
   const nid=candidates[0].nid!;
   if(edits.some(edit=>edit.nid===nid&&edit.after!==m[2].trim()))throw Error('同一文案存在冲突的明确替换要求，请确认后再生成。');
   if(!edits.some(edit=>edit.nid===nid))edits.push({version:1,nid,before:m[1].trim(),after:m[2].trim()});
  }
 }
 const progress=requestedProgressSummary(request),counts=items.filter(item=>item.nid&&/^(?:已填|已完成)\s*\d+\s*\/\s*\d+$/.test(item.text.trim()));
 if(progress&&counts.length===1){const item=counts[0],old=edits.find(edit=>edit.nid===item.nid);if(old&&old.after!==progress)throw Error('进度摘要存在冲突的明确替换要求。');if(!old)edits.push({version:1,nid:item.nid!,before:item.text.trim(),after:progress,kind:'progress-summary'});}
 return edits;
}
