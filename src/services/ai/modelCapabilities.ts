import type {AIProviderConfig} from '../../types/provider';
export interface ModelCapabilityProfile {
  version:1;revision:string;endpointIdentity:string;source:'user'|'verified'|'metadata';
  contextWindow?:number;maxOutputTokens?:number;
  mediaInput?:'native-part'|'url'|'file-upload'|'unsupported';mediaUploadUrl?:string;
  /** Explicit gateway wire format; never inferred from a custom Provider ID. */
  thinkingControl?:'deepseek'|'qwen'|'unsupported';
  /** Explicit endpoint/model capacity; unknown endpoints remain serial. */
  maxConcurrency?:1|2;
  /** No provider supports resumable POST by inference. */
  resumableEvents?:false;
}
export function endpointIdentity(provider:Pick<AIProviderConfig,'protocol'|'baseUrl'>):string{
 const u=new URL(provider.baseUrl.trim());
 // Identity contains no query/credential text; a change in either still invalidates the digest.
 const text=JSON.stringify([provider.protocol,u.href.replace(/\/$/,'')]);let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return 'endpoint-'+(h>>>0).toString(16);
}
export function validModelCapability(value:unknown):value is ModelCapabilityProfile{
 const v=value as ModelCapabilityProfile|undefined;
 const cap=(n:unknown)=>n===undefined||typeof n==='number'&&Number.isSafeInteger(n)&&n>=256&&n<=10_000_000;
 return Boolean(v&&v.version===1&&typeof v.revision==='string'&&v.revision.length>0&&v.revision.length<100&&typeof v.endpointIdentity==='string'&&/^endpoint-[a-f0-9]+$/.test(v.endpointIdentity)&&['user','verified','metadata'].includes(v.source)&&cap(v.contextWindow)&&cap(v.maxOutputTokens)&&(!v.contextWindow||!v.maxOutputTokens||v.maxOutputTokens<v.contextWindow)&&
  (v.thinkingControl===undefined||['deepseek','qwen','unsupported'].includes(v.thinkingControl))&&
  (v.mediaInput===undefined||['native-part','url','file-upload','unsupported'].includes(v.mediaInput))&&(v.maxConcurrency===undefined||v.maxConcurrency===1||v.maxConcurrency===2)&&(v.resumableEvents===undefined||v.resumableEvents===false)&&
  (v.mediaUploadUrl===undefined||typeof v.mediaUploadUrl==='string'&&/^https:\/\//.test(v.mediaUploadUrl)));
}
export function inferKnownModelCapability(
  provider: Pick<AIProviderConfig, 'protocol' | 'baseUrl'>,
  model: string
): ModelCapabilityProfile | undefined {
  const m = model.toLowerCase().trim();
  // 剥离可能存在的路径或组织前缀 (如 models/gemini-2.0-flash, google/gemini-2.0-flash, deepseek-ai/deepseek-v3)
  const normalized = m.replace(/^models\//i, '').split('/').pop() || m;

  let contextWindow: number | undefined;
  let maxOutputTokens: number | undefined = 8192;
  let mediaInput: ModelCapabilityProfile['mediaInput'] = undefined;

  // Gemini 系列: 模型名称包含 gemini (gemini-1.5, gemini-2.0, gemini-2.5, gemini-3.8-flash, gemini-exp 等)
  if (/(?:^|\b)gemini/i.test(normalized) || /(?:^|\b)gemini/i.test(m)) {
    contextWindow = 1048576; // 1M 上下文
    maxOutputTokens = 8192;
    mediaInput = 'native-part';
  } else if (/(?:^|\b)claude/i.test(normalized)) {
    // Claude 系列
    contextWindow = 200000;
    maxOutputTokens = 8192;
    mediaInput = 'native-part';
  } else if (/^(?:gpt-4o|chatgpt-4o|gpt-4-turbo|gpt-4\.5)/i.test(normalized)) {
    // OpenAI GPT-4o / GPT-4.5 系列
    contextWindow = 128000;
    maxOutputTokens = 16384;
    mediaInput = 'native-part';
  } else if (/^(?:o1|o3)/i.test(normalized)) {
    // OpenAI o1 / o3 系列 (o1 支持视觉，o1-mini 与 o3-mini 为纯推理模型)
    contextWindow = 200000;
    maxOutputTokens = 32768;
    if (!normalized.includes('mini')) {
      mediaInput = 'native-part';
    }
  } else if (/^qwen/i.test(normalized)) {
    // Qwen 系列 (通义千问官方均支持 128k 乃至 1M)
    contextWindow = 131072;
    if (/vl|vision|flash/i.test(normalized)) {
      mediaInput = 'native-part';
    }
  } else if (/^deepseek/i.test(normalized)) {
    // DeepSeek 系列 (V3 / R1 官方支持 64k/128k，保守取 65536)
    contextWindow = 65536;
    if (/vl|janus/i.test(normalized)) {
      mediaInput = 'native-part';
    }
  } else if (/^glm/i.test(normalized)) {
    // 智谱 GLM 系列
    contextWindow = 131072;
  } else if (/^(?:moonshot|kimi)/i.test(normalized)) {
    // Moonshot / Kimi 系列
    contextWindow = 131072;
  } else if (/^doubao/i.test(normalized)) {
    // 豆包 Doubao 系列
    contextWindow = 131072;
  } else if (/^(?:abab|minimax)/i.test(normalized)) {
    // MiniMax 系列
    contextWindow = 245760;
  }

  if (!contextWindow) return undefined;

  let ep = '';
  try {
    ep = endpointIdentity(provider);
  } catch {
    return undefined;
  }

  return {
    version: 1,
    revision: 'metadata-default',
    endpointIdentity: ep,
    source: 'metadata',
    contextWindow,
    maxOutputTokens,
    mediaInput,
    maxConcurrency: 1,
    resumableEvents: false
  };
}

export function resolveModelCapability(provider:AIProviderConfig,model:string):ModelCapabilityProfile|undefined{
 const value=provider.modelCapabilities?.[model];
 const inferred=inferKnownModelCapability(provider,model);
 if(value!==undefined){
   if(!validModelCapability(value)||value.endpointIdentity!==endpointIdentity(provider))throw Error('模型能力配置已过期或无效，请核对端点和容量设置。');
   return {
     ...(inferred||{}),
     ...value,
     contextWindow: value.contextWindow ?? inferred?.contextWindow,
     maxOutputTokens: value.maxOutputTokens ?? inferred?.maxOutputTokens,
     mediaInput: value.mediaInput ?? inferred?.mediaInput
   };
 }
 return inferred;
}
export function requestOutputCap(provider:AIProviderConfig,model:string,requested:number):number{
 if(!Number.isSafeInteger(requested)||requested<1)throw Error('请求输出上限无效。');
 const profile=resolveModelCapability(provider,model),roleCap=provider.requestOutputCaps?.[model];
 if(roleCap!==undefined&&(!Number.isSafeInteger(roleCap)||roleCap<1||roleCap>32768))throw Error('角色输出上限无效。');
 return Math.min(requested,profile?.maxOutputTokens??requested,roleCap??requested);
}
