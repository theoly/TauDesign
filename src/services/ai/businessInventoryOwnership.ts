import {contentFingerprint} from './designWorkflow';
import type {PageRedesignSource} from './pageRedesignSource';
import type {SectionPlan} from './sectionedGeneration';
export interface BusinessItem {id:string;kind:'text'|'control'|'media'|'protected';value:unknown}
export interface BusinessOwner {regionId:string;itemIds:string[]}
export interface BusinessDuties {source:PageRedesignSource;owners:BusinessOwner[]}
export function businessItems(source:PageRedesignSource):BusinessItem[]{
 return ([['text',source.texts],['control',source.controls],['media',source.media],['protected',source.protectedNodes]] as const).flatMap(([kind,values])=>values.map((value,index)=>({id:`${kind}:${index}`,kind,value})));
}
export function validateBusinessOwners(source:PageRedesignSource,regionIds:string[],value:unknown):BusinessOwner[]{
 const owners=value as BusinessOwner[],items=businessItems(source),expected=new Set(items.map(item=>item.id)),seen=new Set<string>();
 if(!Array.isArray(owners)||owners.length!==regionIds.length||new Set(owners.map(row=>row?.regionId)).size!==regionIds.length)throw Error('业务清单归属缺失或重复，请确认区块职责。');
 for(const row of owners){
  if(!row||Object.keys(row).some(k=>!['regionId','itemIds'].includes(k))||!regionIds.includes(row.regionId)||!Array.isArray(row.itemIds))throw Error('业务清单包含未知区域或无效归属。');
  for(const id of row.itemIds){if(typeof id!=='string'||!expected.has(id)||seen.has(id))throw Error('业务清单项目重复、未知或跨区域重分配。');seen.add(id);}
 }
 if(seen.size!==expected.size)throw Error('业务清单尚未完整分配，未开始页面写入。');
 // Canonical ordering makes recovery independent of a model's response order.
 return regionIds.map(regionId=>({regionId,itemIds:items.filter(item=>owners.find(row=>row.regionId===regionId)!.itemIds.includes(item.id)).map(item=>item.id)}));
}
export function businessDuty(source:PageRedesignSource,owners:BusinessOwner[],regionId:string){
 const ids=new Set(owners.find(row=>row.regionId===regionId)?.itemIds??[]);
 return {version:1,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source)),items:businessItems(source).filter(item=>ids.has(item.id))};
}
/** Recheck every saved value against the current immutable inventory, never trust saved assignment contents. */
export function readBusinessDuties(source:PageRedesignSource,plan:SectionPlan):BusinessDuties|undefined{
 const rows=plan.sections.map(section=>({section,data:JSON.parse(section.requirements)}));
 if(rows.every(row=>row.data.businessInventory===undefined))return;
 const owners=validateBusinessOwners(source,plan.sections.map(section=>section.id),rows.map(row=>({regionId:row.section.id,itemIds:row.data.businessInventory?.items?.map((item:BusinessItem)=>item.id)})));
 for(const row of rows)if(JSON.stringify(row.data.businessInventory)!==JSON.stringify(businessDuty(source,owners,row.section.id)))throw Error('存档业务职责与当前来源不一致，未复用分区。');
 return {source,owners};
}
