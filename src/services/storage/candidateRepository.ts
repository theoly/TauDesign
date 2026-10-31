import type { DesignExecutionRecord } from '../ai/designExecutionRecord';
import type { DesignTaskContract } from '../ai/designWorkflow';
import { checkGenerationSourceSafety } from '../ai/generationQuality';
import { contentFingerprint } from '../ai/designWorkflow';
import { isCandidateValidationEvidence, type CandidateValidationEvidence } from '../ai/candidateValidation';
import { createProjectStorage, type ProjectStorage } from './projectStorage';
import { isCandidatePreview } from './candidatePreview';
import type { PagePreview } from './pagePreview';

import type {PageRepairRecord} from '../ai/pageRepairRecord';

export interface StagedCandidateData {
  /** Presence also prevents retry if an externally edited receipt is malformed. */
  repair?:PageRepairRecord;
  candidateId?: string;
  targetScreenId: string;
  newHtml: string;
  screenName: string;
  baselineFingerprint?: string;
  projectFingerprint?: string;
  designOriginFingerprint?: string;
  /** Frozen input/authorization identity for newly staged contracts; absent on older candidates. */
  taskBindingFingerprint?:string;
  /** Runtime marker; restored candidates require fresh project-context checks. */
  restoredFromDisk?: boolean;
  modificationRequest?: string;
  navigationTitle?: string;
  workflowContract?: DesignTaskContract;
  executionRecord?: DesignExecutionRecord;
  validationEvidence?: CandidateValidationEvidence;
  preview?: PagePreview;
}

interface CandidateFile {
  schemaVersion: 1;
  projectId: string;
  savedAt: number;
  candidate: StagedCandidateData;
}

const CANDIDATE_FILE = 'candidates/current.json';
const MAX_CANDIDATE_CHARS = 16_000_000;
const pending = new Map<string, Promise<void>>();

function key(projectId: string, folderPath?: string): string { return folderPath ?? `local:${projectId}`; }

function enqueue(projectId: string, folderPath: string | undefined, action: (storage: ProjectStorage) => Promise<void>): Promise<void> {
  const queueKey = key(projectId, folderPath);
  const previous = pending.get(queueKey) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(() => action(createProjectStorage(projectId, folderPath)));
  pending.set(queueKey, operation);
  void operation.finally(() => { if (pending.get(queueKey) === operation) pending.delete(queueKey); }).catch(() => {});
  return operation;
}

/** A candidate is separate from project.json and history; writes are serialized with discard. */
export function saveStagedCandidate(projectId: string, folderPath: string | undefined, candidate: StagedCandidateData): Promise<void> {
  const { restoredFromDisk: _runtimeMarker, ...persisted } = candidate;
  const file: CandidateFile = { schemaVersion: 1, projectId, savedAt: Date.now(), candidate: structuredClone(persisted) };
  const serialized = JSON.stringify(file);
  return enqueue(projectId, folderPath, async storage => {
    const previous = await readCandidateFile(storage);
    const oldPath = ownedPreviewPath(previous), newPath = ownedPreviewPath(file.candidate);
    try {
      if (serialized.length > MAX_CANDIDATE_CHARS) throw new Error('候选内容过大，无法保存跨重启副本。');
      if (file.candidate.preview && !isCandidatePreview(file.candidate.preview, file.candidate.candidateId, contentFingerprint(file.candidate.newHtml))) throw new Error('候选预览与页面不匹配。');
      await storage.ensureDir('candidates');
      await storage.writeTextAtomic(CANDIDATE_FILE, serialized);
    } catch (error) {
      if (newPath && newPath !== oldPath) await removePreview(storage, newPath);
      throw error;
    }
    if (oldPath && oldPath !== newPath) await removePreview(storage, oldPath);
  });
}

async function readCandidateFile(storage: ProjectStorage): Promise<StagedCandidateData | undefined> {
  const raw = await storage.readText(CANDIDATE_FILE);
  try { return raw ? JSON.parse(raw).candidate : undefined; } catch { return undefined; }
}
function ownedPreviewPath(candidate: StagedCandidateData | undefined): string | undefined {
  const preview = candidate?.preview;
  return preview && isCandidatePreview(preview, candidate?.candidateId, preview.candidateFingerprint) && preview.status === 'ready' ? preview.relPath : undefined;
}
async function removePreview(storage: ProjectStorage, path: string): Promise<void> {
  await storage.remove(path).catch(error => console.warn('[candidate-preview] 临时图片清理失败', error));
}

function sameCandidate(a: StagedCandidateData, b: StagedCandidateData): boolean {
  return a.candidateId || b.candidateId ? a.candidateId === b.candidateId :
    a.targetScreenId === b.targetScreenId && a.newHtml === b.newHtml && a.baselineFingerprint === b.baselineFingerprint;
}

export function removeStagedCandidate(projectId: string, folderPath?: string, expectedCandidate?: StagedCandidateData): Promise<void> {
  return enqueue(projectId, folderPath, async storage => {
    const candidate = await readCandidateFile(storage);
    if (expectedCandidate && (!candidate || !sameCandidate(candidate, expectedCandidate))) return;
    await storage.remove(CANDIDATE_FILE);
    const preview = ownedPreviewPath(candidate);
    if (preview) await removePreview(storage, preview);
  });
}

export async function loadStagedCandidate(projectId: string, folderPath?: string): Promise<StagedCandidateData | null> {
  const queueKey = key(projectId, folderPath);
  await pending.get(queueKey)?.catch(() => {});
  const raw = await createProjectStorage(projectId, folderPath).readText(CANDIDATE_FILE);
  if (!raw || raw.length > MAX_CANDIDATE_CHARS) return null;
  try {
    const file = JSON.parse(raw) as CandidateFile;
    const candidate = file.candidate;
    if (file.schemaVersion !== 1 || file.projectId !== projectId || !candidate ||
      (candidate.candidateId !== undefined && typeof candidate.candidateId !== 'string') ||
      typeof candidate.targetScreenId !== 'string' || typeof candidate.screenName !== 'string' ||
      typeof candidate.baselineFingerprint !== 'string' || typeof candidate.projectFingerprint !== 'string' ||
      typeof candidate.designOriginFingerprint !== 'string' ||
      typeof candidate.newHtml !== 'string' || !checkGenerationSourceSafety(candidate.newHtml).passed) return null;
    if (candidate.validationEvidence && (!isCandidateValidationEvidence(candidate.validationEvidence) ||
      candidate.validationEvidence.candidateFingerprint !== contentFingerprint(candidate.newHtml))) delete candidate.validationEvidence;
    if (candidate.preview && !isCandidatePreview(candidate.preview, candidate.candidateId, contentFingerprint(candidate.newHtml))) candidate.preview = {
      status: 'failed', scope: 'first-screen', capturedAt: Number.isFinite(file.savedAt) ? file.savedAt : Date.now(),
      candidateFingerprint: contentFingerprint(candidate.newHtml), contextFingerprint: '', reason: '候选预览记录损坏或与页面不匹配。'
    };
    return structuredClone(candidate);
  } catch { return null; }
}
