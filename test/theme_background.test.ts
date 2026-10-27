import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseThemeBackground, compileThemeBackground, compileBackgroundVariables } from '../src/utils/themeBackground';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { techBlueTheme } from '../src/utils/themePresets';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import type { ThemeBackground } from '../src/types/themeBackground';

describe('structured theme backgrounds', () => {
  test('base styles bind each role through the canonical stylesheet', () => {
    const css = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
    expect(css).toContain('background: var(--background-page, var(--color-bg))');
    expect(css).toContain('background: var(--background-primary-action, var(--color-primary))');
    expect(css).toContain('.bg-decorative-surface { background: var(--background-decorative-surface, var(--color-surface)); }');
  });
  test('rejects conflicting radial axes in parsed and persisted backgrounds', () => {
    for (const shape of ['circle at top bottom', 'at left right', 'ellipse at top top', 'at right left', 'at 20% left', 'at top 30%']) {
      expect(parseThemeBackground(`radial-gradient(${shape}, #fff, #000)`)).toBeNull();
      const paint: ThemeBackground = {kind:'gradient',layers:[{kind:'radial',geometry:shape,stops:[{color:'#fff'},{color:'#000'}]}]};
      expect(compileThemeBackground(paint)).toBeNull();
      expect(compileBackgroundVariables({page:{light:paint}},'light')).toContain('--background-page: var(--color-bg);');
    }
    for (const shape of ['circle at top left','at right bottom','ellipse at 20% 30%','at center top','at left 20%']) {
      expect(parseThemeBackground(`radial-gradient(${shape}, #fff, #000)`)).not.toBeNull();
    }
  });
  test('provides gradient-only interaction filters while preserving solid fallback semantics', () => {
    const paint = parseThemeBackground('linear-gradient(90deg, #fff, #000)')!;
    const css = compileBackgroundVariables({primaryAction:{light:paint}},'light');
    expect(css).toContain('--background-primary-hover-filter: brightness(.94);');
    expect(css).toContain('--background-primary-active-filter: brightness(.86);');
    expect(compileBackgroundVariables(undefined,'light')).toContain('--background-primary-hover-filter: none;');
    expect(compileBackgroundVariables({primaryAction:{light:{kind:'solid',color:'#abc'}}},'light')).toContain('--background-primary-active-filter: none;');
    expect(compileBackgroundVariables({primaryAction:{light:{kind:'gradient',layers:[]}}},'light')).toContain('--background-primary-active-filter: none;');
    const core = readFileSync(new URL('../src/styles/base.css', import.meta.url),'utf8');
    const pc = readFileSync(new URL('../src/styles/base.pc.css', import.meta.url),'utf8');
    expect(core).toContain('.btn-primary:active:not(:disabled):not([aria-disabled="true"]) { background-color: var(--color-primary-active); filter: var(--background-primary-active-filter, none); }');
    expect(core).not.toContain('filter: var(--background-primary-hover-filter');
    expect(pc).toContain('.btn-primary:active:not(:disabled):not([aria-disabled="true"]) { background-color: var(--color-primary-active); filter: var(--background-primary-active-filter, none); }');
    expect(compileBackgroundVariables({primaryAction:{dark:paint}},'light')).toContain('--background-primary-hover-filter: none;');
    expect(pc).toContain('.btn-primary:hover:not(:disabled):not([aria-disabled="true"]) { background-color: var(--color-primary-hover); filter: var(--background-primary-hover-filter, none); }');
  });
  test('rejects mixed RGB channel units while allowing independent alpha units', () => {
    for (const value of ['rgb(10%, 20, 30)', 'rgb(10, 20%, 30)', 'rgba(10, 20, 30%, 50%)', 'rgba(10%, 20%, 30, .5)']) {
      expect(parseThemeBackground(value)).toBeNull();
      expect(compileThemeBackground({kind:'solid',color:value})).toBeNull();
      const gradient: ThemeBackground = {kind:'gradient',layers:[{kind:'linear',stops:[{color:value},{color:'#fff'}]}]};
      expect(compileThemeBackground(gradient)).toBeNull();
      expect(compileBackgroundVariables({page:{light:gradient}},'light')).toContain('--background-page: var(--color-bg);');
    }
    for (const value of ['rgb(10%, 20%, 30%)', 'rgb(10, 20, 30)', 'rgba(10, 20, 30, 50%)', 'rgba(10%, 20%, 30%, .5)']) {
      expect(parseThemeBackground(value)).toEqual({kind:'solid',color:value});
      expect(compileThemeBackground({kind:'solid',color:value})).toBe(value);
    }
  });
  test('parses solids and transparent colors', () => {
    expect(parseThemeBackground('#abc')).toEqual({kind:'solid',color:'#abc'});
    expect(parseThemeBackground('rgba(12, 24, 36, 0.4)')).toEqual({kind:'solid',color:'rgba(12, 24, 36, 0.4)'});
  });
  test('round trips layered gradients with alpha and percentage stops', () => {
    const css = 'radial-gradient(ellipse at 25% 75%, rgba(10, 20, 30, 0.4) 0%, transparent 100%), linear-gradient(135deg, #abc 0%, #123456 100%)';
    const paint = parseThemeBackground(css, '#fff')!;
    expect(paint.kind).toBe('gradient');
    expect(compileThemeBackground(paint)).toBe(css + ', #fff');
  });
  test('supports directions and implicit stops without guessing unsupported expressions', () => {
    expect(compileThemeBackground(parseThemeBackground('linear-gradient(to bottom right, #fff, #000)')!)).toBe('linear-gradient(to bottom right, #fff, #000)');
    for (const value of ['url(https://evil)', 'linear-gradient(var(--x), #fff)', 'env(foo)', '#fff; color:red', 'conic-gradient(#fff,#000)', 'linear-gradient(12px, #fff, #000)', 'linear-gradient(90deg,#fff -10%,#000 100%)', 'radial-gradient(circle at calc(10% + 2px) 50%,#fff,#000)']) expect(parseThemeBackground(value)).toBeNull();
  });
  test('never emits unsafe or malformed persisted paints', () => {
    for (const value of [null, {}, {kind:'gradient',layers:[null]}, {kind:'solid',color:'#fff;}</style><script>x</script>'}, {kind:'gradient',layers:[{kind:'linear',stops:[{color:'#fff'},{color:'url(x)'}]}]}]) {
      expect(compileThemeBackground(value as ThemeBackground)).toBeNull();
    }
    expect(compileBackgroundVariables({page:{light:{kind:'solid',color:'url(x)'}}},'light')).toContain('--background-page: var(--color-bg);');
  });
  test('compiles separate mode roles with legacy semantic fallbacks', () => {
    const css = compileBackgroundVariables({page:{dark:parseThemeBackground('#123')!}},'light');
    expect(css).toContain('--background-page: var(--color-bg);');
    expect(css).toContain('--background-primary-action: var(--color-primary);');
    expect(css).toContain('--background-decorative-surface: var(--color-surface);');
    expect(compileTokensToCss(techBlueTheme.tokens)).toContain('--background-page: var(--color-bg);');
    expect(compileBackgroundVariables({page:{dark:parseThemeBackground('#123')!}},'dark')).toContain('--background-page: #123;');
  });
  test('instructs new pages to inherit backgrounds while preserving explicit local requests', () => {
    const prompt = PromptBuilder.buildSystemPrompt({designSystem:techBlueTheme,deviceProfile:'pc',frameWidth:1440});
    expect(prompt).toContain('--background-page');
    expect(prompt).toContain('BACKGROUND ROLES');
    expect(prompt).toContain('explicit');
    expect(prompt).toContain('local');
  });
});

test('page gradients fill the viewport while legacy pure-color pages keep natural height',()=>{
 const paint=parseThemeBackground('linear-gradient(#fff3ea,#fffaf5)')!;
 expect(compileBackgroundVariables({page:{light:paint}},'light')).toContain('--background-page-full-height: 1');
 expect(compileBackgroundVariables(undefined,'light')).toContain('--background-page-full-height: 0');
});
