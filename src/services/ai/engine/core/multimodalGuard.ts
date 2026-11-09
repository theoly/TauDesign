import {resolveModelCapability} from '../../modelCapabilities';
import { AIProviderConfig } from '../../../../types/provider';
import { useAIConfigStore } from '../../../../stores/useAIConfigStore';

/**
 * 校验指定 Provider 与模型是否具备多模态识图能力 (Vision / Multimodal)
 *
 * 业务判定规则 (BR-VR-01 & BR-VMD-01):
 * 0. 优先信任用户的显式设置：凡被用户指派为活跃 Vision 档位的模型或通过 ModelCapabilityProfile 设置了 native-part/url 的模型均视为支持视觉；
 * 1. Google Gemini 协议全系模型均原生支持多模态视觉 (Gemini 1.5 Flash/Pro, Gemini 2.0 Flash)；
 * 2. Anthropic Claude 3 / 3.5 / 3.7 协议全系模型原生支持视觉输入；
 * 3. 显式带有 vision, -vl, llava, omni, 4o, gemini, claude-3 关键字的模型均视为多模态模型；
 * 4. DeepSeek 官方 API (prov-deepseek) 以及显式标注为 deepseek-chat, deepseek-reasoner, deepseek-v3, deepseek-r1, deepseek-coder 的标准纯文本模型不支持多模态；
 * 5. OpenAI 官方 Provider 下的 gpt-4o, gpt-4-turbo, o1 视为多模态模型。
 */
export function supportsVision(provider?: AIProviderConfig | null, modelId?: string): boolean {
  if (!provider) return false;
  let profile: ReturnType<typeof resolveModelCapability> | undefined;
  try {
    profile=resolveModelCapability(provider,modelId||provider.defaultModel||'');
    if(profile?.mediaInput!==undefined)return profile.mediaInput!=='unsupported'&&profile.mediaInput!=='file-upload';
  }catch{
    // 过期或无效的能力配置不作为授权依据，继续由角色绑定与协议/关键字安全核验
  }

  const model = (modelId || provider.defaultModel || '').toLowerCase().trim();
  const provId = (provider.id || '').toLowerCase().trim();

  // 1. 纯文本黑名单拦截：DeepSeek 官方 API (prov-deepseek) 或显式标准纯文本模型 (deepseek-chat, deepseek-reasoner, deepseek-v3, deepseek-r1, deepseek-coder)
  // 即使误绑定到 Vision 档位，亦不能放行纯文本模型，防止误配置导致下游 400 崩溃
  const isDeepSeekPureText =
    provId === 'prov-deepseek' ||
    (model.includes('deepseek') &&
      (model.includes('chat') ||
       model.includes('reasoner') ||
       model.includes('v3') ||
       model.includes('r1') ||
       model.includes('coder')));

  if (isDeepSeekPureText && !model.includes('-vl') && !model.includes('vision')) {
    return false;
  }

  // 2. 优先信任用户的 Vision 档位明确指派 (BR-VMD-01)
  try {
    const visionBinding = useAIConfigStore.getState?.().bindings?.vision;
    const targetModel = (modelId || provider.defaultModel || '').trim().toLowerCase();
    if (
      visionBinding &&
      visionBinding.providerId === provider.id &&
      targetModel &&
      visionBinding.modelId.trim().toLowerCase() === targetModel
    ) {
      return true;
    }
  } catch {
    // 单元测试或无 store 纯函数环境下优雅降级
  }

  // 3. Gemini 原生协议全系支持 Vision
  if (provider.protocol === 'gemini') return true;

  // 4. Anthropic Claude 3 全系支持 Vision
  if (provider.protocol === 'anthropic') return true;

  // 5. 关键字显式包含视觉/多模态特征 (先于纯文本黑名单排查，如第三方 deepseek-vl 等模型)
  if (
    model.includes('vision') ||
    model.includes('-vl') ||
    model.includes('vl-') ||
    model.endsWith('-vl') ||
    model.includes('_vl') ||
    model.includes('llava') ||
    model.includes('omni') ||
    model.includes('4o') ||
    model.includes('gemini') ||
    model.includes('claude-3')
  ) {
    return true;
  }

  // 6. OpenAI 官方常见视觉模型
  if (
    provId === 'prov-openai' &&
    (model.startsWith('gpt-4') || model.startsWith('o1') || model.startsWith('chatgpt-4o'))
  ) {
    return true;
  }

  return false;
}

export type ModelCapability = 'vision' | 'reasoning' | 'code' | 'chat';

export interface DiscoveredModel {
  id: string;
  name?: string;
  capabilities: ModelCapability[];
}

/**
 * 推断指定模型的综合能力标签 (Vision / Reasoning / Code / Chat)
 */
export function detectModelCapabilities(
  provider?: AIProviderConfig | null,
  modelId?: string
): ModelCapability[] {
  const caps: ModelCapability[] = ['chat'];
  const model = (modelId || provider?.defaultModel || '').toLowerCase().trim();

  // 1. 视觉能力
  if (supportsVision(provider, modelId)) {
    caps.push('vision');
  }

  // 2. 深度思考推理能力
  if (
    model.includes('reasoner') ||
    model.includes('r1') ||
    model.includes('o1') ||
    model.includes('o3') ||
    model.includes('thinking') ||
    model.includes('thought')
  ) {
    caps.push('reasoning');
  }

  // 3. 代码特化能力
  if (
    model.includes('coder') ||
    model.includes('code') ||
    model.includes('starcoder') ||
    model.includes('dev')
  ) {
    caps.push('code');
  }

  return caps;
}
