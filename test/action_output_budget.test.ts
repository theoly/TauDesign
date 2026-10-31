import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
import { afterEach, describe, expect, test } from 'bun:test';
import { AIService } from '../src/services/ai/aiService';
import { AIServiceTransport } from '../src/services/ai/engine/transport/aiServiceTransport';
import { prepareModelRequest } from '../src/services/ai/engine/core/protocolAdapter';
import type { AIProviderConfig, ProviderProtocol, StreamEvent } from '../src/types/provider';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const messages = [{ role: 'user' as const, content: '生成完整页面' }];
function provider(protocol: ProviderProtocol): AIProviderConfig {
  return { id: 'budget-test', name: 'Budget test', protocol, baseUrl: 'https://example.com/v1', apiKey: 'test', isEnabled: true };
}
function outbound() {
  const bodies: any[] = [];
  globalThis.fetch = (async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return new Response('', { status: 200 });
  }) as typeof fetch;
  return bodies;
}
function settings(protocol: ProviderProtocol, body: any) {
  if (protocol === 'gemini') return { maxTokens: body.generationConfig?.maxOutputTokens, temperature: body.generationConfig?.temperature };
  if (protocol === 'ollama_native') return { maxTokens: body.options?.num_predict, temperature: body.options?.temperature };
  return { maxTokens: body.max_tokens, temperature: body.temperature };
}
const protocols: ProviderProtocol[] = ['openai_compatible', 'anthropic', 'gemini', 'ollama_native'];
describe('操作修改输出预算传到实际网络请求', () => {
  for (const protocol of protocols) {
    test(`${protocol}: prepare → AIServiceTransport → fetch 保留16384预算和temperature=0`, async () => {
      const bodies = outbound();
      const { transportRequest } = prepareModelRequest({ provider: provider(protocol), model: 'test-model', messages, maxTokens: 16384, temperature: 0 });
      await new AIServiceTransport().stream(transportRequest, () => {}).promise;
      expect(bodies).toHaveLength(1);
      expect(settings(protocol, bodies[0])).toEqual({ maxTokens: 16384, temperature: 0 });
    });
    test(`${protocol}: prepare默认8192和0.7实际出站一致`, async () => {
      const bodies = outbound();
      const { transportRequest } = prepareModelRequest({ provider: provider(protocol), model: 'test-model', messages });
      await new AIServiceTransport().stream(transportRequest, () => {}).promise;
      expect(settings(protocol, bodies[0])).toEqual({ maxTokens: 8192, temperature: 0.7 });
    });
    test(`${protocol}: 直接调用保持原有默认`, async () => {
      const bodies = outbound();
      await AIService.stream(provider(protocol), 'test-model', messages, () => {}).promise;
      expect(settings(protocol, bodies[0])).toEqual(protocol === 'ollama_native'
        ? { maxTokens: undefined, temperature: undefined }
        : { maxTokens: protocol === 'gemini' ? 4096 : 8192, temperature: 0.7 });
    });
  }
  test('AIService第五位置仍是timeoutMs，第六位置预算不覆盖超时', async () => {
    let body: any;
    const events: StreamEvent[] = [];
    globalThis.fetch = (async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }) as typeof fetch;
    await AIService.stream(provider('openai_compatible'), 'test-model', messages, event => events.push(event), 20, { maxTokens: 16384, temperature: 0.2 }).promise;
    expect(settings('openai_compatible', body)).toEqual({ maxTokens: 16384, temperature: 0.2 });
    expect(events.some(event => event.type === 'Error' && event.kind === 'timeout')).toBe(true);
  });
});

for(const failure of ['network','429','500'] as const)test(`actual AIService ${failure} failure invokes fetch once, never refills or silently retries`,async()=>{
 let calls=0;globalThis.fetch=(async()=>{calls++;if(failure==='network')throw new TypeError('Failed to fetch');return new Response('provider unavailable',{status:Number(failure)});}) as typeof fetch;
 const contract=buildDesignTaskContract({intent:'create_screen',request:'长正文',deviceProfile:'mobile',frameWidth:390});
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'长正文',operation:'create',device:'mobile',scope:'page',maxChars:1500}),'html');
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:8192,maxDurationMs:10000,maxRequestDurationMs:10000});
 const core=withTaskBudget(withGuidanceReceipts(new DefaultAIEngineCore(new AIServiceTransport()),contract,contract.designGuidance),budget);
 const request={provider:provider('openai_compatible'),model:'fixture',maxTokens:8192,messages:[{role:'system' as const,content:contract.designGuidance.selection.body}]};
 await expect(core.streamText(request).textPromise).rejects.toThrow();
 expect(calls).toBe(1);expect(contract.designGuidance.requests).toHaveLength(1);expect(contract.designGuidance.requests[0].status).toBe('failed');
 expect(()=>core.streamText(request)).toThrow('预算');expect(calls).toBe(1);expect(contract.designGuidance.requests).toHaveLength(1);
 expect(budget.snapshot()).toMatchObject({requests:1,requestedOutputTokens:8192,reservedOutputTokens:0});budget.close();
});
