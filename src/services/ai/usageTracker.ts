import { AIProviderConfig, StreamEvent } from '../../types/provider';
import { useUsageStore } from '../../stores/useUsageStore';

let nextRequestId = 0;

const estimateTokens = (chars: number) => Math.max(1, Math.round(chars / 3.5));

function validCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

function estimateCost(provider: AIProviderConfig, inputTokens: number, outputTokens: number): number {
  const rates = provider.protocol === 'anthropic'
    ? [0.000003, 0.000015]
    : provider.protocol === 'gemini'
    ? [0.0000005, 0.0000015]
    : [0.000001, 0.000003];
  return Number((inputTokens * rates[0] + outputTokens * rates[1]).toFixed(6));
}

/** A single AIService request owns its live preview and its one final accounting write. */
export function createUsageTracker(provider: AIProviderConfig, modelId: string, inputChars: number) {
  const requestId = `ai-${Date.now()}-${++nextRequestId}`;
  const estimatedInputTokens = estimateTokens(inputChars);
  let outputChars = 0;
  let providerUsage: { inputTokens: number; outputTokens: number } | undefined;
  let settled = false;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  useUsageStore.getState().beginRequest({
    requestId,
    providerName: provider.name,
    modelId,
    inputTokens: estimatedInputTokens
  });

  const flush = () => {
    progressTimer = undefined;
    if (settled) return;
    useUsageStore.getState().updateRequest(requestId, {
      inputTokens: providerUsage?.inputTokens ?? estimatedInputTokens,
      outputTokens: providerUsage?.outputTokens ?? (outputChars ? estimateTokens(outputChars) : 0),
      source: providerUsage ? 'provider' : 'estimated'
    });
  };

  return {
    onEvent(event: StreamEvent) {
      if (settled) return;
      if (event.type === 'Delta') {
        // AIService inserts these delimiters when normalizing reasoning chunks.
        outputChars += event.text.replace(/<\/?think>/g, '').length;
        if (!progressTimer) progressTimer = setTimeout(flush, 100);
      } else if (event.type === 'Usage' && validCount(event.input_tokens) && validCount(event.output_tokens)) {
        providerUsage = { inputTokens: event.input_tokens, outputTokens: event.output_tokens };
        if (progressTimer) clearTimeout(progressTimer);
        flush();
      }
    },
    settle(status: 'completed' | 'aborted' | 'error') {
      if (settled) return;
      settled = true;
      if (progressTimer) clearTimeout(progressTimer);
      const inputTokens = providerUsage?.inputTokens ?? estimatedInputTokens;
      const outputTokens = providerUsage?.outputTokens ?? (outputChars ? estimateTokens(outputChars) : 0);
      useUsageStore.getState().updateRequest(requestId, {
        inputTokens,
        outputTokens,
        source: providerUsage ? 'provider' : 'estimated'
      });
      useUsageStore.getState().finishRequest(
        requestId,
        status,
        estimateCost(provider, inputTokens, outputTokens)
      );
    }
  };
}
