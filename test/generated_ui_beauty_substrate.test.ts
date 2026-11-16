/**
 * generated-ui-beauty · E2 design substrate
 * Asserts new layout / spacing / type / depth / ThemeBackground classes
 * are physically present in extractClassWhitelist(getBaseCss(...)).
 */
import { describe, test, expect } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { compileTokensToCss, extractClassWhitelist } from '../src/utils/cssCompiler';
import { specimenCoverage } from '../src/utils/styleSpecimen';
import { techBlueTheme } from '../src/utils/themePresets';

const wl = (device: 'pc' | 'mobile') => extractClassWhitelist(getBaseCss(device));

const SHARED = [
  // Layout shells
  'sidebar', 'toolbar', 'filter-bar', 'hero-section',
  // Type
  'font-display', 'font-mono', 'text-5xl', 'text-6xl',
  'tracking-tight', 'tracking-wide', 'leading-tight', 'leading-normal',
  // Depth
  'blur-sm', 'blur-md', 'blur-lg', 'glass-strong',
  // ThemeBackground exposure
  'bg-page', 'bg-primary-action', 'bg-decorative',
  // Centering helpers paired with mx/my ladder
  'mx-auto', 'my-auto',
] as const;

const SPACE_STEPS = ['10', '12', '16'] as const;
const SPACE_PREFIXES = ['gap', 'p', 'px', 'py', 'm', 'mt', 'mb', 'ml', 'mr', 'mx', 'my'] as const;

describe('E2 · generated UI beauty substrate whitelist', () => {
  for (const device of ['pc', 'mobile'] as const) {
    test(`${device}: shared beauty classes exist in whitelist`, () => {
      const list = wl(device);
      for (const name of SHARED) expect(list).toContain(name);
    });

    test(`${device}: space-10/12/16 ladder utilities exist`, () => {
      const list = wl(device);
      for (const prefix of SPACE_PREFIXES) {
        for (const step of SPACE_STEPS) expect(list).toContain(`${prefix}-${step}`);
      }
    });

    test(`${device}: style specimen covers whitelist`, () => {
      expect(specimenCoverage(device).missing).toEqual([]);
    });
  }

  test('PC card-hover hover uses --shadow-* token, not raw rgba', () => {
    const css = getBaseCss('pc');
    const hover = /\.card-hover:hover\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(hover).toContain('var(--shadow-');
    expect(hover).not.toMatch(/rgba?\(/);
  });

  test('compileTokensToCss emits display font + extended size/space vars', () => {
    const css = compileTokensToCss(techBlueTheme.tokens, 'light');
    expect(css).toContain('--font-display:');
    expect(css).toContain('--font-size-5xl:');
    expect(css).toContain('--font-size-6xl:');
    expect(css).toContain('--space-10:');
    expect(css).toContain('--space-12:');
    expect(css).toContain('--space-16:');
    expect(css).toContain('--background-page:');
    expect(css).toContain('--background-primary-action:');
    expect(css).toContain('--background-decorative-surface:');
  });

  test('mobile hero-section keeps full-bleed / bottom radius 0 rules', () => {
    const mobile = getBaseCss('mobile');
    expect(mobile).toContain('.hero-section');
    expect(mobile).toMatch(/border-bottom-(?:left|right)-radius:\s*var\(--radius-none/);
  });
});
