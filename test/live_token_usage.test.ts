import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AIService } from '../src/services/ai/aiService';
import { createUsageTracker } from '../src/services/ai/usageTracker';
import { useUsageStore } from '../src/stores/useUsageStore';
import { AIProviderConfig } from '../src/types/provider';

const provider: AIProviderConfig = {
  id: 'test-openai',
  name: 'Test Provider',
  protocol: 'openai_compatible',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test',
  isEnabled: true
};

const originalFetch = globalThis.fetch;

beforeEach(() => useUsageStore.getState().clearUsage());
afterEach(() => { globalThis.fetch = originalFetch; });

describe('实时 Token 用量结算', () => {
  it('流中预览不落账，重复 Provider 快照只覆盖并结算一次', async () => {
    const tracker = createUsageTracker(provider, 'model', 350);
    expect(useUsageStore.getState().totalCalls).toBe(0);
    expect(Object.values(useUsageStore.getState().activeRequests)[0].inputTokens).toBe(100);

    tracker.onEvent({ type: 'Delta', text: 'x'.repeat(350) });
    await Bun.sleep(120);
    expect(Object.values(useUsageStore.getState().activeRequests)[0].outputTokens).toBe(100);
    expect(useUsageStore.getState().totalCalls).toBe(0);

    tracker.onEvent({ type: 'Usage', input_tokens: 90, output_tokens: 110 });
    tracker.onEvent({ type: 'Usage', input_tokens: 95, output_tokens: 115 });
    tracker.settle('completed');
    tracker.settle('completed');

    const state = useUsageStore.getState();
    expect(state.totalCalls).toBe(1);
    expect(state.totalInputTokens).toBe(95);
    expect(state.totalOutputTokens).toBe(115);
    expect(state.lastRequest?.source).toBe('provider');
    expect(state.history[0].source).toBe('provider');
  });

  it('取消后保留已产生的估算用量；无输出失败为未知', () => {
    const partial = createUsageTracker(provider, 'model', 70);
    partial.onEvent({ type: 'Delta', text: 'partial output' });
    partial.settle('aborted');
    expect(useUsageStore.getState().totalCalls).toBe(1);
    expect(useUsageStore.getState().lastRequest?.status).toBe('aborted');
    expect(useUsageStore.getState().lastRequest?.source).toBe('estimated');

    const failed = createUsageTracker(provider, 'model', 70);
    failed.settle('error');
    expect(useUsageStore.getState().totalCalls).toBe(1);
    expect(useUsageStore.getState().lastRequest?.source).toBe('unknown');
  });

  it('并发请求独立；清空后迟到请求不能重建累计', () => {
    const first = createUsageTracker(provider, 'one', 35);
    const second = createUsageTracker(provider, 'two', 70);
    first.onEvent({ type: 'Delta', text: 'one' });
    second.onEvent({ type: 'Delta', text: 'two' });
    first.settle('completed');
    expect(Object.values(useUsageStore.getState().activeRequests)).toHaveLength(1);
    useUsageStore.getState().resetSessionUsage();
    second.settle('completed');
    expect(useUsageStore.getState().sessionCalls).toBe(1);
    expect(useUsageStore.getState().totalCalls).toBe(2);

    const late = createUsageTracker(provider, 'late', 35);
    useUsageStore.getState().clearUsage();
    late.onEvent({ type: 'Delta', text: 'too late' });
    late.settle('completed');
    expect(useUsageStore.getState().totalCalls).toBe(0);
    expect(useUsageStore.getState().lastRequest).toBeNull();
  });

  it('AIService 拦截实际 SSE：finish_reason 后的 usage 仍纳入同一笔记录', async () => {
    globalThis.fetch = (async () => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }), { status: 200 })) as typeof fetch;

    const events: string[] = [];
    const { promise } = AIService.stream(provider, 'model', [{ role: 'user', content: 'hello' }], (event) => events.push(event.type));
    await promise;
    const state = useUsageStore.getState();
    expect(events).toContain('Usage');
    expect(state.totalCalls).toBe(1);
    expect(state.totalInputTokens).toBe(12);
    expect(state.totalOutputTokens).toBe(34);
    expect(state.history[0].source).toBe('provider');
  });

  it('Anthropic 分段 Usage、Gemini 元数据与 Ollama 结束计数均按实际值落账', async () => {
    const cases = [
      {
        protocol: 'anthropic' as const,
        chunks: 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":21,"output_tokens":0}}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hello"}}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n' +
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        input: 21,
        output: 7
      },
      {
        protocol: 'gemini' as const,
        chunks: 'data: {"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":22,"candidatesTokenCount":8}}\n\n',
        input: 22,
        output: 8
      },
      {
        protocol: 'ollama_native' as const,
        chunks: '{"message":{"content":"hello"}}\n{"done":true,"prompt_eval_count":23,"eval_count":9}\n',
        input: 23,
        output: 9
      }
    ];

    for (const sample of cases) {
      useUsageStore.getState().clearUsage();
      globalThis.fetch = (async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sample.chunks));
          controller.close();
        }
      }), { status: 200 })) as typeof fetch;
      await AIService.stream(
        { ...provider, protocol: sample.protocol },
        'model',
        [{ role: 'user', content: 'hello' }],
        () => {}
      ).promise;
      const state = useUsageStore.getState();
      expect(state.totalCalls).toBe(1);
      expect(state.totalInputTokens).toBe(sample.input);
      expect(state.totalOutputTokens).toBe(sample.output);
      expect(state.lastRequest?.source).toBe('provider');
    }
  });
});
