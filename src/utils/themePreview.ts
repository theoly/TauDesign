import type { DesignSystemTokens } from '../types/designSystem';
import { htmlLang, t, type Locale } from '../i18n';
import { getUiLocale } from '../stores/useLocaleStore';
import { compileTokensToCss } from './cssCompiler';
import { getBaseCss, type DeviceProfile } from '../styles/baseCss';

/** Static component fixture using frame CSS; no model content or executable scripts. */
export function buildThemePreview(
  tokens: DesignSystemTokens,
  mode: 'light' | 'dark',
  device: DeviceProfile,
  locale: Locale = getUiLocale(),
): string {
  const L = (key: string) => t(key, undefined, locale);
  const focusHint =
    device === 'pc' ? L('workspace.themePreviewFocusHintPc') : L('workspace.themePreviewFocusHintMobile');
  return `<!doctype html><html lang="${htmlLang(locale)}"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><style>${getBaseCss(device)}\n${compileTokensToCss(tokens, mode, device)}</style></head>
<body class="p-4"><main class="col gap-4">
<section class="card p-4 col gap-3"><h2 class="text-lg font-semibold">${L('workspace.themePreviewTitle')}</h2><p class="text-secondary">${L('workspace.themePreviewIntro')}</p>
<div class="row wrap gap-2"><button class="btn btn-primary"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v16M4 12h16"/></svg><span>${L('workspace.themePreviewPrimary')}</span></button><button class="btn btn-secondary">${L('workspace.themePreviewSecondary')}</button><button class="btn btn-outline">${L('workspace.themePreviewOutline')}</button><button class="btn btn-text">${L('workspace.themePreviewText')}</button><button class="btn btn-danger">${L('workspace.themePreviewDanger')}</button><button class="btn btn-primary" disabled>${L('workspace.themePreviewDisabled')}</button></div>
<div class="row wrap gap-2"><button class="btn btn-primary" style="background:var(--color-primary-hover)">${L('workspace.themePreviewHover')}</button><button class="btn btn-primary" style="background:var(--color-primary-active)">${L('workspace.themePreviewActive')}</button><button class="btn btn-primary" style="outline:var(--space-1) solid var(--color-focus-ring);outline-offset:var(--space-1)">${L('workspace.themePreviewFocus')}</button></div>
<p class="text-muted">${focusHint}</p>
<label class="col gap-2">${L('workspace.themePreviewName')}<input class="input" placeholder="${L('workspace.themePreviewNamePlaceholder')}" /></label><input class="input" disabled placeholder="${L('workspace.themePreviewDisabledInput')}" />
<div class="row wrap gap-2"><span class="badge bg-success-light">${L('workspace.themePreviewDone')}</span><span class="badge bg-warning-light">${L('workspace.themePreviewPending')}</span><span class="badge bg-danger-light">${L('workspace.themePreviewFailed')}</span><span class="badge bg-info-light">${L('workspace.themePreviewInfo')}</span><span class="badge is-selected">${L('workspace.themePreviewSelected')}</span></div>
</section><section class="panel col gap-2"><h3 class="font-semibold">${L('workspace.themePreviewGroup')}</h3><p class="text-muted">${L('workspace.themePreviewNested')}</p></section><section class="bg-overlay border r-md p-3">${L('workspace.themePreviewOverlay')}</section><section class="bg-inverse r-md p-3">${L('workspace.themePreviewInverse')}</section>
</main></body></html>`;
}
