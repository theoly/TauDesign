/** 用户确认保存的工程需求资料；上传原文独立保留。 */
export interface ProjectDocumentEntry {
  id: string;
  title: string;
  content: string;
  source: 'manual' | 'upload' | 'ai';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  originalContent?: string;
  sourceFingerprint?: string;
  /** 文件缺失时禁用，必须显式修复后才可参与生成。 */
  missing?: boolean;
}

export const MAX_PROJECT_DOCUMENTS = 20;
export const MAX_PROJECT_DOCUMENT_BYTES = 64 * 1024;
export function isSafeProjectDocumentId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
}

export function validateProjectDocument(doc: ProjectDocumentEntry): void {
  if (!isSafeProjectDocumentId(doc.id)) throw new Error('文档 ID 不安全');
  if (typeof doc.title !== 'string' || !doc.title.trim()) throw new Error('文档标题不能为空');
  if (!['manual', 'upload', 'ai'].includes(doc.source)) throw new Error('文档来源无效');
  for (const text of [doc.content, doc.originalContent]) {
    if (text !== undefined && (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_PROJECT_DOCUMENT_BYTES)) {
      throw new Error('文档正文不得超过 64KiB');
    }
  }
  if (typeof doc.content !== 'string') throw new Error('文档正文无效');
}
