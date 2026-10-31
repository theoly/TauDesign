import { create } from 'zustand';
import { AIProviderConfig, ModelRole, ModelRoleBinding, ThirdPartyPreset } from '../types/provider';

export const THIRD_PARTY_PRESETS: ThirdPartyPreset[] = [
  {
    id: 'openai_custom',
    name: '第三方 OpenAI 兼容',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'deepseek-chat', 'deepseek-flash'],
    description: '兼容标准 OpenAI /chat/completions 规范（如各类反向代理、OneAPI、NewAPI 等）'
  },
  {
    id: 'claude_custom',
    name: '第三方 Claude 兼容',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-20241022',
    suggestedModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-7-sonnet-20250219'],
    description: '兼容 Anthropic /v1/messages 规范的第三方 Claude 代理网关'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    suggestedModels: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    description: '国内高性价比大模型托管平台，兼容 OpenAI 规范'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter 网关',
    protocol: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    suggestedModels: ['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat', 'openai/gpt-4o'],
    description: '全球多模型聚合中转服务，统一采用 OpenAI 接口标准'
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Moonshot Kimi)',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    suggestedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    description: '月之暗面长文本大模型，兼容 OpenAI 规范'
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    protocol: 'openai_compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    suggestedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'],
    description: '智谱 GLM 开放平台，兼容 OpenAI 规范'
  },
  {
    id: 'aliyun_token_plan',
    name: '阿里百炼 Token Plan (Aliyun)',
    protocol: 'openai_compatible',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'deepseek-v3',
    suggestedModels: ['deepseek-v3', 'deepseek-r1', 'qwen-plus', 'qwen-turbo', 'qwen-max'],
    description: '阿里云百炼大模型 Token 计费计划，标准 OpenAI /chat/completions 规范'
  },
  {
    id: 'aliyun_dashscope',
    name: '阿里云百炼 DashScope 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    suggestedModels: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'deepseek-v3', 'deepseek-r1'],
    description: '阿里云百炼 DashScope 大模型开放平台，兼容 OpenAI 规范'
  }
];

interface AIConfigState {
  autoReferenceDesignRules:boolean;
  setAutoReferenceDesignRules:(enabled:boolean)=>void;
  providers: AIProviderConfig[];
  bindings: Record<ModelRole, ModelRoleBinding>;
  
  addProvider: (provider: AIProviderConfig) => void;
  updateProvider: (id: string, updates: Partial<AIProviderConfig>) => void;
  deleteProvider: (id: string) => void;
  
  setRoleBinding: (role: ModelRole, binding: ModelRoleBinding) => void;
  getActiveProviderForRole: (role: ModelRole) => { provider: AIProviderConfig; modelId: string } | null;
}

const STORAGE_KEY = 'ai_designer_providers_v1';

export const defaultProviders: AIProviderConfig[] = [
  {
    id: 'prov-openai',
    name: 'OpenAI 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'gpt-4o'
  },
  {
    id: 'prov-deepseek',
    name: 'DeepSeek 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'deepseek-chat'
  },
  {
    id: 'prov-gemini',
    name: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'gemini-2.0-flash'
  },
  {
    id: 'prov-anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'claude-3-5-sonnet-20241022'
  },
  {
    id: 'prov-ollama',
    name: '本地 Ollama',
    protocol: 'ollama_native',
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'qwen2.5-coder'
  }
];

export const defaultBindings: Record<ModelRole, ModelRoleBinding> = {
  code: { role: 'code', providerId: 'prov-deepseek', modelId: 'deepseek-chat' },
  chat: { role: 'chat', providerId: 'prov-deepseek', modelId: 'deepseek-chat' },
  vision: { role: 'vision', providerId: 'prov-gemini', modelId: 'gemini-2.0-flash' },
  image: { role: 'image', providerId: 'prov-openai', modelId: 'dall-e-3' }
};

export function sanitizeModelId(model?: string): string {
  if (!model) return '';
  const trimmed = model.trim();
  if (trimmed === 'gemini-2.5-flash' || trimmed === 'models/gemini-2.5-flash') {
    return 'gemini-2.0-flash';
  }
  return trimmed;
}

function resolveDefaultModel(provider: AIProviderConfig): string {
  let model = provider.defaultModel;
  if (!model) {
    const builtin = defaultProviders.find((d) => d.id === provider.id);
    if (builtin?.defaultModel) model = builtin.defaultModel;
    else if (provider.protocol === 'anthropic') model = 'claude-3-5-sonnet-20241022';
    else if (provider.protocol === 'gemini') model = 'gemini-2.0-flash';
    else if (provider.protocol === 'ollama_native') model = 'qwen2.5-coder';
    else model = 'deepseek-chat';
  }
  return sanitizeModelId(model);
}

function loadStoredConfig(): { providers: AIProviderConfig[]; bindings: Record<ModelRole, ModelRoleBinding>;autoReferenceDesignRules:boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawProviders: AIProviderConfig[] = parsed.providers || defaultProviders;
      const providers = rawProviders.map((p) => ({
        ...p,
        defaultModel: sanitizeModelId(resolveDefaultModel(p))
      }));
      const rawBindings = parsed.bindings || defaultBindings;
      const bindings = { ...defaultBindings, ...rawBindings };
      (Object.keys(bindings) as ModelRole[]).forEach((role) => {
        if (bindings[role]) {
          bindings[role] = {
            ...bindings[role],
            modelId: sanitizeModelId(bindings[role].modelId) || defaultBindings[role].modelId
          };
        }
      });
      return {
        providers,
        bindings,autoReferenceDesignRules:parsed.autoReferenceDesignRules===true
      };
    }
  } catch (e) {
    // ignore
  }
  return { providers: defaultProviders, bindings: defaultBindings,autoReferenceDesignRules:false };
}

function saveConfig(providers: AIProviderConfig[], bindings: Record<ModelRole, ModelRoleBinding>,autoReferenceDesignRules:boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ providers, bindings,autoReferenceDesignRules }));
  } catch (e) {
    // ignore
  }
}

const initial = loadStoredConfig();

export const useAIConfigStore = create<AIConfigState>((set, get) => ({
  autoReferenceDesignRules:initial.autoReferenceDesignRules,
  setAutoReferenceDesignRules:enabled=>set(state=>{const value=enabled===true;saveConfig(state.providers,state.bindings,value);return {autoReferenceDesignRules:value};}),
  providers: initial.providers,
  bindings: initial.bindings,

  addProvider: (provider) => {
    set((state) => {
      const providerWithModel: AIProviderConfig = {
        ...provider,
        defaultModel: resolveDefaultModel(provider)
      };
      const providers = [...state.providers, providerWithModel];
      saveConfig(providers, state.bindings,state.autoReferenceDesignRules);
      return { providers };
    });
  },

  updateProvider: (id, updates) => {
    set((state) => {
      const providers = state.providers.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, ...updates };
        if (!updated.defaultModel) {
          updated.defaultModel = resolveDefaultModel(updated);
        }
        return updated;
      });
      saveConfig(providers, state.bindings,state.autoReferenceDesignRules);
      return { providers };
    });
  },

  deleteProvider: (id) => {
    set((state) => {
      const providers = state.providers.filter((p) => p.id !== id);
      const bindings = { ...state.bindings };
      const fallbackProvider = providers[0];
      if (fallbackProvider) {
        (Object.keys(bindings) as ModelRole[]).forEach((role) => {
          if (bindings[role]?.providerId === id) {
            bindings[role] = {
              ...bindings[role],
              providerId: fallbackProvider.id,
              modelId: fallbackProvider.defaultModel || resolveDefaultModel(fallbackProvider)
            };
          }
        });
      }
      saveConfig(providers, bindings,state.autoReferenceDesignRules);
      return { providers, bindings };
    });
  },

  setRoleBinding: (role, binding) => {
    set((state) => {
      const bindings = { ...state.bindings, [role]: binding };
      saveConfig(state.providers, bindings,state.autoReferenceDesignRules);
      return { bindings };
    });
  },

  getActiveProviderForRole: (role) => {
    const { providers, bindings } = get();
    const binding = bindings[role];
    if (!binding) return null;
    const provider = providers.find((p) => p.id === binding.providerId && p.isEnabled);
    if (!provider) return null;
    return { provider, modelId: sanitizeModelId(binding.modelId) };
  }
}));
