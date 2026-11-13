import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';

import {ReferenceImagePreview} from '../src/components/chat/ReferenceEvidenceCard';
import {MediaResourceSessions} from '../src/services/storage/mediaResourceSession';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {validReferenceEvidence,type ReferenceEvidence} from '../src/services/ai/referenceEvidence';
import {referenceBytes,sha256} from '../src/utils/referenceImagePreparation';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,root:Root|null,host:HTMLDivElement,oldAct:unknown;
function mount(e:ReferenceEvidence){act(()=>root!.render(<ReferenceImagePreview evidence={e}/>));}
function click(text:string){act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click());}
function unmount(){if(root){act(()=>root!.unmount());root=null;}}
async function until(predicate:()=>boolean){const end=Date.now()+2000;while(!predicate()){if(Date.now()>end)throw Error('Preview did not settle');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}}
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'独立图片预览验收',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{unmount();host.remove();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
async function evidence(){
 const hash=await sha256(referenceBytes(png).bytes),path=`assets/images/${hash}.png`,store=createProjectStorage(useProjectStore.getState().id);await store.ensureDir('assets/images');await store.writeBinary(path,png.split(',')[1]);
 const body={version:1 as const,transformVersion:1 as const,image:{name:'tiny.png',fingerprint:'12345678'},sourceSha256:hash,sourcePath:path,width:1,height:1,parts:[{sha256:hash,relPath:path,width:1,height:1,rect:{x:0,y:0,width:1,height:1}}],parser:{version:1 as const,providerId:'synthetic',model:'vision',configurationFingerprint:'a'.repeat(64),inputFingerprint:'b'.repeat(64)},observation:{summary:'合成图',texts:[],groups:[],fields:[],visual:[],uncertainties:[]}};
 const result:ReferenceEvidence={...body,fingerprint:contentFingerprint(JSON.stringify(body))};expect(validReferenceEvidence(result)).toBe(true);return {result,store};
}
test('actual-send preview verifies source bytes, uses an external resource session and releases it on unmount',async()=>{
 const {result}=await evidence(),calls:string[][]=[];let closes=0;
 const factory=spyOn(MediaResourceSessions,'create').mockReturnValue({url:async(path,bytes,mime)=>{calls.push([path,bytes,mime]);return 'http://localhost/__aidesign_media/verified';},close:async()=>{closes++;}});
 try{mount(result);click('查看发送片段 1');await until(()=>!!host.querySelector('img'));expect(host.querySelector('img')!.getAttribute('src')).toContain('/__aidesign_media/');expect(host.querySelector('img')!.getAttribute('src')).not.toContain('base64');expect(calls[0]).toEqual([result.sourcePath,png.split(',')[1],'image/png']);expect(host.querySelector('img')!.alt).toContain('原图区域 x=0, y=0, 1×1');unmount();expect(closes).toBe(1);}finally{factory.mockRestore();}
});
test('changed preview bytes never reach the resource transport',async()=>{
 const {result,store}=await evidence();await store.writeBinary(result.sourcePath,'YQ==');let calls=0;
 const factory=spyOn(MediaResourceSessions,'create').mockReturnValue({url:async()=>{calls++;return 'http://localhost/never';},close:async()=>{}});
 try{mount(result);click('查看原图');await until(()=>!!host.querySelector('[role=alert]'));expect(host.querySelector('[role=alert]')!.textContent).toContain('图片字节已变化');expect(calls).toBe(0);expect(host.querySelector('img')).toBeNull();}finally{factory.mockRestore();}
});
test('closing a pending preview prevents late file reads from registering resources',async()=>{
 const {result}=await evidence();let release!:(value:string|null)=>void,registrations=0,closes=0;
 const reader=spyOn(LocalStorageStorage.prototype,'readBinaryLimited').mockImplementation(()=>new Promise(resolve=>release=resolve));
 const factory=spyOn(MediaResourceSessions,'create').mockReturnValue({url:async()=>{registrations++;return 'http://localhost/late';},close:async()=>{closes++;}});
 try{mount(result);click('查看原图');expect(release).toBeDefined();unmount();await act(async()=>{release(png.split(',')[1]);await Promise.resolve();});expect(registrations).toBe(0);expect(closes).toBe(1);}finally{reader.mockRestore();factory.mockRestore();}
});
