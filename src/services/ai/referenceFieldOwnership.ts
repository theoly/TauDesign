import type {PageTaskPlan} from './pageTaskPlan';
import {referencePlanningFields,type ReferenceEvidence} from './referenceEvidence';
import {normalizeFieldLabel} from './referenceFieldNames';
export function referenceFieldOwnership(plan:PageTaskPlan,evidence:ReferenceEvidence,request:string){
 const fields=referencePlanningFields(evidence,request);
 return fields.map(field=>{
  const matches=plan.features.filter(feature=>feature.information.some(info=>info.label.split(/[、,，/／|｜;；\n]/).some(label=>field.equivalentLabels.some(alias=>normalizeFieldLabel(label)===normalizeFieldLabel(alias)))));
  const imageId=evidence.image?.fingerprint?`image:${evidence.image.fingerprint}`:undefined;
  const imageOwners=imageId?matches.filter(feature=>feature.basis==='image'&&feature.sourceIds.includes(imageId)):[];
  const owners=matches.length>1&&imageOwners.length===1?imageOwners:matches;
  if(owners.length!==1)throw Error(`参考字段“${field.label}”尚未唯一归属业务区块，请先确认字段归属；未开始页面写入。`);
  return {...field,featureId:owners[0].id};
 });
}
