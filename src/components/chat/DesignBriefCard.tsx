import React from 'react';
import type { DesignBrief } from '../../services/ai/designBrief';
import { useT } from '../../stores/useLocaleStore';

const PAGE_KIND_KEYS = [
  'form',
  'detail',
  'list',
  'dashboard',
  'pricing',
  'conversation',
  'landing',
  'settings',
  'empty',
  'result',
  'unknown',
] as const;

type PageKindKey = (typeof PAGE_KIND_KEYS)[number];

function pageKindKey(kind: string): PageKindKey {
  return (PAGE_KIND_KEYS as readonly string[]).includes(kind) ? (kind as PageKindKey) : 'unknown';
}

export function DesignBriefCard({ brief }: { brief: DesignBrief }) {
  const t = useT();
  const pageKind = (k: string) => t(`plan.pageKinds.${pageKindKey(k)}`);
  return (
    <details className="my-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300" data-testid="design-brief">
      <summary className="cursor-pointer">{t('plan.briefSummary', { direction: brief.direction, density: brief.density })}</summary>
      <dl className="mt-2 space-y-2 break-words">
        {brief.requirementsPolicy && (
          <div>
            <dt className="text-slate-400">{t('plan.requirementsPolicy')}</dt>
            <dd>{brief.requirementsPolicy}</dd>
          </div>
        )}
        <div>
          <dt className="text-slate-400">{t('plan.goal')}</dt>
          <dd>{brief.goal}</dd>
        </div>
        {brief.scene && typeof brief.scene.pageKind === 'string' && (
          <div>
            <dt className="text-slate-400">{t('plan.pageKind')}</dt>
            <dd>
              {pageKind(brief.scene.pageKind)} ·{' '}
              {brief.scene.source === 'provided' ? t('plan.sceneProvided') : t('plan.sceneInferred')}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-slate-400">{t('plan.layout')}</dt>
          <dd>{brief.layout}</dd>
        </div>
        <div>
          <dt className="text-slate-400">{t('plan.visual')}</dt>
          <dd>
            <span style={{ backgroundColor: brief.primaryColor }} className="mr-1 inline-block h-2 w-2 rounded-full" />
            {t('plan.visualHint')}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">{t('plan.action')}</dt>
          <dd>{brief.actionPolicy}</dd>
        </div>
        <div>
          <dt className="text-slate-400">{t('plan.content')}</dt>
          <dd>{brief.contentPolicy}</dd>
        </div>
        {Array.isArray(brief.contentObligations) && brief.contentObligations.length > 0 && (
          <div>
            <dt className="text-slate-400">{t('plan.contentRequirements')}</dt>
            <dd>
              {brief.contentObligations
                .filter((o) => o && typeof o.text === 'string')
                .slice(0, 20)
                .map((o, i) => (
                  <p key={i}>
                    {o.target === 'field-label' ? t('plan.fieldLabelPrefix') : ''}
                    {o.kind === 'exact' ? t('plan.obligationExact') : t('plan.obligationSemantic')}：{o.text}
                  </p>
                ))}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-slate-500">{t('plan.briefFooter')}</p>
    </details>
  );
}