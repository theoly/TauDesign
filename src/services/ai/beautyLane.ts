/**
 * Generation-time beauty lane (E3).
 * Chooses which aesthetic package is allowed before prompt assembly.
 * PromptBuilder calls resolveBeautyPromptBundle before mother / StyleLock injection.
 *
 * Intent union is local (not imported from promptBuilder) to avoid a circular module edge.
 */

export type BeautyLane =
  | 'free_create'
  | 'reference_restore'
  | 'library_bound'
  | 'mutate'
  | 'theme_only';

export type BeautyLaneIntent =
  | 'create_screen'
  | 'modify_screen'
  | 'change_theme'
  | 'question'
  | 'patch_element'
  | 'needs_reference';

export interface BeautyLaneInput {
  /** Pipeline / classifier intent when known. */
  intent?: BeautyLaneIntent;
  /** User attached a reference image (or equivalent vision evidence). */
  hasAttachment?: boolean;
  /** Explicit 1:1 / fidelity restore wording in the request. */
  restoreIntent?: boolean;
  /** Current project has a design-library binding. */
  hasDesignLibraryBinding?: boolean;
  /** Raw user request; used only for restore-intent heuristics when restoreIntent is omitted. */
  request?: string;
}

const RESTORE_INTENT_RE =
  /1\s*:\s*1|一对一|按图还原|按图复刻|精准还原|高保真还原|忠于参考|完全复刻|一模一样|视觉还原|按参考图还原|按附件.*还原|还原成参考/;

/** Detect 1:1 / fidelity-restore intent from request text. */
export function detectsRestoreIntent(request: string | undefined): boolean {
  if (!request?.trim()) return false;
  return RESTORE_INTENT_RE.test(request.normalize('NFKC').toLowerCase());
}

/**
 * Resolve the beauty lane for this generation turn.
 *
 * Priority (fidelity and intent first, then library, then free create):
 * 1. change_theme → theme_only
 * 2. attachment or 1:1 restore → reference_restore
 * 3. modify / patch → mutate
 * 4. design-library binding on create → library_bound
 * 5. else free_create
 */
export function resolveBeautyLane(input: BeautyLaneInput): BeautyLane {
  const intent = input.intent ?? 'create_screen';
  if (intent === 'change_theme') return 'theme_only';

  const restore =
    input.restoreIntent === true ||
    input.hasAttachment === true ||
    detectsRestoreIntent(input.request);
  if (restore) return 'reference_restore';

  if (intent === 'modify_screen' || intent === 'patch_element') return 'mutate';

  if (input.hasDesignLibraryBinding) return 'library_bound';

  return 'free_create';
}

/** Soft bundle for later prompt wiring — does not mutate executor state. */
export interface BeautyPromptBundle {
  lane: BeautyLane;
  /** Mothers / VisualStyleLock discovery allowed only on free_create (library optional). */
  allowMotherInjection: boolean;
  allowVisualStyleLock: boolean;
}

export function resolveBeautyPromptBundle(input: BeautyLaneInput): BeautyPromptBundle {
  const lane = resolveBeautyLane(input);
  return {
    lane,
    allowMotherInjection: lane === 'free_create' || lane === 'library_bound',
    allowVisualStyleLock: lane === 'free_create'
  };
}
