import type { DesignSystem } from '../../types/designSystem';
import type { Asset, ProjectSettings, Screen, StyleOverride } from '../../types/project';
import { contentFingerprint } from '../ai/designWorkflow';
import { isCandidateValidationEvidence } from '../ai/candidateValidation';
import type { StagedCandidateData } from './candidateRepository';
import type { ProjectStorage } from './projectStorage';
import { isDeliveryPreview, type DeliveryPreview } from './deliveryPreview';
import {sameRecordedHtml,taskProvenanceIssue} from '../ai/taskProvenance';
import {isPageRepairRecord} from '../ai/pageRepairRecord';
import {repairGuidanceIssue} from '../ai/designKnowledge/repairTrace';
import {draftExecutionIssue} from '../ai/draftExecutionSource';
import type {RuleEvidencePurpose} from '../ai/designKnowledge/safety';
import {guidancePacketIssue} from '../ai/designKnowledge/receipt';

export type DeliveryMode = 'replace' | 'force-replace' | 'keep-both' | 'confirm-structure-keep-both' | 'confirm-structure-replace';
type PageSnapshot = Pick<Screen, 'id' | 'name' | 'htmlContent' | 'scopedCss' | 'metadata'>;

export interface DeliveryRecord {
  schemaVersion: 1;
  id: string;
  projectId: string;
  createdAt: number;
  completedAt?: number;
  status: 'prepared' | 'applied' | 'aborted';
  reason?: string;
  mode: DeliveryMode;
  before: PageSnapshot;
  after: PageSnapshot;
  resultFingerprint: string;
  candidate: StagedCandidateData;
  designSystem: DesignSystem;
  settings: ProjectSettings;
  overrides: Record<string, StyleOverride>;
  assets: Asset[];
  preview?: DeliveryPreview;
}

const validId = (id: string) => /^delivery-[a-z0-9-]+$/.test(id);
const directory = (screenId: string) => `deliveries/screen-${contentFingerprint(screenId)}`;
function recordPath(screenId: string, id: string): string {
  if (!validId(id)) throw new Error('交付记录 ID 无效。');
  return `${directory(screenId)}/${id}.json`;
}

function validRecord(value: unknown, projectId: string, screenId: string, purpose:RuleEvidencePurpose='history'): value is DeliveryRecord {
  const r = value as DeliveryRecord | null;
  const page = (p: PageSnapshot | undefined) => p && typeof p.id === 'string' && typeof p.name === 'string' &&
    typeof p.htmlContent === 'string' && (p.scopedCss === undefined || typeof p.scopedCss === 'string');
  return Boolean(r && r.schemaVersion === 1 && typeof r.id === 'string' && validId(r.id) && r.projectId === projectId &&
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && ['prepared', 'applied', 'aborted'].includes(r.status) &&
    (r.reason === undefined || typeof r.reason === 'string') &&
    ['replace', 'force-replace', 'keep-both', 'confirm-structure-keep-both', 'confirm-structure-replace'].includes(r.mode) && page(r.before) && page(r.after) && r.after.id === screenId &&
    r.resultFingerprint === contentFingerprint(r.after.htmlContent) &&
    r.candidate && typeof r.candidate.newHtml === 'string' && typeof r.candidate.screenName === 'string' &&
    (r.candidate.modificationRequest === undefined || typeof r.candidate.modificationRequest === 'string') &&
    isCandidateValidationEvidence(r.candidate.validationEvidence) &&
    r.candidate.validationEvidence.candidateFingerprint === contentFingerprint(r.candidate.newHtml)&&sameRecordedHtml(r.candidate.newHtml,r.after.htmlContent)&&
    !taskProvenanceIssue(r.candidate.workflowContract)&&!draftExecutionIssue(r.candidate.executionRecord,r.candidate.newHtml,purpose)&&
    (purpose==='history'||r.candidate.workflowContract===undefined||!guidancePacketIssue(r.candidate.workflowContract))&&
    (r.candidate.workflowContract?.validationPlan===undefined||JSON.stringify(r.candidate.validationEvidence.delivery.workflow?.plan)===JSON.stringify(r.candidate.workflowContract.validationPlan))&&
    (r.candidate.workflowContract===undefined||(r.candidate.workflowContract.operation==='modify'||r.candidate.workflowContract.operation==='restyle')&&
      r.candidate.targetScreenId===r.before.id&&r.candidate.workflowContract.target?.id===r.before.id&&
      r.candidate.workflowContract.target.baselineFingerprint===contentFingerprint(r.before.htmlContent))&&
    (r.candidate.repair===undefined||(isPageRepairRecord(r.candidate.repair)&&
      JSON.stringify(r.candidate.repair)===JSON.stringify(r.candidate.validationEvidence.repair)&&
      (!r.candidate.repair.guidance||(r.candidate.workflowContract!==undefined&&!repairGuidanceIssue(r.candidate.repair.guidance,r.candidate.workflowContract,r.candidate.repair.status==='repaired',purpose))))));
}

/** Historical events remain available after undo; the project document remains the current-page authority. */
export class DeliveryRepository {
  constructor(private readonly storage: ProjectStorage, private readonly projectId: string) {}

  async get(screenId: string, id: string): Promise<DeliveryRecord | null> {
    const raw=await this.storage.readText(recordPath(screenId,id));
    if(!raw||raw.length>24_000_000)return null;
    try{const record=JSON.parse(raw);return validRecord(record,this.projectId,screenId)&&record.id===id?record:null;}catch{return null;}
  }

  async prepare(record: DeliveryRecord): Promise<void> {
    if (!validRecord(record, this.projectId, record.after.id,'execute') || record.status !== 'prepared' ||
      (record.preview !== undefined && !isDeliveryPreview(record.preview, record.id, record.resultFingerprint))) throw new Error('交付快照不完整，未应用候选。');
    const serialized = JSON.stringify(record);
    if (serialized.length > 24_000_000) throw new Error('交付档案过大，请精简页面后重试。');
    const path = recordPath(record.after.id, record.id);
    if (await this.storage.exists(path)) throw new Error('交付档案 ID 冲突，请重试。');
    await this.storage.ensureDir(directory(record.after.id));
    await this.storage.writeTextAtomic(path, serialized);
  }

  async finish(record: DeliveryRecord, status: 'applied' | 'aborted', reason?: string): Promise<void> {
    if(!validRecord(record,this.projectId,record.after.id))throw new Error('交付来源或页面快照不一致，未更新交付状态。');
    await this.storage.writeTextAtomic(recordPath(record.after.id, record.id), JSON.stringify({ ...record, status, completedAt: Date.now(), ...(reason ? { reason } : {}) }));
  }

  async listForScreen(screenId: string, limit = 10): Promise<{ records: DeliveryRecord[]; invalidFiles: number; hasMore: boolean }> {
    const files = (await this.storage.listDir(directory(screenId))).filter(name => /^delivery-[a-z0-9-]+\.json$/.test(name)).sort().reverse();
    const selected = files.slice(0, Math.max(1, Math.min(limit, 200)));
    const records: DeliveryRecord[] = [];
    let invalidFiles = 0;
    for (let start = 0; start < selected.length; start += 4) {
      const batch = await Promise.all(selected.slice(start, start + 4).map(async name => {
        try {
          const raw = await this.storage.readText(`${directory(screenId)}/${name}`);
          if (!raw || raw.length > 24_000_000) return null;
          const record = JSON.parse(raw);
          if (!validRecord(record, this.projectId, screenId) || `${record.id}.json` !== name) return null;
          // A broken preview must not hide otherwise valid code and validation history.
          if (record.preview !== undefined && !isDeliveryPreview(record.preview, record.id, record.resultFingerprint)) record.preview = {
            status: 'failed', scope: 'first-screen', capturedAt: record.createdAt, candidateFingerprint: record.resultFingerprint,
            contextFingerprint: record.candidate.validationEvidence!.contextFingerprint, reason: '预览记录损坏或与交付版本不匹配。'
          };
          return record;
        } catch { return null; }
      }));
      for (const record of batch) if (record) records.push(record); else invalidFiles++;
    }
    return { records: records.sort((a, b) => b.createdAt - a.createdAt), invalidFiles, hasMore: files.length > selected.length };
  }
}
