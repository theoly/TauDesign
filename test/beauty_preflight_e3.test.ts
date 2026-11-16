import { expect, test } from 'bun:test';
import {
  detectsRestoreIntent,
  resolveBeautyLane,
  resolveBeautyPromptBundle
} from '../src/services/ai/beautyLane';
import { buildVisualStyleLock, renderVisualStyleLock } from '../src/services/ai/visualStyleLock';
import { buildBeautyPreflight, renderBeautyPreflight } from '../src/services/ai/beautyPreflight';
import { getPageKindTemplate, listPageKindTemplates } from '../src/services/ai/pageKindTemplates';
import { buildDesignBrief, inferPageKind, type PageKind } from '../src/services/ai/designBrief';
import { techBlueTheme } from '../src/utils/themePresets';

test('resolveBeautyLane routes restore, theme, mutate, library, and free create', () => {
  expect(resolveBeautyLane({ intent: 'change_theme' })).toBe('theme_only');
  expect(resolveBeautyLane({ intent: 'create_screen', hasAttachment: true })).toBe('reference_restore');
  expect(resolveBeautyLane({ intent: 'create_screen', request: '请按参考图 1:1 还原登录页' })).toBe(
    'reference_restore'
  );
  expect(detectsRestoreIntent('高保真还原这张图')).toBe(true);
  expect(resolveBeautyLane({ intent: 'modify_screen' })).toBe('mutate');
  expect(resolveBeautyLane({ intent: 'patch_element' })).toBe('mutate');
  expect(
    resolveBeautyLane({ intent: 'create_screen', hasDesignLibraryBinding: true })
  ).toBe('library_bound');
  expect(resolveBeautyLane({ intent: 'create_screen' })).toBe('free_create');
  expect(resolveBeautyLane({ intent: 'question' })).toBe('free_create');

  // Attachment / restore wins over library so fidelity lanes skip marketing mothers.
  expect(
    resolveBeautyLane({
      intent: 'create_screen',
      hasAttachment: true,
      hasDesignLibraryBinding: true
    })
  ).toBe('reference_restore');

  const free = resolveBeautyPromptBundle({ intent: 'create_screen' });
  expect(free.allowMotherInjection).toBe(true);
  expect(free.allowVisualStyleLock).toBe(true);
  const restore = resolveBeautyPromptBundle({ hasAttachment: true });
  expect(restore.allowMotherInjection).toBe(false);
  expect(restore.allowVisualStyleLock).toBe(false);
});

test('buildVisualStyleLock only for free_create and is JSON-serializable', () => {
  expect(buildVisualStyleLock({ lane: 'reference_restore' })).toBeNull();
  expect(buildVisualStyleLock({ lane: 'mutate' })).toBeNull();
  expect(buildVisualStyleLock({ lane: 'theme_only' })).toBeNull();
  expect(buildVisualStyleLock({ lane: 'library_bound' })).toBeNull();

  const lock = buildVisualStyleLock({ lane: 'free_create', density: 'compact' });
  expect(lock).not.toBeNull();
  expect(lock!.version).toBe(1);
  expect(lock!.brandPrimaryRole).toBe('primary');
  expect(lock!.surfaceSteps).toEqual(['page', 'surface', 'surfaceAlt', 'elevated']);
  expect(lock!.density).toBe('compact');
  expect(lock!.typeWeightTone).toBe('medium');
  expect(() => JSON.stringify(lock)).not.toThrow();
  expect(JSON.parse(JSON.stringify(lock))).toEqual(lock);
  expect(renderVisualStyleLock(lock)).toContain('brandPrimaryRole: primary');
  expect(renderVisualStyleLock(null)).toBe('');
});

test('pageKindTemplates cover every kind×device with composition-aligned fields', () => {
  const kinds: PageKind[] = [
    'form',
    'detail',
    'list',
    'dashboard',
    'pricing',
    'conversation',
    'landing',
    'settings',
    'empty',
    'result',
    'unknown'
  ];
  const layouts = new Set(['flow', 'sidebar-main', 'two-column']);
  const roles = new Set(['header', 'sidebar', 'main', 'secondary', 'footer', 'flow']);
  const ctas = new Set(['inline', 'toolbar', 'cta-fixed', 'none']);

  const all = listPageKindTemplates();
  expect(all).toHaveLength(kinds.length * 2);

  for (const kind of kinds) {
    for (const device of ['pc', 'mobile'] as const) {
      const t = getPageKindTemplate(kind, device);
      expect(t.pageKind).toBe(kind);
      expect(t.device).toBe(device);
      expect(layouts.has(t.layout)).toBe(true);
      expect(t.regionRoles.length).toBeGreaterThan(0);
      expect(t.regionRoles.every((r) => roles.has(r))).toBe(true);
      expect(ctas.has(t.primaryCta)).toBe(true);
      expect(t.templateId).toContain(`${device}-${kind}-`);
      // Mobile composition contract: no sidebar / two-column shells.
      if (device === 'mobile') {
        expect(t.layout).toBe('flow');
        expect(t.regionRoles.some((r) => r === 'sidebar' || r === 'secondary')).toBe(false);
      }
    }
  }

  expect(getPageKindTemplate('dashboard', 'pc').regionRoles[0]).toBe('header');
  expect(getPageKindTemplate('settings', 'pc').layout).toBe('sidebar-main');
  expect(getPageKindTemplate('landing', 'mobile').primaryCta).toBe('cta-fixed');
});

test('buildBeautyPreflight fills required checkpoint fields from kind×device', () => {
  const preflight = buildBeautyPreflight({ pageKind: 'list', device: 'mobile' });
  expect(preflight.version).toBe(1);
  expect(preflight.visualAnchor.length).toBeGreaterThan(0);
  expect(preflight.hierarchyPlan.title).toContain('text-');
  expect(preflight.compositionRef).toEqual({ kind: 'template', id: 'mobile-list-cards' });
  expect(preflight.firstScreenRegions.length).toBeGreaterThan(0);
  expect(preflight.layoutRisks.length).toBeGreaterThan(0);
  expect(preflight.layoutRisks.some((r) => r.includes('390'))).toBe(true);

  const withMother = buildBeautyPreflight({
    pageKind: 'landing',
    device: 'pc',
    motherId: 'pc-landing-hero'
  });
  expect(withMother.compositionRef).toEqual({ kind: 'mother', id: 'pc-landing-hero' });
  expect(renderBeautyPreflight(withMother)).toContain('compositionRef: mother:pc-landing-hero');
});

test('inferPageKind recognizes landing/settings/empty/result without breaking prior kinds', () => {
  expect(inferPageKind('会员档案')).toBe('detail');
  expect(inferPageKind('社交产品')).toBe('unknown');
  expect(inferPageKind('充值套餐')).toBe('pricing');
  expect(inferPageKind('用户登录表单')).toBe('form');

  expect(inferPageKind('营销落地页')).toBe('landing');
  expect(inferPageKind('账号设置页')).toBe('settings');
  expect(inferPageKind('列表空状态')).toBe('empty');
  expect(inferPageKind('支付成功结果页')).toBe('result');

  const brief = buildDesignBrief({
    request: '品牌落地页',
    device: 'pc',
    mode: 'light',
    designSystem: techBlueTheme,
    globalDecisions: [],
    components: []
  });
  expect(brief.scene?.pageKind).toBe('landing');
  expect(brief.layout).toContain('品牌英雄区');
});
