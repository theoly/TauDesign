import { invoke, isTauri } from '@tauri-apps/api/core';
import { importedViewportHeight, measureImportedFrame } from './importViewport';

/**
 * 原生高保真导出的前端接口 (doc/feature/high-fidelity-png-export/spec.md)
 *
 * 真正的渲染发生在 Rust 侧：离屏窗口 + WebKit 原生快照（导入页）或 PDF + CoreGraphics。
 * 这里只负责两件事——判断能力可用性，以及把整页高度**实测**出来交给原生侧，
 * 不再沿用可能过期的 `screen.measuredHeight` (BR-PX-03)。
 */

export interface NativeExportArgs {
  html: string;
  width: number;
  height: number;
  scale: number;
  settleMs?: number;
  /** Imported CSS may contain gradients that WebKit's PDF backend mispaints. */
  preferSnapshot?: boolean;
}

export interface NativeExportResult {
  dataUrl: string;
  width: number;
  height: number;
  engine: string;
}

interface RawNativeResult {
  pngBase64: string;
  width: number;
  height: number;
  engine: string;
}

/** 原生导出仅在桌面运行时可用；浏览器下由调用方回退旧路径 (BR-PX-05) */
export function isNativeExportAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export async function exportPngNative(args: NativeExportArgs): Promise<NativeExportResult> {
  const raw = await invoke<RawNativeResult>('export_screen_png', {
    html: args.html,
    width: args.width,
    height: args.height,
    scale: args.scale,
    settleMs: args.settleMs,
    preferSnapshot: args.preferSnapshot
  });

  if (!raw?.pngBase64) {
    throw new Error('原生导出未返回图像数据');
  }

  return {
    dataUrl: `data:image/png;base64,${raw.pngBase64}`,
    width: raw.width,
    height: raw.height,
    engine: raw.engine || 'native-webview-pdf'
  };
}

/** 等字体就绪；环境不支持 FontFaceSet 时直接放行 */
async function waitForFonts(doc: Document, timeoutMs: number): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return;
  await Promise.race([
    fonts.ready.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

/** 等图片解码。单张失败或超时不阻断整体 (BR-PX-02) */
async function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  const images = Array.from(doc.images || []);
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      })
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

/**
 * 在离屏 iframe 中真实渲染一遍，量出整页高度 (BR-PX-03)。
 *
 * 之所以不复用 `screen.measuredHeight`：那是画布 iframe 上一次测量写回的值，
 * 内容变更后未必刷新，导出就会截断或拖出一大片空白。
 */
export async function measureDocumentHeight(
  html: string,
  width: number,
  timeoutMs = 8000
): Promise<number> {
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('当前环境不支持离屏测量');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:800px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      iframe.addEventListener('load', done, { once: true });
      setTimeout(done, timeoutMs);
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc) return 0;

    await waitForFonts(doc, 3000);
    await waitForImages(doc, 5000);

    if (importedViewportHeight(doc)) return measureImportedFrame(iframe);

    return Math.ceil(
      Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    );
  } finally {
    // 无论成败都必须摘掉离屏节点 (BR-PX-07)
    iframe.remove();
  }
}
