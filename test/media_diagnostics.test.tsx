import {afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {createMediaDiagnostic,mediaDiagnosticsSnapshot} from '../src/services/storage/mediaDiagnostics';
import {MediaDiagnosticsButton} from '../src/components/common/MediaDiagnosticsButton';
import * as saver from '../src/utils/exportSaver';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined,host:HTMLDivElement|undefined;
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;host?.remove();host=undefined;});
const tail=()=>mediaDiagnosticsSnapshot().events.at(-1)!;

test('diagnostic output contains only fixed metadata, rejecting content in errors, causes, IDs and extra fields',()=>{
 const secret='sk-PRIVATEcredential-1234567890',html='<main>CONFIDENTIAL_HTML</main>',url='https://user:password@private.test/photo?token=SECRET',bytes='data:image/png;base64,PRIVATE_BYTES';
 const deepest=new Error(secret),second=new TypeError(html,{cause:deepest}),first=new DOMException(url,'SecurityError');
 Object.defineProperty(first,'cause',{value:second});const error=new Error(bytes,{cause:first});error.stack=secret+html+url;
 const log=createMediaDiagnostic({screenId:url,usage:'export',scope:'screen'});
 log('resolve','failed',{error,category:'read',attempt:1,workerState:secret,controllerState:html,...({html,bytes,token:secret,url} as any)});
 expect(tail().error).toEqual({name:'Error',causes:['SecurityError','TypeError']});expect(tail().screenId).toBeUndefined();expect(tail().workerState).toBeUndefined();
 for(const value of [secret,html,url,bytes])expect(JSON.stringify(mediaDiagnosticsSnapshot())).not.toContain(value);
 const named=new Error(secret);named.name=url;createMediaDiagnostic({screenId:secret})('resolve','failed',{error:named});expect(tail().error?.name).toBe('UnknownError');expect(tail().screenId).toBeUndefined();
 const count=tail().sequence;log(html as any,'failed');log('resolve',secret as any);expect(tail().sequence).toBe(count);
});

test('ring retains at most 200 events with total dropped count, immutable snapshots and bounded enum fields',()=>{
 const log=createMediaDiagnostic({screenId:'screen-1731500000000-abcd',usage:'preview',scope:'transport'});
 for(let i=0;i<205;i++)log('register','completed',{attempt:2,workerState:'activated',controllerState:'activated'});
 const snapshot=mediaDiagnosticsSnapshot();expect(snapshot.events).toHaveLength(200);expect(snapshot.capacity).toBe(200);expect(snapshot.droppedEvents).toBe(snapshot.events[0].sequence-1);
 expect(tail().screenId).toBe('screen-1731500000000-abcd');expect(tail().attempt).toBe(2);expect(snapshot.documentId).toMatch(/^[a-f0-9-]{36}$/);
 log('resolve','failed',{error:new TypeError('private',{cause:new Error('private')}),attempt:999,category:'https://secret' as any});const copy=mediaDiagnosticsSnapshot();copy.events.at(-1)!.error!.causes[0]='PRIVATE_MUTATION';copy.events.at(-1)!.screenId='PRIVATE_MUTATION';
 expect(JSON.stringify(mediaDiagnosticsSnapshot())).not.toContain('PRIVATE_MUTATION');expect(tail().attempt).toBeUndefined();expect(tail().category).toBeUndefined();
 const throwing={get name(){throw Error('private');},get cause(){throw Error('private');}};expect(()=>log('resolve','failed',{error:throwing})).not.toThrow();expect(tail().error).toEqual({name:'UnknownError',causes:[]});
});

for(const status of ['saved','canceled','downloaded','failed'] as const)test(`diagnostic export is explicit, content-free and reports ${status}`,async()=>{
 const requests:saver.SaveExportRequest[]=[];
 const mock=spyOn(saver,'saveExportFile').mockImplementation(async request=>{requests.push(request);if(status==='failed')throw Error('SECRET provider credential');return {status,fileName:request.fileName};});
 try{
  host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(<MediaDiagnosticsButton/>));expect(requests).toHaveLength(0);
  await act(async()=>{host!.querySelector('button')!.click();});expect(requests).toHaveLength(1);const request=requests[0];expect(request.fileName).toBe('media-diagnostics.json');expect(request.mimeType).toBe('application/json');const json=new TextDecoder().decode(request.bytes);expect(JSON.parse(json).events.length).toBeLessThanOrEqual(200);expect(json).not.toContain('PRIVATE');
  expect(host.textContent).toContain(status==='canceled'?'已取消':status==='failed'?'保存失败':status==='saved'?'已保存':'浏览器下载');expect(host.textContent).not.toContain('SECRET');
 }finally{mock.mockRestore();}
});
