import { ProjectDocumentEntry } from './projectDocument';
export type { ProjectDocumentEntry } from './projectDocument';
import { DesignSystem } from './designSystem';
import { QuickPromptItem } from './quickPrompt';

export type ScreenId = string;
export type Nid = string;
export type AssetId = string;
export type ComponentId = string;
export type DecisionId = string;

export interface ProjectSettings {
  deviceProfile: 'pc' | 'mobile';     // PC: 1440, Mobile: 390
  frameWidth: number;                 // 1440 | 390
  viewportGuideHeight: number;        // PC 900, Mobile 844
  showViewportGuide: boolean;
  colorMode: 'light' | 'dark';
  lodBudget: number;                  // default 12
}

export interface Screen {
  id: ScreenId;
  name: string;
  position: { x: number; y: number };
  measuredHeight?: number;
  htmlContent: string;
  scopedCss?: string;
  thumbnail?: string;
  /** 'specimen' 为风格样张页（doc/aesthetic/spec.md §6.6），非业务画框 */
  metadata?: { description?: string; promptOrigin?: string; kind?: 'specimen' };
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
  createdAt: number;
  updatedAt: number;
}

export interface ProjectData {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  designSystem: DesignSystem;
  screens: Screen[];
  assets: Asset[];
  components?: ComponentDefinition[];
  decisions: Decision[];
  coverImage?: string;
  quickPrompts?: QuickPromptItem[];
  projectDocuments?: Record<string, ProjectDocumentEntry>;
}

