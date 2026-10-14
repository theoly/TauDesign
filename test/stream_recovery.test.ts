import { afterEach, describe, expect, it } from 'bun:test';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { AIServiceTransport } from '../src/services/ai/engine/transport/aiServiceTransport';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { AIProviderConfig } from '../src/types/provider';

const provider: AIProviderConfig = {
  id: 'stream-recovery-test',
  name: 'Test Provider',
  protocol: 'openai_compatible',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test',
  isEnabled: true
};

const error = {
  type: 'Error' as const,
  kind: 'network_error' as const,
  message: '读取流数据异常: error decoding response body'
};

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('流式响应异常恢复', () => {
  it('完整 artifact 到达后断流，继续通过 Pipeline 提取并标记恢复', async () => {
    const transport = new MockTransport([{ events: [
      { type: 'Delta', text: '<artifact type="screen"><main class="container-max"><h1>完整页面</h1></main></artifact>' },
      error
    ] }]);
    const output = await PipelineExecutor.execute({
      input: { rawPrompt: '创建页面' },
      provider,
      model: 'test-model',
      engineCore: new DefaultAIEngineCore(transport),
      screens: {},
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'Create an artifact.'
    });

    expect(output.status).toBe('applied');
    expect(output.extractedHtml).toContain('完整页面');
    expect(output.recoveredStreamError).toContain('error decoding response body');
  });

  it('仅收到不完整 artifact 时保持失败，不能落地残缺页面', async () => {
    const transport = new MockTransport([{ events: [
      { type: 'Delta', text: '<artifact type="screen"><main>未完成' },
      error
    ] }]);
    const output = await PipelineExecutor.execute({
      input: { rawPrompt: '创建页面' },
      provider,
      model: 'test-model',
      engineCore: new DefaultAIEngineCore(transport),
      screens: {},
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'Create an artifact.'
    });

    expect(output.status).toBe('error');
    expect(output.extractedHtml).toBeUndefined();
    expect(output.errorMessage).toContain('读取流数据异常');
  });

  it('完整 artifact 后出现非网络协议错误时也保持失败', async () => {
    const transport = new MockTransport([{ events: [
      { type: 'Delta', text: '<artifact><main>完整页面</main></artifact>' },
      { type: 'Error', kind: 'invalid_response', message: 'Provider rejected response' }
    ] }]);
    const result = new DefaultAIEngineCore(transport).streamText({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: '创建页面' }]
    });
    await expect(result.textPromise).rejects.toThrow('Provider rejected response');
  });

  it('实际 HTTP 响应体解码失败时，完整 artifact 可从已读分片恢复', async () => {
    let sent = false;
    globalThis.fetch = (async () => new Response(new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"<artifact><main>已完成</main></artifact>"}}]}'
          ));
        } else {
          controller.error(new Error('error decoding response body'));
        }
      }
    }), { status: 200 })) as typeof fetch;

    const result = new DefaultAIEngineCore(new AIServiceTransport()).streamText({
      provider,
      model: 'test-model',
      messages: [{ role: 'user', content: '创建页面' }]
    });
    expect(await result.textPromise).toContain('<artifact><main>已完成</main></artifact>');
    expect(await result.recoveryPromise).toContain('error decoding response body');
  });
});
