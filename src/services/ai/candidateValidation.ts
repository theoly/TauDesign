import type { DesignLibraryBinding } from '../../types/project';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import type { QualityReport } from './generationQuality';
import type { ProjectAssetAuditReport } from './projectAssetIntegrity';
import {isWorkflowValidationReport,type WorkflowValidationReport} from './workflowValidation';
import {isQualityReport,isRenderedQualityReport,isPassedRender} from './evidenceSchema';
import {isPageRepairRecord} from './pageRepairRecord';

export interface CandidateDeliveryReport {
  status: 'ready' | 'blocked' | 'pending';
  checks: Array<{ id: 'entities' | 'task' | 'source' | 'quality' | 'structure' | 'assets' | 'asset_files' | 'render'; status: 'passed' | 'blocked' | 'pending'; message: string }>;
  workflow?:WorkflowValidationReport;
}

/** A human may accept a structural rewrite only after every other live gate passes. */
export function canConfirmCandidateStructure(report: CandidateDeliveryReport | null): boolean {
  if (!report || report.status !== 'blocked' || !report.checks.some(c => c.id === 'structure' && c.status === 'blocked')) return false;
  return report.checks.every(c => c.id === 'structure' ? c.status === 'blocked' : c.status === 'passed')
    && Boolean(report.workflow && report.workflow.checks.every(c => c.id === 'structure' ? c.status === 'blocked' : c.status === 'passed'));
}

/** Historical evidence is diagnostic only. Live adoption always recomputes its own gates. */
export interface CandidateValidationEvidence {
  repair?:import('./pageRepairRecord').PageRepairRecord;
  version: 1;
  capturedAt: number;
  candidateFingerprint: string;
  contextFingerprint: string;
  projectFingerprint: string;
  baselineFingerprint: string;
  viewport: { profile: 'pc' | 'mobile'; width: number; height: number };
  designSystem: { id: string; tokenFingerprint: string };
  designLibrary?: DesignLibraryBinding;
  source: QualityReport;
  quality: QualityReport;
  delivery: CandidateDeliveryReport;
  render?: RenderedQualityReport;
  projectAssets?: ProjectAssetAuditReport;
}

/** Files can be edited externally; malformed diagnostics must not crash the evidence panel. */
export function isCandidateValidationEvidence(value: unknown): value is CandidateValidationEvidence {
  const v = value as CandidateValidationEvidence | null;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return Boolean(v && v.version === 1 && finite(v.capturedAt) &&
    (v.repair===undefined||isPageRepairRecord(v.repair))&&
    typeof v.candidateFingerprint === 'string' && typeof v.contextFingerprint === 'string' &&
    typeof v.projectFingerprint === 'string' && typeof v.baselineFingerprint === 'string' &&
    v.viewport && ['pc', 'mobile'].includes(v.viewport.profile) && finite(v.viewport.width) && finite(v.viewport.height) &&
    v.designSystem && typeof v.designSystem.id === 'string' && typeof v.designSystem.tokenFingerprint === 'string' &&
    (!v.designLibrary || (['project_copy','pinned_reference'].includes(v.designLibrary.mode) && typeof v.designLibrary.sourceProjectId === 'string' &&
      typeof v.designLibrary.sourceName === 'string' && typeof v.designLibrary.sourceFingerprint === 'string' && finite(v.designLibrary.sourceTokenVersion))) &&
    isQualityReport(v.source) && isQualityReport(v.quality) && v.delivery && ['ready', 'blocked', 'pending'].includes(v.delivery.status) &&
    Array.isArray(v.delivery.checks) && v.delivery.checks.length>0 && v.delivery.checks.length<=8 && new Set(v.delivery.checks.map(c=>c?.id)).size===v.delivery.checks.length && v.delivery.checks.every(check => check &&
      ['entities', 'task', 'source', 'quality', 'structure', 'assets', 'asset_files', 'render'].includes(check.id) &&
      ['passed', 'blocked', 'pending'].includes(check.status) && typeof check.message === 'string') &&
    (v.delivery.workflow===undefined||isWorkflowValidationReport(v.delivery.workflow)) &&
    (v.render===undefined||isRenderedQualityReport(v.render)) &&
    v.delivery.status===(v.delivery.checks.some(c=>c.status==='blocked')||v.delivery.workflow?.status==='blocked'?'blocked':
      v.delivery.checks.some(c=>c.status==='pending')||v.delivery.workflow?.status==='pending'?'pending':'ready') &&
    v.delivery.checks.every(c=>c.id==='source'?c.status===(v.source.passed?'passed':'blocked'):c.id==='quality'?c.status===(v.quality.passed?'passed':'blocked'):
      c.id==='render'?c.status===(!v.render||v.render.status==='pending'?'pending':isPassedRender(v.render)?'passed':'blocked'):true) &&
    (v.delivery.status!=='ready'||(v.source.passed&&v.quality.passed&&isPassedRender(v.render)&&
      ['task','source','quality','entities','assets','asset_files','render'].every(id=>v.delivery.checks.some(c=>c.id===id&&c.status==='passed')))) &&
    (!v.projectAssets || (finite(v.projectAssets.checkedAt) && finite(v.projectAssets.screenCount) &&
      Array.isArray(v.projectAssets.files) && v.projectAssets.files.every(file => file && typeof file.id === 'string' && typeof file.relPath === 'string') &&
      Array.isArray(v.projectAssets.issues) && v.projectAssets.issues.every(issue => issue && typeof issue.code === 'string' && typeof issue.entityId === 'string' && typeof issue.message === 'string'))));
}
