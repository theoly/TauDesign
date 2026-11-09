import { AIProviderConfig } from '../../../../types/provider';

export interface EngineMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  /** Official native assistant prefix completion only. */
  partial?: true;
}

export interface TransportReceipt {version:1;requestId?:string;taskId?:string;stepId?:string;attemptIds:string[];connected:boolean;closed:boolean;httpStatus?:number;finishReason?:string;errorKind?:string;capacity?:import('../../modelCapacity').CapacityReceipt;usage?:TokenUsage}

export interface StreamTextOptions {
  provider: AIProviderConfig;
  model: string;
  messages: EngineMessage[];
  provenance?:{taskId:string;stepId:string};
  onTransportEvidence?:(receipt:TransportReceipt)=>void;
  onCapacity?:(capacity:import('../../modelCapacity').CapacityReceipt)=>void;
  /** Metadata callback for structured calls whose return value contains only the parsed JSON. */
  onUsage?:(usage:TokenUsage|undefined)=>void;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Task-scoped and serialized only for an explicitly supported model/endpoint. */
  enableThinking?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  source?: 'provider' | 'estimated' | 'unknown';
  reasoningTokens?:number;
}

export interface StreamTextResult {
  /** 纯文本内容流 (过滤掉思考过程标签) */
  textStream: AsyncIterable<string>;
  /** 深度思考推理流 (针对 DeepSeek R1 / Qwen Thinking) */
  reasoningStream: AsyncIterable<string>;
  /** 完整最终纯文本结果 */
  textPromise: Promise<string>;
  /** 完整最终思考内容结果 */
  reasoningPromise: Promise<string | undefined>;
  /** 真实 Token 消耗统计 (C-2 协议回传) */
  usagePromise: Promise<TokenUsage | undefined>;
  /** 连接异常后从完整 artifact 恢复时的原始错误；正常完成时为空 */
  recoveryPromise?: Promise<string | undefined>;
  /** Provider的真实结束原因，保留length等输出上限信息。 */
  finishReasonPromise?: Promise<string | undefined>;
  transportEvidencePromise?:Promise<TransportReceipt>;
  abort: () => void;
}

export interface AIEngineCore {
  streamText(options: StreamTextOptions): StreamTextResult;
  generateObject<T>(schema: Record<string, unknown>, options: Omit<StreamTextOptions, 'jsonSchema'>): Promise<T>;
}
