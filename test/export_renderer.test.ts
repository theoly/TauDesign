import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  buildStandaloneHtml,
  buildArtifactManifest,
  buildExportSvg,
  downloadBlob,
  downloadDataUrl,
  renderScreenToPngDataUrl
} from '../src/utils/exportRenderer';
import { Screen, ProjectSettings } from '../src/types/project';
import { getBaseCss } from '../src/styles/baseCss';

describe('ExportRenderer Specification (BR-01 / BR-02 / ISSUE-024)', () => {
  const mockScreen: Screen = {
    id: 'scr_member_center',
    name: '会员中心 · 开通线下会员',
    position: { x: 100, y: 150 },
    measuredHeight: 844,
    htmlContent: `
      <div data-nid="root1" class="col min-h-screen bg-base safe-top">
        <header data-nid="hdr1" class="appbar">
          <button data-nid="btn1" class="tap-target">返回</button>
          <h2 data-nid="title1">会员中心 · 开通线下会员</h2>
          <div class="tap-target"></div>
        </header>
        <main data-nid="main1" class="flex-1 p-4 col gap-4">
          <div data-nid="card1" class="card p-4 col gap-2">
            <img src="https://example.com/vip.png">
            <input type="text" placeholder="输入推荐码 & 优惠券">
            <br>
            <hr>
            <p>特权说明 & 细则 &copy; 2026</p>
          </div>
        </main>
        <footer data-nid="ftr1" class="cta-fixed p-4">
          <button data-nid="btn2" class="btn btn-primary w-full">立即开通</button>
        </footer>
      </div>
    `
  };

  const mockSettings: ProjectSettings = {
    deviceProfile: 'mobile',
    frameWidth: 390,
    viewportGuideHeight: 844,
    colorMode: 'light'
  };

  const mockTokensCss = ':root { --color-bg: #ffffff; --color-primary: #2563eb; }';
  const mockBaseCss = getBaseCss('mobile');
  const mockOverrides = '[data-nid="title1"] { color: #2563eb !important; }';

  describe('CHK-EXP-01: Standalone HTML Assembly', () => {
    it('produces standalone zero-dependency HTML with stripped data-nid and inlined styles', () => {
      const html = buildStandaloneHtml(mockScreen, {
        tokensCss: mockTokensCss,
        baseCss: mockBaseCss,
        screenOverrides: mockOverrides
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>会员中心 · 开通线下会员</title>');
      expect(html).toContain(mockTokensCss);
      expect(html).toContain(mockBaseCss);
      // Export removes engineering NIDs while preserving effective L4 styling.
      expect(html).toContain(mockOverrides.replace('[data-nid=', '[data-export-id='));
      expect(html).toContain('data-export-id="title1"');

      // 验证 body 内部的 DOM 节点上的 data-nid 已被剥离干净
      const bodyContent = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
      expect(bodyContent).not.toContain('data-nid=');
      // 内容与结构必须保留
      expect(bodyContent).toContain('会员中心 · 开通线下会员');
      expect(bodyContent).toContain('立即开通');
    });
  });

  describe('CHK-EXP-02: Artifact Manifest Sidecar Model', () => {
    it('constructs well-formed manifest with matching screen identity and metadata', () => {
      const manifest = buildArtifactManifest(mockScreen, mockSettings);

      expect(manifest.id).toBe('scr_member_center');
      expect(manifest.kind).toBe('screen');
      expect(manifest.renderer).toBe('html-iframe');
      expect(manifest.entry).toBe('screens/scr_member_center.html');
      expect(manifest.title).toBe('会员中心 · 开通线下会员');
      expect(manifest.device).toBe('mobile');
      expect(manifest.metadata?.measuredHeight).toBe(844);
    });
  });

  describe('CHK-EXP-03: Strict XHTML Serialization in SVG (Fixing Parsererror)', () => {
    it('converts void elements and special characters without XML parsererror', () => {
      const svgString = buildExportSvg(mockScreen, {
        tokensCss: mockTokensCss,
        baseCss: mockBaseCss,
        screenOverrides: mockOverrides,
        width: 390,
        height: 844,
        bgColor: '#ffffff'
      });

      expect(svgString).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svgString).toContain('<foreignObject');
      expect(svgString).toContain('xmlns="http://www.w3.org/1999/xhtml"');

      // 验证 void 标签已转换为自闭合标签
      expect(svgString).toContain('<img');
      expect(svgString).toContain('/>');
      expect(svgString).toContain('<input');
      expect(svgString).toContain('<br />');
      expect(svgString).toContain('<hr />');

      // 严格验证：将生成的 SVG 字符串喂入 XML 解析器，必须 0 处 parsererror！
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(svgString, 'image/svg+xml');
      const parserErrors = xmlDoc.getElementsByTagName('parsererror');
      expect(parserErrors.length).toBe(0);
    });

    it('injects matching background color to prevent transparent or white bleed through', () => {
      const darkSvg = buildExportSvg(mockScreen, {
        tokensCss: ':root { --color-bg: #0f172a; }',
        baseCss: mockBaseCss,
        screenOverrides: '',
        width: 390,
        height: 844,
        bgColor: '#0f172a'
      });

      expect(darkSvg).toContain('#0f172a');
    });

    it('inlines data:image/svg+xml as native SVG elements with proper viewBox to prevent layout collapse in WebKit (ISSUE-025)', () => {
      const svgDataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='272'%3E%3Crect width='220' height='272' fill='%23E3A78F'/%3E%3C/svg%3E";
      const screenWithCards: Screen = {
        id: 'scr_cards',
        name: '卡片页',
        position: { x: 0, y: 0 },
        measuredHeight: 844,
        htmlContent: `
          <div class="col">
            <article class="r-lg overflow-hidden" style="position:relative">
              <img class="full-img" alt="用户" src="${svgDataUrl}">
              <span style="position:absolute;top:8px">在线</span>
            </article>
          </div>
        `
      };

      const resultSvg = buildExportSvg(screenWithCards, {
        tokensCss: mockTokensCss,
        baseCss: mockBaseCss,
        screenOverrides: '',
        width: 390,
        height: 844,
        bgColor: '#ffffff'
      });

      // 验证 img 标签已替换为原生 svg
      expect(resultSvg).not.toContain('<img');
      expect(resultSvg).toContain('<svg');
      expect(resultSvg).toContain('class="full-img"');
      expect(resultSvg).toContain('viewBox="0 0 220 272"');
      // 验证防坍塌样式已注入
      expect(resultSvg).toContain('svg.full-img, img.full-img { width: 100% !important; height: auto !important; display: block !important; }');
    });

    it('scales the XHTML paint layer at CSS layout width for high-DPI output (ISSUE-025)', () => {
      const scale2Svg = buildExportSvg(mockScreen, {
        tokensCss: mockTokensCss,
        baseCss: mockBaseCss,
        screenOverrides: '',
        width: 390,
        height: 844,
        scale: 2,
        bgColor: '#ffffff'
      });

      // 使用物理像素坐标及 HTML 绘制层缩放；CSS 布局宽度仍是390，不能靠放大1x位图兜底。
      expect(scale2Svg).toContain('width="780"');
      expect(scale2Svg).toContain('height="1688"');
      expect(scale2Svg).toContain('viewBox="0 0 780 1688"');
      const doc=new DOMParser().parseFromString(scale2Svg,'image/svg+xml');
      const container=doc.querySelector('foreignObject > div') as HTMLElement;
      expect(container.style.width).toBe('390px');
      expect(container.style.height).toBe('844px');
      expect(container.style.transform).toBe('scale(2)');
      expect(container.style.transformOrigin).toBe('0 0');
    });
  });

  describe('CHK-EXP-04 / CHK-EXP-05: PNG Rasterization and Error Handling', () => {
    let originalGetContext: any;
    let originalToDataURL: any;

    beforeEach(() => {
      originalGetContext = HTMLCanvasElement.prototype.getContext;
      originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

      HTMLCanvasElement.prototype.getContext = (() => ({
        fillStyle: '',
        fillRect: () => {},
        drawImage: () => {}
      })) as any;

      HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,mockPngData') as any;
    });

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    });

    it('successfully rasterizes to PNG data URL on image load', async () => {
      const originalImage = globalThis.Image;
      class MockSuccessImage {
        crossOrigin = '';
        onerror: ((e: any) => void) | null = null;
        onload: (() => void) | null = null;
        private _src = '';
        set src(val: string) {
          this._src = val;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 10);
        }
        get src() {
          return this._src;
        }
      }

      (globalThis as any).Image = MockSuccessImage;

      try {
        const dataUrl = await renderScreenToPngDataUrl(mockScreen, {
          tokensCss: mockTokensCss,
          baseCss: mockBaseCss,
          screenOverrides: mockOverrides,
          width: 390,
          height: 844,
          scale: 2,
          bgColor: '#ffffff'
        });

        expect(dataUrl).toBe('data:image/png;base64,mockPngData');
      } finally {
        globalThis.Image = originalImage;
      }
    });

    it('rejects with real Error when image loading fails, strictly forbidding fake blank image export', async () => {
      // 模拟 Image.prototype.src 触发 onerror
      const originalImage = globalThis.Image;
      class MockBrokenImage {
        crossOrigin = '';
        onerror: ((e: any) => void) | null = null;
        onload: (() => void) | null = null;
        private _src = '';
        set src(val: string) {
          this._src = val;
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('Simulated image decode failure'));
          }, 10);
        }
        get src() {
          return this._src;
        }
      }

      (globalThis as any).Image = MockBrokenImage;

      try {
        let threw = false;
        await renderScreenToPngDataUrl(mockScreen, {
          tokensCss: mockTokensCss,
          baseCss: mockBaseCss,
          screenOverrides: mockOverrides,
          width: 390,
          height: 844,
          scale: 2,
          bgColor: '#ffffff'
        }).catch((err) => {
          threw = true;
          expect(err.message).toContain('PNG 渲染失败');
        });

        expect(threw).toBe(true);
      } finally {
        globalThis.Image = originalImage;
      }
    });
  });

  describe('Safe Download Execution', () => {
    it('appends anchor to body, clicks it, and safely removes it', () => {
      let clicked = false;
      const originalAppendChild = document.body.appendChild.bind(document.body);

      let appendedAnchor: HTMLAnchorElement | null = null;

      document.body.appendChild = (node: Node) => {
        if ((node as HTMLElement).tagName === 'A') {
          appendedAnchor = node as HTMLAnchorElement;
          (node as HTMLAnchorElement).click = () => {
            clicked = true;
          };
        }
        return originalAppendChild(node);
      };

      const testBlob = new Blob(['test content'], { type: 'text/plain' });
      downloadBlob(testBlob, 'test.txt');

      expect(clicked).toBe(true);
      expect(appendedAnchor).not.toBeNull();
      expect(appendedAnchor!.download).toBe('test.txt');

      document.body.appendChild = originalAppendChild;
    });

    it('downloads data URL safely', () => {
      let clicked = false;
      const originalAppendChild = document.body.appendChild.bind(document.body);
      let appendedAnchor: HTMLAnchorElement | null = null;

      document.body.appendChild = (node: Node) => {
        if ((node as HTMLElement).tagName === 'A') {
          appendedAnchor = node as HTMLAnchorElement;
          (node as HTMLAnchorElement).click = () => {
            clicked = true;
          };
        }
        return originalAppendChild(node);
      };

      downloadDataUrl('data:image/png;base64,abc', 'test.png');

      expect(clicked).toBe(true);
      expect(appendedAnchor).not.toBeNull();
      expect(appendedAnchor!.download).toBe('test.png');

      document.body.appendChild = originalAppendChild;
    });
  });
});
