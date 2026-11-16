import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ExportModal } from '../src/components/export/ExportModal';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExportModal UI Specification (ISSUE-024 / CHK-EXP-01 ~ CHK-EXP-05)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockScreen = {
    id: 'scr_member_ui',
    name: '会员中心 · 开通线下会员',
    position: { x: 0, y: 0 },
    measuredHeight: 844,
    htmlContent: '<div data-nid="root01" class="p-4"><p>会员特权</p></div>'
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen as any },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        deviceProfile: 'mobile',
        frameWidth: 390,
        viewportGuideHeight: 844,
        colorMode: 'light',
        showViewportGuide: true
      },
      overrides: {}
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('CHK-EXP-01: renders modal with HTML tab active and manifest sidecar checkbox unchecked by default', async () => {
    await act(async () => {
      root.render(<ExportModal onClose={() => {}} />);
    });

    // 检查标题与 Tab
    expect(container.textContent).toContain('单页交付导出中心');
    expect(container.textContent).toContain('自包含 HTML 单页');
    expect(container.textContent).toContain('高保真 PNG 渲染图');

    // 检查 Manifest 复选框
    const manifestCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(manifestCheckbox).not.toBeNull();
    expect(manifestCheckbox.checked).toBe(false);
    expect(container.textContent).toContain('同时导出 Manifest 元数据侧车文件');
  });

  it('CHK-EXP-01: 点击保存 HTML 只落一个 .html，不被 manifest 覆盖（浏览器环境退回下载）', async () => {
    const downloadedFiles: string[] = [];

    const originalAppendChild = document.body.appendChild.bind(document.body);
    document.body.appendChild = (node: Node) => {
      if ((node as HTMLElement).tagName === 'A') {
        const a = node as HTMLAnchorElement;
        downloadedFiles.push(a.download);
      }
      return originalAppendChild(node);
    };

    try {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });

      // 找到下载按钮并点击
      const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('保存独立 HTML 文件')
      );
      expect(downloadBtn).toBeDefined();

      await act(async () => {
        downloadBtn!.click();
      });

      // 默认必须且仅下载 .html 文件！绝不静默并发下载 manifest.json
      expect(downloadedFiles.length).toBe(1);
      expect(downloadedFiles[0]).toBe('会员中心 · 开通线下会员.html');
    } finally {
      document.body.appendChild = originalAppendChild;
    }
  });

  it('CHK-EXP-02: 勾选侧车后 .html 与 .manifest.json 依次落盘', async () => {
    const downloadedFiles: string[] = [];

    const originalAppendChild = document.body.appendChild.bind(document.body);
    document.body.appendChild = (node: Node) => {
      if ((node as HTMLElement).tagName === 'A') {
        const a = node as HTMLAnchorElement;
        downloadedFiles.push(a.download);
      }
      return originalAppendChild(node);
    };

    try {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });

      // 勾选 Manifest 侧车选项
      const manifestCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await act(async () => {
        manifestCheckbox.click();
      });
      expect(manifestCheckbox.checked).toBe(true);

      const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('保存独立 HTML 文件')
      );

      await act(async () => {
        downloadBtn!.click();
      });

      // 立即触发 .html
      expect(downloadedFiles).toContain('会员中心 · 开通线下会员.html');

      // 侧车改为 HTML 保存完成后顺序保存，不再依赖 600ms 延时调度
      // (doc/feature/export-save-dialog BR-SAVE-04)
      expect(downloadedFiles).toContain('会员中心 · 开通线下会员.manifest.json');
      expect(downloadedFiles.length).toBe(2);
    } finally {
      document.body.appendChild = originalAppendChild;
    }
  });

  it('CHK-EXP-04: switching to PNG tab reveals scale selection and clip range options', async () => {
    await act(async () => {
      root.render(<ExportModal onClose={() => {}} />);
    });

    const pngTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('高保真 PNG 渲染图')
    );
    expect(pngTabBtn).toBeDefined();

    await act(async () => {
      pngTabBtn!.click();
    });

    expect(container.textContent).toContain('输出倍率 (Resolution Scale)');
    expect(container.textContent).toContain('截取范围');
    expect(container.textContent).toContain('画框整页长图');
    expect(container.textContent).toContain('仅导出首屏');
    expect(container.textContent).toContain('下载高清 PNG 图片');
  });

  it('CHK-EXP-05: displays friendly error banner when PNG export fails, without saving fake blank image', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {}
    })) as any;

    // 模拟 Image 解码失败
    const originalImage = globalThis.Image;
    class MockFailingImage {
      crossOrigin = '';
      onerror: ((e: any) => void) | null = null;
      onload: (() => void) | null = null;
      private _src = '';
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onerror) this.onerror(new Error('Decode failed'));
        }, 10);
      }
      get src() {
        return this._src;
      }
    }
    (globalThis as any).Image = MockFailingImage;

    const downloadedFiles: string[] = [];
    const originalAppendChild = document.body.appendChild.bind(document.body);
    document.body.appendChild = (node: Node) => {
      if ((node as HTMLElement).tagName === 'A') {
        const a = node as HTMLAnchorElement;
        downloadedFiles.push(a.download);
      }
      return originalAppendChild(node);
    };

    try {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });

      // 切换到 PNG Tab
      const pngTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('高保真 PNG 渲染图')
      );
      await act(async () => {
        pngTabBtn!.click();
      });

      const exportPngBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('下载高清 PNG 图片')
      );

      await act(async () => {
        exportPngBtn!.click();
      });
      await act(async () => {
        for (let i = 0; i < 40; i++) {
          if (container.textContent?.includes('PNG 渲染失败')) break;
          await new Promise((r) => setTimeout(r, 25));
        }
      });

      // 严禁下载错误空白图片！
      expect(downloadedFiles.length).toBe(0);

      // 必须呈现错误提示横幅
      expect(container.textContent).toContain('PNG 渲染失败');
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      globalThis.Image = originalImage;
      document.body.appendChild = originalAppendChild;
    }
  });
});
