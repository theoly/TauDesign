export const normalizeFieldLabel=(s:string)=>s.normalize('NFKC').replace(/\((?:必填|选填|可选)\)/g,'').replace(/[\s*＊:：()（）]/g,'');
/** A finite domain equivalence, not fuzzy similarity: hometown/target region are different facts. */
const equivalentFieldLabels=[['居住地','现居地','现居住地','常住地']] as const;
export function referenceFieldLabelAliases(label:string):string[]{
 const normalized=normalizeFieldLabel(label),group=equivalentFieldLabels.find(names=>names.some(name=>name===normalized));
 return group?[label,...group.filter(name=>name!==label)]:[label];
}
