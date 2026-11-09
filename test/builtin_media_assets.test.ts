import {test,expect} from 'bun:test';
import {BUILTIN_MEDIA_ICON_NAMES,prepareBuiltinMediaAssets} from '../src/services/ai/builtinMediaAssets';
import {importedLucideSvg} from '../src/services/import/importLucideIcons';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
test('every bundled entry exists in the installed icon library and resource preparation is idempotent with History',async()=>{
 for(const name of BUILTIN_MEDIA_ICON_NAMES)expect(importedLucideSvg(name)).toStartWith('<svg');
 const prior=useProjectStore.getState(),history=useHistoryStore.getState();
 try{
  useProjectStore.getState().initNewProject({name:'图标准备',deviceProfile:'mobile',createSpecimen:false});const before=useHistoryStore.getState().past.length;
  await prepareBuiltinMediaAssets();const state=useProjectStore.getState(),assets=Object.values(state.assets),storage=createProjectStorage(state.id,state.folderPath);expect(assets).toHaveLength(22);expect(useHistoryStore.getState().past.length).toBe(before+1);
  for(const asset of assets){expect(asset.relPath).toMatch(/^assets\/icons\/[a-f0-9]{64}\.svg$/);expect(await storage.exists(asset.relPath)).toBe(true);}
  await prepareBuiltinMediaAssets();expect(useHistoryStore.getState().past.length).toBe(before+1);useHistoryStore.getState().undo();expect(Object.values(useProjectStore.getState().assets)).toHaveLength(0);useHistoryStore.getState().redo();expect(Object.values(useProjectStore.getState().assets)).toHaveLength(22);
 }finally{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);}
});
test('cancellation does not publish asset metadata or remove hashed files another owner may use',async()=>{
 const prior=useProjectStore.getState(),history=useHistoryStore.getState(),write=LocalStorageStorage.prototype.writeBinary,controller=new AbortController();let writes=0;
 try{useProjectStore.getState().initNewProject({name:'取消准备',deviceProfile:'mobile',createSpecimen:false});const before=useHistoryStore.getState().past.length;
  LocalStorageStorage.prototype.writeBinary=async function(path,base64){await write.call(this,path,base64);if(++writes===3)controller.abort();};
  await expect(prepareBuiltinMediaAssets(controller.signal)).rejects.toThrow('取消');expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
  const storage=createProjectStorage(useProjectStore.getState().id);expect(await storage.listDir('assets/icons')).toHaveLength(3);
 }finally{LocalStorageStorage.prototype.writeBinary=write;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);}
});
