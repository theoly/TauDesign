import {safeModelDiagnostic,httpFailure} from './transportFailure';
import { AIProviderConfig, ErrorKind, StreamEvent } from '../../types/provider';
import { createUsageTracker } from './usageTracker';
import { isTauri } from '@tauri-apps/api/core';
import { streamNativeProxy } from './nativeProxy';
import { encodeModelRequest } from './modelRequestCodec';
import { ModelDiscoveryService } from './modelDiscoveryService';
import { DiscoveredModel } from './engine/core/multimodalGuard';
import {structuredMessages} from './structuredRequestPolicy';
import {ProviderStreamParser,legacyReasoningAdapter} from './providerStreamParser';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  partial?: true;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  enableThinking?: boolean;
  idleTimeoutMs?:number;
  jsonSchema?: Record<string,unknown>;
  /** Legacy callers retain the text adapter; the core receives typed reasoning events. */
  eventProtocol?: 'typed';
}

export class AIService {
  public static stream(
    provider: AIProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    onEvent: (ev: StreamEvent) => void,
    timeoutMs = 900000,
    generationOptions: GenerationOptions = {}
  ): { abort: () => void; promise: Promise<void> } {
    messages=structuredMessages(messages,generationOptions.jsonSchema);
    const controller = new AbortController();
    let isAborted = false;

    // 1. 全局最大总时限（兜底保护，默认 15 分钟；正常流仍受空闲心跳保护）
    const maxTimeoutMs = timeoutMs;
    // 2. 流式活跃心跳窗口（默认 90s：每次收到有效数据分片自动刷新；若连续 90s 无任何新分片则判定挂死）
    const idleTimeout=generationOptions.idleTimeoutMs??90000;
    if(!Number.isSafeInteger(idleTimeout)||idleTimeout<10||idleTimeout>180000)throw Error('无活动超时配置无效。');
    const inactivityTimeoutMs = Math.min(timeoutMs, idleTimeout);

    let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearAllTimers = () => {
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
        maxTimeoutId = null;
      }
      if (inactivityTimeoutId) {
        clearTimeout(inactivityTimeoutId);
        inactivityTimeoutId = null;
      }
    };

    const triggerTimeout = (reason: string) => {
      clearAllTimers();
      if (isAborted) return;
      controller.abort();
      emitEvent({
        type: 'Error',
        kind: 'timeout',
        message: reason
      });
    };

    maxTimeoutId = setTimeout(() => {
      triggerTimeout(`请求超时: 超过最大允许时限 (${Math.round(maxTimeoutMs / 1000)}s)`);
    }, maxTimeoutMs);

    const refreshInactivityTimer = () => {
      if (inactivityTimeoutId) clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = setTimeout(() => {
        triggerTimeout(`数据流传输超时: 超过 ${Math.round(inactivityTimeoutMs / 1000)}s 未收到任何新分片`);
      }, inactivityTimeoutMs);
    };

    // 初始化等待首包定时器
    refreshInactivityTimer();
    const inputCharsEstimated = messages.reduce((acc, m) => acc + m.content.length + (m.imageUrl ? 1000 : 0), 0);
    const usageTracker = createUsageTracker(provider, modelId, inputCharsEstimated);
    let streamFailed = false;
    const deliver=generationOptions.eventProtocol==='typed'?onEvent:legacyReasoningAdapter(onEvent);
    const emitEvent = (event: StreamEvent) => {
      if (event.type === 'Error'){streamFailed=true;event={...event,message:safeModelDiagnostic(event.message,provider.apiKey)};}
      usageTracker.onEvent(event);
      deliver(event);
    };
    const processor = new ProviderStreamParser(provider, emitEvent,Boolean(generationOptions.jsonSchema));
    const requestId=crypto.randomUUID();
    emitEvent({type:'RequestStarted',requestId,attemptId:requestId+'-prepare',eventProtocol:'typed',at:Date.now()});

    let url = '';

    const promise = (async () => {
      try {
        const encoded = encodeModelRequest({provider,model:modelId,messages,...generationOptions}).transportRequest;
        url = encoded.url;
        const headers = encoded.headers ?? {};
        const bodyJson = encoded.body;

        // Strategy 1: If running inside Tauri desktop app, use native Rust proxy to completely bypass CORS
        if (isTauri()) {
          try {
            await streamNativeProxy({
              url,
              method: 'POST',
              headers,
              body: JSON.stringify(bodyJson),
              allow_private_network: false,
            }, (payload) => {
              if (isAborted) return;
              if (payload.type === 'Chunk' && payload.data) {
                refreshInactivityTimer();
                processor.feed(payload.data);
              } else if(payload.type==='Attempt'){
                emitEvent({type:'TransportAttempt',attemptId:requestId+'-'+payload.data,at:Date.now()});
              } else if(payload.type==='Connected'){
                emitEvent({type:'Connected',at:Date.now(),http_status:payload.data});
              } else if(payload.type==='HttpError'){
                clearAllTimers();processor.finish();emitEvent(httpFailure(payload.data.status,payload.data.message,payload.data.retry_after_ms));
              } else if (payload.type === 'Error') {
                clearAllTimers();
                processor.finish();
                emitEvent({
                  type: 'Error',
                  kind: 'network_error',
                  message: payload.data || '网络请求异常'
                });
              } else if (payload.type === 'Done') {
                clearAllTimers();
                processor.finish();
                emitEvent({ type: 'TransportClosed', at:Date.now() });
              }
            }, controller.signal);
            return;
          } catch (tauriErr) {
            if (!isAborted && !streamFailed) {
              emitEvent({ type: 'Error', kind: 'network_error', message: `原生代理中断: ${String(tauriErr)}` });
            }
            return;
          }
        }

        // Strategy 2: Web / Browser environment with Vite dev proxy support
        let fetchUrl = url;
        const forwardHeaders: Record<string, string> = { ...headers };

        // In web dev mode on localhost, route through Vite proxy to eliminate CORS
        if (
          typeof window !== 'undefined' &&
          (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
        ) {
          fetchUrl = '/api/ai-proxy';
          forwardHeaders['x-target-url'] = url;
        }

        emitEvent({type:'TransportAttempt',attemptId:requestId+'-1',at:Date.now()});
        const resp = await fetch(fetchUrl, {
          method: 'POST',
          headers: forwardHeaders,
          body: JSON.stringify(bodyJson),
          signal: controller.signal
        });

        refreshInactivityTimer();
        emitEvent({type:'Connected',at:Date.now(),http_status:resp.status});

        if (!resp.ok) {
          clearAllTimers();
          const status = resp.status;
          const text = await resp.text().catch(() => '');
          let parsedMessage = text || resp.statusText;
          try {
            const errJson = JSON.parse(text);
            if (errJson.error?.message) {
              parsedMessage = errJson.error.message;
            } else if (errJson.message) {
              parsedMessage = errJson.message;
            }
          } catch {
            // Keep original text
          }

          const retrySeconds=Number(resp.headers.get('retry-after'));
          emitEvent(httpFailure(status,parsedMessage,Number.isFinite(retrySeconds)&&retrySeconds>=0?retrySeconds*1000:undefined));
          return;
        }

        if (!resp.body) {
          clearAllTimers();
          emitEvent({ type: 'Error', kind: 'invalid_response', message: '响应体为空' });
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            clearAllTimers();
            processor.feed(decoder.decode());
            processor.finish();
            emitEvent({type:'TransportClosed',at:Date.now()});
            break;
          }
          refreshInactivityTimer();
          const chunkText = decoder.decode(value, { stream: true });
          processor.feed(chunkText);
        }
      } catch (err: unknown) {
        clearAllTimers();
        if (isAborted) return;
        const e = err as Error;
        if (e.name === 'AbortError') return;

        let msg = e.message || '网络连接异常';
        if (e.name === 'TypeError' && (e.message.includes('Load failed') || e.message.includes('Failed to fetch'))) {
          msg = `跨域网络限制 (CORS): ${e.message}。由于该服务提供商 (${url}) 未在服务端开放浏览器跨域头，请在客户端桌面端运行或通过代理访问。`;
        }

        processor.finish();
        emitEvent({
          type: 'Error',
          kind: 'network_error',
          message: msg
        });
      } finally {
        clearAllTimers();
        usageTracker.settle(isAborted ? 'aborted' : streamFailed ? 'error' : 'completed');
      }
    })();

    return {
      abort: () => {
        isAborted = true;
        clearAllTimers();
        controller.abort();
        usageTracker.settle('aborted');
      },
      promise
    };
  }

  /**
   * Performs quick connectivity test with the given modelId
   */
  public static async testConnection(
    provider: AIProviderConfig,
    modelId: string
  ): Promise<{ success: boolean; message: string }> {
    const trimmedModel = (modelId || '').trim();
    if (!trimmedModel) {
      return { success: false, message: '请先填写模型 ID (Model ID)' };
    }
    if (!(provider.baseUrl || '').trim()) {
      return { success: false, message: '请先填写 API Base URL' };
    }
    if (!(provider.apiKey || '').trim() && provider.protocol !== 'ollama_native') {
      return { success: false, message: '请先填写 API Key 凭证' };
    }

    try {
      let receivedAny = false;
      let errorMsg = '';
      const { promise } = this.stream(
        provider,
        trimmedModel,
        [{ role: 'user', content: 'hello' }],
        (ev) => {
          if (ev.type === 'Delta' || ev.type === 'Done') receivedAny = true;
          if (ev.type === 'Error') errorMsg = ev.message;
        },
        12000
      );
      await promise;
      if (errorMsg) return { success: false, message: errorMsg };
      if (receivedAny) return { success: true, message: '连通性测试成功' };
      return { success: false, message: '未收到有效响应' };
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' };
    }
  }

  /**
   * 连通性测试并联动探测 Provider 可用模型与能力标签 (BR-MD-01 ~ BR-MD-03)
   */
  public static async testConnectionAndDiscoverModels(
    provider: AIProviderConfig,
    modelId: string
  ): Promise<{
    success: boolean;
    message: string;
    discoveredModels: DiscoveredModel[];
    visionCount: number;
  }> {
    // 1. 先执行连通性测试
    const connTest = await this.testConnection(provider, modelId);
    if (!connTest.success) {
      return {
        success: false,
        message: connTest.message,
        discoveredModels: [],
        visionCount: 0
      };
    }

    // 2. 连通成功后，并发探测远端模型列表与能力标签
    try {
      const discovery = await ModelDiscoveryService.discoverModels(provider);
      const visionCount = discovery.models.filter((m) => m.capabilities.includes('vision')).length;
      const countMsg = discovery.models.length > 0
        ? ` (已自动探测到 ${discovery.models.length} 个可用模型，含 ${visionCount} 个多模态视觉模型)`
        : '';

      return {
        success: true,
        message: `连通性测试成功${countMsg}`,
        discoveredModels: discovery.models,
        visionCount
      };
    } catch {
      return {
        success: true,
        message: '连通性测试成功',
        discoveredModels: [],
        visionCount: 0
      };
    }
  }
}
