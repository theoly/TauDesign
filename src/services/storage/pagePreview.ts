import type { DesignSystem } from '../../types/designSystem';
import type { Asset, ProjectSettings, Screen, StyleOverride } from '../../types/project';
import type { ProjectStorage } from './projectStorage';
import { resolveImportedResources } from '../import/importResources';
import { exportScreenPng, type PngExportEngine } from '../../utils/pngExporter';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { resolveProjectViewport } from '../../utils/referenceDevice';
import { resolveThemeColors } from '../../utils/semanticColors';

interface PreviewIdentity {
  capturedAt: number;
  scope: 'first-screen';
  candidateFingerprint: string;
  contextFingerprint: string;
}
export type PagePreview = PreviewIdentity & (
  { status: 'ready'; relPath: string; width: number; height: number; engine: PngExportEngine } |
  { status: 'failed'; reason: string }
);

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 6_000_000;
const ENGINES = ['native-webview-pdf', 'native-webview-snapshot', 'foreign-object'];
export interface PagePreviewRequest {
  screen: Screen;
  designSystem: DesignSystem;
  settings: ProjectSettings;
  overrides: Record<string, StyleOverride>;
  assets: Asset[];
  relPath: string;
  candidateFingerprint: string;
  contextFingerprint: string;
}
export interface PagePreviewDeps {
  render?: typeof exportScreenPng;
  timeoutMs?: number;
  isCurrent?: () => boolean;
}
export function isPreviewPath(path: string): boolean {
  return /^assets\/images\/(?:delivery-preview-delivery|candidate-preview-candidate)-[a-z0-9-]+\.png$/.test(path);
}
export function isPagePreview(value: unknown, fingerprint: string): value is PagePreview {
  const p = value as PagePreview | undefined;
  if (!p || p.scope !== 'first-screen' || !Number.isFinite(p.capturedAt) ||
    p.candidateFingerprint !== fingerprint || typeof p.contextFingerprint !== 'string') return false;
  if (p.status === 'failed') return typeof p.reason === 'string' && p.reason.length <= 600;
  return p.status === 'ready' && typeof p.relPath === 'string' && isPreviewPath(p.relPath) && ENGINES.includes(p.engine) &&
    Number.isInteger(p.width) && p.width > 0 && Number.isInteger(p.height) && p.height > 0 && p.width * p.height <= MAX_PIXELS;
}

/** Verify file identity and bounds before persisting or displaying it. Decode errors are also handled by the image UI. */
export function inspectPreviewPng(base64: string): { width: number; height: number } {
  if (!base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('预览 PNG 为空、编码错误或超过 8 MiB。');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || signature.some((value, index) => bytes[index] !== value) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR' ||
    String.fromCharCode(...bytes.subarray(-8, -4)) !== 'IEND') throw new Error('预览不是完整的 PNG 文件。');
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('预览图片尺寸超出限制。');
  return { width, height };
}

/** Only real render outputs are accepted. No diagram/placeholder fallback can be archived as a screenshot. */
export const PagePreviewCapture = {
  async capture(request: PagePreviewRequest, storage: ProjectStorage, deps: PagePreviewDeps = {}): Promise<PagePreview> {
    const identity: PreviewIdentity = { capturedAt: Date.now(), scope: 'first-screen', candidateFingerprint: request.candidateFingerprint,
      contextFingerprint: request.contextFingerprint };
    let writtenPath: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!isPreviewPath(request.relPath)) throw new Error('预览文件路径无效。');
      const viewport = resolveProjectViewport(request.settings);
      if (viewport.width * viewport.height > MAX_PIXELS) throw new Error('参考设备尺寸超出预览上限。');
      // A DOM simulator has no render surface. Fail explicitly rather than waiting for fake canvas/image callbacks.
      if (!deps.render && (!document.documentElement.clientWidth || !document.documentElement.clientHeight)) throw new Error('当前环境没有可用的图像渲染视口。');
      const render = async () => {
        const overrides = Object.values(request.overrides).map(ov => `[data-nid="${ov.nid}"] { ${Object.entries(ov.declarations)
          .map(([prop, value]) => `${prop}: ${value.replace(/\s*!important\s*$/i, '')} !important;`).join(' ')} }`).join('\n');
        const screen = request.screen;
        const resources = await resolveImportedResources(screen.htmlContent, screen.scopedCss, storage, new Set(request.assets.map(asset => asset.relPath)));
        // L4 background images need the same local-resource materialization as authored CSS.
        const resolvedOverrides = await resolveImportedResources('<body></body>', overrides, storage, new Set(request.assets.map(asset => asset.relPath)));
        return (deps.render ?? exportScreenPng)({ ...screen, ...resources }, {
          tokensCss: compileTokensToCss(request.designSystem.tokens, request.settings.colorMode),
          baseCss: getBaseCss(request.settings.deviceProfile), screenOverrides: resolvedOverrides.scopedCss ?? '',
          width: viewport.width, viewportHeight: viewport.height, clipToHeight: true, clipHeight: viewport.height,
          deviceProfile: request.settings.deviceProfile, useCustomNavigation: request.settings.useCustomNavigation,
          scale: 1, bgColor: resolveThemeColors(request.designSystem.tokens, request.settings.colorMode).values.background
        });
      };
      const outcome = await Promise.race([render(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('预览生成超时，已保留代码与验收记录。')), deps.timeoutMs ?? 15_000);
      })]);
      if (!outcome.dataUrl.startsWith('data:image/png;base64,')) throw new Error('渲染器未返回 PNG 图片。');
      const base64 = outcome.dataUrl.slice('data:image/png;base64,'.length);
      const dimensions = inspectPreviewPng(base64);
      if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) throw new Error('预览尺寸与交付参考设备不一致。');
      const relPath = request.relPath;
      if (deps.isCurrent && !deps.isCurrent()) throw new Error('候选或上下文已变化，预览已取消。');
      if (await storage.exists(relPath)) throw new Error('此交付预览文件已存在，未覆盖历史图片。');
      await storage.ensureDir('assets/images');
      if (deps.isCurrent && !deps.isCurrent()) throw new Error('候选或上下文已变化，预览已取消。');
      writtenPath = relPath;
      await storage.writeBinary(relPath, base64);
      if (deps.isCurrent && !deps.isCurrent()) throw new Error('候选或上下文已变化，预览已取消。');
      return { ...identity, status: 'ready', relPath, ...dimensions, engine: outcome.engine };
    } catch (error) {
      if (writtenPath) await storage.remove(writtenPath).catch(() => {});
      return { ...identity, status: 'failed', reason: (error instanceof Error ? error.message : '预览生成失败。').slice(0, 600) };
    } finally { if (timer) clearTimeout(timer); }
  }
};
