import type { PageKind } from '../services/ai/designBrief';

/** Mother page kinds exclude unknown — unknown falls back to device few-shot. */
export type MotherPageKind = Exclude<PageKind, 'unknown'>;

export type MotherStatus = 'active' | 'deprecated';
export type MotherDensity = 'compact' | 'standard' | 'relaxed';
export type MotherOrigin = 'builtin' | 'user-global' | 'project-local';

export type MotherRegionRole = 'header' | 'sidebar' | 'main' | 'secondary' | 'footer' | 'filters' | 'flow';

export type MotherUiState =
  | 'empty'
  | 'filled'
  | 'error'
  | 'disabled'
  | 'loading'
  | 'selected';

export interface MotherCompositionHint {
  layout: 'flow' | 'sidebar-main' | 'two-column';
  regionRoles: Array<'header' | 'sidebar' | 'main' | 'secondary' | 'footer'>;
  primaryCta: 'inline' | 'toolbar' | 'cta-fixed' | 'none';
}

export interface MotherLicense {
  source: 'authored' | 'adapted' | 'online-adapted';
  note: string;
}

export interface MotherReview {
  reviewer: string;
  date: string;
  renderPass: boolean;
}

export interface MotherSourceOnline {
  siteId?: string;
  url?: string;
  fetchedAt?: string;
}

/**
 * Machine-readable mother metadata (meta.json authority).
 * contentFingerprint covers body.html + regions/* (sorted by role).
 */
export interface MotherPageMeta {
  id: string;
  version: string;
  status: MotherStatus;
  device: 'pc' | 'mobile';
  pageKind: MotherPageKind;
  aliases: string[];
  features: string[];
  density: MotherDensity;
  compositionHint: MotherCompositionHint;
  applicableWhen: string[];
  notApplicableWhen: string[];
  statesShown: MotherUiState[];
  promptBudgetChars: number;
  license: MotherLicense;
  origin: MotherOrigin;
  sourceOnline?: MotherSourceOnline;
  qualityScore?: number;
  contentFingerprint: string;
  review: MotherReview;
}

export interface MotherRegionExcerpt {
  role: string;
  html: string;
}

/** Loaded mother record used by catalog / retriever / injector. */
export interface MotherPage {
  meta: MotherPageMeta;
  bodyHtml: string;
  regions: MotherRegionExcerpt[];
}

export interface MotherMatchQuery {
  device: 'pc' | 'mobile';
  pageKind?: MotherPageKind | PageKind;
  requestText?: string;
  features?: string[];
  density?: MotherDensity;
  hasAttachment?: boolean;
  /** Manual override: skip scoring when id is active and device matches. */
  userMotherId?: string;
  allowOnlineSuggest?: boolean;
}

export interface MotherSelection {
  mother: MotherPage;
  score: number;
  /** Optional ≤2 region excerpts for compressed injection. */
  regions: MotherRegionExcerpt[];
  reason: string;
}

export interface MotherInjectionReceipt {
  kind: 'mother-page';
  id: string;
  version: string;
  fingerprint: string;
}

export interface MotherInjectResult {
  text: string;
  receipt: MotherInjectionReceipt;
}

export interface MotherIngestIssue {
  code: 'unknown_class' | 'script' | 'external_script' | 'fingerprint_mismatch' | 'other';
  message: string;
  detail?: string;
}

export interface MotherIngestResult {
  ok: boolean;
  unknownClassCount: number;
  issues: MotherIngestIssue[];
}
