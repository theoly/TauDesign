import { beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { buildDesignProjectManifest, renderProjectManifestContext } from '../src/services/ai/projectManifest';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';
import { knowledgeFingerprint } from '../src/services/ai/projectKnowledge';
import { ProjectAssetAuditPanel } from '../src/components/inspector/ProjectAssetAuditPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  useHistoryStore.getState().restore(null);
  useProjectStore.getState().initNewProject({ name: '静态页面分类', deviceProfile: 'mobile', designSystem: structuredClone(defaultTheme) });
});

describe('static page design classification', () => {
  test('metadata stays in the screen entity, appears in the derived manifest, and follows History', () => {
    const id = useProjectStore.getState().addScreen({ name: '会员资料', htmlContent: '<main>资料</main>' });
    const before = knowledgeFingerprint(useProjectStore.getState());
    useProjectStore.getState().setScreenDesignRole(id, { pageGroup: '会员中心', stateLabel: '空状态', audienceRole: '会员' });
    const current = useProjectStore.getState();
    expect(current.screens[id].metadata).toMatchObject({ pageGroup: '会员中心', stateLabel: '空状态', audienceRole: '会员' });
    expect(knowledgeFingerprint(current)).not.toBe(before);
    const manifest = buildDesignProjectManifest({ projectId: current.id, projectName: current.name, deviceProfile: 'mobile',
      screens: Object.values(current.screens), assets: [] });
    expect(manifest.pages[0]).toMatchObject({ pageGroup: '会员中心', stateLabel: '空状态', audienceRole: '会员' });
    expect(renderProjectManifestContext(manifest)).toContain('状态:空状态 角色:会员');
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens[id].metadata?.pageGroup).toBeUndefined();
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screens[id].metadata?.pageGroup).toBe('会员中心');
  });

  test('inspector commits classification after editing, without changing HTML', () => {
    const id = useProjectStore.getState().addScreen({ name: '会员资料', htmlContent: '<main>资料</main>' });
    useProjectStore.setState({ activeScreenId: id, selectedNid: null, selectedNode: null });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<PropertyInspector />));
      const input = host.querySelector('input[aria-label="页面分组"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, '会员中心'); input.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(input.value).toBe('会员中心');
      act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
      expect(useProjectStore.getState().screens[id].metadata?.pageGroup).toBe('会员中心');
      expect(useProjectStore.getState().screens[id].htmlContent).toContain('资料');
    } finally { act(() => root.unmount()); host.remove(); }
  });

  test('invalid variant source is diagnosed rather than treated as a real page relationship', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p', projectName: 'P', deviceProfile: 'mobile', assets: [],
      screens: [{ id: 'variant', name: '候选', htmlContent: '<main>候选</main>', position: { x: 0, y: 0 }, metadata: { basedOnScreenId: 'missing' } }] });
    expect(manifest.issues.map(issue => issue.code)).toContain('invalid_page_variant_source');
  });

  test('asset audit panel shows a registered file that is absent from project storage', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const screen = { id: 'page', name: '首页', position: { x: 0, y: 0 }, htmlContent: '<img src="assets/images/avatar.png">' };
    const asset = { id: 'avatar', name: '头像', type: 'image' as const, mimeType: 'image/png', source: 'upload' as const,
      relPath: 'assets/images/avatar.png', refCount: 1 };
    try {
      act(() => root.render(<ProjectAssetAuditPanel projectId="audit-test" screens={{ page: screen }} assets={{ avatar: asset }} />));
      await act(async () => { (host.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve(); });
      expect(host.textContent).toContain('文件 assets/images/avatar.png 不存在');
    } finally { act(() => root.unmount()); host.remove(); }
  });
});
