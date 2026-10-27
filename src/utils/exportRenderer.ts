import { Screen, ProjectSettings, ArtifactManifest } from '../types/project';
import { NidEngine } from './nidEngine';
import { prepareForeignObjectShadows } from './foreignObjectShadows';
import { buildScreenDocument } from './screenDocument';
import type { MobileNavigationPolicy } from './mobileNavigation';

export interface StandaloneHtmlOptions extends MobileNavigationPolicy {
  tokensCss: string;
  baseCss: string;
  screenOverrides: string;
}

export interface ExportSvgOptions extends MobileNavigationPolicy {
  viewportHeight?: number;
  tokensCss: string;
  baseCss: string;
  screenOverrides: string;
  width: number;
  height: number;
  scale?: 1 | 2 | 3;
  bgColor: string;
}

export interface ExportPngOptions extends MobileNavigationPolicy {
  onWarning?: (text: string) => void;
  viewportHeight?: number;
  tokensCss: string;
  baseCss: string;
  screenOverrides: string;
  width: number;
  height: number;
  scale: 1 | 2 | 3;
  bgColor: string;
}

/**
 * 剥离编辑器装饰类名 (BR-PX-01)
 *
 * `aidesign-selected` / `aidesign-hovered` 是画布上的选中框与悬停高亮，属编辑器 UI，
 * 不应出现在交付产物里。注意**不能**顺手剥离 `data-nid`——L4 样式覆盖正是以
 * `[data-nid="..."]` 作选择器，剥了 nid 等于把用户的手动样式一起丢掉。
 */
export function stripEditorChromeClasses(html: string): string {
  return html
    .replace(/\s*class=(["'])([^"']*)\1/gi, (match, quote: string, value: string) => {
      const kept = value
        .split(/\s+/)
        .filter((cls) => cls && cls !== 'aidesign-selected' && cls !== 'aidesign-hovered' && cls !== 'aidesign-quality-target');
      if (kept.length === 0) return '';
      return ` class=${quote}${kept.join(' ')}${quote}`;
    });
}

/**
 * 组装自包含独立 HTML 字符串 (BR-01)
 * 具备零构建依赖、剥离内部 data-nid 标记、内联 Token 与基座样式。
 */
export function buildStandaloneHtml(screen: Screen, options: StandaloneHtmlOptions): string {
  const doc = new DOMParser().parseFromString(stripEditorChromeClasses(screen.htmlContent || ''), 'text/html');
  // L4 selectors (and authored selectors in imported pages) require stable NIDs.
  const keepNids = !!screen.metadata?.importedHtml;
  const hasBackgroundBindings=Object.values(screen.metadata?.themeBackgrounds?.bindings??{}).some(selectors=>selectors?.length);
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'data-nid' && !keepNids && (options.screenOverrides.trim()||hasBackgroundBindings)) el.setAttribute('data-export-id', attr.value);
      if ((attr.name === 'data-nid' && !keepNids) || attr.name === 'data-asset-id' || attr.name.startsWith('data-component-')) el.removeAttribute(attr.name);
    }
  }
  const screenOverrides = keepNids ? options.screenOverrides : options.screenOverrides.replace(/\[data-nid(?=[\s=\]])/g, '[data-export-id');
  const metadata=structuredClone(screen.metadata);
  if(!keepNids&&metadata?.themeBackgrounds?.bindings)for(const role of Object.keys(metadata.themeBackgrounds.bindings) as Array<keyof typeof metadata.themeBackgrounds.bindings>){metadata.themeBackgrounds.bindings[role]=metadata.themeBackgrounds.bindings[role]?.map(selector=>selector.replace('[data-nid=', '[data-export-id='));}
  return buildScreenDocument({ ...screen,metadata, htmlContent: doc.documentElement.outerHTML }, { ...options, screenOverrides, title: screen?.name || 'Exported Design', viewportHeight: undefined, viewportWidth: undefined, includeMobileChrome: false, staticImage: false });
}

/**
 * 构建 Artifact Manifest 侧车元数据结构 (BR-05 / T-OD-19)
 */
export function buildArtifactManifest(screen: Screen, settings: ProjectSettings): ArtifactManifest {
  return {
    id: screen.id,
    kind: 'screen',
    renderer: 'html-iframe',
    entry: `screens/${screen.id}.html`,
    title: screen.name || screen.id,
    device: settings.deviceProfile || 'pc',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      measuredHeight: screen.measuredHeight,
      ...(screen.metadata || {})
    }
  };
}

/**
 * 将 HTML 结构转换为具备 100% XML/XHTML 严格语法的 SVG 字符串 (BR-02 / ISSUE-024 / ISSUE-025)
 *
 * 核心保障：
 * 1. 高倍率输出：SVG 使用物理像素坐标，HTML 保持 CSS 布局宽度并在绘制前缩放；
 *    避免 WebKit 在嵌套 XHTML 文档中忽略 SVG viewBox 的缩放，只绘制左上角 1x 内容。
 * 2. 内联 SVG 转换：将 data:image/svg+xml 形式的 <img> 自动转换为内联 <svg> 元素，
 *    解决 WebKit 在 SVG foreignObject 中阻断子图片加载导致的排版坍塌 (ISSUE-025)；
 * 3. 规整 void 标签自闭合与实体转义，保障 0 parsererror。
 */
export function buildExportSvg(screen: Screen, options: ExportSvgOptions): string {
  // 保留 data-nid：screenOverrides 依赖它作选择器，剥离会丢掉全部 L4 手动样式
  const cleanBodyHtml = screen ? stripEditorChromeClasses(screen.htmlContent || '') : '';
  const { width, height, bgColor, tokensCss, baseCss, screenOverrides, scale = 1 } = options;
  const policy = { deviceProfile: options.deviceProfile ?? (width === 390 ? 'mobile' as const : undefined), useCustomNavigation: options.useCustomNavigation };
  const fullDocument = !!screen.metadata?.importedHtml || policy.deviceProfile === 'mobile' || options.viewportHeight !== undefined;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  if (typeof document === 'undefined') {
    // SSR / Node 环境降级
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${scaledWidth}" height="${scaledHeight}" viewBox="0 0 ${scaledWidth} ${scaledHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px; overflow: hidden; background-color: ${bgColor}; transform: scale(${scale}); transform-origin: 0 0;">
          <style>${tokensCss}\n${baseCss}\n${screenOverrides}</style>
          ${cleanBodyHtml}
        </div>
      </foreignObject>
    </svg>`;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', `${scaledWidth}`);
  svg.setAttribute('height', `${scaledHeight}`);
  svg.setAttribute('viewBox', `0 0 ${scaledWidth} ${scaledHeight}`);

  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');

  const container = document.createElement('div');
  container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  container.style.cssText = `width: ${width}px; height: ${height}px; overflow: hidden; background-color: ${bgColor}; box-sizing: border-box; margin: 0; padding: 0;`;
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = '0 0';

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background-color: ${bgColor}; }
    svg.full-img, img.full-img { width: 100% !important; height: auto !important; display: block !important; }
    ${tokensCss}
    ${baseCss}
    ${screenOverrides}
  `;
  if (!fullDocument) container.appendChild(styleEl);

  const htmlParser = new DOMParser();
  const htmlDoc = htmlParser.parseFromString(fullDocument
    ? buildScreenDocument({ ...screen, htmlContent: cleanBodyHtml }, { tokensCss, baseCss, screenOverrides, ...policy, includeMobileChrome: true, viewportWidth: width, viewportHeight: options.viewportHeight ?? (policy.deviceProfile === 'mobile' ? 844 : 900), staticImage: true })
    : cleanBodyHtml, 'text/html');

  if (fullDocument && !screen.metadata?.importedHtml) {
    const imageSizing = htmlDoc.createElement('style');
    imageSizing.textContent = 'svg.full-img, img.full-img { width: 100% !important; height: auto !important; display: block !important; }';
    htmlDoc.head.append(imageSizing);
  }

  // 将 data:image/svg+xml 形式的 <img> 自动转换为内联 <svg> 元素 (消除 WebKit foreignObject 屏蔽图片导致的排版坍塌)
  const imgElements = Array.from(htmlDoc.body.querySelectorAll('img'));
  for (const img of imgElements) {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:image/svg+xml')) {
      let rawSvg = '';
      if (src.includes(';base64,')) {
        const base64Data = src.split(';base64,')[1];
        if (typeof atob !== 'undefined') {
          try { rawSvg = atob(base64Data); } catch {}
        }
      } else {
        const commaIndex = src.indexOf(',');
        if (commaIndex !== -1) {
          try { rawSvg = decodeURIComponent(src.slice(commaIndex + 1)); } catch {}
        }
      }

      if (rawSvg) {
        try {
          const parsedSvgDoc = htmlParser.parseFromString(rawSvg, 'image/svg+xml');
          const svgEl = parsedSvgDoc.documentElement;
          if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
            const className = img.getAttribute('class');
            if (className) svgEl.setAttribute('class', className);

            const style = img.getAttribute('style');
            if (style) {
              const existingStyle = svgEl.getAttribute('style') || '';
              svgEl.setAttribute('style', `${existingStyle}; ${style}`.trim());
            }

            const svgW = svgEl.getAttribute('width');
            const svgH = svgEl.getAttribute('height');
            if (!svgEl.getAttribute('viewBox') && svgW && svgH) {
              svgEl.setAttribute('viewBox', `0 0 ${parseFloat(svgW)} ${parseFloat(svgH)}`);
            }

            img.replaceWith(svgEl);
          }
        } catch {}
      }
    }
  }

  // 将 HTML DOM 节点逐一移入 XHTML 容器
  if (fullDocument) {
    // Preserve html/body selectors and attributes in imported documents too.
    const root = htmlDoc.documentElement.cloneNode(true) as HTMLElement;
    root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    container.appendChild(root);
  } else {
    Array.from(htmlDoc.body.childNodes).forEach((node) => {
      container.appendChild(node.cloneNode(true));
    });
  }

  foreignObject.appendChild(container);
  svg.appendChild(foreignObject);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}

/**
 * 安全触发文件下载 (BR-01)
 *
 * 关键保障：
 * 1. 挂载 <a> 元素到 document.body 后调用 click()，触发后立即卸载；
 * 2. 避免立即同步 revokeObjectURL 导致 WebKit / Safari 取消正在进行的文件保存流；
 *    采用 60s 延时安全释放。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);
}

/**
 * 安全触发 DataURL 下载
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 执行画框光栅化渲染并导出为 PNG (BR-02 / ISSUE-024)
 *
 * 1. 采用严格 XHTML SVG 避免语法解析失败；
 * 2. 优先采用 data:image/svg+xml 防止 WebKit 下 blob: 跨域隔离；
 * 3. 拒绝假交付：若图片加载失败，直接抛出真实 Error，严禁下载错误空白图片。
 */
export async function renderScreenToPngDataUrl(screen: Screen, options: ExportPngOptions): Promise<string> {
  const { width, height, scale, bgColor } = options;
  let svgString = buildExportSvg(screen, {
    tokensCss: options.tokensCss,
    baseCss: options.baseCss,
    screenOverrides: options.screenOverrides,
    width,
    height,
    scale,
    bgColor,
    viewportHeight: options.viewportHeight,
    deviceProfile: options.deviceProfile, useCustomNavigation: options.useCustomNavigation
  });

  svgString = await prepareForeignObjectShadows(svgString, width, options.viewportHeight ?? height, options.onWarning, scale);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D 上下文创建失败');
  }

  // 预先填充背景底色，杜绝透明穿透
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 优先构建 data URL，规避 WebKit blob origin 限制；若超大则回退为 blob URL
  let imageSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  let blobUrlToRevoke: string | null = null;

  if (imageSource.length > 1.5 * 1024 * 1024) {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    imageSource = URL.createObjectURL(blob);
    blobUrlToRevoke = imageSource;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    // 10s 超时保护
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
        reject(new Error('PNG 导出超时：页面元素光栅化耗时过长'));
      }
    }, 10000);

    img.onload = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (blobUrlToRevoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrlToRevoke!), 10000);
      }

      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngDataUrl = canvas.toDataURL('image/png');
        resolve(pngDataUrl);
      } catch (err: any) {
        reject(new Error(`PNG 数据编码失败: ${err?.message || '画布已被安全策略污染'}`));
      }
    };

    img.onerror = (e) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
      // 杜绝假交付：发生错误直接 reject，不可绘制空白白板骗取通过
      reject(new Error('PNG 渲染失败：SVG 结构解码被浏览器拦截，请尝试导出 HTML'));
    };

    img.src = imageSource;
  });
}
