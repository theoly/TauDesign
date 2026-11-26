import type {PageTaskFeature, PageTaskPlan} from './pageTaskPlan';
import {referenceFieldCoverage, referencePlanningFields, type ReferenceEvidence} from './referenceEvidence';
import {normalizeFieldLabel} from './referenceFieldNames';

type PlanningField = ReturnType<typeof referencePlanningFields>[number];

function matchesExact(infoLabel:string,field:PlanningField):boolean{
 const norm=normalizeFieldLabel(infoLabel);
 return Boolean(norm)&&field.equivalentLabels.some(alias=>normalizeFieldLabel(alias)===norm);
}

function matchesSplit(infoLabel:string,field:PlanningField):boolean{
 return infoLabel.split(/[、,，/／|｜;；\n]/).some(part=>matchesExact(part,field));
}

function matchesContains(infoLabel:string,field:PlanningField):boolean{
 if(field.equivalentLabels.length!==1)return false;
 const normInfo=normalizeFieldLabel(infoLabel),normField=normalizeFieldLabel(field.label);
 return Boolean(normInfo&&normField)&&normInfo.includes(normField);
}

function featureMatchRank(feature:PageTaskFeature,field:PlanningField):0|1|2|3{
 let best:0|1|2|3=0;
 for(const info of feature.information){
  if(matchesExact(info.label,field))return 1;
  if(matchesSplit(info.label,field))best=best===0?2:best;
  else if(matchesContains(info.label,field)&&best===0)best=3;
 }
 return best;
}

function matchesGroupTitle(feature:PageTaskFeature,group:string):boolean{
 const normGroup=normalizeFieldLabel(group),normTitle=normalizeFieldLabel(feature.title);
 return Boolean(normGroup&&normTitle)&&(normTitle.includes(normGroup)||normGroup.includes(normTitle));
}

export function resolveReferenceFieldOwnership(
 plan:PageTaskPlan,
 evidence:ReferenceEvidence,
 request:string
):{ownership:Array<PlanningField & {featureId:string}>;warnings:string[]}{
 const active=plan.features.filter(f=>f.change!=='remove');
 const pool=active.length?active:plan.features;
 if(!pool.length)return {ownership:[],warnings:[]};
 const fields=referencePlanningFields(evidence,request);
 const imageId=evidence.image?.fingerprint?`image:${evidence.image.fingerprint}`:undefined;
 const warnings:string[]=[];
 const ownership=fields.map(field=>{
  const ranked=pool.map(feature=>({feature,rank:featureMatchRank(feature,field)})).filter(item=>item.rank>0);
  const minRank=ranked.length?Math.min(...ranked.map(item=>item.rank)):0;
  const matches=ranked.filter(item=>item.rank===minRank).map(item=>item.feature);
  let chosen:PageTaskFeature;
  if(matches.length===1){
   chosen=matches[0];
  }else if(matches.length>1){
   const imageOwners=imageId?matches.filter(feature=>feature.basis==='image'&&feature.sourceIds.includes(imageId)):[];
   if(imageOwners.length===1){
    chosen=imageOwners[0];
   }else{
    const candidates=imageOwners.length?imageOwners:matches;
    const groupMatches=candidates.filter(feature=>matchesGroupTitle(feature,field.group));
    chosen=groupMatches.length===1?groupMatches[0]:candidates[0];
    warnings.push(`参考字段「${field.label}」在多个业务区块重复出现，已自动归属至「${chosen.title}」（仅作提示，不拦截生成）。`);
   }
  }else{
   chosen=(field.group.trim()?pool.find(feature=>matchesGroupTitle(feature,field.group)):undefined)
    ??(imageId?pool.find(feature=>feature.basis==='image'&&feature.sourceIds.includes(imageId)):undefined)
    ??pool.find(feature=>feature.basis==='image')
    ??pool.find(feature=>feature.information.length<8)
    ??pool[0];
   warnings.push(`参考字段「${field.label}」尚未明确归属业务区块，已自动归属至「${chosen.title}」（仅作提示，不拦截生成）。`);
  }
  return {...field,featureId:chosen.id};
 });
 return {ownership,warnings:[...new Set(warnings)]};
}

export function referenceFieldOwnership(plan:PageTaskPlan,evidence:ReferenceEvidence,request:string){
 return resolveReferenceFieldOwnership(plan,evidence,request).ownership;
}

export function reconcileReferenceFieldsInPlan(
 plan:PageTaskPlan,
 evidence:ReferenceEvidence,
 request:string
):{plan:PageTaskPlan;warnings:string[]}{
 const next=structuredClone(plan);
 const {ownership,warnings}=resolveReferenceFieldOwnership(next,evidence,request);
 const allWarnings=[...warnings];

 for(const field of ownership){
  const matchingFeatures=next.features.filter(feature=>featureMatchRank(feature,field)>0);
  if(matchingFeatures.length===0){
   const target=next.features.find(feature=>feature.id===field.featureId&&feature.information.length<8)
    ??next.features.find(feature=>feature.change!=='remove'&&feature.information.length<8)
    ??next.features.find(feature=>feature.information.length<8);
   if(target&&field.label.trim()){
    target.information.push({label:field.label.trim().slice(0,300),kind:field.mode==='readonly'?'display':'input'});
   }
  }else if(matchingFeatures.length>1){
   const keepId=matchingFeatures.some(feature=>feature.id===field.featureId)?field.featureId:matchingFeatures[0].id;
   for(const feature of matchingFeatures){
    if(feature.id===keepId)continue;
    feature.information=feature.information.filter(info=>{
     if(matchesExact(info.label,field))return false;
     const parts=info.label.split(/[、,，/／|｜;；\n]/).map(p=>p.trim()).filter(Boolean);
     return !(parts.length>0&&parts.every(part=>matchesExact(part,field)));
    });
   }
  }
 }

 const remaining=referenceFieldCoverage(evidence,next.features.flatMap(f=>f.information.map(i=>i.label)),request);
 if(remaining){
  allWarnings.push(`参考图字段检查提示：${remaining}（仅作提示，不拦截生成）。`);
 }

 return {plan:next,warnings:[...new Set(allWarnings)]};
}
