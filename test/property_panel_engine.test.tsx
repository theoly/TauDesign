import { test, expect, beforeEach } from 'bun:test';
import { collectInspectorStyle, mergeInspectorDeclarations, setInspectorPreview, clearInspectorPreview, reconcileInlinePriority } from '../src/utils/inspectorStyle';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { buildStandaloneHtml } from '../src/utils/exportRenderer';

beforeEach(() => { useHistoryStore.getState().clear(); });

test('snapshot includes actual typography, parent layout and source declarations', () => {
  const parent = document.createElement('div'); parent.style.display = 'flex';
  const el = document.createElement('span'); el.style.cssText = 'font-size:24px;color:rgb(20, 30, 40);letter-spacing:-0.3px';
  parent.append(el); document.body.append(parent);
  const info = collectInspectorStyle(el);
  expect(info.styles['font-size']).toBe('24px');
  expect(info.styles['letter-spacing']).toBe('-0.3px');
  expect(info.parentDisplay).toBe('flex');
  expect(info.authored['font-size']).toBe('24px'); parent.remove();
});

test('editor selection highlight is excluded from actual shadow and palette without losing selection', () => {
  const style=document.createElement('style'); style.setAttribute('data-taudesign-runtime','editor-chrome');
  style.textContent='.aidesign-selected{box-shadow:0 0 0 4px rgb(37,99,235)!important}'; document.head.append(style);
  const el=document.createElement('div'); el.className='aidesign-selected';el.style.boxShadow='0 2px 4px black';document.body.append(el);
  const info=collectInspectorStyle(el);
  expect(info.styles['box-shadow']).toBe('0 2px 4px black');
  expect(el.classList.contains('aidesign-selected')).toBe(true);
  expect(info.pageColors).not.toContain('rgb(37,99,235)');el.remove();style.remove();
});

test('shorthand replacement removes stale longhands, preserves unrelated overrides', () => {
  expect(mergeInspectorDeclarations({ 'border-top-left-radius':'3px', color:'red' }, { 'border-radius':'8px' })).toEqual({ color:'red','border-radius':'8px' });
  expect(mergeInspectorDeclarations({ gap:'8px' }, { 'row-gap':'12px' })).toEqual({ gap:'8px','row-gap':'12px' });
});

test('preview is temporary, clear restores persistent style without touching history', () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<div data-nid="box">Text</div>';
  setInspectorPreview(doc, 'box', { color:'red', opacity:'0.5' });
  expect(doc.querySelector('style[data-taudesign-runtime="inspector-preview"]')?.textContent).toContain('opacity: 0.5 !important');
  expect(doc.body.innerHTML).toBe('<div data-nid="box">Text</div>');
  clearInspectorPreview(doc);
  expect(doc.querySelector('style[data-taudesign-runtime="inspector-preview"]')).toBeNull();
  expect(useHistoryStore.getState().past).toHaveLength(0);
});

test('atomic overrides skip no-op and preserve escaped properties across unrelated edits', () => {
  useProjectStore.setState({ screens:{}, overrides:{} });
  const store = useProjectStore.getState();
  store.setOverride('s','n', { color:'#ff0000' }, true);
  store.setOverride('s','n', { 'justify-content':'center','align-items':'center' });
  expect(useProjectStore.getState().overrides['s:n'].escaped).toBe(true);
  expect(useHistoryStore.getState().past).toHaveLength(2);
  store.setOverride('s','n', { 'justify-content':'center','align-items':'center' });
  expect(useHistoryStore.getState().past).toHaveLength(2);
  useHistoryStore.getState().undo();
  expect(useProjectStore.getState().overrides['s:n'].declarations).toEqual({color:'#ff0000'});
  store.setOverride('s','n', {color:''});
  expect(useProjectStore.getState().overrides['s:n']).toBeUndefined();
});

test('inline important priority is lowered only for overridden properties and restored on clear', () => {
  const doc=document.implementation.createHTMLDocument();
  doc.body.innerHTML='<div data-nid="x" style="color:red!important;width:20px!important">A</div>';
  const el=doc.body.firstElementChild as HTMLElement;
  reconcileInlinePriority(doc, '[data-nid="x"] { color: blue !important; }');
  expect(el.style.getPropertyPriority('color')).toBe('');
  expect(el.style.getPropertyPriority('width')).toBe('important');
  reconcileInlinePriority(doc, '');
  expect(el.style.getPropertyPriority('color')).toBe('important');
});

test('clean standalone export retains priority for overrides after internal IDs are removed', () => {
  const html=buildStandaloneHtml({id:'export',name:'Export',position:{x:0,y:0},htmlContent:'<div data-nid="x" style="color:red!important">A</div>'},
    {tokensCss:'',baseCss:'',screenOverrides:'[data-nid="x"] { color: blue !important; }'});
  const doc=new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelector('[data-nid]')).toBeNull();
  expect((doc.querySelector('[data-export-id="x"]') as HTMLElement).style.getPropertyPriority('color')).toBe('');
});
