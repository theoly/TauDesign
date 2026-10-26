import { AIProviderConfig, ErrorKind, StreamEvent } from '../../types/provider';
import { createUsageTracker } from './usageTracker';
import { isTauri } from '@tauri-apps/api/core';
import { streamNativeProxy } from './nativeProxy';
import { supportsNativeContinuation } from './boundedContinuation';
import { ModelDiscoveryService } from './modelDiscoveryService';
import { DiscoveredModel } from './engine/core/multimodalGuard';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  partial?: true;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
}

class StreamChunkProcessor {
  private buffer = '';
  private currentEvent = 'message';
  private lastInputTokens: number | undefined;
  private lastOutputTokens: number | undefined;
  private isInsideThinkTag = false;

  constructor(
    private provider: AIProviderConfig,
    private onEvent: (ev: StreamEvent) => void
  ) {}

  public processChunk(chunk: string) {
    this.buffer += chunk;

    if (this.provider.protocol === 'ollama_native') {
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            this.onEvent({ type: 'Delta', text: parsed.message.content });
          }
          if (parsed.done && typeof parsed.prompt_eval_count === 'number' && typeof parsed.eval_count === 'number') {
            this.onEvent({ type: 'Usage', input_tokens: parsed.prompt_eval_count, output_tokens: parsed.eval_count });
          }
          if (parsed.done) {
            this.onEvent({ type: 'Done', finish_reason: parsed.done_reason || 'stop' });
          }
        } catch (e) {
          /* partial */
        }
      }
    } else {
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('event:')) {
          this.currentEvent = trimmed.slice(6).trim();
          continue;
        }

        let dataStr = '';
        if (trimmed.startsWith('data:')) {
          dataStr = trimmed.slice(5).trim();
        } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          // Non-SSE standard JSON chunk fallback
          dataStr = trimmed;
        } else {
          continue;
        }

        if (dataStr === '[DONE]') {
          if (this.isInsideThinkTag) {
            this.isInsideThinkTag = false;
            this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
          }
          this.onEvent({ type: 'Done', finish_reason: 'stop' });
          continue;
        }

        try {
          const data = JSON.parse(dataStr);

          // Handle error object in stream event
          if (data.error || this.currentEvent === 'error' || data.type === 'error') {
            const errorText = data.error?.message || data.message || JSON.stringify(data);
            this.onEvent({
              type: 'Error',
              kind: 'invalid_response',
              message: `API 错误: ${errorText}`
            });
            return;
          }

          if (this.provider.protocol === 'openai_compatible') {
            const reasoningDelta =
              data.choices?.[0]?.delta?.reasoning_content ??
              data.choices?.[0]?.delta?.reasoning;

            if (reasoningDelta) {
              if (!this.isInsideThinkTag) {
                this.isInsideThinkTag = true;
                this.onEvent({ type: 'Delta', text: '<think>\n' + reasoningDelta });
              } else {
                this.onEvent({ type: 'Delta', text: reasoningDelta });
              }
            }

            const delta =
              data.choices?.[0]?.delta?.content ??
              data.choices?.[0]?.text ??
              data.choices?.[0]?.message?.content;
            if (delta) {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' + delta });
              } else {
                this.onEvent({ type: 'Delta', text: delta });
              }
            }
            if (data.usage && typeof data.usage.prompt_tokens === 'number' && typeof data.usage.completion_tokens === 'number') {
              this.onEvent({ type: 'Usage', input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens });
            }
            if (data.choices?.[0]?.finish_reason) {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
              }
              this.onEvent({ type: 'Done', finish_reason: data.choices[0].finish_reason });
            }
          } else if (this.provider.protocol === 'anthropic') {
            if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
              const thinking = data.delta.thinking;
              if (thinking) {
                if (!this.isInsideThinkTag) {
                  this.isInsideThinkTag = true;
                  this.onEvent({ type: 'Delta', text: '<think>\n' + thinking });
                } else {
                  this.onEvent({ type: 'Delta', text: thinking });
                }
              }
            }
            const textDelta =
              data.delta?.text ??
              (data.type === 'content_block_delta' ? data.delta?.text : null) ??
              data.content?.[0]?.text;
            if (textDelta) {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' + textDelta });
              } else {
                this.onEvent({ type: 'Delta', text: textDelta });
              }
            }
            const usage = data.usage ?? data.message?.usage;
            if (usage) {
              if (typeof usage.input_tokens === 'number') this.lastInputTokens = usage.input_tokens;
              if (typeof usage.output_tokens === 'number') this.lastOutputTokens = usage.output_tokens;
              if (this.lastInputTokens !== undefined && this.lastOutputTokens !== undefined) {
                this.onEvent({ type: 'Usage', input_tokens: this.lastInputTokens, output_tokens: this.lastOutputTokens });
              }
            }
            const stopReason = data.delta?.stop_reason ?? data.stop_reason;
            if (stopReason || this.currentEvent === 'message_stop' || data.type === 'message_stop') {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
              }
              this.onEvent({ type: 'Done', finish_reason: stopReason || 'stop' });
            }
          } else if (this.provider.protocol === 'gemini') {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              this.onEvent({ type: 'Delta', text });
            }
            if (data.candidates?.[0]?.finishReason) {
              this.onEvent({ type: 'Done', finish_reason: data.candidates[0].finishReason });
            }
            const metadata = data.usageMetadata;
            if (typeof metadata?.promptTokenCount === 'number' && typeof metadata?.candidatesTokenCount === 'number') {
              this.onEvent({ type: 'Usage', input_tokens: metadata.promptTokenCount, output_tokens: metadata.candidatesTokenCount });
            }
          }
        } catch (e) {
          /* partial chunk parse error */
        }
      }
    }
  }

  public finish() {
    if (this.buffer) this.processChunk('\n');
    if (this.isInsideThinkTag) {
      this.isInsideThinkTag = false;
      this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
    }
  }
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
    const controller = new AbortController();
    let isAborted = false;

    // 1. 全局最大总时限（兜底保护，默认 15 分钟；正常流仍受空闲心跳保护）
    const maxTimeoutMs = timeoutMs;
    // 2. 流式活跃心跳窗口（默认 90s：每次收到有效数据分片自动刷新；若连续 90s 无任何新分片则判定挂死）
    const inactivityTimeoutMs = Math.min(timeoutMs, 90000);

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
    const emitEvent = (event: StreamEvent) => {
      if (event.type === 'Error') streamFailed = true;
      usageTracker.onEvent(event);
      onEvent(event);
    };
    const processor = new StreamChunkProcessor(provider, emitEvent);

    let url = '';

    const promise = (async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        let bodyJson: unknown;

        if (provider.protocol === 'openai_compatible') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;

          const rawKey = (provider.apiKey || '').trim();
          if (rawKey) {
            headers['Authorization'] = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
            headers['api-key'] = rawKey.replace(/^Bearer\s+/i, '');
          }

          const formattedMessages = messages.map((m) => {
            if (m.imageUrl) {
              return {
                role: m.role,
                content: [
                  { type: 'text', text: m.content },
                  { type: 'image_url', image_url: { url: m.imageUrl } }
                ]
              };
            }
            return { role: m.role, content: m.content, ...(m.partial && supportsNativeContinuation(provider, modelId) && m === messages.at(-1) && m.role === 'assistant' ? { partial: true } : {}) };
          });

          const body: Record<string, unknown> = {
            model: modelId,
            messages: formattedMessages,
            ...(formattedMessages.some(m => 'partial' in m) ? { enable_thinking: false } : {}),
            stream: true,
            temperature: generationOptions.temperature ?? 0.7,
            max_tokens: generationOptions.maxTokens ?? 8192
          };

          // Official OpenAI supports stream_options; omit for custom third-party proxies to prevent 400 Bad Request
          if (provider.id === 'prov-openai') {
            body.stream_options = { include_usage: true };
          }

          bodyJson = body;
        } else if (provider.protocol === 'anthropic') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          if (cleanBase.endsWith('/messages')) {
            url = cleanBase;
          } else if (cleanBase.endsWith('/v1')) {
            url = `${cleanBase}/messages`;
          } else {
            url = `${cleanBase}/v1/messages`;
          }

          const rawKey = (provider.apiKey || '').trim().replace(/^Bearer\s+/i, '');
          if (rawKey) {
            headers['x-api-key'] = rawKey;
            headers['Authorization'] = `Bearer ${rawKey}`;
          }
          headers['anthropic-version'] = '2023-06-01';
          headers['anthropic-dangerous-direct-browser-access'] = 'true';

          const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
          const nonSystem = messages
            .filter((m) => m.role !== 'system')
            .map((m) => {
              if (m.imageUrl && m.imageUrl.startsWith('data:')) {
                const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  return {
                    role: m.role,
                    content: [
                      { type: 'text', text: m.content },
                      {
                        type: 'image',
                        source: { type: 'base64', media_type: match[1], data: match[2] }
                      }
                    ]
                  };
                }
              }
              return { role: m.role, content: m.content };
            });

          const anthropicMessages = nonSystem.length > 0 ? nonSystem : [{ role: 'user', content: 'hello' }];

          const body: Record<string, unknown> = {
            model: modelId,
            messages: anthropicMessages,
            stream: true,
            max_tokens: generationOptions.maxTokens ?? 8192,
            temperature: generationOptions.temperature ?? 0.7
          };

          if (systemMsg.trim()) {
            body.system = systemMsg.trim();
          }

          bodyJson = body;
        } else if (provider.protocol === 'gemini') {
          const keyParam = provider.apiKey ? `?key=${provider.apiKey.trim()}&alt=sse` : '?alt=sse';
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = `${cleanBase}/models/${modelId}:streamGenerateContent${keyParam}`;

          const contents = messages.map((m) => {
            const parts: any[] = [{ text: m.content }];
            if (m.imageUrl && m.imageUrl.startsWith('data:')) {
              const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: { mimeType: match[1], data: match[2] }
                });
              }
            }
            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts
            };
          });

          bodyJson = {
            contents,
            generationConfig: { temperature: generationOptions.temperature ?? 0.7, maxOutputTokens: generationOptions.maxTokens ?? 4096 }
          };
        } else if (provider.protocol === 'ollama_native') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = `${cleanBase}/api/chat`;
          bodyJson = {
            model: modelId,
            messages,
            stream: true,
            ...(generationOptions.maxTokens !== undefined || generationOptions.temperature !== undefined ? {
              options: {
                ...(generationOptions.maxTokens !== undefined ? { num_predict: generationOptions.maxTokens } : {}),
                ...(generationOptions.temperature !== undefined ? { temperature: generationOptions.temperature } : {})
              }
            } : {})
          };
        }

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
                processor.processChunk(payload.data);
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
                emitEvent({ type: 'Done', finish_reason: 'stop' });
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

        const resp = await fetch(fetchUrl, {
          method: 'POST',
          headers: forwardHeaders,
          body: JSON.stringify(bodyJson),
          signal: controller.signal
        });

        refreshInactivityTimer();

        if (!resp.ok) {
          clearAllTimers();
          const status = resp.status;
          const text = await resp.text().catch(() => '');
          let kind: ErrorKind = 'network_error';
          if (status === 401 || status === 403) kind = 'auth_failed';
          else if (status === 404) kind = 'not_found';
          else if (status === 429) kind = 'rate_limited';

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

          emitEvent({
            type: 'Error',
            kind,
            message: `HTTP 错误 ${status}: ${parsedMessage}`,
            http_status: status
          });
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
            processor.finish();
            break;
          }
          refreshInactivityTimer();
          const chunkText = decoder.decode(value, { stream: true });
          processor.processChunk(chunkText);
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
