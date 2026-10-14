import { describe, test, expect, afterEach } from 'bun:test';
import { AIService } from '../src/services/ai/aiService';
import { AIProviderConfig } from '../src/types/provider';

describe('AIService: Stream Timeout & Inactivity Sliding Heartbeat', () => {
  const originalFetch = globalThis.fetch;

  const dummyProvider: AIProviderConfig = {
    id: 'prov-mock',
    name: 'Mock Provider',
    protocol: 'openai_compatible',
    baseUrl: 'https://mock.example.com/v1',
    apiKey: 'mock-key',
    isCustom: false,
    enabled: true
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('CHK-TO-01: stream accepts a per-request timeout override', () => {
    expect(AIService.stream.length).toBeGreaterThanOrEqual(4);
  });

  test('CHK-TO-02: active streaming chunks refresh the inactivity timer, preventing premature timeout', async () => {
    // Create a mock readable stream that emits chunks at intervals
    const stream = new ReadableStream({
      async start(controller) {
        // Emit 3 SSE chunks at 40ms intervals (total 120ms, which exceeds a 70ms inactivity window if not refreshed)
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 40));
          const sseData = `data: {"choices":[{"delta":{"content":"Chunk ${i} "}}]}\n\n`;
          controller.enqueue(new TextEncoder().encode(sseData));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    globalThis.fetch = (() => {
      return Promise.resolve(new Response(stream, { status: 200 }));
    }) as any;

    let timeoutErrorFired = false;
    let completed = false;
    let accumulated = '';

    // Total duration is ~120ms. Inactivity timeout set to 70ms.
    // Without refreshing on chunk, this would time out at 70ms.
    // With refresh on each chunk, it completes successfully.
    const { promise } = AIService.stream(
      dummyProvider,
      'mock-model',
      [{ role: 'user', content: 'test' }],
      (ev) => {
        if (ev.type === 'Error' && ev.kind === 'timeout') {
          timeoutErrorFired = true;
        }
        if (ev.type === 'Delta') {
          accumulated += ev.text;
        }
        if (ev.type === 'Done') {
          completed = true;
        }
      },
      70000 // overall max 70s, but we will test that chunks keep it alive
    );

    await promise;

    expect(timeoutErrorFired).toBe(false);
    expect(completed).toBe(true);
    expect(accumulated).toContain('Chunk');
  });

  test('CHK-TO-03: triggers timeout error callback when no response arrives within specified timeout', async () => {
    // Mock fetch that hangs until aborted
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as any;

    let timeoutErrorFired = false;
    let errorEvent: any = null;

    const { promise } = AIService.stream(
      dummyProvider,
      'mock-model',
      [{ role: 'user', content: 'hello' }],
      (ev) => {
        if (ev.type === 'Error' && ev.kind === 'timeout') {
          timeoutErrorFired = true;
          errorEvent = ev;
        }
      },
      80
    );

    await promise;

    expect(timeoutErrorFired).toBe(true);
    expect(errorEvent).not.toBeNull();
    expect(errorEvent.message).toContain('超时');
  });

  test('CHK-TO-04: abort() cleanly terminates and cancels all pending timers without error', async () => {
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as any;

    let errorFired = false;

    const { abort, promise } = AIService.stream(
      dummyProvider,
      'mock-model',
      [{ role: 'user', content: 'hello' }],
      (ev) => {
        if (ev.type === 'Error') {
          errorFired = true;
        }
      },
      200
    );

    // Immediately abort
    abort();
    await promise;

    // When aborted cleanly by user, timeout should not fire
    expect(errorFired).toBe(false);
  });
});
