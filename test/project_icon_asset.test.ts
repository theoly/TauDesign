import {afterEach,beforeEach,expect,test} from 'bun:test';
import {saveProjectIcon} from '../src/services/ai/projectIconAsset';
import {inspectExternalMedia} from '../src/services/ai/externalMedia';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
const fragment='<circle cx="12" cy="12" r="8"/><path d="M8 12L12 16L16 8"/>';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
const write=LocalStorageStorage.prototype.writeBinary;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'独立图标',deviceProfile:'mobile',createSpecimen:false});useProjectStore.setState({id:'icon-test-'+crypto.randomUUID()});useHistoryStore.getState().restore(null);});
afterEach(()=>{LocalStorageStorage.prototype.writeBinary=write;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});

test('AI icon is a real independent file; copied page code contains only its registered reference and exact undo/redo',async()=>{
 const saved=await saveProjectIcon(fragment,'认证图标','ai_generated'),state=useProjectStore.getState(),storage=createProjectStorage(state.id,state.folderPath);
 expect(saved.asset.rawSvg).toBeUndefined();expect(saved.asset.relPath).toMatch(/^assets\/icons\/[a-f0-9]{64}\.svg$/);expect(inspectExternalMedia(saved.reference).violations).toEqual([]);
 expect(saved.reference).not.toContain('<path');expect(saved.reference).not.toContain('<circle');expect(saved.reference).toContain(saved.asset.relPath);
 expect(atob((await storage.readBinary(saved.asset.relPath))!)).toContain('<circle');expect(state.assets[saved.asset.id]).toEqual(saved.asset);expect(useHistoryStore.getState().past).toHaveLength(1);
 await saveProjectIcon(fragment,'same bytes','builtin');expect(useHistoryStore.getState().past).toHaveLength(1);expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);
 useHistoryStore.getState().undo();expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);useHistoryStore.getState().redo();expect(useProjectStore.getState().assets[saved.asset.id]).toEqual(saved.asset);
});

test('untrusted SVG never reaches the filesystem or assets',async()=>{
 let writes=0;LocalStorageStorage.prototype.writeBinary=async()=>{writes++;};
 for(const shapes of ['<script>alert(1)</script>','<path onclick="alert(1)" d="M0 0"/>','<image href="data:image/png;base64,YQ=="/>'])await expect(saveProjectIcon(shapes,'bad','ai_generated')).rejects.toThrow();
 expect(writes).toBe(0);expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);expect(useHistoryStore.getState().past).toHaveLength(0);
});

test('cancel or project switch during write leaves no metadata and never deletes immutable files',async()=>{
 for(const mode of ['cancel','switch'] as const){
  const controller=new AbortController(),old=useProjectStore.getState(),storage=createProjectStorage(old.id,old.folderPath);
  LocalStorageStorage.prototype.writeBinary=async function(path,data){await write.call(this,path,data);if(mode==='cancel')controller.abort();else useProjectStore.getState().initNewProject({name:'other',deviceProfile:'pc',createSpecimen:false});};
  await expect(saveProjectIcon(fragment,mode,'ai_generated',controller.signal)).rejects.toThrow();expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);expect(await storage.listDir('assets/icons')).toHaveLength(1);
  useProjectStore.getState().initNewProject({name:'next',deviceProfile:'mobile',createSpecimen:false});useProjectStore.setState({id:'icon-test-'+crypto.randomUUID()});
 }
});

test('conflicting or failed file writes do not register a successful asset',async()=>{
 const saved=await saveProjectIcon(fragment,'first','builtin'),storage=createProjectStorage(useProjectStore.getState().id);useHistoryStore.getState().undo();await storage.writeBinary(saved.asset.relPath,btoa('tampered'));
 await expect(saveProjectIcon(fragment,'again','builtin')).rejects.toThrow('不匹配');expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
 LocalStorageStorage.prototype.writeBinary=async()=>{throw Error('disk full');};await expect(saveProjectIcon('<path d="M0 0L2 2"/>','failed','ai_generated')).rejects.toThrow('disk full');expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
});

test('global replacement blocks embedded, temporary and unregistered local resources before History or DOM changes',()=>{
 const store=useProjectStore.getState();store.addAsset({id:'photo',name:'photo',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/photo.png',refCount:1});store.addScreen({name:'page',htmlContent:'<main><img data-asset-id="photo" src="assets/images/photo.png"></main>'},'page');const before=useProjectStore.getState().screens.page.htmlContent,count=useHistoryStore.getState().past.length;
 for(const url of ['data:image/png;base64,YQ==','blob:https://example.test/123','assets/images/missing.png','javascript:alert(1)'])expect(()=>store.replaceAssetGlobally('photo',url)).toThrow();
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);expect(useHistoryStore.getState().past).toHaveLength(count);
 expect(store.replaceAssetGlobally('photo','https://example.test/new.png')).toBeGreaterThan(0);expect(useProjectStore.getState().screens.page.htmlContent).toContain('https://example.test/new.png');
});
