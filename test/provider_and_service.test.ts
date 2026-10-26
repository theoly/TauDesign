import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AIService } from '../src/services/ai/aiService';
import { useAIConfigStore, THIRD_PARTY_PRESETS } from '../src/stores/useAIConfigStore';
import { AIProviderConfig } from '../src/types/provider';

describe('AI Provider & AIService Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('AIService.testConnection', () => {
    test('passes configured modelId (e.g. deepseek-flash) rather than hardcoded gpt-4o', async () => {
      let interceptedUrl = '';
      let interceptedBody: any = null;
      let interceptedHeaders: any = null;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        interceptedUrl = url.toString();
        interceptedHeaders = init?.headers;
        if (init?.body) {
          interceptedBody = JSON.parse(init.body as string);
        }

        // Return a mock SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"Pong"}}]}\n\ndata: [DONE]\n\n')
            );
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-deepseek',
        name: 'DeepSeek 官方',
        protocol: 'openai_compatible',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-test-key-123',
        isEnabled: true,
        defaultModel: 'deepseek-flash'
      };

      const result = await AIService.testConnection(provider, 'deepseek-flash');

      expect(result.success).toBe(true);
      expect(interceptedUrl).toBe('https://api.deepseek.com/chat/completions');
      expect(interceptedBody).toBeDefined();
      expect(interceptedBody.model).toBe('deepseek-flash');
      expect(interceptedBody.model).not.toBe('gpt-4o');
      expect(interceptedHeaders['Authorization']).toBe('Bearer sk-test-key-123');
    });

    test('validates missing modelId, baseUrl, or apiKey before calling network', async () => {
      let fetchCalled = false;
      globalThis.fetch = (() => {
        fetchCalled = true;
        return Promise.resolve(new Response('ok'));
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-test',
        name: 'Test Provider',
        protocol: 'openai_compatible',
        baseUrl: '',
        apiKey: '',
        isEnabled: true
      };

      const res1 = await AIService.testConnection(provider, '');
      expect(res1.success).toBe(false);
      expect(res1.message).toContain('模型 ID');

      const res2 = await AIService.testConnection(provider, 'some-model');
      expect(res2.success).toBe(false);
      expect(res2.message).toContain('Base URL');

      provider.baseUrl = 'https://api.example.com';
      const res3 = await AIService.testConnection(provider, 'some-model');
      expect(res3.success).toBe(false);
      expect(res3.message).toContain('API Key');

      expect(fetchCalled).toBe(false);
    });

    test('extracts detailed API error message from response JSON', async () => {
      globalThis.fetch = (async () => {
        const errorJson = JSON.stringify({
          error: {
            message: 'The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed gpt-4o.',
            type: 'invalid_request_error'
          }
        });
        return new Response(errorJson, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-deepseek',
        name: 'DeepSeek 官方',
        protocol: 'openai_compatible',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-test',
        isEnabled: true
      };

      const res = await AIService.testConnection(provider, 'gpt-4o');
      expect(res.success).toBe(false);
      expect(res.message).toContain('The supported API model names are deepseek-flash');
      expect(res.message).toContain('HTTP 错误 400');
    });
  });

  describe('AIService Claude / Anthropic Compatibility', () => {
    test('formats Anthropic request correctly with proper headers, URL, and omit empty system msg', async () => {
      let interceptedUrl = '';
      let interceptedHeaders: any = null;
      let interceptedBody: any = null;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        interceptedUrl = url.toString();
        interceptedHeaders = init?.headers;
        if (init?.body) {
          interceptedBody = JSON.parse(init.body as string);
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello Claude"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
              )
            );
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-claude-custom',
        name: '第三方 Claude 兼容',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test-key',
        isEnabled: true,
        defaultModel: 'claude-3-5-sonnet-20241022'
      };

      let deltaText = '';
      let isDone = false;

      const { promise } = AIService.stream(
        provider,
        'claude-3-5-sonnet-20241022',
        [{ role: 'user', content: 'test message' }],
        (ev) => {
          if (ev.type === 'Delta') deltaText += ev.text;
          if (ev.type === 'Done') isDone = true;
        }
      );

      await promise;

      // URL should have /v1/messages without double /v1
      expect(interceptedUrl).toBe('https://api.anthropic.com/v1/messages');

      // Headers check
      expect(interceptedHeaders['x-api-key']).toBe('sk-ant-test-key');
      expect(interceptedHeaders['Authorization']).toBe('Bearer sk-ant-test-key');
      expect(interceptedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(interceptedHeaders['anthropic-dangerous-direct-browser-access']).toBe('true');

      // Body check
      expect(interceptedBody.model).toBe('claude-3-5-sonnet-20241022');
      expect(interceptedBody.system).toBeUndefined(); // no empty string system
      expect(interceptedBody.messages.length).toBe(1);
      expect(interceptedBody.messages[0].content).toBe('test message');

      // Stream delta & done check
      expect(deltaText).toBe('Hello Claude');
      expect(isDone).toBe(true);
    });

    test('Claude compatibility handles proxy without event: lines', async () => {
      globalThis.fetch = (async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Proxy chunk"}}\n\ndata: {"type":"message_stop"}\n\n'
              )
            );
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-claude-proxy',
        name: 'Proxy Claude',
        protocol: 'anthropic',
        baseUrl: 'https://proxy.example.com',
        apiKey: 'proxy-key',
        isEnabled: true
      };

      let deltaText = '';
      let isDone = false;

      const { promise } = AIService.stream(
        provider,
        'claude-3-5-haiku-20241022',
        [{ role: 'user', content: 'hello' }],
        (ev) => {
          if (ev.type === 'Delta') deltaText += ev.text;
          if (ev.type === 'Done') isDone = true;
        }
      );

      await promise;
      expect(deltaText).toBe('Proxy chunk');
      expect(isDone).toBe(true);
    });

    test('OpenAI compatible captures delta.reasoning_content and wraps into <think>', async () => {
      globalThis.fetch = (async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Simulate DeepSeek-R1 / Qwen reasoning chunks followed by content chunk
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"reasoning_content":"正在思考登录页结构..."}}]}\n\n' +
                'data: {"choices":[{"delta":{"reasoning_content":"需要手机号与验证码输入框。" turn":1}}]}\n\n' +
                'data: {"choices":[{"delta":{"content":"```html\\n<form class=\\"card\\">登录</form>\\n```"}}]}\n\n' +
                'data: [DONE]\n\n'
              )
            );
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-r1-test',
        name: 'DeepSeek R1',
        protocol: 'openai_compatible',
        baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test',
        isEnabled: true
      };

      let fullText = '';
      let done = false;

      const { promise } = AIService.stream(
        provider,
        'deepseek-r1',
        [{ role: 'user', content: '创建登录页面' }],
        (ev) => {
          if (ev.type === 'Delta') fullText += ev.text;
          if (ev.type === 'Done') done = true;
        }
      );

      await promise;

      expect(done).toBe(true);
      expect(fullText).toContain('<think>');
      expect(fullText).toContain('正在思考登录页结构');
      expect(fullText).toContain('</think>');
      expect(fullText).toContain('<form class="card">登录</form>');
    });
  });

  describe('useAIConfigStore Third-Party Provider Management', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test('adds and configures custom third-party provider', () => {
      const store = useAIConfigStore.getState();
      const customId = `prov-custom-${Date.now()}`;
      const newProvider: AIProviderConfig = {
        id: customId,
        name: '硅基流动 SiliconFlow',
        protocol: 'openai_compatible',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: 'sk-silicon-123',
        isEnabled: true,
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        isCustom: true
      };

      store.addProvider(newProvider);

      const added = useAIConfigStore.getState().providers.find((p) => p.id === customId);
      expect(added).toBeDefined();
      expect(added?.name).toBe('硅基流动 SiliconFlow');
      expect(added?.defaultModel).toBe('deepseek-ai/DeepSeek-V3');
      expect(added?.isCustom).toBe(true);

      // Bind to code role
      store.setRoleBinding('code', {
        role: 'code',
        providerId: customId,
        modelId: 'deepseek-ai/DeepSeek-V3'
      });

      const activeCode = useAIConfigStore.getState().getActiveProviderForRole('code');
      expect(activeCode?.provider?.id).toBe(customId);
      expect(activeCode?.modelId).toBe('deepseek-ai/DeepSeek-V3');
    });

    test('deleting active provider automatically falls back safely without breaking role bindings', () => {
      const store = useAIConfigStore.getState();
      const tempId = `prov-temp-${Date.now()}`;

      store.addProvider({
        id: tempId,
        name: 'Temp Provider',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'key',
        isEnabled: true,
        defaultModel: 'claude-3-5-sonnet-20241022',
        isCustom: true
      });

      store.setRoleBinding('code', {
        role: 'code',
        providerId: tempId,
        modelId: 'claude-3-5-sonnet-20241022'
      });

      expect(useAIConfigStore.getState().bindings.code.providerId).toBe(tempId);

      // Delete the provider
      store.deleteProvider(tempId);

      const stateAfter = useAIConfigStore.getState();
      expect(stateAfter.providers.find((p) => p.id === tempId)).toBeUndefined();
      // Should have safely fallen back to the first available provider
      expect(stateAfter.bindings.code.providerId).not.toBe(tempId);
      expect(stateAfter.bindings.code.providerId).toBe(stateAfter.providers[0].id);
    });

    test('THIRD_PARTY_PRESETS includes both OpenAI and Claude compatible templates', () => {
      const openaiPreset = THIRD_PARTY_PRESETS.find((p) => p.protocol === 'openai_compatible');
      const claudePreset = THIRD_PARTY_PRESETS.find((p) => p.protocol === 'anthropic');

      expect(openaiPreset).toBeDefined();
      expect(claudePreset).toBeDefined();
      expect(openaiPreset?.defaultModel).toBeDefined();
      expect(claudePreset?.defaultModel).toBeDefined();
    });

    test('THIRD_PARTY_PRESETS includes Aliyun Token Plan preset with correct endpoint', () => {
      const aliyunTokenPlan = THIRD_PARTY_PRESETS.find((p) => p.name.includes('Token Plan'));
      expect(aliyunTokenPlan).toBeDefined();
      expect(aliyunTokenPlan?.protocol).toBe('openai_compatible');
      expect(aliyunTokenPlan?.baseUrl).toBe('https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
      expect(aliyunTokenPlan?.suggestedModels).toContain('qwen-plus');
      expect(aliyunTokenPlan?.suggestedModels).toContain('deepseek-v3');
    });

    test('AIService catches WebKit "Load failed" and provides clear CORS diagnostic message', async () => {
      globalThis.fetch = (() => {
        const err = new TypeError('Load failed');
        return Promise.reject(err);
      }) as unknown as typeof fetch;

      const provider: AIProviderConfig = {
        id: 'prov-aliyun-test',
        name: '阿里百炼 Token Plan',
        protocol: 'openai_compatible',
        baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-aliyun-test-key',
        isEnabled: true
      };

      const res = await AIService.testConnection(provider, 'qwen-plus');
      expect(res.success).toBe(false);
      expect(res.message).toContain('跨域网络限制 (CORS)');
      expect(res.message).toContain('https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
    });
  });

  describe('AIProviderModal Component UI Tests', () => {
    let container: HTMLDivElement;
    let root: any;

    beforeEach(() => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      container = document.createElement('div');
      document.body.appendChild(container);
      root = (require('react-dom/client') as typeof import('react-dom/client')).createRoot(container);
    });

    afterEach(() => {
      const { act } = require('react');
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    test('UI renders providers, allows adding third-party provider, and tests connection with current model ID', async () => {
      const React = require('react');
      const { act } = React;
      const { AIProviderModal } = require('../src/components/settings/AIProviderModal');

      // Mock testConnection
      let testedModelId = '';
      const originalTest = AIService.testConnection;
      AIService.testConnection = async (_prov: any, modelId: string) => {
        testedModelId = modelId;
        return { success: true, message: '连通性测试成功' };
      };

      act(() => {
        root.render(React.createElement(AIProviderModal, { onClose: () => {} }));
      });

      expect(container.textContent).toContain('AI 模型与 Provider');
      expect(container.textContent).toContain('项目设置');
      expect(container.textContent).toContain('添加第三方');

      // Click "添加第三方" to open menu
      const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('添加第三方')
      );
      expect(addBtn).toBeDefined();
      act(() => {
        addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('选择预设规范快速接入');
      expect(container.textContent).toContain('第三方 Claude 兼容');
      expect(container.textContent).toContain('第三方 OpenAI 兼容');

      // Click "第三方 OpenAI 兼容" preset
      const presetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('第三方 OpenAI 兼容')
      );
      expect(presetBtn).toBeDefined();
      act(() => {
        presetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Now custom provider should be selected
      expect(container.textContent).toContain('自定义第三方');
      expect(container.textContent).toContain('OpenAI 兼容规范');

      const fireChange = (el: HTMLInputElement, val: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        nativeSetter?.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Set API key and model ID
      const inputs = Array.from(container.querySelectorAll('input'));
      const apiKeyInput = inputs.find((i) => i.type === 'password' || i.placeholder.includes('sk-'));
      expect(apiKeyInput).toBeDefined();
      act(() => {
        fireChange(apiKeyInput!, 'sk-custom-test-key');
      });

      // Find Model ID input
      const modelInput = inputs.find(
        (i) => i.placeholder.includes('输入模型 ID') || (i.value && typeof i.value === 'string' && i.value.includes('gpt-4o'))
      );
      expect(modelInput).toBeDefined();

      // Change Model ID to 'deepseek-flash' as in user's scenario!
      act(() => {
        fireChange(modelInput!, 'deepseek-flash');
      });

      // Click "测试连通性"
      const testConnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('测试连通性')
      );
      expect(testConnBtn).toBeDefined();

      await act(async () => {
        testConnBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Verify AIService.testConnection was called with 'deepseek-flash', NOT 'gpt-4o'!
      expect(testedModelId).toBe('deepseek-flash');
      expect(container.textContent).toContain('连通性测试成功');

      AIService.testConnection = originalTest;
    });
  });
});
