import type {Screen} from '../../src/types/project';
const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])):value;
export function screenDesignSnapshot(screens:Screen[]){return JSON.stringify(ordered(screens.map(({measuredHeight,...screen})=>({...screen,scopedCss:screen.scopedCss??''}))));}
/** Saving may add manifest defaults, but may not erase/change any actual pre-save design field. */
export function assertSavedScreenFields(originals:Screen[],saved:Screen[]){
 for(const original of originals){const actual=saved.find(page=>page.id===original.id);if(!actual)throw Error('保存后缺少页面：'+original.id);
  for(const [key,value]of Object.entries(original)){
   if(key==='measuredHeight'||value===undefined)continue;
   const savedValue=key==='scopedCss'?(actual.scopedCss??''):(actual as any)[key];
   if(JSON.stringify(ordered(value))!==JSON.stringify(ordered(savedValue)))throw Error('保存改变设计字段：'+original.id+'.'+key);
  }
 }
}
