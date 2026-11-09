import {spyOn} from 'bun:test';
import {browserProjectSnapshotStore} from '../../src/services/storage/browserProjectSnapshot';
import type {ManagedProjectSnapshot} from '../../src/services/storage/managedProjectSnapshot';
import {browserResourceFileStore} from '../../src/services/storage/browserResourceStore';
/** Unit IO only. Real Chromium/WebKit tests exercise the actual IndexedDB backend. */
export function installTestBrowserSnapshotStore(){
 const snapshots=new Map<string,ManagedProjectSnapshot>();
 const resources=new Map<string,Map<string,string|null>>();
 spyOn(browserResourceFileStore,'initialized').mockImplementation(async scope=>resources.has(scope));
 spyOn(browserResourceFileStore,'initialize').mockImplementation(async(scope,files)=>{if(!resources.has(scope))resources.set(scope,new Map(Object.entries(files)));});
 spyOn(browserResourceFileStore,'read').mockImplementation(async(scope,path)=>{const files=resources.get(scope);return files?.has(path)?{version:1,path,value:files.get(path)!}:null;});
 spyOn(browserResourceFileStore,'list').mockImplementation(async scope=>Array.from(resources.get(scope)??[],([path,value])=>({version:1 as const,path,value})).sort((a,b)=>a.path.localeCompare(b.path)));
 spyOn(browserResourceFileStore,'update').mockImplementation(async(scope,path,change)=>{const files=resources.get(scope);if(!files)throw Error('Missing resource initialization');files.set(path,change(files.get(path)??null));});
 spyOn(browserResourceFileStore,'remove').mockImplementation(async(scope,prefix)=>{for(const [path]of resources.get(scope)??[])if(path===prefix||path.startsWith(prefix+'/'))resources.get(scope)!.set(path,null);});
 spyOn(browserProjectSnapshotStore,'read').mockImplementation(async scope=>structuredClone(snapshots.get(scope)??null));
 spyOn(browserProjectSnapshotStore,'compareExchange').mockImplementation(async(scope,expected,next,dependencies=[])=>{if(dependencies.some(file=>resources.get(scope)?.get(file.path)!==file.value))throw Error('页面资源内容已变化，请刷新预览并复验后再采纳。');const old=snapshots.get(scope)??null;if(old?.identity!==(expected?.identity??undefined)||old&&JSON.stringify(old.files)!==JSON.stringify(expected!.files))return false;snapshots.set(scope,structuredClone(next));return true;});
}
