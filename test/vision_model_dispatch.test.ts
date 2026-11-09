import { describe, test, expect, beforeEach } from 'bun:test';
import { supportsVision, detectModelCapabilities } from '../src/services/ai/engine/core/multimodalGuard';
import { useAIConfigStore } from '../src/stores/useAIConfigStore';
import { endpointIdentity } from '../src/services/ai/modelCapabilities';
import { AIProviderConfig } from '../src/types/provider';
import { preparePageTaskPlan } from '../src/services/ai/pageTaskPlan';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import { referenceImageIdentity } from '../src/services/ai/workflowSources';
import { TaskBudget } from '../src/services/ai/taskBudget';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { chatPageTaskPlan } from './fixtures/pageTaskPlan';

describe('Vision Model Dispatch & Custom Capability Suite (BR-VMD-01 ~ BR-VMD-04)', () => {
  const aliyunProvider: AIProviderConfig = {
    id: 'prov-aliyun-token-plan',
    name: '阿里百炼 Token Plan',
    protocol: 'openai_compatible',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-aliyun-test-key',
    isEnabled: true,
    defaultModel: 'qwen3.8-flash'
  };

  const customGatewayProvider: AIProviderConfig = {
    id: 'prov-custom-gateway',
    name: '自建第三方聚合网关',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.my-gateway.com/v1',
    apiKey: 'sk-gateway-key',
    isEnabled: true,
    defaultModel: 'deepseek-flash'
  };

  const officialDeepseekProvider: AIProviderConfig = {
    id: 'prov-deepseek',
    name: 'DeepSeek 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-official-deepseek',
    isEnabled: true,
    defaultModel: 'deepseek-chat'
  };

  beforeEach(() => {
    // 恢复基础 Provider
    const { addProvider, updateProvider } = useAIConfigStore.getState();
    const existing = useAIConfigStore.getState().providers;
    if (!existing.some((p) => p.id === aliyunProvider.id)) {
      addProvider(aliyunProvider);
    } else {
      updateProvider(aliyunProvider.id, aliyunProvider);
    }
    if (!existing.some((p) => p.id === customGatewayProvider.id)) {
      addProvider(customGatewayProvider);
    } else {
      updateProvider(customGatewayProvider.id, customGatewayProvider);
    }
  });

  test('CHK-F-01: 当 qwen3.8-flash 绑定至 Vision 档位时，supportsVision 权威返回 true', () => {
    const { setRoleBinding } = useAIConfigStore.getState();

    // 绑定 qwen3.8-flash 到 Vision 角色
    setRoleBinding('vision', {
      role: 'vision',
      providerId: aliyunProvider.id,
      modelId: 'qwen3.8-flash'
    });

    // 校验 supportsVision
    const isVision = supportsVision(aliyunProvider, 'qwen3.8-flash');
    expect(isVision).toBe(true);

    // 校验 detectModelCapabilities 也包含 vision 标签
    const caps = detectModelCapabilities(aliyunProvider, 'qwen3.8-flash');
    expect(caps).toContain('vision');
  });

  test('CHK-F-02: 第三方包含 -vl 的 DeepSeek 模型或自建 deepseek-flash 指派为 Vision 档时不被误拦截', () => {
    const { setRoleBinding } = useAIConfigStore.getState();

    // 1. 第三方 deepseek-vl 模型直接通过命名规则判定为视觉
    expect(supportsVision(customGatewayProvider, 'deepseek-ai/deepseek-vl-7b-chat')).toBe(true);
    expect(supportsVision(customGatewayProvider, 'deepseek-vl2-small')).toBe(true);

    // 2. 第三方 deepseek-flash 指派给 Vision 档后权威生效
    setRoleBinding('vision', {
      role: 'vision',
      providerId: customGatewayProvider.id,
      modelId: 'deepseek-flash'
    });
    expect(supportsVision(customGatewayProvider, 'deepseek-flash')).toBe(true);
  });

  test('CHK-F-03: 官方 DeepSeek 纯文本模型继续保持纯文本判断 (返回 false)', () => {
    // 确保未指派给 Vision 档时，官方纯文本模型不产生伪视觉能力
    expect(supportsVision(officialDeepseekProvider, 'deepseek-chat')).toBe(false);
    expect(supportsVision(officialDeepseekProvider, 'deepseek-reasoner')).toBe(false);
    expect(supportsVision(officialDeepseekProvider, 'deepseek-v3')).toBe(false);
    expect(supportsVision(officialDeepseekProvider, 'deepseek-r1')).toBe(false);
  });

  test('CHK-F-04: setRoleBinding 为 vision 角色自动写入 mediaInput: native-part', () => {
    const { setRoleBinding } = useAIConfigStore.getState();

    setRoleBinding('vision', {
      role: 'vision',
      providerId: aliyunProvider.id,
      modelId: 'qwen3.8-flash'
    });

    const updatedProvider = useAIConfigStore.getState().providers.find((p) => p.id === aliyunProvider.id);
    expect(updatedProvider).toBeDefined();
    expect(updatedProvider?.modelCapabilities?.['qwen3.8-flash']?.mediaInput).toBe('native-part');
  });

  test('CHK-F-05: 存量配置即使脱离 store 上下文，凭借写入的 modelCapabilities 依然判定支持视觉', () => {
    // 模拟脱离 store 上下文的独立 provider 对象（带有有效 mediaInput: native-part）
    const standaloneBase: AIProviderConfig = {
      ...aliyunProvider,
      id: 'prov-isolated-test'
    };
    const standaloneProvider: AIProviderConfig = {
      ...standaloneBase,
      modelCapabilities: {
        'qwen3.8-flash': {
          version: 1,
          revision: 'rev-test',
          source: 'user',
          endpointIdentity: endpointIdentity(standaloneBase),
          mediaInput: 'native-part'
        }
      }
    };

    // 此时 store 的 bindings.vision 并不是 standaloneProvider
    expect(supportsVision(standaloneProvider, 'qwen3.8-flash')).toBe(true);

    // 显式配置为不支持视觉时权威生效
    const unsupportedProvider: AIProviderConfig = {
      ...standaloneBase,
      modelCapabilities: {
        'qwen3.8-flash': {
          version: 1,
          revision: 'rev-test',
          source: 'user',
          endpointIdentity: endpointIdentity(standaloneBase),
          mediaInput: 'unsupported'
        }
      }
    };
    expect(supportsVision(unsupportedProvider, 'qwen3.8-flash')).toBe(false);
  });

  test('CHK-F-06: 在 pageTaskPlan 中，附带图片且使用已指派的 qwen3.8-flash Vision 档时不再被拦截', async () => {
    // 1. 将 qwen3.8-flash 绑定为 Vision 档
    useAIConfigStore.getState().setRoleBinding('vision', {
      role: 'vision',
      providerId: aliyunProvider.id,
      modelId: 'qwen3.8-flash'
    });

    const attachment = {
      name: '官网截图.png',
      dataUrl: 'data:image/png;base64,YQ==',
      region: { sourceFingerprint: 'abcdef01', sourceWidth: 100, sourceHeight: 100, x: 0, y: 0, width: 50, height: 50 }
    };
    const contract = buildDesignTaskContract({
      intent: 'create_screen',
      request: '根据官网截图新建高端页面',
      deviceProfile: 'mobile',
      frameWidth: 390,
      referenceImage: referenceImageIdentity(attachment)
    });

    const transport = new MockTransport();
    const imageId = `image:${referenceImageIdentity(attachment).fingerprint}`;
    const plan = {
      ...chatPageTaskPlan,
      features: chatPageTaskPlan.features.map((f) => ({ ...f, basis: 'image' as const, sourceIds: [imageId] }))
    };
    transport.queueResponse(JSON.stringify(plan));

    const core = new DefaultAIEngineCore({
      id: 'capture',
      stream: (req, evt) => transport.stream(req, evt)
    });

    const budget = new TaskBudget({
      maxRequests: 1,
      maxRequestedOutputTokens: 3072,
      maxDurationMs: 900000,
      maxRequestDurationMs: 900000
    });

    try {
      // 传入 qwen3.8-flash 模型与 aliyunProvider，断言其不抛出“业务规划需要可用的视觉模型”错误并成功产出业务规划
      const prepared = await preparePageTaskPlan(core, {
        contract,
        provider: aliyunProvider,
        model: 'qwen3.8-flash',
        budget,
        attachment,
        isCurrent: () => true
      });

      expect(prepared).toBeDefined();
      expect(prepared.plan.goal).toBeDefined();
      expect(prepared.plan.features.length).toBeGreaterThan(0);
    } finally {
      budget.close();
    }
  });
});
