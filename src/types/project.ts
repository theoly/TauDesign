import { ProjectDocumentEntry } from './projectDocument';
export type { ProjectDocumentEntry } from './projectDocument';
import { DesignSystem } from './designSystem';
import { QuickPromptItem } from './quickPrompt';
import type { HtmlImportMetadata } from './htmlImport';

export type ScreenId = string;
export type Nid = string;
export type AssetId = string;
export type ComponentId = string;
export type DecisionId = string;

export interface ReferenceDevice {
  id: string;
  name: string;
  deviceProfile: 'pc' | 'mobile';
  width: number;
  height: number;
}

export interface ProjectSettings {
  deviceProfile: 'pc' | 'mobile';     // PC: 1440, Mobile: 390
  frameWidth: number;                 // 1440 | 390
  viewportGuideHeight: number;        // PC 900, Mobile 844
  referenceDevice?: ReferenceDevice; // Immutable preset snapshot; absent in legacy projects
  showViewportGuide: boolean;
  colorMode: 'light' | 'dark';
  useCustomNavigation?: boolean;
  lodBudget: number;                  // default 12
}

export interface DesignSystemOrigin {
  kind: 'project' | 'html_import' | 'project_override';
  sourceId?: string;
  sourceName?: string;
  sourceFingerprint?: string;
  /** Version of the effective token set; undo restores the previous version with the token snapshot. */
  tokenVersion?: number;
  /** Stable identity of the effective token set, independent of object key insertion order. */
  tokenFingerprint?: string;
  updatedAt: number;
}

/** A materialized copy of another local project's design assets. No writes to the source project. */
export interface DesignLibraryBinding {
  mode: 'project_copy' | 'pinned_reference';
  sourceProjectId: string;
  sourceName: string;
  sourceDeviceProfile: 'pc' | 'mobile';
  sourceFingerprint: string;
  sourceFingerprintVersion?: 2;
  sourceTokenVersion: number;
  importedAt: number;
  /** Pinned local cache; old resource/definition members remain protected after explicit updates. */
  referenceSnapshot?: {
    version: 1; designSystemId: string; designSystemName: string; tokenFingerprint: string;
    components: Record<string, string>; assets: Record<string, string>; files: Record<string, string>;
  };
  importEvidence?: {
    version: 1; checkedAt: number; sourceFingerprint: string; previewFingerprint: string; targetContextFingerprint: string;
    files: Array<{relPath:string;fingerprint:string}>;
  };
}

export interface Screen {
  id: ScreenId;
  /** Repository-managed canonical body path; optional for legacy in-memory pages. */
  entry?: string;
  name: string;
  position: { x: number; y: number };
  measuredHeight?: number;
  htmlContent: string;
  scopedCss?: string;
  thumbnail?: string;
  /** 'specimen' 为风格样张页（doc/aesthetic/spec.md §6.6），非业务画框 */
  metadata?: { description?: string; promptOrigin?: string; kind?: 'specimen'; importedHtml?: HtmlImportMetadata; navigationTitle?: string; scopedStyleAsset?: ScopedStyleAssetIdentity;
    /** Explicit page choices when a project background changes; no business DOM rewrite. */
    themeBackgrounds?: { snapshot?: import('./themeBackground').ThemeBackgrounds; bindings?: Partial<Record<import('./themeBackground').BackgroundRole,string[]>> };
    /** Static design taxonomy only; no runtime role or state transitions are implied. */
    pageGroup?: string; stateLabel?: string; audienceRole?: string; basedOnScreenId?: ScreenId;
    multiPageDelivery?:import('../services/ai/multiPageContract').MultiPageDelivery;
    creationEvidence?: import('../services/ai/pageCreationValidation').PageCreationEvidence };
}

export interface ScopedStyleAssetIdentity {
  id: string;
  version: number;
  fingerprint: string;
  source: 'imported' | 'generated' | 'edited';
}

/**
 * 标准化产物元数据清单 (REQ-OD-05 / BR-05.1 / §4.2.2)
 */
export interface ArtifactManifest {
  id: string;
  kind: 'screen' | 'deck' | 'dashboard';
  renderer: 'html-iframe';
  entry: string; // 相对工程根路径，如 "screens/screen_1.html"
  title: string;
  device: 'pc' | 'mobile';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface StyleOverride {
  nid: Nid;
  declarations: Record<string, string>;
  escaped?: boolean;
  escapedProperties?: string[];
}

export interface Asset {
  id: AssetId;
  name: string;
  type: 'image' | 'svg_icon';
  mimeType: string;
  source: 'upload' | 'ai_generated' | 'builtin';
  relPath: string;
  rawSvg?: string;
  dimensions?: { width: number; height: number };
  refCount: number;
}

export interface Decision {
  id: DecisionId;
  text: string;
  scope: 'global' | 'screen';
  screenId?: ScreenId;
  source: {
    kind: 'auto_extracted' | 'manual';
    conversationId?: string;
    createdAt: number;
  };
  active: boolean;
}

export interface SlotDef {
  slotName: string;
  selector: string;
  type: 'text' | 'image' | 'node';
  defaultContent: string;
}

export interface ComponentDefinition {
  id: ComponentId;
  name: string;
  description?: string;
  templateHtml: string;
  slotDefs?: SlotDef[];
  /** Explicit fixed-template/typed-slot validation. Missing keeps legacy compatibility. */
  templateContract?: { version: 1 };
  createdAt: number;
  updatedAt: number;
  /** Incremented when template, slots or template contract change; legacy components are version 1. */
  version?: number;
  origin?: { kind: 'manual' | 'extracted' | 'library_copy'; sourceScreenId?: ScreenId; sourceNid?: Nid;
    sourceProjectId?: string; sourceComponentId?: ComponentId; sourceFingerprint?: string };
}

export interface ProjectData {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  designSystem: DesignSystem;
  designSystemOrigin?: DesignSystemOrigin;
  designLibraryBinding?: DesignLibraryBinding;
  screens: Screen[];
  assets: Asset[];
  components?: ComponentDefinition[];
  decisions: Decision[];
  coverImage?: string;
  quickPrompts?: QuickPromptItem[];
  projectDocuments?: Record<string, ProjectDocumentEntry>;
}

