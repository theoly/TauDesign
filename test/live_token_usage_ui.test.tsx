import { afterEach, beforeEach, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useUsageStore } from '../src/stores/useUsageStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useUsageStore.getState().clearUsage();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('聊天统计栏实时展示本次请求，并在结算后标记实际用量', () => {
  act(() => root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} })));
  expect(container.textContent).not.toContain('本次请求:');

  act(() => useUsageStore.getState().beginRequest({
    requestId: 'ui-request',
    providerName: 'Provider',
    modelId: 'model',
    inputTokens: 100
  }));
  expect(container.textContent).toContain('本次请求:');
  expect(container.textContent).toContain('入 100 / 出 0');
  expect(container.textContent).toContain('估算');

  act(() => useUsageStore.getState().updateRequest('ui-request', {
    inputTokens: 95,
    outputTokens: 23,
    source: 'provider'
  }));
  expect(container.textContent).toContain('入 95 / 出 23');
  expect(container.textContent).toContain('实际');

  act(() => useUsageStore.getState().finishRequest('ui-request', 'completed', 0));
  expect(container.textContent).toContain('最近请求:');
  expect(container.textContent).toContain('历史: 118');
});
