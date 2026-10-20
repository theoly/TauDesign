import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import type { PipelineOutput } from '../src/services/ai/engine/pipeline/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
describe('恢复请求的用量和提示', () => {
  let host: HTMLDivElement, root: Root, engine: ReturnType<typeof useAIEngineChat>;
  let pipeline: ReturnType<typeof spyOn>;
  const Harness = () => { engine = useAIEngineChat(); return null; };
  beforeEach(async () => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({ name: '恢复统计', deviceProfile: 'mobile', createSpecimen: false });
    useAIConfigStore.setState({ providers: defaultProviders.map(p => ({ ...p, apiKey: 'test' })), bindings: defaultBindings });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    pipeline = spyOn(PipelineExecutor, 'execute');
    await act(async () => { root.render(<Harness />); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); pipeline.mockRestore(); });
  for (const status of ['rejected_by_quality', 'error', 'answered_question'] as const) {
    test(`${status}仍展示累计用量和恢复说明`, async () => {
      const result: PipelineOutput = { status, rawResponse: '已接收片段', errorMessage: '未完整返回',
        usage: { inputTokens: 1200, outputTokens: 800 }, warnings: ['已自动续写1次，累计统计本轮请求。'] };
      pipeline.mockResolvedValue(result);
      await act(async () => { await engine.sendMessage('说明这个页面的作用'); });
      const message = engine.messages.filter(m => m.sender === 'assistant').at(-1)!;
      expect(message.usage).toEqual({ promptTokens: 1200, completionTokens: 800, totalTokens: 2000 });
      expect(message.generationWarnings).toEqual(result.warnings);
      expect(message.isGenerating).toBe(false);
      expect(useProjectStore.getState().stagedScreen).toBeNull();
    });
  }
});
