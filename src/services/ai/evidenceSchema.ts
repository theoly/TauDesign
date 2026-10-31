import type {QualityFinding,QualityReport} from './generationQuality';
import type {RenderedQualityReport} from '../../utils/renderedQuality';

export function isQualityFinding(value:unknown):value is QualityFinding {
 const f=value as QualityFinding|undefined;
 return Boolean(f&&typeof f.code==='string'&&['error','warning'].includes(f.severity)&&typeof f.message==='string'&&typeof f.actual==='string'&&typeof f.expected==='string'&&(f.nid===undefined||typeof f.nid==='string'));
}
export function isQualityReport(value:unknown):value is QualityReport {
 const r=value as QualityReport|undefined;
 return Boolean(r&&typeof r.passed==='boolean'&&Array.isArray(r.findings)&&r.findings.every(isQualityFinding)&&r.passed===!r.findings.some(f=>f.severity==='error'));
}
export function isRenderedQualityReport(value:unknown):value is RenderedQualityReport {
 const r=value as RenderedQualityReport|undefined;
 return Boolean(r&&['pending','complete','incomplete','unavailable'].includes(r.status)&&Number.isSafeInteger(r.inspected)&&r.inspected>=0&&
  Array.isArray(r.findings)&&r.findings.every(isQualityFinding)&&(r.reason===undefined||typeof r.reason==='string'));
}
export function isPassedRender(value:unknown):value is RenderedQualityReport {
 return isRenderedQualityReport(value)&&value.status==='complete'&&!value.findings.some(f=>f.severity==='error');
}
