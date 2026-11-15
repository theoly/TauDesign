import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import {stubPageCreationRender} from './helpers/pageCreation';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {getProjectPublication} from '../src/services/storage/projectPublication';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
stubPageCreationRender();
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(async()=>{project=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'原子新建回归',deviceProfile:'mobile',createSpecimen:false});await useProjectStore.getState().saveProjectChecked();});
afterEach(()=>{useProjectStore.setState(project,true);useHistoryStore.setState(history,true);});
const create=(signal?:AbortSignal)=>CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'新资料',html:'<main><h1>新资料</h1><button class="btn btn-primary">保存资料</button></main>'}},{signal});
test('readonly never renders or reports a created page',async()=>{
 useProjectStore.setState({projectSaveStatus:'readonly',projectSaveError:'页面正文缺失'});const render=spyOn(PageRenderCheck,'inspect');
 try{const result=await create();expect(result.success).toBe(false);expect(result.error).toContain('无法保存设计');expect(render).not.toHaveBeenCalled();expect(useProjectStore.getState().screenOrder).toEqual([]);}finally{render.mockRestore();}
});
for(const fail of [false,true])test(`single page waits for the durable page/index/History commit; disk failure=${fail}`,async()=>{
 const state=useProjectStore.getState(),storage=createProjectStorage(state.id),before=await storage.readManagedSnapshot!(),past=useHistoryStore.getState().past.length,checkpoints=useHistoryStore.getState().checkpoints.length,original=LocalStorageStorage.prototype.publishManagedSnapshot;
 let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const spy=spyOn(LocalStorageStorage.prototype,'publishManagedSnapshot').mockImplementation(async function(expected,changes,resources){if(this.scopeKey!==storage.scopeKey)return original.call(this,expected,changes,resources);entered();await gate;if(fail)throw Error('synthetic disk full');return original.call(this,expected,changes,resources);});
 const operation=create();
 try{
  await reached;expect(useProjectStore.getState().screenOrder).toEqual([]);expect(useHistoryStore.getState().past).toHaveLength(past);expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);expect(getProjectPublication()).not.toBeNull();
  release();const result=await operation;expect(result.success).toBe(!fail);expect(getProjectPublication()).toBeNull();
  if(fail){expect(result.error).toContain('disk full');expect(await storage.readManagedSnapshot!()).toEqual(before);expect(useProjectStore.getState().screenOrder).toEqual([]);expect(useHistoryStore.getState().past).toHaveLength(past);expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);}
  else{const id=result.screenId!;expect(await storage.readText(`screens/${id}.html`)).toBe(result.createdHtml);const root=JSON.parse((await storage.readText('project.json'))!),archive=JSON.parse((await storage.readText('history.json'))!);expect(root.screenOrder).toEqual([id]);expect(archive.checkpoints.some((cp:any)=>cp.id===result.checkpointId)).toBe(true);
   spy.mockRestore();expect(await useProjectStore.getState().loadProjectById(state.id)).toBe(true);expect(useProjectStore.getState().screens[id].htmlContent).toBe(result.createdHtml);useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[id]).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[id].htmlContent).toBe(result.createdHtml);await useProjectStore.getState().saveProjectChecked();}
 }finally{release();await operation;spy.mockRestore();}
});
test('a lost acknowledgement after a real commit is verified, not retried or discarded',async()=>{
 const id=useProjectStore.getState().id,storage=createProjectStorage(id),original=LocalStorageStorage.prototype.publishManagedSnapshot;let writes=0;
 const spy=spyOn(LocalStorageStorage.prototype,'publishManagedSnapshot').mockImplementation(async function(expected,changes,resources){const result=await original.call(this,expected,changes,resources);if(this.scopeKey===storage.scopeKey){writes++;throw Error('lost native acknowledgement');}return result;});
 try{const result=await create();expect(result.success).toBe(true);expect(writes).toBe(1);expect(JSON.parse((await storage.readText('project.json'))!).screens[result.screenId!]).toBeDefined();expect(useProjectStore.getState().screens[result.screenId!].htmlContent).toBe(result.createdHtml);}finally{spy.mockRestore();}
});
