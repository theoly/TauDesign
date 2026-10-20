import { describe, expect, test } from 'bun:test';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { analyzeScreenModification } from '../src/services/ai/modificationReview';
import { defaultProviders } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';

const options = {
  provider: defaultProviders[0], model: 'test', name: '约见履约与回访录入',
  html: '<main data-nid="root0001"><p data-nid="text0001">原文保留</p></main>',
  request: '请为卡片与组件增加细腻微边框、柔和投影与轻微背景渐变以及色彩搭配，提升质感。',
  designSystem: defaultTheme, mode: 'light' as const, deviceProfile: 'mobile' as const
};
const valid = { summary: '提升卡片质感', items: [{ title: '增加层次', reason: '卡片缺少视觉层次', change: '使用主题边框和柔和阴影', scope: 'page', operations: [] }] };

describe('修改分析结构化响应兼容', () => {
  test.each(['openai_compatible', 'ollama_native'] as const)('%s请求正文显式携带字段契约，不依赖端点执行schema', async protocol => {
    const transport = new MockTransport(); transport.queueResponse(JSON.stringify(valid));
    const result = await analyzeScreenModification(new DefaultAIEngineCore(transport), { ...options, provider: { ...options.provider, protocol } });
    expect(result.items[0].change).toBe('使用主题边框和柔和阴影');
    const system = (transport.lastRequest!.body as any).messages.find((m: any) => m.role === 'system').content;
    expect(system).toContain('"required":["summary","items"]');
    expect(system).toContain('"title","reason","change","scope","operations"');
  });

  test.each([
    ['错误字段', JSON.stringify({ analysis: '可提升质感', suggestions: valid.items })],
    ['无效JSON', '{"summary":"未完成"'],
    ['缺失改法', JSON.stringify({ summary: '分析', items: [{ title: '建议', reason: '依据' }] })]
  ])('%s经一次纠正后返回真实建议', async (_, response) => {
    const transport = new MockTransport(); transport.queueResponse(response); transport.queueResponse(JSON.stringify(valid));
    const result = await analyzeScreenModification(new DefaultAIEngineCore(transport), options);
    expect(result.summary).toBe('提升卡片质感');
    expect(result.items).toEqual([{ id: 'suggestion-1', title: '增加层次', reason: '卡片缺少视觉层次', change: '使用主题边框和柔和阴影', scope: 'page' }]);
    expect(transport.lastRequest!.messages!.at(-1).content).toContain('纠正');
  });

  test('两次无效则停止并说明结构错误，不消费第三次响应', async () => {
    const transport = new MockTransport();
    transport.queueResponse('{"summary":"错误","items":{}}');
    transport.queueResponse('{"summary":"错误","items":{}}');
    transport.queueResponse(JSON.stringify(valid));
    const core = new DefaultAIEngineCore(transport);
    await expect(analyzeScreenModification(core, options)).rejects.toThrow('纠正后仍');
    expect(await core.generateObject({}, { provider: options.provider, model: 'test', messages: [] })).toEqual(valid);
  });

  test('网络错误不触发格式纠正', async () => {
    const transport = new MockTransport([{ events: [{ type: 'Error', kind: 'network_error', message: '连接失败' }] }]);
    transport.queueResponse(JSON.stringify(valid));
    const core = new DefaultAIEngineCore(transport);
    await expect(analyzeScreenModification(core, options)).rejects.toThrow('连接失败');
    expect(await core.generateObject({}, { provider: options.provider, model: 'test', messages: [] })).toEqual(valid);
  });

  test('取消后不发起分析或纠正', async () => {
    const transport = new MockTransport(); transport.queueResponse(JSON.stringify(valid));
    const controller = new AbortController(); controller.abort();
    await expect(analyzeScreenModification(new DefaultAIEngineCore(transport), { ...options, signal: controller.signal })).rejects.toThrow('取消');
    expect(transport.lastRequest).toBeUndefined();
  });
});
