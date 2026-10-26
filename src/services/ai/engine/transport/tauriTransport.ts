import { streamNativeProxy } from '../../nativeProxy';
import { AITransport, TransportRequest, StreamEvent } from './types';
import { SSEChunkParser } from './chunkParser';

export class TauriRustTransport implements AITransport {
  public readonly id = 'tauri-rust';

  public stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> } {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    else request.signal?.addEventListener('abort', abort, { once: true });
    const parser = new SSEChunkParser(onEvent);

    const promise = (async () => {
      try {
        await streamNativeProxy({
          url: request.url,
          method: request.method || 'POST',
          headers: request.headers || {},
          body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {}),
          allow_private_network: request.allowPrivateNetwork ?? request.provider?.allowPrivateNetwork ?? false,
          allowed_internal_hosts: request.allowedInternalHosts ?? request.provider?.allowedInternalHosts ?? [],
        }, (payload) => {
          if (payload.type === 'Chunk' && payload.data) {
            parser.feed(payload.data);
          } else if (payload.type === 'Error') {
            onEvent({
              type: 'Error',
              kind: 'network_error',
              message: payload.data || '网络请求异常'
            });
          } else if (payload.type === 'Done') {
            parser.finish();
            onEvent({ type: 'Done', finish_reason: 'stop' });
          }
        }, controller.signal);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          onEvent({
            type: 'Error',
            kind: 'network_error',
            message: err?.message || 'Tauri proxy request failed'
          });
        }
      } finally {
        request.signal?.removeEventListener('abort', abort);
      }
    })();

    return { abort, promise };
  }
}
