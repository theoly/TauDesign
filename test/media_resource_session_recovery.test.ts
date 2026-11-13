import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import {createMediaResourceSession} from '../src/services/storage/mediaResourceSession';
import {mediaDiagnosticsSnapshot} from '../src/services/storage/mediaDiagnostics';

const originalContainer=Object.getOwnPropertyDescriptor(navigator,'serviceWorker'),originalChannel=globalThis.MessageChannel;
const originalUrl=location.href;
let starts=0,registers=0,releases=0,startFailure:Error|undefined,failStarts=0,sendFailure:Error|undefined,failSends=0,rejectBytes=false,dropAck=false;
let container:EventTarget&{controller:ServiceWorker|null;register:()=>Promise<unknown>;ready:Promise<unknown>},worker:ServiceWorker;
const stored=new Set<string>();
class Channel {
 port1={onmessage:null as null|((event:{data:unknown})=>void),onmessageerror:null as null|(()=>void),closed:false,close(){this.closed=true;}};
 port2={postMessage:(data:unknown)=>{if(!this.port1.closed)queueMicrotask(()=>{if(!this.port1.closed)this.port1.onmessage?.({data});});},close(){}};
}
beforeEach(()=>{
 (window as any).happyDOM.setURL('http://localhost/');
 starts=registers=releases=0;failStarts=failSends=0;startFailure=sendFailure=undefined;rejectBytes=dropAck=false;stored.clear();
 worker={state:'activated',postMessage(data:any,transfer:any[]){
  const reply=transfer[0];
  if(data.type==='register'){
   registers++;if(failSends-- >0)throw sendFailure;
   if(rejectBytes){reply.postMessage({ok:false,error:'Invalid media bytes'});return;}
   stored.add(data.paths[0]);if(dropAck){dropAck=false;return;}
  }else{releases++;data.paths.forEach((path:string)=>stored.delete(path));}
  reply.postMessage({ok:true});
 }} as ServiceWorker;
 container=Object.assign(new EventTarget(),{controller:worker,async register(){starts++;if(failStarts-- >0)throw startFailure;return {};},ready:Promise.resolve({})});
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:container});
 globalThis.MessageChannel=Channel as unknown as typeof MessageChannel;
});
afterEach(()=>{if(originalContainer)Object.defineProperty(navigator,'serviceWorker',originalContainer);else delete (navigator as any).serviceWorker;globalThis.MessageChannel=originalChannel;(window as any).happyDOM.setURL(originalUrl);});

test('temporary worker startup failure retries once, deduplicates URLs and closes exactly once',async()=>{
 const start=mediaDiagnosticsSnapshot().events.at(-1)?.sequence??0;
 failStarts=1;startFailure=new TypeError('navigation abandoned registration');const session=createMediaResourceSession();
 const [first,second]=await Promise.all([session.url('photo','aW1hZ2U=','image/png'),session.url('photo','aW1hZ2U=','image/png')]);
 expect(first).toBe(second);expect(first).toContain('/__aidesign_media/');expect(first).not.toMatch(/^(?:blob:|data:)/);expect(starts).toBe(2);expect(registers).toBe(1);expect(stored.size).toBe(1);
 await Promise.all([session.close(),session.close()]);expect(releases).toBe(1);expect(stored.size).toBe(0);await expect(session.url('new','aW1hZ2U=','image/png')).rejects.toThrow('已关闭');
 const events=mediaDiagnosticsSnapshot().events.filter(row=>row.sequence>start);
 expect(events.some(row=>row.stage==='worker-start'&&row.status==='failed'&&row.error?.name==='TypeError')).toBe(true);
 expect(events.some(row=>row.stage==='retry'&&row.attempt===2)).toBe(true);
 expect(events.some(row=>row.stage==='worker-control'&&row.controllerState==='activated')).toBe(true);
 expect(events.some(row=>row.stage==='register'&&row.status==='completed')).toBe(true);expect(events.some(row=>row.stage==='release'&&row.status==='completed')).toBe(true);
});
test('persistent startup and denied permissions stop; explicit URL retry does not retain a rejected promise',async()=>{
 failStarts=9;startFailure=new TypeError('offline');const session=createMediaResourceSession();await expect(session.url('photo','aW1hZ2U=','image/png')).rejects.toThrow('暂时无法启动');expect(starts).toBe(2);expect(registers).toBe(0);
 failStarts=0;expect(await session.url('photo','aW1hZ2U=','image/png')).toContain('/__aidesign_media/');await session.close();
 // New container also represents a new document; failed old readiness cannot poison it.
 container=Object.assign(new EventTarget(),{controller:worker,async register(){starts++;throw new DOMException('denied','SecurityError');},ready:Promise.resolve({})});Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:container});
 const denied=createMediaResourceSession(),before=starts;await expect(denied.url('photo','aW1hZ2U=','image/png')).rejects.toThrow('denied');expect(starts-before).toBe(1);await denied.close();
});
test('worker rejection is not retried and its token is released',async()=>{
 rejectBytes=true;const session=createMediaResourceSession();await expect(session.url('photo','aW1hZ2U=','image/png')).rejects.toThrow('Invalid media bytes');expect(registers).toBe(1);expect(releases).toBe(1);expect(stored.size).toBe(0);await session.close();
});
test('lost registration acknowledgement releases the stored token before bounded retry',async()=>{
 const start=mediaDiagnosticsSnapshot().events.at(-1)?.sequence??0;
 const timeout=globalThis.setTimeout;const timer=spyOn(globalThis,'setTimeout').mockImplementation(((fn:TimerHandler,ms?:number,...args:any[])=>timeout(fn,ms===10000?5:ms,...args)) as typeof setTimeout);
 try{dropAck=true;const session=createMediaResourceSession();await session.url('photo','aW1hZ2U=','image/png');expect(registers).toBe(2);expect(releases).toBe(1);expect(stored.size).toBe(1);await session.close();expect(stored.size).toBe(0);
 const events=mediaDiagnosticsSnapshot().events.filter(row=>row.sequence>start);expect(events.some(row=>row.stage==='register'&&row.status==='failed'&&row.category==='transport'&&row.attempt===1)).toBe(true);expect(events.some(row=>row.stage==='register'&&row.status==='completed'&&row.attempt===2)).toBe(true);
 }finally{timer.mockRestore();}
});
test('a replacement controller is used and a closed pending session cannot register late bytes',async()=>{
 const first=createMediaResourceSession();await first.url('first','aW1hZ2U=','image/png');
 let currentSends=0;container.controller={state:'activated',postMessage(data:any,ports:any[]){currentSends++;worker.postMessage(data,ports);}} as ServiceWorker;
 const next=createMediaResourceSession();await next.url('second','aW1hZ2U=','image/png');expect(currentSends).toBe(1);await first.close();expect(currentSends).toBe(1);await next.close();expect(stored.size).toBe(0);
 let resolve!:()=>void;container=Object.assign(new EventTarget(),{controller:worker,register:()=>new Promise<void>(r=>{resolve=r;}),ready:Promise.resolve({})});Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:container});
 const pending=createMediaResourceSession(),before=registers,result=pending.url('late','aW1hZ2U=','image/png'),closing=pending.close();resolve();await expect(result).rejects.toThrow('已关闭');await closing;expect(registers).toBe(before);expect(stored.size).toBe(0);
});
test('a redundant former controller can release its document-owned lease through the replacement without restarting registration',async()=>{
 const old=createMediaResourceSession();await old.url('photo','aW1hZ2U=','image/png');
 const post=worker.postMessage.bind(worker);worker.postMessage=(()=>{throw new DOMException('worker replaced','InvalidStateError');}) as ServiceWorker['postMessage'];
 container.controller={state:'activated',postMessage:post} as ServiceWorker;
 await old.close();expect(stored.size).toBe(0);expect(starts).toBe(1);expect(releases).toBe(1);
});
