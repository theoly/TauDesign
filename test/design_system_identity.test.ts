import { describe, expect, it } from 'bun:test';
import { designSystemOriginFor, designTokenFingerprint } from '../src/utils/designSystemIdentity';
import { neutralModernTheme } from '../src/utils/themePresets';
import { buildDesignProjectManifest, renderProjectManifestContext } from '../src/services/ai/projectManifest';

describe('design system identity and token versions', () => {
  it('fingerprints tokens independent of object key insertion order', () => {
    const left = { colors: { primary: { 500: '#123456', 600: '#234567' } } } as any;
    const right = { colors: { primary: { 600: '#234567', 500: '#123456' } } } as any;
    expect(designTokenFingerprint(left)).toBe(designTokenFingerprint(right));
  });

  it('increments the effective token version only when token values change', () => {
    const original = neutralModernTheme;
    const first = designSystemOriginFor(original, { kind: 'project', sourceId: original.id, updatedAt: 1 });
    const renamed = designSystemOriginFor({ ...original, name: '新名称' }, { kind: 'project_override', sourceId: original.id, updatedAt: 2 }, first);
    expect(first.tokenVersion).toBe(1);
    expect(renamed.tokenVersion).toBe(1);
    expect(renamed.tokenFingerprint).toBe(first.tokenFingerprint);

    const updated = { ...original, tokens: { ...original.tokens, spacing: { ...original.tokens.spacing, 7: 29 } } };
    const next = designSystemOriginFor(updated, { kind: 'project_override', sourceId: updated.id, updatedAt: 3 }, renamed);
    expect(next.tokenVersion).toBe(2);
    expect(next.tokenFingerprint).not.toBe(first.tokenFingerprint);
  });

  it('adds token identity to the derived manifest and project prompt', () => {
    const origin = designSystemOriginFor(neutralModernTheme, { kind: 'html_import', sourceName: 'base.html', updatedAt: 1 });
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile', screens: [], assets: [],
      designSystem: neutralModernTheme, designSystemOrigin: origin });
    expect(manifest.designSystem).toEqual({ id: neutralModernTheme.id, name: neutralModernTheme.name, tokenVersion: 1,
      tokenFingerprint: origin.tokenFingerprint, origin: 'html_import' });
    expect(renderProjectManifestContext(manifest)).toContain(`Token v1，指纹 ${origin.tokenFingerprint}`);
  });
});
