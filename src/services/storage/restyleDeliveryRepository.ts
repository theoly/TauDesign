import type { DesignSystem } from '../../types/designSystem';
import type { Asset, ComponentDefinition, DesignLibraryBinding, DesignSystemOrigin, ProjectSettings, Screen, StyleOverride } from '../../types/project';
import type { RestyleOutcome } from '../ai/restyleService';
import type { RestyleValidationReport } from '../ai/restyleValidation';
import { contentFingerprint } from '../ai/designWorkflow';
import type { ProjectStorage } from './projectStorage';
import { deliveryPreviewPath, isDeliveryPreview } from './deliveryPreview';
import type { PagePreview } from './pagePreview';
import {isWorkflowValidationReport} from '../ai/workflowValidation';

export type RestylePageSnapshot = Pick<Screen, 'id' | 'name' | 'htmlContent' | 'scopedCss' | 'metadata'>;
export interface RestyleDeliveryRecord {
  schemaVersion: 1; id: string; projectId: string; batchId?: string; createdAt: number; completedAt?: number;
  status: 'prepared' | 'applied' | 'aborted'; reason?: string;
  outcome: Omit<RestyleOutcome, 'validation' | 'delivery'>;
  validation: RestyleValidationReport;
  pages: Array<{ before: RestylePageSnapshot; after: RestylePageSnapshot; preview?: PagePreview }>;
  component?: { before: ComponentDefinition; after: ComponentDefinition };
  designSystem: DesignSystem; settings: ProjectSettings; designSystemOrigin?: DesignSystemOrigin;
  designLibraryBinding?: DesignLibraryBinding; overrides: Record<string, StyleOverride>; assets: Asset[];
}
export interface RestyleDeliveryReceipt { id: string; status: 'applied' | 'prepared'; message?: string }

const directory = 'deliveries/restyle';
const validId = (id: string) => /^restyle-[a-z0-9-]+$/.test(id);
const maxLength = 24_000_000;
export function restylePagePreviewId(id: string, index: number): string {
  if (!validId(id) || !Number.isInteger(index) || index < 0) throw new Error('重塑预览归属无效。');
  return `delivery-${id}-${index}`;
}
export function restylePagePreviewPath(id: string, index: number): string {
  return deliveryPreviewPath(restylePagePreviewId(id, index));
}
function recordPath(id: string): string {
  if (!validId(id)) throw new Error('重塑交付 ID 无效。');
  return `${directory}/${id}.json`;
}
function validRecord(value: unknown, projectId: string): value is RestyleDeliveryRecord {
  const r = value as RestyleDeliveryRecord | null;
  const page = (p?: RestylePageSnapshot) => p && typeof p.id === 'string' && typeof p.name === 'string' &&
    typeof p.htmlContent === 'string' && (p.scopedCss === undefined || typeof p.scopedCss === 'string');
  const passedQuality = (q:RestyleValidationReport['pages'][number]['quality']) => q?.passed === true && Array.isArray(q.findings) &&
    q.findings.every(f=>f && f.severity === 'warning' && typeof f.code === 'string' && typeof f.message === 'string' && typeof f.actual === 'string' && typeof f.expected === 'string');
  if (!r || r.schemaVersion !== 1 || typeof r.id !== 'string' || !validId(r.id) || r.projectId !== projectId ||
    !Number.isFinite(r.createdAt) || !['prepared','applied','aborted'].includes(r.status) ||
    (r.reason !== undefined && typeof r.reason !== 'string') || (r.batchId !== undefined && typeof r.batchId !== 'string') ||
    !r.outcome || r.outcome.status !== 'applied' || !r.outcome.target || !['screen','component'].includes(r.outcome.target.kind) ||
    typeof r.outcome.target.id !== 'string' || typeof r.outcome.target.name !== 'string' || typeof r.outcome.target.html !== 'string' || typeof r.outcome.html !== 'string' ||
    !r.validation || r.validation.status !== 'passed' || !Number.isFinite(r.validation.checkedAt) || typeof r.validation.contextFingerprint !== 'string' ||
    !Array.isArray(r.validation.assetIssues) || r.validation.assetIssues.length || !Array.isArray(r.validation.pages) ||
    !r.validation.pages.length || (r.validation.workflow!==undefined&&!isWorkflowValidationReport(r.validation.workflow)) ||
    !Array.isArray(r.pages) || !r.settings || !['pc','mobile'].includes(r.settings.deviceProfile) ||
    (r.settings.referenceDevice !== undefined && (!r.settings.referenceDevice || typeof r.settings.referenceDevice.name !== 'string')) ||
    !r.designSystem || typeof r.designSystem.name !== 'string' ||
    (r.designSystemOrigin !== undefined && (!r.designSystemOrigin || (r.designSystemOrigin.sourceName !== undefined && typeof r.designSystemOrigin.sourceName !== 'string'))) ||
    !r.overrides || !Array.isArray(r.assets)) return false;
  if (!r.validation.pages.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.candidateFingerprint === 'string' &&
    passedQuality(p.source) && passedQuality(p.quality) &&
    p.render?.status === 'complete' && Number.isFinite(p.render.inspected) && Array.isArray(p.render.findings) &&
    p.render.findings.every(f => f && f.severity === 'warning' && typeof f.code === 'string' && typeof f.message === 'string' &&
      typeof f.actual === 'string' && typeof f.expected === 'string'))) return false;
  const matches = (id: string, html: string) => r.validation.pages.some(p => p.id === id && p.candidateFingerprint === contentFingerprint(html));
  if (!r.pages.every(p => p && page(p.before) && page(p.after) && p.before.id === p.after.id && matches(p.after.id,p.after.htmlContent)) ||
    new Set(r.pages.map(p=>p.after.id)).size !== r.pages.length ||
    new Set(r.validation.pages.map(p=>p.id)).size !== r.validation.pages.length) return false;
  if (r.outcome.target.kind === 'screen') return !r.component && r.pages.length === 1 && r.pages[0].after.id === r.outcome.target.id && r.validation.pages.length === 1;
  return Boolean(r.component && r.component.before.id === r.outcome.target.id && r.component.after.id === r.outcome.target.id &&
    r.component.before.templateHtml === r.outcome.target.html && r.component.after.templateHtml === r.outcome.html &&
    typeof r.component.before.name === 'string' && typeof r.component.after.name === 'string' &&
    matches(`template-${r.component.after.id}`,r.component.after.templateHtml) && r.validation.pages.length === r.pages.length + 1);
}

/** One canonical event contains the entire checked component/page write set. Undo never deletes it. */
export class RestyleDeliveryRepository {
  constructor(private readonly storage: ProjectStorage, private readonly projectId: string) {}
  async get(id:string):Promise<RestyleDeliveryRecord|null>{
    const raw=await this.storage.readText(recordPath(id));if(!raw||raw.length>maxLength)return null;
    try{const record=JSON.parse(raw);return validRecord(record,this.projectId)&&record.id===id?record:null;}catch{return null;}
  }
  async prepare(record: RestyleDeliveryRecord): Promise<void> {
    if (!validRecord(record,this.projectId) || record.status !== 'prepared' || record.pages.some((p,index) =>
      p.preview !== undefined && !isDeliveryPreview(p.preview,restylePagePreviewId(record.id,index),contentFingerprint(p.after.htmlContent)))) throw new Error('重塑交付快照不完整，原页面未修改。');
    const raw = JSON.stringify(record), path = recordPath(record.id);
    if (raw.length > maxLength) throw new Error('重塑交付档案过大，请分批处理。');
    if (await this.storage.exists(path)) throw new Error('重塑交付 ID 冲突。');
    await this.storage.ensureDir(directory);await this.storage.writeTextAtomic(path,raw);
  }
  async finish(record: RestyleDeliveryRecord, status: 'applied' | 'aborted', reason?: string): Promise<void> {
    await this.storage.writeTextAtomic(recordPath(record.id),JSON.stringify({...record,status,completedAt:Date.now(),...(reason ? {reason} : {})}));
  }
  async list(options: { screenId?: string; limit?: number } = {}): Promise<{records: RestyleDeliveryRecord[]; invalidFiles: number; hasMore: boolean}> {
    const files = (await this.storage.listDir(directory)).filter(name => /^restyle-[a-z0-9-]+\.json$/.test(name)).sort().reverse();
    const selected = files.slice(0,Math.max(1,Math.min(options.limit ?? 10,200)));
    const records: RestyleDeliveryRecord[] = [];let invalidFiles = 0;
    for (let start=0;start<selected.length;start+=4) {
      const batch = await Promise.all(selected.slice(start,start+4).map(async name => {
        try {
          const raw = await this.storage.readText(`${directory}/${name}`);
          if (!raw || raw.length > maxLength) return null;
          const record = JSON.parse(raw);
          if (!validRecord(record,this.projectId) || `${record.id}.json` !== name) return null;
          record.pages.forEach((p,index) => {
            if (p.preview !== undefined && !isDeliveryPreview(p.preview,restylePagePreviewId(record.id,index),contentFingerprint(p.after.htmlContent))) p.preview = {
              status:'failed',scope:'first-screen',capturedAt:record.createdAt,candidateFingerprint:contentFingerprint(p.after.htmlContent),
              contextFingerprint:record.validation.contextFingerprint,reason:'重塑预览记录损坏或归属不匹配。'
            };
          });
          return record;
        } catch {return null;}
      }));
      for (const record of batch) if (!record) invalidFiles++;else if (!options.screenId || record.pages.some(p=>p.after.id === options.screenId)) records.push(record);
    }
    return {records:records.sort((a,b)=>b.createdAt-a.createdAt),invalidFiles,hasMore:files.length>selected.length};
  }
}
