import type { DeliveryRecord } from './deliveryRepository';
import type { ProjectStorage } from './projectStorage';
import { isPagePreview, PagePreviewCapture, type PagePreview, type PagePreviewDeps } from './pagePreview';
export { inspectPreviewPng } from './pagePreview';
export type DeliveryPreview = PagePreview;

export function deliveryPreviewPath(id: string): string {
  if (!/^delivery-[a-z0-9-]+$/.test(id)) throw new Error('预览所属交付 ID 无效。');
  return `assets/images/delivery-preview-${id}.png`;
}
export function isDeliveryPreview(value: unknown, id: string, fingerprint: string): value is DeliveryPreview {
  return isPagePreview(value, fingerprint) && (value.status === 'failed' || value.relPath === deliveryPreviewPath(id));
}
export const DeliveryPreviewCapture = {
  capture(record: DeliveryRecord, storage: ProjectStorage, deps: PagePreviewDeps = {}): Promise<DeliveryPreview> {
    return PagePreviewCapture.capture({ screen: { ...record.after, position: { x: 0, y: 0 } },
      designSystem: record.designSystem, settings: record.settings, overrides: record.overrides, assets: record.assets,
      relPath: deliveryPreviewPath(record.id), candidateFingerprint: record.resultFingerprint,
      contextFingerprint: record.candidate.validationEvidence!.contextFingerprint }, storage, deps);
  }
};
