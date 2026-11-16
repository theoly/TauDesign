import type { DesignSystemTokens } from '../../types/designSystem';
import type { BeautyLane } from './beautyLane';

/**
 * Free-create visual direction lock (E3).
 * Serializes a single-brand primary role, surface ladder, density, and type-weight tone
 * so free exploration cannot invent a second brand hue axis mid-generation.
 */

export type SurfaceStep = 'page' | 'surface' | 'surfaceAlt' | 'elevated';
export type TypeWeightTone = 'light' | 'regular' | 'medium' | 'strong';

/** Stable, JSON-serializable lock written into task contracts later. */
export interface VisualStyleLock {
  version: 1;
  /** Only the project primary brand axis — never a secondary/accent brand hue. */
  brandPrimaryRole: 'primary';
  /** Ordered surface ladder from canvas ground to elevated chrome. */
  surfaceSteps: SurfaceStep[];
  density: DesignSystemTokens['personality']['density'];
  typeWeightTone: TypeWeightTone;
}

export interface VisualStyleLockInput {
  lane: BeautyLane;
  density?: DesignSystemTokens['personality']['density'];
  /** Optional hint from request / brief; defaults from density. */
  typeWeightTone?: TypeWeightTone;
}

const DEFAULT_SURFACE_STEPS: SurfaceStep[] = ['page', 'surface', 'surfaceAlt', 'elevated'];

function toneFromDensity(density: DesignSystemTokens['personality']['density']): TypeWeightTone {
  if (density === 'compact') return 'medium';
  if (density === 'relaxed') return 'regular';
  return 'regular';
}

/**
 * Build a VisualStyleLock for free_create only.
 * Other lanes return null (reference restore / mutate must not invent decorative direction).
 */
export function buildVisualStyleLock(input: VisualStyleLockInput): VisualStyleLock | null {
  if (input.lane !== 'free_create') return null;
  const density = input.density ?? 'standard';
  const lock: VisualStyleLock = {
    version: 1,
    brandPrimaryRole: 'primary',
    surfaceSteps: [...DEFAULT_SURFACE_STEPS],
    density,
    typeWeightTone: input.typeWeightTone ?? toneFromDensity(density)
  };
  return lock;
}

/** Short prompt summary; empty when lock is absent. Compact for ≤12k create budgets (E5). */
export function renderVisualStyleLock(lock: VisualStyleLock | null): string {
  if (!lock) return '';
  return [
    '### VISUAL STYLE LOCK',
    `- brandPrimaryRole: ${lock.brandPrimaryRole} (single brand hue; no secondary brand axis)`,
    `- density=${lock.density}; typeWeightTone=${lock.typeWeightTone}; surfaces ${lock.surfaceSteps.join('→')}`
  ].join('\n');
}
