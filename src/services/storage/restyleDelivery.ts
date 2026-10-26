import type { DesignLibraryBinding, DesignSystemOrigin, Screen } from '../../types/project';
import type { RestyleOutcome } from '../ai/restyleService';
import type { CheckedRestylePlan, RestyleValidationState } from '../ai/restyleValidation';
import { contentFingerprint } from '../ai/designWorkflow';
import type { ProjectStorage } from './projectStorage';
import { PagePreviewCapture } from './pagePreview';
import { restylePagePreviewPath, type RestyleDeliveryRecord, type RestylePageSnapshot } from './restyleDeliveryRepository';

function snapshot(screen: Screen): RestylePageSnapshot {
  const {id,name,htmlContent,scopedCss,metadata} = screen;return {id,name,htmlContent,scopedCss,metadata};
}
export function buildRestyleDelivery(state: RestyleValidationState & {designSystemOrigin?:DesignSystemOrigin;designLibraryBinding?:DesignLibraryBinding},
  outcome: RestyleOutcome, plan: CheckedRestylePlan): RestyleDeliveryRecord {
  const {validation:_oldValidation,delivery:_oldDelivery,...execution} = outcome;
  return structuredClone({schemaVersion:1,id:`restyle-${Date.now().toString(36)}-${crypto.randomUUID()}`,projectId:state.id,
    batchId:outcome.batchId,createdAt:Date.now(),status:'prepared',outcome:execution,validation:plan.validation,
    pages:plan.screens.map(screen=>({before:snapshot(state.screens[screen.id]),after:snapshot(screen)})),
    ...(plan.component ? {component:{before:state.components[plan.component.id],after:plan.component}} : {}),
    designSystem:state.designSystem,settings:state.settings,designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,
    assets:Object.values(state.assets),overrides:state.overrides});
}
export async function captureRestylePreviews(record: RestyleDeliveryRecord, storage: ProjectStorage, isCurrent:()=>boolean): Promise<void> {
  for (const [index,page] of record.pages.entries()) {
    if (!isCurrent()) throw new Error('生成重塑预览前工程已变化或执行已取消。');
    page.preview = await PagePreviewCapture.capture({screen:{...page.after,position:{x:0,y:0}},
      settings:record.settings,designSystem:record.designSystem,assets:record.assets,
      overrides:Object.fromEntries(Object.entries(record.overrides).filter(([key])=>key.startsWith(`${page.after.id}:`))),
      relPath:restylePagePreviewPath(record.id,index),candidateFingerprint:contentFingerprint(page.after.htmlContent),
      contextFingerprint:record.validation.contextFingerprint},storage,{isCurrent});
    if (!isCurrent()) throw new Error('生成重塑预览期间工程已变化或执行已取消。');
  }
}
export async function removeUnarchivedRestylePreviews(record: RestyleDeliveryRecord, storage: ProjectStorage): Promise<void> {
  await Promise.all(record.pages.flatMap((page,index)=>page.preview?.status === 'ready' && page.preview.relPath === restylePagePreviewPath(record.id,index)
    ? [storage.remove(page.preview.relPath).catch(()=>{})] : []));
}
