import type { DesignSystem, DesignSystemTokens } from '../types/designSystem';
import type { DesignSystemOrigin } from '../types/project';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** Stable non-cryptographic identity for comparing design tokens across save/load and undo. */
export function designTokenFingerprint(tokens: DesignSystemTokens): string {
  const content = JSON.stringify(canonicalize(tokens)) ?? 'null';
  let hash = 2166136261;
  for (let index = 0; index < content.length; index++) hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function designSystemOriginFor(
  designSystem: DesignSystem,
  origin: DesignSystemOrigin,
  previous?: DesignSystemOrigin
): DesignSystemOrigin {
  const fingerprint = designTokenFingerprint(designSystem.tokens);
  const previousFingerprint = previous?.tokenFingerprint;
  const tokenVersion = previous
    ? (previous.tokenVersion ?? 1) + (previousFingerprint && previousFingerprint === fingerprint ? 0 : 1)
    : origin.tokenVersion ?? 1;
  return { ...origin, tokenVersion, tokenFingerprint: fingerprint };
}
