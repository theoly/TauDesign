import {sha256,referenceBytes} from '../../utils/referenceImagePreparation';
import { ProjectStorage } from './projectStorage';
import type { Asset } from '../../types/project';
import { parseImageInfoFromDataUrl } from '../../utils/md5';

/**
 * 会话附件落盘与去重 (A2 / T-AE-32 / BR-IMG-02)。
 *
 * 1. 图片写入 assets/images/，以文件二进制 MD5 命名（assets/images/{md5}.{ext}）；
 * 2. 重复上传或粘贴相同图片时，基于 storage.exists 自动检测并复用既有文件，不重复写盘；
 * 3. 顺带收益是附件纳入既有的 refCount 与 cleanupUnusedAssets 体系。
 */

export const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

export interface ParsedDataUrl {
  mimeType: string;
  base64: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  return m ? { mimeType: m[1], base64: m[2] } : null;
}

/** base64 长度 → 近似字节数 */
export function approxBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export class AttachmentStore {
  constructor(private readonly storage: ProjectStorage) {}

  async saveReference(name:string,dataUrl:string):Promise<Asset|null>{
    try{const info=referenceBytes(dataUrl),hash=await sha256(info.bytes),relPath=`assets/images/${hash}.${info.ext}`;await this.storage.ensureDir('assets/images');
      if(!await this.storage.exists(relPath))await this.storage.writeBinary(relPath,dataUrl.slice(dataUrl.indexOf(',')+1));
      const actual=await this.storage.readBinary(relPath);if(actual===null||await sha256(referenceBytes(`data:${info.mime};base64,${actual}`).bytes)!==hash)throw Error('参考图片内容校验失败');
      return {id:`asset_sha256_${hash}`,name,type:'image',mimeType:info.mime,source:'upload',relPath,refCount:0};
    }catch(error){console.warn('[reference] 独立图片保存失败',error);return null;}
  }

  /**
   * 落盘一张附件，按内容二进制 MD5 命名并去重。
   * 若相同 MD5 文件已存在，则复用原文件，不重复写盘。
   */
  async save(name: string, dataUrl: string): Promise<Asset | null> {
    const info = parseImageInfoFromDataUrl(dataUrl);
    if (!info) return null;

    const id = `asset_${info.md5}`;
    const relPath = info.relPath; // assets/images/${info.md5}.${info.ext}

    try {
      await this.storage.ensureDir('assets/images');
      const alreadyExists = await this.storage.exists(relPath);
      if (!alreadyExists) {
        await this.storage.writeBinary(relPath, info.base64);
      }
    } catch (e) {
      console.warn('[attachment] 落盘失败，本轮附件不入库', e);
      return null;
    }

    return {
      id,
      name,
      type: info.mimeType === 'image/svg+xml' ? 'svg_icon' : 'image',
      mimeType: info.mimeType,
      source: 'upload',
      relPath,
      refCount: 0
    };
  }

  /**
   * 读取一张附件并返回用于在前端渲染的 Data URL。
   * 若文件不存在或读取异常返回 null。
   */
  async readDataUrl(relPath: string): Promise<string | null> {
    try {
      const exists = await this.storage.exists(relPath);
      if (!exists) return null;

      const base64 = await this.storage.readBinary(relPath);
      if (!base64) return null;

      const ext = relPath.split('.').pop()?.toLowerCase() || 'png';
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'svg'
          ? 'image/svg+xml'
          : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
          ? 'image/gif'
          : 'image/png';

      return `data:${mime};base64,${base64}`;
    } catch (e) {
      console.warn('[attachment] 读取附件 DataURL 失败:', relPath, e);
      return null;
    }
  }
}
