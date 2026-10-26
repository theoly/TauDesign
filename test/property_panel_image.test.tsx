import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { replaceInspectorImage, setInspectorImageAlt } from '../src/utils/inspectorImage';
import type { Asset } from '../src/types/project';

const asset: Asset = { id: 'asset_new', name: 'new.png', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/new.png', refCount: 0 };
const originalGet = useProjectStore.getState().getAttachmentStore;
const originalSave = useProjectStore.getState().saveProject;
const html = '<!DOCTYPE html><html><head><title>Preserved</title></head><body><picture><source srcset="old-large.png"><img data-nid="img-1" src="old.png" srcset="old@2.png 2x" alt="old"></picture><p data-nid="sibling">Keep me</p><img data-nid="img-2" src="other.png"></body></html>';
beforeEach(() => {
  useProjectStore.setState({ id: 'image-project', assets: {}, screens: { s1: { id: 's1', name: 'Image', position: { x: 0, y: 0 }, htmlContent: html } }, activeScreenId: 's1', selectedNid: 'img-1', saveProject: async () => {}, getAttachmentStore: () => ({ save: async () => asset } as any) });
  useHistoryStore.getState().clear();
});

afterEach(() => { useProjectStore.setState({ getAttachmentStore: originalGet, saveProject: originalSave }); });

describe('inspector image content editing', () => {
  test('replace saves asset path, preserves full document and sibling, removes responsive sources', async () => {
    await replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    const state = useProjectStore.getState();
    const doc = new DOMParser().parseFromString(state.screens.s1.htmlContent, 'text/html');
    expect(doc.title).toBe('Preserved');
    expect(state.screens.s1.htmlContent.toLowerCase()).toStartWith('<!doctype');
    expect(doc.querySelector('[data-nid="img-1"]')?.getAttribute('src')).toBe(asset.relPath);
    expect(doc.querySelector('[data-nid="img-1"]')?.getAttribute('data-asset-id')).toBe(asset.id);
    expect(doc.querySelector('[data-nid="img-1"]')?.hasAttribute('srcset')).toBe(false);
    expect(doc.querySelector('source')?.hasAttribute('srcset')).toBe(false);
    expect(doc.querySelector('[data-nid="sibling"]')?.textContent).toBe('Keep me');
    expect(doc.querySelector('[data-nid="img-2"]')?.getAttribute('src')).toBe('other.png');
    expect(state.assets[asset.id]?.relPath).toBe(asset.relPath);
    expect(useHistoryStore.getState().past).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe(html);
    expect(useProjectStore.getState().assets[asset.id]).toBeUndefined();
  });

  test('pending replacement remains bound to original nid after selection changes', async () => {
    let resolve!: (value: Asset) => void;
    useProjectStore.setState({ getAttachmentStore: () => ({ save: () => new Promise<Asset>((r) => { resolve = r; }) } as any) });
    const pending = replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    useProjectStore.setState({ selectedNid: 'img-2' });
    resolve(asset);
    await pending;
    const doc = new DOMParser().parseFromString(useProjectStore.getState().screens.s1.htmlContent, 'text/html');
    expect(doc.querySelector('[data-nid="img-1"]')?.getAttribute('src')).toBe(asset.relPath);
    expect(doc.querySelector('[data-nid="img-2"]')?.getAttribute('src')).toBe('other.png');
  });

  test('project switch discards pending replacement', async () => {
    let resolve!: (value: Asset) => void;
    useProjectStore.setState({ getAttachmentStore: () => ({ save: () => new Promise<Asset>((r) => { resolve = r; }) } as any) });
    const pending = replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    useProjectStore.setState({ id: 'another-project' });
    resolve(asset);
    expect(await pending).toBe(false);
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe(html);
    expect(useProjectStore.getState().assets).toEqual({});
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  test('alt updates escape markup without touching sibling DOM and are undoable', () => {
    setInspectorImageAlt('s1', 'img-1', '"><b>literal</b>');
    const doc = new DOMParser().parseFromString(useProjectStore.getState().screens.s1.htmlContent, 'text/html');
    expect(doc.querySelector('[data-nid="img-1"]')?.getAttribute('alt')).toBe('"><b>literal</b>');
    expect(doc.querySelector('b')).toBeNull();
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe(html);
  });

  test('deleted original image is reported instead of replacing the later selection', async () => {
    let resolve!: (value: Asset) => void;
    useProjectStore.setState({ getAttachmentStore: () => ({ save: () => new Promise<Asset>((r) => { resolve = r; }) } as any) });
    const pending = replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    useProjectStore.getState().updateScreenHtml('s1', '<img data-nid="img-2" src="other.png">');
    resolve(asset);
    await expect(pending).rejects.toThrow('删除');
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe('<img data-nid="img-2" src="other.png">');
    expect(useProjectStore.getState().assets).toEqual({});
  });

  test('replacement reuses an existing asset and restores both reference counts on undo and redo', async () => {
    const old: Asset = { ...asset, id: 'asset_old', relPath: 'assets/images/old.png', refCount: 2 };
    const reused: Asset = { ...asset, id: 'existing_new', refCount: 3 };
    const original = '<img data-nid="img-1" src="assets/images/old.png" data-asset-id="asset_old">';
    useProjectStore.setState({ assets: { [old.id]: old, [reused.id]: reused }, screens: { s1: { id: 's1', name: 'Image', position: { x: 0, y: 0 }, htmlContent: original } } });
    await replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(2);
    expect(useProjectStore.getState().assets[reused.id].refCount).toBe(4);
    expect(useProjectStore.getState().assets[old.id].refCount).toBe(1);
    expect(useProjectStore.getState().screens.s1.htmlContent).toContain('data-asset-id="existing_new"');
    expect(useHistoryStore.getState().past).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().assets[reused.id].refCount).toBe(3);
    expect(useProjectStore.getState().assets[old.id].refCount).toBe(2);
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe(original);
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().assets[reused.id].refCount).toBe(4);
    expect(useProjectStore.getState().assets[old.id].refCount).toBe(1);
  });

  test('reapplying the same registered image does not inflate its reference count', async () => {
    useProjectStore.setState({ assets: { [asset.id]: { ...asset, refCount: 1 } }, screens: { s1: { id: 's1', name: 'Image', position: { x: 0, y: 0 }, htmlContent: '<img data-nid="img-1" src="assets/images/new.png" data-asset-id="asset_new">' } } });
    await replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==');
    expect(useProjectStore.getState().assets[asset.id].refCount).toBe(1);
  });

  test('failed asset persistence reports an error without mutating the project', async () => {
    useProjectStore.setState({ getAttachmentStore: () => ({ save: async () => null } as any) });
    await expect(replaceInspectorImage('s1', 'img-1', 'new.png', 'data:image/png;base64,AA==')).rejects.toThrow('保存');
    expect(useProjectStore.getState().screens.s1.htmlContent).toBe(html);
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageSection } from '../src/components/inspector/ImageSection';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test('image controls are conditional and expose image-specific fit and focal point controls', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = { screenId: 's1', nid: 'img-1', tagName: 'DIV', declarations: {}, computed: {}, onChange: () => {} };
  act(() => root.render(<ImageSection {...props} />));
  expect(host.textContent).toBe('');
  act(() => root.render(<ImageSection {...props} tagName="IMG" />));
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="图片适应"]')).not.toBeNull();
  expect(host.querySelectorAll('button[aria-label^="焦点"]')).toHaveLength(9);
  expect(host.querySelector('[aria-label="替代文本"]')?.getAttribute('value')).toBe('old');
  act(() => root.unmount());
});
