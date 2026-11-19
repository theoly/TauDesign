import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import React, { useEffect, useMemo, useState } from 'react';
import type { Screen } from '../../types/project';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { DeliveryRepository, type DeliveryRecord } from '../../services/storage/deliveryRepository';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { EvidenceRecord } from '../canvas/CandidateEvidencePanel';
import { DeliveryPreviewImage } from './DeliveryPreviewImage';
import { RestyleDeliveryHistoryPanel } from './RestyleDeliveryHistoryPanel';
import {VisualEvidencePanel} from './VisualEvidencePanel';
import {DesignGuidanceCard} from '../chat/DesignGuidanceCard';
import {HistoricalDraftSource} from '../chat/HistoricalDraftSource';
import {useLocaleStore, useT} from '../../stores/useLocaleStore';

export function DeliveryHistoryPanel({ projectId, folderPath, screen, revision, notice }: {
  projectId: string; folderPath?: string; screen: Screen; revision: number; notice?: string | null;
}) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const modes = useMemo(() => ({
    replace: t('inspector.deliveryModeReplace'),
    'force-replace': t('inspector.deliveryModeForceReplace'),
    'keep-both': t('inspector.deliveryModeKeepBoth'),
    'confirm-structure-keep-both': t('inspector.deliveryModeConfirmStructureKeepBoth'),
    'confirm-structure-replace': t('inspector.deliveryModeConfirmStructureReplace'),
  }), [locale, t]);
  const statuses = useMemo(() => ({
    prepared: t('inspector.deliveryStatusPrepared'),
    applied: t('inspector.deliveryStatusApplied'),
    aborted: t('inspector.deliveryStatusAborted'),
  }), [locale, t]);
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [invalidFiles, setInvalidFiles] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(10);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const screenId = screen.id;
  useEffect(() => { setLimit(10); }, [projectId, folderPath, screenId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setRecords([]); setInvalidFiles(0); setHasMore(false);
    void new DeliveryRepository(createProjectStorage(projectId, folderPath), projectId).listForScreen(screenId, limit).then(result => {
      if (cancelled) return;
      setRecords(result.records); setInvalidFiles(result.invalidFiles); setHasMore(result.hasMore);
    }).catch(() => { if (!cancelled) setError(t('inspector.deliveryReadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, folderPath, screenId, revision, limit, refresh]);

  return <section aria-label={t('inspector.deliverySectionAria')} className="w-full space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left text-[11px]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-300">{t('inspector.deliveryHistory')}</span>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-md bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-50">{t('inspector.deliveryRefresh')}</button>
    </div>
    {notice && <p role="alert" className="text-amber-300">{notice}</p>}
    {loading && <p role="status" className="text-slate-500">{t('inspector.deliveryLoading')}</p>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {!!invalidFiles && <p role="alert" className="text-amber-300">{t('inspector.deliveryInvalidFiles', { count: invalidFiles })}</p>}
    {!loading && !error && !records.length && <p className="text-slate-500">{t('inspector.deliveryEmpty')}</p>}
    {records.map(record => {
      const request = record.candidate.modificationRequest ?? record.candidate.workflowContract?.request;
      const matches = record.resultFingerprint === contentFingerprint(screen.htmlContent) && (record.after.scopedCss ?? '') === (screen.scopedCss ?? '');
      return <details key={record.id} className="rounded-lg border border-slate-800 p-2">
        <summary className="cursor-pointer text-slate-300">{modes[record.mode]} · {statuses[record.status]}<span className="mt-1 block text-[10px] text-slate-500">{new Date(record.createdAt).toLocaleString()}</span></summary>
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap break-words text-slate-400">{typeof request === 'string' ? request : t('inspector.deliveryNoRequest')}</p>
          <p className="text-slate-500">{matches ? t('inspector.deliveryMatchesCurrent') : t('inspector.deliveryDiffersCurrent')}</p>
          {record.reason && <p className="text-amber-300">{record.reason}</p>}
          {record.status === 'prepared' && <p className="text-amber-300">{t('inspector.deliveryPreparedHint')}</p>}
          <ModificationReviewSource receipt={record.candidate.workflowContract?.modificationReview} />
          <DesignGuidanceCard contract={record.candidate.workflowContract} historical/>
          <HistoricalDraftSource execution={record.candidate.executionRecord}/>
          <DeliveryPreviewImage record={record} projectId={projectId} folderPath={folderPath} />
          {record.status==='applied'&&<VisualEvidencePanel projectId={projectId} folderPath={folderPath} kind="single" eventId={record.id} screenId={record.after.id}/>}
          <details><summary className="cursor-pointer text-slate-400">{t('inspector.deliveryCodeBeforeAfter')}</summary>
            <p className="my-1 text-slate-500">{t('inspector.deliveryBeforeLabel', { name: record.before.name })}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{record.before.htmlContent.slice(0, 10000)}</pre>
            <p className="my-1 text-slate-500">{t('inspector.deliveryAfterLabel', { name: record.after.name })}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{record.after.htmlContent.slice(0, 10000)}</pre>
            <p className="text-[10px] text-slate-600">{t('inspector.deliveryCodeTruncation')}</p>
          </details>
          <details><summary className="cursor-pointer text-slate-400">{t('inspector.deliveryValidationEvidence')}</summary>
            <p className="my-2 text-amber-300">{t('inspector.deliveryHistoricalDisclaimer')}</p>
            <EvidenceRecord evidence={record.candidate.validationEvidence!} />
          </details>
        </div>
      </details>;
    })}
    {hasMore && limit < 200 && <button type="button" onClick={() => setLimit(value => value + 10)} className="text-blue-300">{t('inspector.deliveryLoadMore')}</button>}
    {hasMore && limit >= 200 && <p className="text-slate-500">{t('inspector.deliveryLimitReached')}</p>}
    <RestyleDeliveryHistoryPanel projectId={projectId} folderPath={folderPath} screen={screen} revision={revision} notice={notice}/>
  </section>;
}