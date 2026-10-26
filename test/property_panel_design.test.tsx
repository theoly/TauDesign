import { describe, expect, test } from 'bun:test';
import { buildSizeModePatch, buildTransformPatch, buildAlignmentPatch, buildLinkedSpacingPatch } from '../src/components/inspector/DesignSections';
describe('property panel layout operations', () => {
    test('flex main-axis fill replaces fixed sizing and hug clears the flex basis', () => {
        expect(buildSizeModePatch('width', 'fill', 320, 'flex', 'row')).toEqual({ width: 'auto', 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0%', 'min-width': '0' });
        expect(buildSizeModePatch('width', 'hug', 320, 'flex', 'row')).toEqual({ width: 'fit-content', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'min-width': '' });
    });
    test('column flex height fill changes main axis while cross axis fills independently', () => {
        expect(buildSizeModePatch('height', 'fill', 120, 'flex', 'column')['flex-grow']).toBe('1');
        expect(buildSizeModePatch('width', 'fill', 320, 'flex', 'column')).toEqual({ width: 'auto', 'min-width': '0', 'align-self': 'stretch' });
    });
    test('rotation preserves independent flips and rejects complex transforms', () => {
        expect(buildTransformPatch('rotate(20deg) scaleX(-1)', 'rotate', 45)).toEqual({ transform: 'rotate(45deg) scaleX(-1)' });
        expect(buildTransformPatch('matrix(1, 0, 0, 1, 10, 20)', 'rotate', 45)).toBeNull();
        expect(buildTransformPatch('translateX(20px)', 'scaleX', -1)).toBeNull();
        expect(buildTransformPatch('scaleX(-1) rotate(20deg)', 'rotate', 45)).toEqual({ transform: 'scaleX(-1) rotate(45deg)' });
    });
    test('nine-grid swaps axes for column flow in one patch', () => {
        expect(buildAlignmentPatch('column', 2, 0)).toEqual({ 'align-items': 'flex-start', 'justify-content': 'flex-end' });
        expect(buildAlignmentPatch('row', 2, 0)).toEqual({ 'align-items': 'flex-end', 'justify-content': 'flex-start' });
    });
    test('linked spacing removes shorthand conflicts and commits four sides together', () => {
        expect(buildLinkedSpacingPatch('padding', '12px')).toEqual({ padding: '', 'padding-top': '12px', 'padding-right': '12px', 'padding-bottom': '12px', 'padding-left': '12px' });
    });
});
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignSections, TypographySection } from '../src/components/inspector/DesignSections';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test('nine-grid sends one combined layout change and complex transforms stay disabled', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    act(() => root.render(<DesignSections
      declarations={{ transform: 'translateX(20px)' }}
      computed={{ display: 'flex', 'flex-direction': 'column' }}
      width={200}
      height={100}
      tagName="div"
      onChange={patch => patches.push(patch)}/>));
    expect((host.querySelector('[aria-label="旋转"]') as HTMLInputElement).disabled).toBe(true);
    act(() => (host.querySelector('[aria-label="对齐 3 行 1 列"]') as HTMLButtonElement).click());
    expect(patches).toEqual([{ 'align-items': 'flex-start', 'justify-content': 'flex-end' }]);
    act(() => root.unmount());
    host.remove();
});
test('ellipsis changes wrapping and clipping atomically', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    act(() => root.render(<TypographySection declarations={{}} computed={{}} onChange={patch => patches.push(patch)}/>));
    const select = host.querySelector('[aria-label="省略方式"]') as HTMLSelectElement;
    act(() => { select.value = 'ellipsis'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(patches).toEqual([{ 'text-overflow': 'ellipsis', overflow: 'hidden', 'white-space': 'nowrap' }]);
    act(() => root.unmount());
    host.remove();
});
import { buildGapPatch, buildPositionPatch, buildAxisSpacingPatch, getSizeMode } from '../src/components/inspector/DesignSections';
test('ordinary auto sizing is distinct from hug and returns to automatic layout', () => {
    expect(getSizeMode('width', { width: 'auto' }, { width: '1120px' }, 'block')).toBe('auto');
    expect(getSizeMode('height', {}, { height: 'auto' }, 'block')).toBe('auto');
    expect(getSizeMode('width', { width: 'fit-content' }, { width: '320px' }, 'block')).toBe('hug');
    expect(buildSizeModePatch('width', 'auto', 320, 'flex', 'row')).toEqual({ width: 'auto', 'min-width': '', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto' });
    expect(buildSizeModePatch('width', 'auto', 320, 'flex', 'column')).toEqual({ width: 'auto', 'min-width': '', 'align-self': '' });
});
test('cross-axis fill stretches inside parent padding and fixed mode clears stretch', () => {
    expect(buildSizeModePatch('width', 'fill', 320, 'flex', 'column')).toEqual({ width: 'auto', 'min-width': '0', 'align-self': 'stretch' });
    expect(buildSizeModePatch('width', 'fixed', 320, 'flex', 'column')).toEqual({ width: '320px', 'min-width': '', 'align-self': '' });
    expect(getSizeMode('width', {}, { width: 'auto', 'align-self': 'stretch' }, 'flex', 'column')).toBe('fill');
    expect(getSizeMode('width', {}, { width: 'fit-content' }, 'block', 'row')).toBe('hug');
});
test('editing a gap axis preserves the other computed gap after shorthand removal', () => {
    expect(buildGapPatch({ 'row-gap': '8px' }, { 'row-gap': '20px', 'column-gap': '30px' })).toEqual({ gap: '', 'row-gap': '8px', 'column-gap': '30px' });
});
test('horizontal spacing linkage preserves vertical values when removing shorthand', () => {
    expect(buildAxisSpacingPatch('padding', 'horizontal', '6px', { 'padding-top': '10px', 'padding-bottom': '20px', 'padding-left': '30px', 'padding-right': '40px' })).toEqual({ padding: '', 'padding-top': '10px', 'padding-bottom': '20px', 'padding-left': '6px', 'padding-right': '6px' });
});
test('absolute positioning accounts for offset-parent border and scrolling and retains dimensions', () => {
    expect(buildPositionPatch('absolute', { top: 240, left: 180, width: 120, height: 80, parentTop: 100, parentLeft: 50, parentBorderTop: 2, parentBorderLeft: 3, parentScrollTop: 20, parentScrollLeft: 10 })).toEqual({ position: 'absolute', top: '158px', left: '137px', width: '120px', height: '80px', right: 'auto', bottom: 'auto', 'margin-top': '0px', 'margin-left': '0px', 'box-sizing': 'border-box' });
});
test('design section reads computed flex fill and exposes geometry, spacing and radius Token actions', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    const geometry = { top: 50, left: 60, width: 100, height: 80, parentTop: 0, parentLeft: 0, parentBorderTop: 0, parentBorderLeft: 0, parentScrollTop: 0, parentScrollLeft: 0 };
    act(() => root.render(<DesignSections
      tagName="div"
      declarations={{}}
      computed={{ display: 'flex', width: 'auto', 'align-self': 'stretch', transform: 'none', 'padding-top': '8px', 'padding-bottom': '8px', 'padding-left': '4px', 'padding-right': '4px' }}
      tokens={{ '--radius-md': '8px', '--space-2': '8px' }}
      geometry={geometry}
      width={100}
      height={80}
      parentDisplay="flex"
      parentDirection="column"
      onChange={p => patches.push(p)}/>));
    expect((host.querySelector('[aria-label="宽度模式"]') as HTMLSelectElement).value).toBe('fill');
    expect((host.querySelector('[aria-label="旋转"]') as HTMLInputElement).value).toBe('0deg');
    const position = host.querySelector('[aria-label="定位方式"]') as HTMLSelectElement;
    act(() => { position.value = 'absolute'; position.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(patches[0]).toEqual(buildPositionPatch('absolute', geometry));
    const linked = host.querySelector('[aria-label="内边距联动模式"]') as HTMLSelectElement;
    act(() => { linked.value = 'axis'; linked.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('[aria-label="水平内边距"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="垂直内边距"]')).toBeTruthy();
    const token = host.querySelector('[aria-label="圆角 Token"]') as HTMLSelectElement;
    act(() => { token.value = '--radius-md'; token.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(patches[1]['border-radius']).toBe('var(--radius-md)');
    expect(patches[1]['border-top-left-radius']).toBe('');
    act(() => root.unmount());
    host.remove();
});
test('font size and letter spacing expose project Token choices', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    act(() => root.render(<TypographySection
      declarations={{}}
      computed={{}}
      tokens={{ '--font-size-md': '16px', '--space-1': '4px' }}
      onChange={p => patches.push(p)}/>));
    const token = host.querySelector('[aria-label="字号 Token"]') as HTMLSelectElement;
    act(() => { token.value = '--font-size-md'; token.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(patches).toEqual([{ 'font-size': 'var(--font-size-md)' }]);
    expect(host.querySelector('[aria-label="字距 Token"]')).toBeTruthy();
    act(() => root.unmount());
    host.remove();
});
test('nonnegative sizes reject negative values while offsets and margins keep signed values', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    act(() => root.render(<DesignSections
      tagName="div"
      declarations={{}}
      computed={{ position: 'relative', display: 'flex', width: '100px', height: '80px', 'margin-top': '0px', 'padding-top': '0px' }}
      width={100}
      height={80}
      onChange={p => patches.push(p)}/>));
    const commit = (label: string, value: string) => { const el = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); };
    commit('宽度 W', '-4');
    commit('统一内边距', '-4');
    commit('圆角', '-4');
    commit('行间距', '-4');
    expect(patches).toHaveLength(0);
    commit('统一外边距', '-4');
    commit('上', '-2');
    expect(patches[0]['margin-top']).toBe('-4px');
    expect(patches[1].top).toBe('-2px');
    act(() => root.unmount());
    host.remove();
});
test('grid fill controls the corresponding alignment axis', () => {
    expect(buildSizeModePatch('width', 'fill', 100, 'grid', 'row')).toEqual({ width: 'auto', 'min-width': '0', 'justify-self': 'stretch' });
    expect(buildSizeModePatch('height', 'fill', 80, 'grid', 'row')).toEqual({ height: 'auto', 'min-height': '0', 'align-self': 'stretch' });
});
test('authored simple transform stays editable when browser computed style is a matrix', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const patches: Record<string, string>[] = [];
    act(() => root.render(<DesignSections
      tagName="div"
      declarations={{}}
      authored={{ transform: 'scaleX(-1) rotate(20deg)' }}
      computed={{ transform: 'matrix(-0.939693, 0.34202, 0.34202, 0.939693, 0, 0)' }}
      width={100}
      height={80}
      onChange={p => patches.push(p)}/>));
    const rotation = host.querySelector('[aria-label="旋转"]') as HTMLInputElement;
    expect(rotation.disabled).toBe(false);
    expect(rotation.value).toBe('20deg');
    const flip = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '垂直翻转')!;
    act(() => flip.click());
    expect(patches).toEqual([{ transform: 'scaleX(-1) rotate(20deg) scaleY(-1)' }]);
    act(() => root.unmount());
    host.remove();
});

test('saved aspect ratio drives resize and undo immediately removes coupling',()=>{
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);const patches:Record<string,string>[]=[];
  const render=(ratio:string)=>act(()=>root.render(<DesignSections
    tagName="div"
    declarations={ratio?{'aspect-ratio':ratio}:{}}
    computed={{width:'200px',height:'100px','aspect-ratio':ratio||'auto'}}
    width={200}
    height={100}
    onChange={p=>patches.push(p)}/>));
  const resize=(value:string)=>{const input=host.querySelector('[aria-label="宽度 W"]')as HTMLInputElement;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));};
  render('2 / 1');resize('300');
  expect(patches[0]).toMatchObject({width:'300px',height:'150px'});
  render('');resize('400');
  expect(patches[1].width).toBe('400px');expect(patches[1].height).toBeUndefined();
  act(()=>root.unmount());host.remove();
});
test('authored size mode is retained after computed style resolves intrinsic size to pixels',()=>{
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  act(()=>root.render(<DesignSections
    tagName="div"
    declarations={{}}
    authored={{width:'fit-content'}}
    computed={{width:'142px',height:'100px'}}
    width={142}
    height={100}
    onChange={()=>{}}/>));
  expect((host.querySelector('[aria-label="宽度模式"]') as HTMLSelectElement).value).toBe('hug');
  act(()=>root.unmount());host.remove();
});
