import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignSystemVisualPreview } from '../src/components/theme/DesignSystemVisualPreview';
import { defaultTheme } from '../src/utils/themePresets';

test('design system samples reflect actual typography, density and shadow tokens', () => {
  const theme = structuredClone(defaultTheme);
  theme.tokens.typography.sizes['2xl'] = 29;
  theme.tokens.typography.sizes.md = 17;
  theme.tokens.typography.fontFamilySans = 'Example Sans, sans-serif';
  theme.tokens.personality.density = 'relaxed';
  theme.tokens.shadows.card.light = '0 2px 11px rgba(0,0,0,0.12)';
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(<DesignSystemVisualPreview theme={theme} colorMode="light" />), 'text/html');
  expect(doc.querySelector('[data-design-sample="display"]')?.getAttribute('style')).toContain('font-size:29px');
  expect(doc.querySelector('[data-design-sample="body"]')?.getAttribute('style')).toContain('font-size:17px');
  expect(doc.querySelector('[data-design-sample="card"]')?.getAttribute('style')).toContain('box-shadow:0 2px 11px');
  expect(doc.querySelector('[data-design-sample="card"]')?.getAttribute('style')).toContain('padding:19px');
  expect(doc.querySelector('[data-design-sample="system"]')?.getAttribute('style')).toContain('font-family:Example Sans, sans-serif');
});
