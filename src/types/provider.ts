export type ErrorKind =
  | 'auth_failed'
  | 'payment_required'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'invalid_response';

export type StreamEvent =
  | { type: 'RequestStarted'; requestId:string; attemptId:string; eventProtocol:'typed'; at:number }
  | {type:'TransportAttempt';attemptId:string;at:number}
  | { type: 'Connected'; at:number; http_status?:number }
  | { type: 'TransportClosed'; at:number }
  | { type: 'ReasoningDelta'; text:string }
  | { type: 'Delta'; text: string }
  | { type: 'Usage'; input_tokens: number; output_tokens: number; source?:'provider'|'estimated'|'unknown'; reasoning_tokens?:number }
  | { type: 'Done'; finish_reason: string }
  | { type: 'Error'; kind: ErrorKind; message: string; http_status?: number; retry_after_ms?:number };

export type ModelRole = 'code' | 'chat' | 'vision' | 'image';

export type ProviderProtocol = 'openai_compatible' | 'anthropic' | 'gemini' | 'ollama_native';

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  isEnabled: boolean;
  defaultModel?: string;
  customModels?: string[];
  modelCapabilities?:Record<string,import('../services/ai/modelCapabilities').ModelCapabilityProfile>;
  /** Runtime per-role output limits; no change to the provider capability itself. */
  requestOutputCaps?:Record<string,number>;
  suggestedModels?: string[];
  isCustom?: boolean;
  allowPrivateNetwork?: boolean;
  allowedInternalHosts?: string[];
}

export interface ModelRoleBinding {
  role: ModelRole;
  providerId: string;
  modelId: string;
  maxOutputTokens?: number;
}

export interface ThirdPartyPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  description: string;
}
