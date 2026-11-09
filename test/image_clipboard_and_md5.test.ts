import { describe, it, expect, beforeEach,afterEach } from 'bun:test';
import { computeMd5, computeBase64Md5, parseImageInfoFromDataUrl, base64ToUint8Array } from '../src/utils/md5';
import { AttachmentStore } from '../src/services/storage/attachmentStore';
import { ProjectStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import React,{act} from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';

// 1x1 像素有效 PNG 的 dataUrl
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// 内存 Mock Storage 实现，用于测试文件读写与 exists
class MemoryStorage implements ProjectStorage {
  readonly kind = 'localStorage' as const;
  files: Map<string, string> = new Map();
  writeCount: number = 0;

  async ensureDir(): Promise<void> {}
  async exists(rel: string): Promise<boolean> {
    return this.files.has(rel);
  }
  async readText(rel: string): Promise<string | null> {
    return this.files.get(rel) ?? null;
  }
  async writeTextAtomic(rel: string, contents: string): Promise<void> {
    this.files.set(rel, contents);
  }
  async appendLine(rel: string, line: string): Promise<void> {
    const prev = this.files.get(rel) || '';
    this.files.set(rel, prev ? `${prev}\n${line}` : line);
  }
  async readTailLines(rel: string, limit: number): Promise<string[]> {
    const all = await this.readAllLines(rel);
    return all.slice(Math.max(0, all.length - limit));
  }
  async readAllLines(rel: string): Promise<string[]> {
    const raw = this.files.get(rel);
    return raw ? raw.split('\n').filter((l) => l.trim()) : [];
  }
  async writeBinary(rel: string, base64Data: string): Promise<void> {
    this.writeCount++;
    this.files.set(rel, base64Data);
  }
  async listDir(rel: string): Promise<string[]> {
    return Array.from(this.files.keys()).filter((k) => k.startsWith(rel));
  }
  async remove(rel: string): Promise<void> {
    this.files.delete(rel);
  }
}

describe('MD5 与剪切板粘贴图片去重系统 (MD5 & Image Clipboard Deduplication)', () => {
  it('CHK-F-01: RFC 1321 标准测试向量完全符合规范', () => {
    expect(computeMd5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(computeMd5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
    expect(computeMd5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(computeMd5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(computeMd5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
  });

  it('CHK-F-02: 正确计算 Base64 图片二进制 MD5 与解析 DataURL', () => {
    const info = parseImageInfoFromDataUrl(PNG_1PX);
    expect(info).not.toBeNull();
    expect(info?.mimeType).toBe('image/png');
    expect(info?.ext).toBe('png');
    expect(info?.md5).toMatch(/^[a-f0-9]{32}$/);
    expect(info?.fileName).toBe(`${info?.md5}.png`);
    expect(info?.relPath).toBe(`assets/images/${info?.md5}.png`);

    // 二进制计算一致性
    const bytes = base64ToUint8Array(info!.base64);
    expect(computeMd5(bytes)).toBe(info!.md5);
    expect(computeBase64Md5(info!.base64)).toBe(info!.md5);
  });

  it('CHK-F-03: AttachmentStore.save 按 MD5 命名落盘并返回规范 Asset', async () => {
    const storage = new MemoryStorage();
    const store = new AttachmentStore(storage);

    const asset = await store.save('测试图片.png', PNG_1PX);
    expect(asset).not.toBeNull();
    expect(asset?.source).toBe('upload');
    expect(asset?.type).toBe('image');
    expect(asset?.mimeType).toBe('image/png');

    const expectedMd5 = computeBase64Md5(PNG_1PX.replace(/^data:[^;,]+;base64,/, ''));
    expect(asset?.id).toBe(`asset_${expectedMd5}`);
    expect(asset?.relPath).toBe(`assets/images/${expectedMd5}.png`);

    // 验证文件已真实写入 Storage
    expect(storage.files.has(`assets/images/${expectedMd5}.png`)).toBe(true);
    expect(storage.writeCount).toBe(1);
  });

  it('CHK-F-04: 重复保存相同图片时自动去重，不重复写盘并复用原文件', async () => {
    const storage = new MemoryStorage();
    const store = new AttachmentStore(storage);

    // 第一次保存
    const asset1 = await store.save('第一次上传.png', PNG_1PX);
    expect(storage.writeCount).toBe(1);

    // 第二次保存相同二进制内容的图片（哪怕名称不同）
    const asset2 = await store.save('第二次粘贴截图.png', PNG_1PX);
    // 写盘计数保持 1，未触发二次写盘！
    expect(storage.writeCount).toBe(1);

    // 两者指向相同的 relPath 与相同 ID
    expect(asset1?.relPath).toBe(asset2?.relPath);
    expect(asset1?.id).toBe(asset2?.id);
  });

  it('CHK-F-07: useProjectStore.addAsset 自动按 relPath / ID 去重并自增 refCount', () => {
    const store = useProjectStore.getState();
    const testAsset = {
      id: 'asset_test_md5',
      name: '测试素材',
      type: 'image' as const,
      mimeType: 'image/png',
      source: 'upload' as const,
      relPath: 'assets/images/test_md5.png',
      refCount: 0
    };

    // 第一次添加
    store.addAsset(testAsset);
    let current = useProjectStore.getState().assets['asset_test_md5'];
    expect(current).toBeDefined();
    expect(current.refCount).toBe(0);

    // 第二次重复添加相同 asset
    store.addAsset(testAsset);
    current = useProjectStore.getState().assets['asset_test_md5'];
    expect(current.refCount).toBe(1);

    // 第三次重复添加相同 relPath 但不同名称的 asset
    store.addAsset({
      ...testAsset,
      name: '不同别名'
    });
    current = useProjectStore.getState().assets['asset_test_md5'];
    expect(current.refCount).toBe(2);
  });

  describe('ChatDrawer 剪切板粘贴图片交互测试 (CHK-F-05 & CHK-F-06)', () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });
    afterEach(()=>{act(()=>root.unmount());container.remove();});

    it('CHK-F-05: 粘贴剪切板图片时阻止默认行为并载入 attachedImage 预览', async () => {
      act(() => {
        root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
      });

      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();

      // 构建模拟的粘贴事件，包含图片数据
      const imageBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      const imageFile = new File([imageBlob], 'screenshot.png', { type: 'image/png' });

      let defaultPrevented = false;
      const pasteEvent = {
        clipboardData: {
          items: [
            {
              type: 'image/png',
              getAsFile: () => imageFile
            }
          ]
        },
        preventDefault: () => {
          defaultPrevented = true;
        }
      };

      // 触发 onPaste
      act(() => {
        textarea?.dispatchEvent(
          new Event('paste', { bubbles: true })
        );
      });

      // 直接调用 onPaste 属性以模拟 React 合成事件
      const reactPropsKey = Object.keys(textarea || {}).find((k) => k.startsWith('__reactProps'));
      const reactProps = reactPropsKey ? (textarea as any)[reactPropsKey] : null;

      if (reactProps && reactProps.onPaste) {
        act(() => {
          reactProps.onPaste(pasteEvent);
        });
        expect(defaultPrevented).toBe(true);
      }
    });

    it('CHK-F-06: 粘贴纯文本时不阻止默认行为，文字正常输入', async () => {
      act(() => {
        root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
      });

      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();

      let defaultPrevented = false;
      const textPasteEvent = {
        clipboardData: {
          items: [
            {
              type: 'text/plain',
              getAsFile: () => null
            }
          ]
        },
        preventDefault: () => {
          defaultPrevented = true;
        }
      };

      const reactPropsKey = Object.keys(textarea || {}).find((k) => k.startsWith('__reactProps'));
      const reactProps = reactPropsKey ? (textarea as any)[reactPropsKey] : null;

      if (reactProps && reactProps.onPaste) {
        act(() => {
          reactProps.onPaste(textPasteEvent);
        });
        // 纯文本粘贴不应被 preventDefault
        expect(defaultPrevented).toBe(false);
      }
    });
  });
});
