import {UserFacingNotice} from '../common/UserFacingNotice';
import React from 'react';
import type { QualityFinding } from '../../services/ai/generationQuality';
import { findingDisposition, findingRequirement } from '../../services/ai/findingPolicy';
import { t } from '../../i18n';
import { getUiLocale, useT } from '../../stores/useLocaleStore';

const dispositionKeys = {
  blocker: 'quality.dispositionBlocker',
  warning: 'quality.dispositionWarning',
  unverified: 'quality.dispositionUnverified',
  advisory: 'quality.dispositionAdvisory',
  elevatable: 'quality.dispositionElevatable',
  'layout-risk': 'quality.dispositionLayoutRisk',
} as const;
const colors = {
  blocker: 'text-rose-300',
  warning: 'text-amber-200',
  unverified: 'text-slate-300',
  advisory: 'text-sky-200',
  elevatable: 'text-violet-200',
  'layout-risk': 'text-rose-300',
} as const;

export function findingSummary(findings: QualityFinding[]): string {
  const locale = getUiLocale();
  return (Object.keys(dispositionKeys) as Array<keyof typeof dispositionKeys>)
    .map(type => t('quality.dispositionCount', {
      count: findings.filter(f => findingDisposition(f) === type).length,
      label: t(dispositionKeys[type], undefined, locale),
    }, locale)).join(' · ');
}

export function QualityFindings({findings, onLocate}: {findings: QualityFinding[]; onLocate?: (nid: string) => void}) {
  const translate = useT();
  return <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
    {findings.map((finding, index) => {
      const kind = findingDisposition(finding);
      return <li key={index} className="break-words">
      <div className={colors[kind]}>
        {translate(dispositionKeys[kind])}：{finding.nid ? `[${finding.nid}] ` : ''}<UserFacingNotice message={finding.message}/>
      </div>
      <details data-technical-details className="text-slate-400"><summary className="cursor-pointer">{translate('quality.viewDetails')}</summary><div>{findingRequirement(finding) === 'required' ? translate('quality.requiredCheck') : translate('quality.advisoryCheck')} · {translate('quality.actualPrefix', {value: finding.actual??''})}</div>
      <div>{translate('quality.expectedPrefix', {value: finding.expected??''})}</div></details>
      {finding.nid && onLocate && <button type="button" onClick={() => onLocate(finding.nid!)} className="mt-1 text-blue-300 underline">{translate('quality.locateComponent', {nid: finding.nid})}</button>}
    </li>;
    })}
  </ul>;
}
