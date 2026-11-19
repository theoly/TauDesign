import React, { useEffect, useRef, useState } from 'react';
import type { MultiPageItem, MultiPageReview } from '../../services/ai/multiPageContract';
import { validateVariantItems, validateMultiPageItems } from '../../services/ai/multiPageContract';
import { pageCreationContext } from '../../services/ai/pageCreationValidation';
import { useProjectStore } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';
import { PageTaskPlanContent } from './PageTaskPlanCard';
import { TaskBudgetCard } from './TaskBudgetCard';

export function MultiPagePlanCard({
  review,
  disabled,
  onConfirm,
  onCancel,
}: {
  review: MultiPageReview;
  disabled: boolean;
  onConfirm: (pages: MultiPageItem[], tree?: { concurrency: 1 | 2 }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const project = useProjectStore();
  const [pages, setPages] = useState<MultiPageItem[]>(() => structuredClone(review.plan?.pages ?? []));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [tree, setTree] = useState(false);
  const [concurrency, setConcurrency] = useState<1 | 2>(1);
  useEffect(() => {
    setPages(structuredClone(review.plan?.pages ?? []));
  }, [review.plan?.id]);
  const variants = review.plan?.kind === 'variants';
  const unit = variants ? t('plan.unitVariant') : t('plan.unitPage');
  const item = variants ? t('plan.itemVariant') : t('plan.itemPage');
  const stale = review.status === 'ready' && review.plan?.contextFingerprint !== pageCreationContext(project);
  const taskChanged = (page: MultiPageItem) => {
    const original = review.plan?.pages.find((p) => p.id === page.id);
    return (
      page.requirements.trim() !== original?.requirements ||
      JSON.stringify([...page.links].sort()) !== JSON.stringify([...(original?.links ?? [])].sort())
    );
  };
  let issue = '';
  try {
    if (review.status === 'ready') {
      if (variants) validateVariantItems(pages);
      else validateMultiPageItems(pages);
      if (pages.some((p) => p.task?.questions.length && !taskChanged(p))) issue = t('plan.taskQuestionsIssue');
    }
  } catch (error) {
    issue = error instanceof Error ? error.message : t('plan.planInvalid');
  }
  const change = (id: string, update: Partial<MultiPageItem>) => setPages((current) => current.map((p) => (p.id === id ? { ...p, ...update } : p)));
  const progressLabels: Record<string, string> = {
    pending: t('plan.statusPending'),
    generating: t('plan.statusGenerating'),
    checked: t('plan.statusChecked'),
    applied: t('plan.statusApplied'),
    failed: t('plan.statusFailed'),
  };
  return (
    <section data-testid="multi-page-plan" className="space-y-3 rounded-xl border border-blue-900 bg-slate-950 p-3 text-xs text-slate-300">
      <h3 className="font-semibold text-slate-100">{variants ? t('plan.titleVariants') : t('plan.titleMultiPage')}</h3>
      <p role="status" className="whitespace-pre-wrap text-slate-400">
        {review.message}
      </p>
      {review.status === 'ready' && (
        <>
          {review.plan?.planning.budget && (
            <details className="text-slate-400">
              <summary className="cursor-pointer">{t('plan.planningBudgetSummary')}</summary>
              <TaskBudgetCard value={review.plan.planning.budget} />
            </details>
          )}
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              aria-label={t('plan.sharedTreeAria')}
              disabled={busy || disabled}
              checked={tree}
              onChange={(e) => setTree(e.target.checked)}
            />
            {t('plan.sharedTreeLabel')}
          </label>
          {tree && (
            <div className="space-y-1 text-slate-400">
              <p>{t('plan.sharedTreeHint')}</p>
              <label>
                <select
                  aria-label={t('plan.concurrencyAria')}
                  value={concurrency}
                  disabled={busy || disabled}
                  onChange={(e) => setConcurrency(Number(e.target.value) as 1 | 2)}
                  className="ml-2 rounded border border-slate-700 bg-slate-900 p-1"
                >
                  <option value={1}>{t('plan.concurrencyOption1')}</option>
                  <option value={2}>{t('plan.concurrencyOption2')}</option>
                </select>
              </label>
            </div>
          )}
          <p className="text-slate-500">
            {variants
              ? t('plan.confirmVariantsHint', { count: pages.length })
              : t('plan.confirmPagesHint', { count: pages.length })}
          </p>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {pages.map((page, index) => (
              <details key={page.id} open={index === 0} className="space-y-2 rounded-lg border border-slate-800 p-2">
                <summary className="cursor-pointer break-words font-medium">
                  {index + 1}. {page.name || t('plan.unnamedPage')}
                </summary>
                <label className="block space-y-1">
                  {variants ? t('plan.variantName') : t('plan.pageName')}
                  <input
                    aria-label={t('plan.pageNameAria', { index: index + 1, unit: item })}
                    maxLength={20}
                    disabled={busy || disabled}
                    value={page.name}
                    onChange={(e) => change(page.id, { name: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                  />
                </label>
                <label className="block space-y-1">
                  {variants ? t('plan.variantRequirements') : t('plan.pageRequirements')}
                  <textarea
                    aria-label={t('plan.pageReqAria', { index: index + 1, unit: item })}
                    maxLength={1600}
                    disabled={busy || disabled}
                    value={page.requirements}
                    onChange={(e) => change(page.id, { requirements: e.target.value })}
                    rows={3}
                    className="w-full resize-y rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                  />
                </label>
                {page.task && (
                  <details aria-label={t('plan.taskPlanAria', { name: page.name })} className="space-y-1 rounded border border-slate-800 p-2 text-slate-400">
                    <summary className="cursor-pointer">
                      {taskChanged(page) ? t('plan.taskPlanEdited') : t('plan.taskPlanDefault')}
                    </summary>
                    <PageTaskPlanContent plan={page.task} />
                  </details>
                )}
                {taskChanged(page) && <p className="text-amber-300">{t('plan.requirementsAdjusted')}</p>}
                {!variants && (
                  <fieldset disabled={busy || disabled} className="space-y-1">
                    <legend className="mb-1 text-slate-500">{t('plan.linkPagesLegend')}</legend>
                    {pages
                      .filter((p) => p.id !== page.id)
                      .map((target) => (
                        <label key={target.id} className="flex items-start gap-2 break-words text-slate-400">
                          <input
                            type="checkbox"
                            aria-label={`${page.name} → ${target.name}`}
                            checked={page.links.includes(target.id)}
                            onChange={(e) =>
                              change(page.id, {
                                links: e.target.checked
                                  ? [...page.links, target.id]
                                  : page.links.filter((id) => id !== target.id),
                              })
                            }
                          />
                          {target.name}
                        </label>
                      ))}
                  </fieldset>
                )}
                <button
                  type="button"
                  disabled={busy || disabled || pages.length <= (variants ? 2 : 1)}
                  onClick={() =>
                    setPages((current) =>
                      current
                        .filter((p) => p.id !== page.id)
                        .map((p) => ({ ...p, links: p.links.filter((id) => id !== page.id) })),
                    )
                  }
                  className="text-slate-500 hover:text-red-300 disabled:opacity-40"
                >
                  {t('plan.removeItem', {
                    action: variants ? t('plan.removeVariant') : t('plan.removePage'),
                    name: page.name,
                  })}
                </button>
              </details>
            ))}
          </div>
          {(issue || stale) && (
            <p role="alert" className="text-amber-300">
              {stale ? t('plan.staleContext') : issue}
            </p>
          )}
          <button
            type="button"
            disabled={disabled || busy || stale || Boolean(issue)}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              try {
                await onConfirm(structuredClone(pages), tree ? { concurrency } : undefined);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
            className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-40"
          >
            {t('plan.confirmGenerate', { count: pages.length, unit })}
          </button>
        </>
      )}
      {!!review.progress?.length && (
        <ol className="space-y-2">
          {review.progress.map((page, index) => (
            <li key={page.itemId} className="rounded-lg border border-slate-800 p-2">
              <p className="break-words">
                {index + 1}. {page.name} ·{' '}
                <span
                  className={
                    page.status === 'failed' ? 'text-red-300' : page.status === 'applied' ? 'text-emerald-300' : 'text-blue-300'
                  }
                >
                  {progressLabels[page.status]}
                </span>
              </p>
              {page.message && <p className="mt-1 break-words text-slate-400">{page.message}</p>}
            </li>
          ))}
        </ol>
      )}
      {['planning', 'ready', 'running'].includes(review.status) && (
        <button type="button" onClick={onCancel} className="ml-2 text-slate-400 hover:text-slate-200">
          {variants ? t('plan.cancelVariants') : t('plan.cancelMultiPage')}
        </button>
      )}
      {['blocked', 'cancelled'].includes(review.status) && (
        <p className="text-slate-500">{variants ? t('plan.batchVariantsBlocked') : t('plan.batchPagesBlocked')}</p>
      )}
    </section>
  );
}