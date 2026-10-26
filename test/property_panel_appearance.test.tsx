import { describe, test, expect } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PropertyField, Section } from '../src/components/inspector/PropertyFields';
import { AppearanceSections } from '../src/components/inspector/AppearanceSections';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function mount(node: React.ReactNode) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(node));
  return {
    el,
    root,
    clean: () => {
      act(() => root.unmount());
      el.remove();
    }
  };
}
function input(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', {
      bubbles: true
    }));
  });
}
function key(el: HTMLElement, key: string) {
  act(() => el.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true
  })));
}
describe('property field transactions', () => {
  test('baseline readback, cancel, invalid rejection and one commit', () => {
    const patches: unknown[] = [];
    const m = mount(<PropertyField label="宽度" property="width" value="" computed="120px" onChange={p => patches.push(p)} type="number" unit="px" />);
    const el = m.el.querySelector('input')!;
    expect(el.value).toBe('120px');
    expect(m.el.textContent).toContain('继承');
    input(el, '240');
    key(el, 'Escape');
    expect(el.value).toBe('120px');
    expect(patches).toHaveLength(0);
    input(el, 'garbage');
    key(el, 'Enter');
    expect(patches).toHaveLength(0);
    expect(m.el.querySelector('[role="alert"]')).not.toBeNull();
    input(el, '240');
    key(el, 'Enter');
    expect(patches).toEqual([{
      width: '240px'
    }]);
    m.clean();
  });
  test('section collapse survives remount', () => {
    const m = mount(<Section title="保持折叠"><span>内容</span></Section>);
    act(() => m.el.querySelector('button')!.click());
    m.clean();
    const n = mount(<Section title="保持折叠"><span>内容</span></Section>);
    expect(n.el.textContent).not.toContain('内容');
    n.clean();
  });
  test('hidden layer can be restored and token color writes reference', () => {
    const patches: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      display: 'none'
    }} computed={{
      display: 'none',
      opacity: '1'
    }} onChange={p => patches.push(p)} tokens={{
      '--color-primary': '#123456'
    }} />);
    const show = Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '显示图层')!;
    act(() => show.click());
    expect(patches).toContainEqual({
      display: ''
    });
    const token = Array.from(m.el.querySelectorAll('button')).find(b => b.title === '--color-primary: #123456')!;
    act(() => token.click());
    expect(patches).toContainEqual({
      'background-color': 'var(--color-primary)'
    });
    m.clean();
  });
  test('drag previews and commits once', () => {
    const commits: unknown[] = [];
    const previews: unknown[] = [];
    const m = mount(<PropertyField label="透明度" property="opacity" value="1" computed="1" type="number" min={0} max={1} step={0.01} onChange={p => commits.push(p)} onPreview={p => previews.push(p)} />);
    const label = m.el.querySelector('[data-drag-label]')!;
    act(() => label.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 100,
      bubbles: true
    })));
    act(() => window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 80
    })));
    expect(commits).toHaveLength(0);
    expect(previews.length).toBeGreaterThan(0);
    act(() => window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 80
    })));
    expect(commits).toHaveLength(1);
    m.clean();
  });
  test('fill alpha reads actual value and changes background without layer opacity', () => {
    const patches: Record<string, string>[] = [];
    const previews: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      'background-color': 'rgba(10, 20, 30, 0.25)',
      opacity: '0.7'
    }} computed={{}} onChange={p => patches.push(p)} onPreview={p => previews.push(p)} />);
    const range = m.el.querySelector('input[aria-label="填充透明度"]') as HTMLInputElement;
    expect(range.value).toBe('25');
    input(range, '50');
    expect(patches).toHaveLength(0);
    act(() => range.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true
    })));
    expect(patches).toEqual([{
      'background-color': 'rgba(10, 20, 30, 0.5)'
    }]);
    expect(previews.length).toBeGreaterThan(0);
    m.clean();
  });
  test('multiple shadows preserve commas within color functions when deleting a layer', () => {
    const patches: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 0 1px #ffffff'
    }} computed={{}} onChange={p => patches.push(p)} />);
    const remove = m.el.querySelector('button[aria-label="删除第2层阴影"]') as HTMLButtonElement;
    expect(remove).not.toBeNull();
    act(() => remove.click());
    expect(patches).toEqual([{
      'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.3)'
    }]);
    m.clean();
  });
  test('gradient tool writes real background image and rejects invalid colors', () => {
    const patches: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{}} computed={{}} onChange={p => patches.push(p)} />);
    const apply = Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '应用渐变')!;
    input(m.el.querySelector('input[aria-label="起始色"]')!, 'not-color');
    act(() => apply.click());
    expect(patches).toHaveLength(0);
    input(m.el.querySelector('input[aria-label="起始色"]')!, '#123456');
    act(() => apply.click());
    expect(patches).toEqual([{
      'background-image': 'linear-gradient(135deg, #123456, #a855f7)'
    }]);
    m.clean();
  });
  test('hiding a flex container and restoring preserves layout and pointer policy', () => {
    const patches: Record<string, string>[] = [];
    function Harness() {
      const [d, setD] = React.useState({
        'display': 'flex',
        'pointer-events': 'auto',
        'visibility': 'visible'
      });
      return <AppearanceSections declarations={d} computed={{
        display: 'flex'
      }} onChange={p => {
        patches.push(p);
        setD(old => ({
          ...old,
          ...p
        }));
      }} />;
    }
    const m = mount(<Harness />);
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '隐藏图层')!.click());
    expect(patches[0]).toEqual({
      visibility: 'hidden',
      'pointer-events': 'none'
    });
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '显示图层')!.click());
    expect(patches[1]).toEqual({
      visibility: 'visible',
      'pointer-events': 'auto'
    });
    m.clean();
  });
  test('hex alpha and modern rgb alpha values read back accurately', () => {
    for (const [color, expected] of [['#11223380', '50'], ['rgb(10 20 30 / 0.4)', '40']]) {
      const m = mount(<AppearanceSections declarations={{
        'background-color': color
      }} computed={{}} onChange={() => {}} />);
      expect((m.el.querySelector('input[aria-label="填充透明度"]') as HTMLInputElement).value).toBe(expected);
      m.clean();
    }
  });
  test('existing shadow layer can be edited with units preserved', () => {
    const patches: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      'box-shadow': '0px 0.5rem 1rem 0px #000000'
    }} computed={{}} onChange={p => patches.push(p)} />);
    const select = m.el.querySelector('select[aria-label="编辑阴影层"]') as HTMLSelectElement;
    act(() => {
      select.value = '0';
      select.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    });
    expect((m.el.querySelector('input[aria-label="垂直"]') as HTMLInputElement).value).toBe('0.5rem');
    input(m.el.querySelector('input[aria-label="水平"]')!, '2');
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '更新此层阴影')!.click());
    expect(patches).toEqual([{
      'box-shadow': '2px 0.5rem 1rem 0px #000000'
    }]);
    m.clean();
  });
  test('layer reset clears hidden pointer policy and discards restore snapshot', () => {
    const patches: Record<string, string>[] = [];
    function Harness() {
      const [d, setD] = React.useState<Record<string, string>>({
        visibility: 'visible',
        'pointer-events': 'auto'
      });
      return <AppearanceSections declarations={d} computed={{
        display: 'flex'
      }} onChange={p => {
        patches.push(p);
        setD(old => ({
          ...old,
          ...p
        }));
      }} />;
    }
    const m = mount(<Harness />);
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '隐藏图层')!.click());
    const layer = m.el.querySelector('section')!;
    act(() => Array.from(layer.querySelectorAll('button')).find(b => b.textContent === '还原分区')!.click());
    expect(patches[1]['pointer-events']).toBe('');
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '隐藏图层')!.click());
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '显示图层')!.click());
    expect(patches.at(-1)).toEqual({
      visibility: '',
      'pointer-events': ''
    });
    m.clean();
  });
  test('reloaded hidden layer restores pointer events without changing flex', () => {
    const patches: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      visibility: 'hidden',
      'pointer-events': 'none',
      display: 'flex'
    }} computed={{
      display: 'flex',
      visibility: 'hidden'
    }} onChange={p => patches.push(p)} />);
    act(() => Array.from(m.el.querySelectorAll('button')).find(b => b.textContent === '显示图层')!.click());
    expect(patches).toEqual([{
      visibility: '',
      'pointer-events': ''
    }]);
    m.clean();
  });
  test('Escape on fill alpha cancels previews and prevents pointerup or blur commits', () => {
    const patches: unknown[] = [];
    const previews: unknown[] = [];
    const m = mount(<AppearanceSections declarations={{
      'background-color': 'rgba(10, 20, 30, 0.25)'
    }} computed={{}} onChange={p => patches.push(p)} onPreview={p => previews.push(p)} />);
    const range = m.el.querySelector('input[aria-label="填充透明度"]') as HTMLInputElement;
    input(range, '80');
    key(range, 'Escape');
    expect(range.value).toBe('25');
    act(() => range.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true
    })));
    act(() => range.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true
    })));
    expect(patches).toHaveLength(0);
    expect(previews.at(-1)).toBeNull();
    m.clean();
  });
});
test('numeric stepping and dragging preserve units and resolve tokens from actual value', () => {
  for (const [value, computed, expected] of [['50%', '50px', '51%'], ['1.5rem', '24px', '2.5rem'], ['var(--space-4)', '16px', '17px']]) {
    const patches: unknown[] = [];
    const m = mount(<PropertyField label="尺寸" property="width" value={value} computed={computed} unit="px" type="number" onChange={p => patches.push(p)} />);
    const el = m.el.querySelector('input')!;
    key(el, 'ArrowUp');
    key(el, 'Enter');
    expect(patches).toEqual([{
      width: expected
    }]);
    m.clean();
  }
  const patches: unknown[] = [];
  const m = mount(<PropertyField label="尺寸" property="width" value="50%" computed="100px" unit="px" type="number" onChange={p => patches.push(p)} />);
  act(() => m.el.querySelector('[data-drag-label]')!.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: 10,
    bubbles: true
  })));
  act(() => window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: 12
  })));
  act(() => window.dispatchEvent(new PointerEvent('pointerup')));
  expect(patches).toEqual([{
    width: '52%'
  }]);
  m.clean();
});
test('native color picker previews continuously and commits once', () => {
  const commits: unknown[] = [];
  const previews: unknown[] = [];
  const m = mount(<PropertyField label="颜色" property="color" value="#112233" computed="rgb(17, 34, 51)" type="color" onChange={p => commits.push(p)} onPreview={p => previews.push(p)} />);
  const color = m.el.querySelector('input[type="color"]') as HTMLInputElement;
  expect(color).not.toBeNull();
  input(color, '#223344');
  input(color, '#334455');
  expect(commits).toHaveLength(0);
  expect(previews).toContainEqual({
    color: '#334455'
  });
  act(() => color.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true
  })));
  expect(commits).toEqual([{
    color: '#334455'
  }]);
  act(() => color.dispatchEvent(new FocusEvent('focusout', {
    bubbles: true
  })));
  expect(commits).toHaveLength(1);
  m.clean();
});
