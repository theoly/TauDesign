import {referenceBytes,referenceDimensions} from '../../src/utils/referenceImagePreparation';
/** Happy DOM has no raster decoder; only supply the missing decode event for tiny test fixtures. */
export function installReferenceImageDecoder(){
 const original=globalThis.Image;
 class FixtureImage {
  naturalWidth=0;naturalHeight=0;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  set src(value:string){if(!value)return;queueMicrotask(()=>{try{const d=referenceDimensions(referenceBytes(value).bytes);this.naturalWidth=d.width;this.naturalHeight=d.height;this.onload?.();}catch{this.onerror?.();}});}
 }
 globalThis.Image=FixtureImage as unknown as typeof Image;return ()=>{globalThis.Image=original;};
}
export const referenceObservationFixture={summary:'参考UI表单',texts:['邮箱','保存'],groups:[],fields:[{label:'邮箱',type:'email',required:true,group:'基础资料',value:''}],visual:['单列布局'],uncertainties:[]};
