import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {AIServiceTransport} from '../src/services/ai/engine/transport/aiServiceTransport';
import { afterEach, expect, test } from 'bun:test';
import { streamNativeProxy, type NativeProxyPayload } from '../src/services/ai/nativeProxy';
import { AIService } from '../src/services/ai/aiService';
import { TauriRustTransport } from '../src/services/ai/engine/transport/tauriTransport';
import { useUsageStore } from '../src/stores/useUsageStore';

const originalInternals = (window as any).__TAURI_INTERNALS__;
const originalTauri = (globalThis as any).isTauri;
const usage = useUsageStore.getState();
afterEach(() => {
  (window as any).__TAURI_INTERNALS__ = originalInternals;
  (globalThis as any).isTauri = originalTauri;
  useUsageStore.setState(usage, true);
});

function ipcFixture() {
  const requests = new Map<string, { channel: { onmessage: (payload: NativeProxyPayload) => void }; resolve: () => void }>();
  const cancels: string[] = [];
  let callbackId = 0;
  (window as any).__TAURI_INTERNALS__ = {
    transformCallback: () => ++callbackId,
    unregisterCallback() {},
    invoke: (command: string, args: any) => {
      if (command === 'proxy_stream_request') return new Promise<void>(resolve => requests.set(args.requestId, { channel: args.channel, resolve }));
      if (command === 'cancel_proxy_request') {
        cancels.push(args.requestId);
        requests.get(args.requestId)?.resolve();
        return Promise.resolve();
      }
      return Promise.reject(Error('Unexpected command: ' + command));
    },
  };
  return { requests, cancels };
}

test('pre-aborted native request never invokes Rust', async () => {
  const fixture = ipcFixture(), controller = new AbortController();
  controller.abort();
  await streamNativeProxy({}, () => { throw Error('late event'); }, controller.signal);
  expect(fixture.requests.size).toBe(0);
});

for (const phase of ['before-ready', 'after-ready'] as const) test(`native cancellation ${phase} waits for registration and drops late output`, async () => {
  const fixture = ipcFixture(), controller = new AbortController(), events: NativeProxyPayload[] = [];
  const promise = streamNativeProxy({}, event => events.push(event), controller.signal);
  const [id, request] = [...fixture.requests][0];
  if (phase === 'before-ready') {
    controller.abort();
    expect(fixture.cancels).toEqual([]);
  }
  request.channel.onmessage({ type: 'Ready', data: id });
  controller.abort(); controller.abort();
  request.channel.onmessage({ type: 'Chunk', data: 'late' });
  request.channel.onmessage({ type: 'Done' });
  await promise;
  expect(fixture.cancels).toEqual([id]);
  expect(events).toEqual([]);
});

test('native parallel streams cancel by unique ID and normal completion removes abort listener', async () => {
  const fixture = ipcFixture(), a = new AbortController(), b = new AbortController(), events: NativeProxyPayload[] = [];
  const first = streamNativeProxy({}, () => {}, a.signal);
  const second = streamNativeProxy({}, event => events.push(event), b.signal);
  const [[idA, requestA], [idB, requestB]] = [...fixture.requests];
  expect(idA).not.toBe(idB);
  requestA.channel.onmessage({ type: 'Ready', data: idA });
  requestB.channel.onmessage({ type: 'Ready', data: idB });
  a.abort(); await first;
  requestB.channel.onmessage({ type: 'Chunk', data: 'kept' });
  requestB.channel.onmessage({ type: 'Done' }); requestB.resolve(); await second;
  b.abort();
  expect(fixture.cancels).toEqual([idA]);
  expect(events).toEqual([{ type: 'Chunk', data: 'kept' }, { type: 'Done' }]);
});

test('AIService timeout cancels actual native command and settles without late Done', async () => {
  const fixture = ipcFixture(), events: any[] = [];
  (globalThis as any).isTauri = true;
  const result = AIService.stream({ id: 'local', name: 'fixture', protocol: 'openai_compatible', baseUrl: 'http://localhost:9999', apiKey: '', isEnabled: true }, 'fixture', [], event => events.push(event), 30);
  const [id, request] = [...fixture.requests][0];
  request.channel.onmessage({ type: 'Ready', data: id });
  await result.promise;
  request.channel.onmessage({ type: 'Done' });
  expect(fixture.cancels).toEqual([id]);
  expect(events.filter(event => event.type === 'Error')).toHaveLength(1);
  expect(events.some(event => event.type === 'Done')).toBe(false);
});

for (const kind of ['handle', 'signal'] as const) test(`TauriRustTransport ${kind} cancellation settles its promise`, async () => {
  const fixture = ipcFixture(), events: any[] = [], controller = new AbortController();
  const result = new TauriRustTransport().stream({ url: 'http://localhost:9999', signal: controller.signal }, event => events.push(event));
  const [id, request] = [...fixture.requests][0];
  request.channel.onmessage({ type: 'Ready', data: id });
  if (kind === 'handle') result.abort(); else controller.abort();
  await result.promise;
  expect(fixture.cancels).toEqual([id]); expect(events).toEqual([]);
});

test('AIService native network failure invokes one Rust command and never falls back to browser fetch',async()=>{
 const fixture=ipcFixture(),fetchBefore=globalThis.fetch;let fetchCalls=0;
 (globalThis as any).isTauri=true;globalThis.fetch=(async()=>{fetchCalls++;throw Error('unexpected fallback');}) as typeof fetch;
 try{
  const core=new DefaultAIEngineCore(new AIServiceTransport()),response=core.streamText({provider:{id:'local',name:'fixture',protocol:'openai_compatible',baseUrl:'https://invalid.test',apiKey:'',isEnabled:true},model:'fixture',messages:[]});
  const failed=response.textPromise.then(()=>null,error=>error);
  const [id,request]=[...fixture.requests][0];request.channel.onmessage({type:'Ready',data:id});request.channel.onmessage({type:'Error',data:'native network failure'});request.resolve();
  expect((await failed)?.message).toContain('network_error');expect(fixture.requests.size).toBe(1);expect(fetchCalls).toBe(0);
 }finally{globalThis.fetch=fetchBefore;}
});
