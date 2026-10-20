import type { GenerationOptions } from '../../aiService';
import { StreamEvent, ErrorKind } from '../../../../types/provider';

export type { StreamEvent, ErrorKind };

export interface TransportRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  provider?: any;
  model?: string;
  messages?: any[];
  generationOptions?: GenerationOptions;
  allowPrivateNetwork?: boolean;
  allowedInternalHosts?: string[];
}

export interface AITransport {
  readonly id: string;
  /**
   * 发起流式网络请求，将分片规范化为标准 StreamEvent 事件
   */
  stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> };
}
