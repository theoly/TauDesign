import { Channel, invoke } from '@tauri-apps/api/core';

export interface NativeProxyPayload {
  type: 'Ready' | 'Chunk' | 'Error' | 'Done';
  data?: string;
}

/** Ready acknowledges registration before cancellation, including aborts during IPC setup. */
export async function streamNativeProxy(
  args: Record<string, unknown>,
  onMessage: (payload: NativeProxyPayload) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const requestId = crypto.randomUUID();
  let registered = false;
  let cancelSent = false;
  const cancel = () => {
    if (!registered || cancelSent) return;
    cancelSent = true;
    // Keep an IPC failure observable to the request's promise.
    cancelPromise = invoke('cancel_proxy_request', { requestId });
    void cancelPromise.catch(() => {});
  };
  let cancelPromise: Promise<unknown> | undefined;
  const channel = new Channel<NativeProxyPayload>();
  channel.onmessage = (payload) => {
    if (payload.type === 'Ready') {
      registered = true;
      if (signal?.aborted) cancel();
      return;
    }
    if (!signal?.aborted) onMessage(payload);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await invoke('proxy_stream_request', { ...args, requestId, channel });
    await cancelPromise;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
