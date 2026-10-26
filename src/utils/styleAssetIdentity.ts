import type { ScopedStyleAssetIdentity } from '../types/project';

export function styleAssetFingerprint(css: string): string {
  let hash = 2166136261;
  for (let index = 0; index < css.length; index++) hash = Math.imul(hash ^ css.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function nextScopedStyleAsset(
  screenId: string,
  css: string,
  source: ScopedStyleAssetIdentity['source'],
  previous?: ScopedStyleAssetIdentity,
  previousCss?: string
): ScopedStyleAssetIdentity {
  const fingerprint = styleAssetFingerprint(css);
  const previousFingerprint = previous?.fingerprint ?? (previousCss !== undefined ? styleAssetFingerprint(previousCss) : undefined);
  const version = previous
    ? previous.version + (previousFingerprint === fingerprint ? 0 : 1)
    : previousCss && previousCss.length > 0 && previousFingerprint !== fingerprint ? 2 : 1;
  return { id: `${screenId}:scoped-css`, version, fingerprint, source };
}
