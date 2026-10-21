import { buildExportSvg } from './exportRenderer';
import { Screen } from '../types/project';

export interface ScreenCaptureOptions {
  frameWidth?: number;
  viewportHeight?: number;
  useCustomNavigation?: boolean;
  deviceProfile?: 'pc' | 'mobile';
  tokensCss?: string;
  baseCss?: string;
  screenOverrides?: string;
  colorMode?: 'light' | 'dark';
  /** 目标输出缩略图宽度，默认 480 */
  targetWidth?: number;
  /** 目标输出缩略图高度，默认 240 (2:1 比例) */
  targetHeight?: number;
}

/**
 * 截取画框核心视觉视图作为工程封面 DataURL (BR-02 / T-PCI-02)
 *
 * 1. 移动端 (Mobile 390)：在 2:1 卡片中居中微缩手机真机外壳 (Phone Mockup)，展示完整页面上下层次，彻底解决盲目裁切与巨大放大问题；
 * 2. 桌面端 (PC 1440)：自适应完整横向视口并等比微缩至卡片；
 * 3. 具备降级保护：在无 DOM、happy-dom 或 WebKit 限制环境下，生成同等精细度微缩矢量封面。
 */
export async function captureScreenSnippetAsDataUrl(
  screen: Screen,
  options: ScreenCaptureOptions = {}
): Promise<string> {
  const isMobile = options.deviceProfile === 'mobile' || (options.frameWidth && options.frameWidth <= 500);
  const targetW = options.targetWidth || 480;
  const targetH = options.targetHeight || 240;
  const isDark = options.colorMode === 'dark';
  const bgColor = isDark ? '#0b0f19' : '#ffffff';
  const textColor = isDark ? '#f1f5f9' : '#0f172a';

  // 矢量微质感降级封面生成器：环境受限时确保 100% 成功生成比例协调的微缩应用封面
  const buildSvgFallbackDataUrl = () => {
    const escapedName = (screen.name || '页面预览')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (isMobile) {
      // 移动端微质感手机模型：居中微缩呈现状态栏、导航条、卡片网格与底部栏，比例逼真协调，告别巨大色块
      const phoneW = 100;
      const phoneH = 216;
      const phoneX = Math.round((targetW - phoneW) / 2);
      const phoneY = 12;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetW} ${targetH}" width="${targetW}" height="${targetH}">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${isDark ? '#0b0f19' : '#f8fafc'}" />
            <stop offset="50%" stop-color="${isDark ? '#111827' : '#f1f5f9'}" />
            <stop offset="100%" stop-color="${isDark ? '#0b0f19' : '#e2e8f0'}" />
          </linearGradient>
          <filter id="phoneShadow" x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGrad)" />
        <g filter="url(#phoneShadow)">
          <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="14" fill="${isDark ? '#0f172a' : '#ffffff'}" stroke="${isDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(203, 213, 225, 0.8)'}" stroke-width="1.5" />
        </g>
        <rect x="${phoneX + (phoneW - 28) / 2}" y="${phoneY + 6}" width="28" height="4" rx="2" fill="${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}" />
        <text x="${phoneX + phoneW / 2}" y="${phoneY + 26}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600" fill="${textColor}" text-anchor="middle">${escapedName}</text>
        <rect x="${phoneX + 8}" y="${phoneY + 34}" width="${phoneW - 16}" height="38" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(226, 232, 240, 0.8)'}" />
        <rect x="${phoneX + 8}" y="${phoneY + 78}" width="${(phoneW - 20) / 2}" height="42" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.9)'}" />
        <rect x="${phoneX + 8 + (phoneW - 20) / 2 + 4}" y="${phoneY + 78}" width="${(phoneW - 20) / 2}" height="42" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.9)'}" />
        <rect x="${phoneX + 8}" y="${phoneY + 126}" width="${phoneW - 16}" height="32" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(241, 245, 249, 0.8)'}" />
        <rect x="${phoneX + 8}" y="${phoneY + 164}" width="${phoneW - 16}" height="20" rx="4" fill="${isDark ? 'rgba(37, 99, 235, 0.3)' : 'rgba(59, 130, 246, 0.2)'}" />
        <rect x="${phoneX + (phoneW - 32) / 2}" y="${phoneY + phoneH - 8}" width="32" height="3" rx="1.5" fill="${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}" />
      </svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    // PC 桌面端微质感浏览器窗口微缩视图
    const winW = 420;
    const winH = 216;
    const winX = Math.round((targetW - winW) / 2);
    const winY = 12;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetW} ${targetH}" width="${targetW}" height="${targetH}">
      <defs>
        <linearGradient id="bgGradPc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${isDark ? '#0b0f19' : '#f8fafc'}" />
          <stop offset="100%" stop-color="${isDark ? '#111827' : '#e2e8f0'}" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bgGradPc)" />
      <rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="8" fill="${isDark ? '#0f172a' : '#ffffff'}" stroke="${isDark ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.8)'}" stroke-width="1.5" />
      <rect x="${winX}" y="${winY}" width="${winW}" height="22" rx="8" fill="${isDark ? '#1e293b' : '#f1f5f9'}" />
      <circle cx="${winX + 12}" cy="${winY + 11}" r="3.5" fill="#ef4444" />
      <circle cx="${winX + 22}" cy="${winY + 11}" r="3.5" fill="#f59e0b" />
      <circle cx="${winX + 32}" cy="${winY + 11}" r="3.5" fill="#10b981" />
      <text x="${winX + 46}" y="${winY + 15}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600" fill="${textColor}">${escapedName}</text>
      <rect x="${winX + 8}" y="${winY + 28}" width="60" height="${winH - 36}" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.8)'}" />
      <rect x="${winX + 74}" y="${winY + 28}" width="${winW - 82}" height="26" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(241, 245, 249, 0.6)'}" />
      <rect x="${winX + 74}" y="${winY + 60}" width="${(winW - 90) / 2}" height="64" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'}" />
      <rect x="${winX + 74 + (winW - 90) / 2 + 8}" y="${winY + 60}" width="${(winW - 90) / 2}" height="64" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'}" />
      <rect x="${winX + 74}" y="${winY + 130}" width="${winW - 82}" height="${winH - 138}" rx="4" fill="${isDark ? 'rgba(30, 41, 59, 0.3)' : 'rgba(241, 245, 249, 0.5)'}" />
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  if (typeof document === 'undefined') {
    return buildSvgFallbackDataUrl();
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  const renderFallback = () => {
    return buildSvgFallbackDataUrl();
  };

  if (!ctx) return renderFallback();

  const width = options.frameWidth ?? (isMobile ? 390 : 1440);
  const height = options.viewportHeight ?? (isMobile ? 844 : 900);
  const scale = Math.min((isMobile ? 104 : targetW) / width, (targetH - 24) / height);
  const x = (targetW - width * scale) / 2;
  const pageSvg = buildExportSvg(screen, { tokensCss: options.tokensCss ?? '', baseCss: options.baseCss ?? '', screenOverrides: options.screenOverrides ?? '',
    width, height, viewportHeight: height, bgColor, deviceProfile: isMobile ? 'mobile' : 'pc', useCustomNavigation: options.useCustomNavigation });
  const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}">
    <rect width="100%" height="100%" fill="${isDark ? '#0b0f19' : '#f8fafc'}" />
    <g transform="translate(${x},12) scale(${scale})">${pageSvg}</g>
  </svg>`;

  try {
    const svgBlob = new Blob([wrappedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    return await new Promise<string>((resolve) => {
      let resolved = false;

      const finishFallback = () => {
        if (!resolved) {
          resolved = true;
          try { URL.revokeObjectURL(svgUrl); } catch {}
          resolve(renderFallback());
        }
      };

      // 400ms 超时保护，兼顾复杂排版与异步解码
      const timer = setTimeout(finishFallback, 400);

      img.onload = () => {
        if (resolved) return;
        clearTimeout(timer);
        try {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          URL.revokeObjectURL(svgUrl);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolved = true;
          resolve(dataUrl);
        } catch {
          finishFallback();
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        finishFallback();
      };

      img.src = svgUrl;
    });
  } catch {
    return renderFallback();
  }
}
