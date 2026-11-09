import {test,expect} from 'bun:test';
import {AIService} from '../src/services/ai/aiService';
import {endpointIdentity,resolveModelCapability,requestOutputCap} from '../src/services/ai/modelCapabilities';
import {inspectModelCapacity,estimateInputTokens} from '../src/services/ai/modelCapacity';
import {httpFailure,retryEligibility} from '../src/services/ai/transportFailure';
import {useAIConfigStore} from '../src/stores/useAIConfigStore';
import type {AIProviderConfig} from '../src/types/provider';
const provider:AIProviderConfig={id:'capacity',name:'test',protocol:'openai_compatible',baseUrl:'https://example.test/v1',apiKey:'test-key',isEnabled:true};
const profile={version:1 as const,source:'user' as const,revision:'one',endpointIdentity:endpointIdentity(provider),contextWindow:8192,maxOutputTokens:4096};
test('known capacity includes all messages, metadata schema and output reserve; unknown is disclosed',()=>{
 const messages=[{role:'system' as const,content:'协议'.repeat(800)},{role:'user' as const,content:'需求'.repeat(800),imageUrl:'https://example.test/image.png'}];
 const r=inspectModelCapacity(messages,4096,profile,{type:'object',description:'必需字段'.repeat(200)});
 expect(r.fits).toBe(false);expect(r.inputTokens).toBeGreaterThan(8000);expect(r.parts.at(-1)?.kind).toBe('native-schema');expect(r.mediaEstimate).toBe(true);
 expect(inspectModelCapacity(messages,4096).knownWindow).toBe(false);expect(estimateInputTokens('中文')).toBe(2);
});
test('model/endpoint changes cannot silently reuse an old capacity; role and provider caps intersect',()=>{
 const p={...provider,modelCapabilities:{m:profile},requestOutputCaps:{m:2048}};expect(requestOutputCap(p,'m',8192)).toBe(2048);expect(resolveModelCapability(p,'foreign')).toBeUndefined();
 expect(()=>resolveModelCapability({...p,baseUrl:'https://proxy.test/v1'},'m')).toThrow('过期');expect(()=>requestOutputCap({...p,requestOutputCaps:{m:-1}},'m',8192)).toThrow('无效');
});
test('final service boundary refuses oversized schema/system/current input before any fetch',async()=>{
 const original=globalThis.fetch;let requests=0;globalThis.fetch=(async()=>{requests++;throw Error('must not fetch');}) as typeof fetch;
 const errors:any[]=[];
 try{await AIService.stream({...provider,modelCapabilities:{m:profile}},'m',[{role:'system',content:'规则'.repeat(4000)},{role:'user',content:'不要裁剪本段'}],e=>{if(e.type==='Error')errors.push(e);},undefined,{maxTokens:4096}).promise;expect(requests).toBe(0);expect(errors[0].message).toContain('上下文容量不足');}finally{globalThis.fetch=original;}
});
test('missing bytes never authorize an automatic POST retry and account errors stay terminal',()=>{
 expect(retryEligibility(httpFailure(429,'limited',100),{cancelled:false,stale:false,remainingMs:5000,attempts:1,verifiedRemoteResume:false}).allowed).toBe(false);
 for(const status of [401,402,403])expect(retryEligibility(httpFailure(status,'denied'),{cancelled:false,stale:false,remainingMs:5000,attempts:1,verifiedRemoteResume:true}).allowed).toBe(false);
 expect(httpFailure(402,'balance').kind).toBe('payment_required');
 expect(retryEligibility(httpFailure(429,'limited',6000),{cancelled:false,stale:false,remainingMs:5000,attempts:1,verifiedRemoteResume:true}).allowed).toBe(false);
});
test('unknown context uses an explicit conservative ceiling rather than sending an unbounded request',async()=>{
 const original=globalThis.fetch;let requests=0;globalThis.fetch=(async()=>{requests++;throw Error('must not fetch');}) as typeof fetch;
 try{
  const messages=[{role:'user' as const,content:'必须完整保留的原文'.repeat(10000)}];
  const receipt=inspectModelCapacity(messages,8192);expect(receipt.knownWindow).toBe(false);expect(receipt.contextWindow).toBeUndefined();expect(receipt.conservativeCeiling).toBe(32768);expect(receipt.fits).toBe(false);
  const errors:string[]=[];await AIService.stream(provider,'unknown',messages,event=>{if(event.type==='Error')errors.push(event.message);}).promise;
  expect(requests).toBe(0);expect(errors[0]).toContain('非厂商窗口');expect(messages[0].content).toEndWith('必须完整保留的原文');
 }finally{globalThis.fetch=original;}
});

test('known models infer 128k context and native vision capability from metadata when unconfigured', () => {
  const cap = resolveModelCapability(provider, 'qwen3.8-flash');
  expect(cap).toBeDefined();
  expect(cap?.source).toBe('metadata');
  expect(cap?.contextWindow).toBe(131072);
  expect(cap?.mediaInput).toBe('native-part');

  // 模拟真实长上下文 + 图片输入 (约 28806 tokens)
  const messages = [
    { role: 'system' as const, content: '全量规范与白名单'.repeat(5000) },
    { role: 'user' as const, content: '根据截图重新设计页面', imageUrl: 'data:image/png;base64,mock' }
  ];
  const receipt = inspectModelCapacity(messages, 8192, cap);
  expect(receipt.knownWindow).toBe(true);
  expect(receipt.contextWindow).toBe(131072);
  expect(receipt.fits).toBe(true); // 顺利放行，不再报超过 32768
});

test('user configured capacity strictly overrides inferred metadata capacity', () => {
  const customProfile = {
    ...profile,
    contextWindow: 65536,
    source: 'user' as const
  };
  const customProvider = {
    ...provider,
    modelCapabilities: { 'qwen3.8-flash': customProfile }
  };
  const cap = resolveModelCapability(customProvider, 'qwen3.8-flash');
  expect(cap?.source).toBe('user');
  expect(cap?.contextWindow).toBe(65536);
});

test('CHK-F-01: inferKnownModelCapability recognises gemini-3.8-flash, models/ prefix, and google/ prefix with 1M context', () => {
  const models = ['gemini-3.8-flash', 'models/gemini-2.0-flash', 'google/gemini-2.0-flash', 'gemini-exp-1206'];
  for (const model of models) {
    const cap = resolveModelCapability(provider, model);
    expect(cap).toBeDefined();
    expect(cap?.contextWindow).toBe(1048576);
    expect(cap?.mediaInput).toBe('native-part');
  }
});

test('CHK-F-02: gemini protocol provider infers 1M context regardless of model name', () => {
  const geminiProvider: AIProviderConfig = {
    ...provider,
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  };
  const cap = resolveModelCapability(geminiProvider, 'custom-gemini-model');
  expect(cap).toBeDefined();
  expect(cap?.contextWindow).toBe(1048576);
  expect(cap?.mediaInput).toBe('native-part');
});

test('CHK-F-03: partial stored capability without contextWindow inherits inferred window instead of dropping to unknown', () => {
  const partialProfile = {
    version: 1 as const,
    source: 'user' as const,
    revision: 'vision-auto',
    endpointIdentity: endpointIdentity(provider),
    mediaInput: 'native-part' as const
    // contextWindow is undefined
  };
  const providerWithPartial: AIProviderConfig = {
    ...provider,
    modelCapabilities: {
      'gemini-3.8-flash': partialProfile,
      'qwen3.8-flash': partialProfile
    }
  };
  const geminiCap = resolveModelCapability(providerWithPartial, 'gemini-3.8-flash');
  expect(geminiCap).toBeDefined();
  expect(geminiCap?.source).toBe('user');
  expect(geminiCap?.contextWindow).toBe(1048576); // inherited from inferred
  expect(geminiCap?.mediaInput).toBe('native-part');

  const qwenCap = resolveModelCapability(providerWithPartial, 'qwen3.8-flash');
  expect(qwenCap).toBeDefined();
  expect(qwenCap?.source).toBe('user');
  expect(qwenCap?.contextWindow).toBe(131072); // inherited from inferred
});

test('CHK-F-05: useAIConfigStore hydration and setRoleBinding vision populates recommended contextWindow', () => {
  const { setRoleBinding, updateProvider } = useAIConfigStore.getState();
  updateProvider('prov-gemini', { modelCapabilities: undefined });
  setRoleBinding('vision', {
    role: 'vision',
    providerId: 'prov-gemini',
    modelId: 'gemini-3.8-flash'
  });
  const updated = useAIConfigStore.getState().providers.find(p => p.id === 'prov-gemini');
  const cap = updated?.modelCapabilities?.['gemini-3.8-flash'];
  expect(cap?.mediaInput).toBe('native-part');
  expect(cap?.contextWindow).toBe(1048576);
});

test('CHK-F-06: 29222 tokens input scenario passes inspectModelCapacity without throwing local conservative boundary error', () => {
  // Simulate the exact error: estimated input ~29222 tokens
  const partialProfile = {
    version: 1 as const,
    source: 'user' as const,
    revision: 'vision-auto',
    endpointIdentity: endpointIdentity(provider),
    mediaInput: 'native-part' as const
  };
  const provWithGemini: AIProviderConfig = {
    ...provider,
    modelCapabilities: { 'gemini-3.8-flash': partialProfile }
  };
  const cap = resolveModelCapability(provWithGemini, 'gemini-3.8-flash');
  expect(cap?.contextWindow).toBe(1048576);

  // 构造约 29000 tokens 的输入
  const messages = [
    { role: 'system' as const, content: '全量设计规范与基座样式白名单'.repeat(1200) },
    { role: 'user' as const, content: '请修改该页面卡片布局并优化质感'.repeat(600) }
  ];
  const receipt = inspectModelCapacity(messages, 8192, cap);
  expect(receipt.knownWindow).toBe(true);
  expect(receipt.contextWindow).toBe(1048576);
  expect(receipt.fits).toBe(true);
  expect(() => {
    if (!receipt.fits) throw new Error('Capacity overflow');
  }).not.toThrow();
});
