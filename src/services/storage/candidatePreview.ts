import { isPagePreview, type PagePreview } from './pagePreview';

export function validCandidateId(id: unknown): id is string {
  return typeof id === 'string' && /^candidate-[a-z0-9-]+$/.test(id);
}
export function candidatePreviewPath(id: string): string {
  if (!validCandidateId(id)) throw new Error('候选预览 ID 无效。');
  return `assets/images/candidate-preview-${id}-${crypto.randomUUID()}.png`;
}
export function isCandidatePreviewPath(path: string, id: unknown): boolean {
  return validCandidateId(id) && path.startsWith(`assets/images/candidate-preview-${id}-`) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/.test(path.slice(`assets/images/candidate-preview-${id}-`.length));
}
export function isCandidatePreview(value: unknown, id: unknown, fingerprint: string): value is PagePreview {
  return isPagePreview(value, fingerprint) && (value.status === 'failed' || isCandidatePreviewPath(value.relPath, id));
}
