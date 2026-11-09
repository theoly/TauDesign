/** App-owned applicability explanations; these never satisfy or waive a required gate. */
const reasons={
  'inactive-control':{check:'控件可见文案',outcome:'not-applicable',message:'控件隐藏、禁用或位于未启用区域；通用操作文案检查不适用，明确要求展示的原文仍单独检查。'},
  'body-structured-content':{check:'正文阅读宽度',outcome:'not-applicable',message:'表格、代码、表单或操作控件中的文本，不按普通正文推断窄列。'},
  'body-intentional-layout':{check:'正文阅读宽度',outcome:'not-applicable',message:'已声明竖排、截断或行数限制，不按普通横排正文判断。'},
  'body-transform':{check:'正文阅读宽度',outcome:'unverified',message:'存在复杂变换，未将变换后的矩形与原始尺寸混合推断正文挤压。'},
  'body-measure-limit':{check:'正文阅读宽度',outcome:'unverified',message:'正文文本节点超过本次测量预算；报告保持未完成，请分区检查，不能当作已通过。'},
  'badge-transform':{check:'角标遮挡',outcome:'unverified',message:'角标、承载区或图标存在复杂变换，当前几何检查无法可靠判断遮挡。'},
  'badge-corner-contact':{check:'角标遮挡',outcome:'unverified',message:'通知角标仅在图标外角发生矩形接触，无法据此确定墨迹被遮挡；请核对实际图形。'},
  'intentional-wrap':{check:'短标签换行',outcome:'not-applicable',message:'实际样式允许自然多行，不按必须单行的短标签提示；仍检查裁切和严重正文挤压。'},
  'clipping-transform':{check:'祖先文字裁切',outcome:'unverified',message:'存在复杂变换，当前检查不推断祖先裁切；不能当作文字已完整显示。'},
  'contrast-invisible-ink':{check:'纯色文字对比度',outcome:'not-applicable',message:'当前文字墨色透明，纯色对比度计算不适用；操作可见性及明确原文检查仍执行。'},
} as const;
export type RenderCoverageReason=keyof typeof reasons;
export interface RenderCoverageEntry {reason:RenderCoverageReason;count:number;nids:string[]}
export function renderCoverageDescription(entry:RenderCoverageEntry){return {...reasons[entry.reason]};}
export function validRenderCoverage(value:unknown):value is RenderCoverageEntry[]{
  if(!Array.isArray(value)||value.length>Object.keys(reasons).length)return false;
  const seen=new Set<string>();
  return value.every(entry=>{
    if(!entry||typeof entry!=='object'||Object.keys(entry).length!==3||!['reason','count','nids'].every(key=>Object.hasOwn(entry,key))
      ||typeof entry.reason!=='string'||!Object.hasOwn(reasons,entry.reason)||seen.has(entry.reason)
      ||!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>10000||!Array.isArray(entry.nids)||entry.nids.length>8||entry.nids.length>entry.count
      ||entry.nids.some((nid:unknown)=>typeof nid!=='string'||!nid.length||nid.length>128)||new Set(entry.nids).size!==entry.nids.length)return false;
    seen.add(entry.reason);return true;
  });
}

export function createRenderCoverage(){
  const records=new Map<RenderCoverageReason,{entry:RenderCoverageEntry;elements:Set<Element>}>();
  return {
    note(reason:RenderCoverageReason,element:Element){
      let record=records.get(reason);
      if(!record){record={entry:{reason,count:0,nids:[]},elements:new Set()};records.set(reason,record);}
      if(record.elements.has(element))return;
      record.elements.add(element);record.entry.count++;
      const nid=element.getAttribute('data-nid')||element.closest('[data-nid]')?.getAttribute('data-nid');
      if(nid&&nid.length<=128&&!record.entry.nids.includes(nid)&&record.entry.nids.length<8)record.entry.nids.push(nid);
    },
    entries:()=>Array.from(records.values(),record=>({...record.entry,nids:[...record.entry.nids]})),
  };
}
