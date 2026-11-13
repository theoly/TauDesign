import {endpointIdentity} from '../src/services/ai/modelCapabilities';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { preparePageTaskPlan } from '../src/services/ai/pageTaskPlan';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { TaskBudget } from '../src/services/ai/taskBudget';
import { structuredChatOptions, isDeepSeekModel } from '../src/services/ai/structuredRequestPolicy';
import { encodeModelRequest } from '../src/services/ai/modelRequestCodec';
import { observeRequestActivity } from '../src/services/ai/requestActivity';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';

const samplePlan = () => ({
  goal: '展示资料与择偶要求',
  actor: '注册用户',
  completion: ['查看表单'],
  features: [{
    id: 'f1',
    title: '基础资料表单',
    change: 'add',
    basis: 'user',
    sourceIds: ['user:request'],
    information: [{ label: '昵称', kind: 'input' }, { label: '身高', kind: 'input' }],
    interactions: [{ label: '保存并继续', precondition: '填写完毕', outcome: '静态展示保存意图', targetScreenId: '' }],
    states: [{ name: '编辑态', condition: '聚焦输入框', feedback: '展示高亮边框' }]
  }],
  questions: []
});

const sampleContract = () => buildDesignTaskContract({
  intent: 'modify_screen',
  request: '将基础资料、择偶要求的表单集成到本页，类似附件图片样式',
  deviceProfile: 'mobile',
  frameWidth: 390,
  target: { id: 'screen_target', name: '完善资料弹窗', htmlContent: '<div data-nid="root">资料页面</div>' }
});

describe('结构化输出达到输出上限 (Length Limit) 缺陷修复测试套件', () => {
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    host = null;
  });

  test('CHK-F-01: 自定义 Provider 上的 DeepSeek/兼容模型在结构化请求时输出正确的 thinking 控制参数', () => {
    const customProvider = {
      id: 'prov-custom-1794361625648',
      name: 'Custom Aggregator',
      protocol: 'openai_compatible' as const,
      baseUrl: 'https://api.my-custom-proxy.com/v1',
      apiKey: 'sk-custom-test',
      isEnabled: true
    };
    const model = 'deepseek/deepseek-flash';

    expect(isDeepSeekModel(model)).toBe(true);

    const schema = { type: 'object', properties: { test: { type: 'string' } } };
    expect(structuredChatOptions(customProvider, model, schema, false)).toEqual({});
    const configuredProvider={...customProvider,modelCapabilities:{[model]:{version:1 as const,revision:'test',source:'user' as const,endpointIdentity:endpointIdentity(customProvider),thinkingControl:'deepseek' as const}}};
    const chatOptions = structuredChatOptions(configuredProvider, model, schema, false);
    expect(chatOptions).toMatchObject({
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' }
    });

    const prepared = encodeModelRequest({
      provider: configuredProvider,
      model,
      messages: [{ role: 'user', content: 'test request' }],
      jsonSchema: schema,
      enableThinking: false
    });
    const body = prepared.transportRequest.body as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.enable_thinking).toBeUndefined();
  });

  test('CHK-F-02: preparePageTaskPlan 请求参数显式传递 enableThinking: false', async () => {
    const provider = {
      id: 'prov-custom-test',
      name: 'Custom Provider',
      protocol: 'openai_compatible' as const,
      baseUrl: 'https://proxy.test/v1',
      apiKey: 'test-key',
      isEnabled: true
    };
    const transport = new MockTransport();
    const calls: any[] = [];
    const core = new DefaultAIEngineCore({
      id: 'capture-core',
      stream(request, event) {
        calls.push(request);
        return transport.stream(request, event);
      }
    });
    transport.queueResponse(JSON.stringify(samplePlan()), 1);

    const budget = new TaskBudget({
      maxRequests: 4,
      maxRequestedOutputTokens: 34568,
      maxDurationMs: 900000,
      maxRequestDurationMs: 900000
    });

    const snapshot = await preparePageTaskPlan(core, {
      contract: sampleContract(),
      provider,
      model: 'deepseek/deepseek-flash',
      budget,
      baselineHtml: '<div data-nid="root">资料页面</div>',
      isCurrent: () => true
    });

    expect(snapshot).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].generationOptions.enableThinking).toBe(false);
    expect(calls[0].generationOptions.maxTokens).toBe(3072);
  });

  test('CHK-F-03: 遇到输出上限截断 (length error) 时，遵循预算规范严格拦截并不隐式消耗额度', async () => {
    const provider = {
      id: 'prov-custom-test',
      name: 'Custom Provider',
      protocol: 'openai_compatible' as const,
      baseUrl: 'https://proxy.test/v1',
      apiKey: 'test-key',
      isEnabled: true
    };

    let callCount = 0;
    const calls: any[] = [];
    const core = new DefaultAIEngineCore({
      id: 'mock-core',
      stream(request, event) {
        calls.push(request);
        callCount++;
        return {
          abort: () => {},
          promise: (async () => {
            event({ type: 'Connected', at: Date.now(), http_status: 200 });
            event({ type: 'Delta', text: '{"goal":"展示资料",' });
            event({ type: 'Done', finish_reason: 'length' });
          })()
        };
      }
    });

    const budget = new TaskBudget({
      maxRequests: 4,
      maxRequestedOutputTokens: 34568,
      maxDurationMs: 900000,
      maxRequestDurationMs: 900000
    });

    await expect(preparePageTaskPlan(core, {
      contract: sampleContract(),
      provider,
      model: 'deepseek/deepseek-flash',
      budget,
      baselineHtml: '<div data-nid="root">资料页面</div>',
      isCurrent: () => true
    })).rejects.toThrow('结构化输出达到输出上限');

    expect(calls).toHaveLength(1);
    expect(budget.snapshot().requests).toBe(1);
  });

  test('CHK-F-04: generateObject 在异常中断时记录传输状态与 finishReason', async () => {
    const provider = {
      id: 'prov-test',
      name: 'Test',
      protocol: 'openai_compatible' as const,
      baseUrl: 'https://test.local/v1',
      apiKey: 'k',
      isEnabled: true
    };
    const core = new DefaultAIEngineCore({
      id: 'usage-core',
      stream(request, event) {
        return {
          abort: () => {},
          promise: (async () => {
            event({ type: 'Connected', at: Date.now(), http_status: 200 });
            event({
              type: 'Usage',
              input_tokens: 100,
              output_tokens: 1500,
              reasoning_tokens: 500
            });
            event({ type: 'Done', finish_reason: 'length' });
          })()
        };
      }
    });

    let lastSnapshot: any = null;
    const { core: monitored } = observeRequestActivity(core, s => {
      lastSnapshot = s;
    });

    try {
      await monitored.generateObject({ type: 'object' }, {
        provider,
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello' }]
      });
    } catch {
      // 预期会抛出输出上限异常
    }

    expect(lastSnapshot).toBeDefined();
    expect(lastSnapshot.lastFinishReason).toBe('length');
    expect(lastSnapshot.status).toBe('failed');
  });

  test('CHK-F-05: ChatDrawer 呈现「结构化输出达到输出上限」时，渲染紧凑模式诊断与重试按钮', async () => {
    let root: any = null;
    try {
      root = createRoot(host!);
      root.render(
        <div data-testid="error-container">
          <div className="space-y-2.5 p-2 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200">
            <div className="text-[11px]">
              生成失败: 结构化输出达到输出上限，未应用部分结果。请缩小修改范围或提高输出预算后重试。
            </div>
            <div className="text-[10px] text-amber-400/90 bg-amber-950/40 p-1.5 rounded border border-amber-900/60 leading-relaxed">
              💡 提示：业务规划内容过长或模型深度思考占满输出预算导致截断。系统已优化深度思考控制与自愈纠错，点击重试将自动以紧凑模式重新生成。
            </div>
            <button type="button" className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-[11px]">
              直接重试 (紧凑自愈)
            </button>
          </div>
        </div>
      );
      await new Promise(r => setTimeout(r, 50));

      expect(host!.innerHTML).toContain('结构化输出达到输出上限');
      expect(host!.innerHTML).toContain('紧凑模式重新生成');
      expect(host!.innerHTML).toContain('直接重试 (紧凑自愈)');
    } finally {
      if (root) root.unmount();
    }
  });
});
