import type {PageRenderRequest} from '../../src/services/ai/pageRenderCheck';
import type {ProjectStorage} from '../../src/services/storage/projectStorage';
import {createProjectStorage} from '../../src/services/storage/projectStorage';
import {readProjectRenderResources} from '../../src/services/ai/projectAssetIntegrity';
import {useProjectStore} from '../../src/stores/useProjectStore';
import type {RenderedQualityReport} from '../../src/utils/renderedQuality';
/** Controlled layout observation still reads the exact real files used by that observation. */
export async function resourceRenderReport(request:PageRenderRequest,storage:ProjectStorage,report:RenderedQualityReport={status:'complete',findings:[],inspected:4}){
 if(!request.screen)return report; // The existing concurrency fixture deliberately delegates an empty request.
 const resources=await readProjectRenderResources(storage,[request.screen],request.assets,request.overrides);
 return {...report,resourceFiles:resources.resourceFiles};
}
export async function stageResourceReport(report:RenderedQualityReport={status:'complete',findings:[],inspected:3}){
 const state=useProjectStore.getState(),candidate=state.stagedScreen!;
 const screen={...state.screens[candidate.targetScreenId],htmlContent:candidate.newHtml};
 const proof=await resourceRenderReport({screen,settings:state.settings,designSystem:state.designSystem,assets:Object.values(state.assets),overrides:state.overrides},createProjectStorage(state.id,state.folderPath),report);
 state.setStagedRenderQuality(state.getStagedRenderContextKey(),proof);
}
