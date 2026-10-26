import { Screen } from '../types/project';
import { buildScreenDocument } from './screenDocument';
import type { MobileNavigationPolicy } from './mobileNavigation';
import { renderScreenToPngDataUrl, stripEditorChromeClasses } from './exportRenderer';
import {
  exportPngNative,
  isNativeExportAvailable,
  measureDocumentHeight,
  NativeExportArgs,
  NativeExportResult
} from './nativeExport';

/**
 * PNG 导出编排 (doc/feature/high-fidelity-png-export/spec.md)
 *
 * 主路径走原生渲染器（导入页使用屏幕位图快照，其余页面使用 createPDF），失败自动回退旧的
 * SVG foreignObject 路径；两条都失败才报错，绝不返回空白图冒充成功 (BR-PX-05)。
 */

export type PngExportEngine = 'native-webview-pdf' | 'native-webview-snapshot' | 'foreign-object';

export interface PngExportOptions extends MobileNavigationPolicy {
  viewportHeight?: number;
  tokensCss: string;
  baseCss: string;
  screenOverrides: string;
  /** 画框宽度（CSS 像素） */
  width: number;
  /** 首屏裁切高度；仅 clipToHeight 为 true 时使用 */
  clipHeight?: number;
  clipToHeight?: boolean;
  /** 整页导出时的高度兜底值（实测失败时才用） */
  fallbackHeight?: number;
  scale: 1 | 2 | 3;
  bgColor: string;
}

export interface PngExportOutcome {
  dataUrl: string;
  engine: PngExportEngine;
  /** CSS 像素高度（非输出像素） */
  cssHeight: number;
  /** 主路径失败时的原因，用于在 UI 上说明为何降级 */
  fallbackReason?: string;
  warnings?: string[];
}

/** 可注入的依赖，便于在无浏览器渲染器的测试环境下验证编排逻辑 */
export interface PngExportDeps {
  isNativeAvailable?: () => boolean;
  measureHeight?: (html: string, width: number) => Promise<number>;
  nativeExport?: (args: NativeExportArgs) => Promise<NativeExportResult>;
  legacyExport?: typeof renderScreenToPngDataUrl;
}

/**
 * 组装用于离屏渲染的导出文档 (BR-PX-01)
 *
 * 与画布 iframe 的文档结构一致，但剥离 editor-chrome（选中框/悬停高亮）——
 * 那是编辑器 UI，不该出现在交付图里。
 */
export function buildExportRenderDocument(
  screen: Screen,
  options: Pick<PngExportOptions, 'tokensCss' | 'baseCss' | 'screenOverrides' | 'bgColor' | 'width' | 'deviceProfile' | 'useCustomNavigation' | 'viewportHeight'>
): string {
  // 保留 data-nid：screenOverrides 以 [data-nid="..."] 作选择器，
  // 剥了它等于把用户在检查器里调的每一处样式都丢掉
  const cleanBodyHtml = screen ? stripEditorChromeClasses(screen.htmlContent || '') : '';

  const deviceProfile = options.deviceProfile ?? (options.width === 390 ? 'mobile' : undefined);
  return buildScreenDocument({ ...screen, htmlContent: cleanBodyHtml }, { ...options, title: screen?.name || 'Export', deviceProfile, viewportHeight: options.viewportHeight ?? (deviceProfile === 'mobile' ? 844 : 900), viewportWidth: options.width, includeMobileChrome: true, staticImage: true });
}

/** 解析本次导出的 CSS 高度：裁切模式取参考线，整页模式取实测值 (BR-PX-03) */
export function resolveExportHeight(
  measured: number | null,
  options: Pick<PngExportOptions, 'clipHeight' | 'clipToHeight' | 'fallbackHeight'>
): number {
  if (options.clipToHeight && options.clipHeight && options.clipHeight > 0) {
    return Math.ceil(options.clipHeight);
  }
  const fallback = options.fallbackHeight && options.fallbackHeight > 0 ? options.fallbackHeight : 800;
  if (!measured || measured <= 0) return Math.ceil(fallback);
  return Math.ceil(Math.max(measured, 1));
}

export async function exportScreenPng(
  screen: Screen,
  options: PngExportOptions,
  deps: PngExportDeps = {}
): Promise<PngExportOutcome> {
  const nativeAvailable = (deps.isNativeAvailable ?? isNativeExportAvailable)();
  const measure = deps.measureHeight ?? measureDocumentHeight;
  const native = deps.nativeExport ?? exportPngNative;
  const legacy = deps.legacyExport ?? renderScreenToPngDataUrl;

  const renderHtml = buildExportRenderDocument(screen, options);

  let measured: number | null = null;
  if (!options.clipToHeight) {
    try {
      measured = await measure(renderHtml, options.width);
    } catch {
      // 实测失败不致命，退回调用方给的高度
      measured = null;
    }
  }
  const cssHeight = resolveExportHeight(measured, options);

  let fallbackReason: string | undefined;

  if (nativeAvailable) {
    try {
      const result = await native({
        html: renderHtml,
        width: options.width,
        height: cssHeight,
        scale: options.scale,
        preferSnapshot: !!screen.metadata?.importedHtml
      });
      return {
        dataUrl: result.dataUrl,
        engine: result.engine === 'native-webview-snapshot' ? 'native-webview-snapshot' : 'native-webview-pdf',
        cssHeight
      };
    } catch (err: any) {
      fallbackReason = err?.message || String(err);
    }
  } else {
    fallbackReason = '当前为浏览器环境，原生渲染不可用';
  }

  try {
    const warnings: string[] = [];
    const dataUrl = await legacy(screen, {
      onWarning: text => warnings.push(text),
      tokensCss: options.tokensCss,
      baseCss: options.baseCss,
      screenOverrides: options.screenOverrides,
      width: options.width,
      height: cssHeight,
      scale: options.scale,
      bgColor: options.bgColor,
      deviceProfile: options.deviceProfile, useCustomNavigation: options.useCustomNavigation,
      viewportHeight: options.viewportHeight
    });
    return { dataUrl, engine: 'foreign-object', cssHeight, fallbackReason, ...(warnings.length ? { warnings } : {}) };
  } catch (legacyErr: any) {
    const legacyMessage = legacyErr?.message || String(legacyErr);
    throw new Error(
      `PNG 导出失败。原生渲染：${fallbackReason || '未尝试'}；兼容渲染：${legacyMessage}。建议改用 HTML 导出。`
    );
  }
}
