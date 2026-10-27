import type {AIProviderConfig} from '../../types/provider';

// Verified hybrid models only. Some dated snapshots (e.g. 3.7-max-2026-05-17)
// are thinking-only even though the undated model supports this option.
const hybridModels=new Set([
 'qwen3.8-max','qwen3.8-flash',
 'qwen3.7-max','qwen3.7-max-2026-05-20','qwen3.7-max-2026-06-08',
 'qwen3.7-plus','qwen3.7-plus-2026-05-26','qwen3.7-flash','qwen3.7-flash-2026-07-15',
 'qwen3.6-plus','qwen3.6-plus-2026-04-02','qwen3.6-flash','qwen3.6-flash-2026-04-16',
 'qwen3.5-plus','qwen3.5-plus-2026-02-15','qwen3.5-flash','qwen3.5-flash-2026-02-23'
]);
/** Official hybrid Qwen endpoints only; never send vendor options to an arbitrary proxy/model. */
export function supportsThinkingToggle(provider:AIProviderConfig,model:string):boolean {
 if(provider.protocol!=='openai_compatible'||!hybridModels.has(model))return false;
 try{const u=new URL(provider.baseUrl);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
  (/^(?:dashscope(?:-intl|-us)?\.aliyuncs\.com|[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com)$/.test(u.hostname))&&/^\/(?:compatible-mode\/)?v1(?:\/chat\/completions)?\/?$/.test(u.pathname);}catch{return false;}
}
export function restyleThinkingOptions(provider:AIProviderConfig,model:string):{enableThinking?:boolean} {
 return supportsThinkingToggle(provider,model)?{enableThinking:false}:{};
}
