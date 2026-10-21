import type { DesignSystem } from './designSystem';
import type { MobileNavigationPolicy } from '../utils/mobileNavigation';

export type HtmlImportMode = 'preserve' | 'unify' | 'selective';
export type HtmlImportCategory = 'colors' | 'typography' | 'spacing' | 'radius' | 'shadows';

export interface HtmlImportResource {
  url: string;
  type: 'stylesheet' | 'image' | 'font' | 'media' | 'other';
  status: 'external' | 'missing' | 'embedded' | 'local';
}

/** Observed declared values, not browser-computed styles. */
export interface HtmlImportStyleSummary {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  spacing: string[];
  radius: string[];
  shadows: string[];
  styleSheetCount: number;
  inlineStyleCount: number;
}

export interface HtmlImportAnalysis {
  fileName: string;
  sanitizedHtml: string;
  title: string;
  nodeCount: number;
  warnings: string[];
  resources: HtmlImportResource[];
  styleSummary: HtmlImportStyleSummary;
  suggestedTheme: DesignSystem;
  suggestedColorMode: 'light' | 'dark';
  detectedWidth?: number;
}

export interface HtmlImportMetadata {
  navigationTitle?: string;
  fileName: string;
  mode: HtmlImportMode;
  categories: HtmlImportCategory[];
  changes: string[];
  retained: string[];
  /** Import provenance format version. Source NID aliases stay in the document. */
  version: 1;
}

export interface HtmlImportOptions extends MobileNavigationPolicy {
  mode: HtmlImportMode;
  categories?: HtmlImportCategory[];
  designSystem: DesignSystem;
  colorMode: 'light' | 'dark';
}

export interface HtmlImportResult {
  htmlContent: string;
  /** Source styles stay in the complete document to retain their cascade position. */
  scopedCss: string;
  changes: string[];
  retained: string[];
  metadata: HtmlImportMetadata;
}
