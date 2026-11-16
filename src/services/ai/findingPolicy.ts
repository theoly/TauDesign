import type { QualityFinding } from './generationQuality';

// Application-owned policy. No requirement supplied by a model/document is accepted.
const checks = {
  'render-controls': { requirement: 'required', codes: ['render_action_zero_size', 'render_action_invisible_label'], statuses: ['failed'] },
  'render-completion': { requirement: 'required', codes: ['render_check_unverified'], statuses: ['unverified'] },
  contrast: { requirement: 'advisory', codes: ['render_contrast'], statuses: ['failed'] },
  'contrast-support': { requirement: 'advisory', codes: ['render_contrast_unverified'], statuses: ['unverified'] },
  'icon-sizing': { requirement: 'advisory', codes: ['unbounded_icon'], statuses: ['advice'] },
  'required-field-label': { requirement: 'required', codes: ['required_field_label_missing'], statuses: ['failed'] },
  'required-field-label-support': { requirement: 'required', codes: ['required_field_label_unverified'], statuses: ['unverified'] },
  'required-action-text': { requirement: 'required', codes: ['required_action_text_missing'], statuses: ['failed'] },
  'required-action-text-support': { requirement: 'required', codes: ['required_action_text_unverified'], statuses: ['unverified'] },
} as const;
export type FindingCheckId = keyof typeof checks;
export interface FindingAssessment { checkId: FindingCheckId; status: 'failed' | 'unverified' | 'advice' }
export type FindingDisposition = 'blocker' | 'warning' | 'unverified' | 'advisory' | 'elevatable' | 'layout-risk';

/** Improve-ladder lane attached to elevatable / layout findings (E6). */
export type RepairLane = 'deterministic' | 'style' | 'polish' | 'region' | 'regen';

const REPAIR_LANES: readonly RepairLane[] = ['deterministic', 'style', 'polish', 'region', 'regen'];

const LAYOUT_RISK_CODES = new Set([
  'incomplete_html',
  'layout_risk_device_contract',
  'active_content',
  'event_handler',
  'unsafe_url',
  'duplicate_nid'
]);

export function validRepairLane(value: unknown): value is RepairLane {
  return typeof value === 'string' && (REPAIR_LANES as readonly string[]).includes(value);
}

export function validFindingAssessment(finding: QualityFinding): boolean {
  if (finding.repairLane !== undefined && !validRepairLane(finding.repairLane)) return false;
  if (finding.assessment === undefined) {
    if (['render_check_unverified', 'render_contrast_unverified', 'required_field_label_missing', 'required_field_label_unverified', 'required_action_text_missing', 'required_action_text_unverified'].includes(finding.code)) return false;
    return !(checks['render-controls'].codes as readonly string[]).includes(finding.code) || finding.severity === 'error';
  }
  const value = finding.assessment;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.checkId !== 'string' || typeof value.status !== 'string'
    || Object.keys(value).some(key => key !== 'checkId' && key !== 'status')
    || !Object.hasOwn(checks, value.checkId)) return false;
  const check = checks[value.checkId];
  return (check.codes as readonly string[]).includes(finding.code)
    && (check.statuses as readonly string[]).includes(value.status)
    && finding.severity === (check.requirement === 'required' ? 'error' : 'warning');
}

export function assessedFinding(checkId: FindingCheckId, status: FindingAssessment['status'],
  details: Omit<QualityFinding, 'severity' | 'assessment'>): QualityFinding {
  const finding: QualityFinding = { ...details, severity: checks[checkId].requirement === 'required' ? 'error' : 'warning', assessment: { checkId, status } };
  if (!validFindingAssessment(finding)) throw new Error('Finding does not match its application check policy');
  return finding;
}

/** Elevatable aesthetic / hard-visual finding: warning + repairLane (create must not hard-fail solely on these). */
export function elevatableFinding(
  details: Omit<QualityFinding, 'severity' | 'assessment'> & { repairLane: RepairLane }
): QualityFinding {
  const finding: QualityFinding = { ...details, severity: 'warning' };
  if (!validFindingAssessment(finding)) throw new Error('Elevatable finding is invalid');
  return finding;
}

export function isLayoutRiskFinding(finding: QualityFinding): boolean {
  return LAYOUT_RISK_CODES.has(finding.code) && finding.severity === 'error';
}

export function isElevatableFinding(finding: QualityFinding): boolean {
  return finding.severity === 'warning' && validRepairLane(finding.repairLane);
}

export function findingDisposition(finding: QualityFinding): FindingDisposition {
  if (!validFindingAssessment(finding)) return 'blocker';
  if (isLayoutRiskFinding(finding)) return 'layout-risk';
  if (isElevatableFinding(finding)) return 'elevatable';
  if (finding.assessment?.status === 'unverified') return 'unverified';
  if (finding.assessment?.status === 'advice') return 'advisory';
  return finding.severity === 'error' ? 'blocker' : 'warning';
}
export function findingRequirement(finding: QualityFinding): 'required' | 'advisory' {
  if (!validFindingAssessment(finding)) return 'required';
  if (isElevatableFinding(finding)) return 'advisory';
  return finding.assessment ? checks[finding.assessment.checkId].requirement : finding.severity === 'error' ? 'required' : 'advisory';
}

/** Derived disclosure of report status, not evidence that an unrun check executed. */
export function renderFindingsForDisplay(report: {status: string; findings: QualityFinding[]; reason?: string}): QualityFinding[] {
  if (report.status === 'complete' || report.findings.some(f => f.code === 'render_check_unverified' && validFindingAssessment(f))) return report.findings;
  return [...report.findings, assessedFinding('render-completion', 'unverified', {
    code: 'render_check_unverified', message: '必需渲染检查尚未完成，不能采纳。',
    actual: report.reason || '尚无完整的当前渲染证据', expected: '完成当前设备的渲染检查后再采纳',
  })];
}
