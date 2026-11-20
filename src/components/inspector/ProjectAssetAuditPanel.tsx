import React, { useEffect, useRef, useState } from 'react';
import type { Asset, Screen } from '../../types/project';
import { auditProjectAssets, type ProjectAssetIssue } from '../../services/ai/projectAssetIntegrity';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { useT } from '../../stores/useLocaleStore';

export function ProjectAssetAuditPanel({ projectId, folderPath, screens, assets }: {
  projectId: string; folderPath?: string; screens: Record<string, Screen>; assets: Record<string, Asset>;
}) {
  const t = useT();
  const [result, setResult] = useState<ProjectAssetIssue[] | null>(null);
  const [checking, setChecking] = useState(false);
  const requestId = useRef(0);
  useEffect(() => { requestId.current++; setResult(null); setChecking(false); return () => { requestId.current++; }; }, [projectId, folderPath]);

  const check = async () => {
    if (checking) return;
    const request = ++requestId.current;
    setChecking(true); setResult(null);
    try {
      const currentScreens = Object.values(screens);
      const currentAssets = Object.values(assets);
      const report = await auditProjectAssets(createProjectStorage(projectId, folderPath), currentScreens, currentAssets);
      if (request === requestId.current) setResult(report.issues);
    } catch {
      if (request === requestId.current) setResult([{ code: 'asset_check_unavailable', entityId: projectId, message: t('inspector.assetAuditUnavailable') }]);
    } finally { if (request === requestId.current) setChecking(false); }
  };

  return <section aria-label={t('inspector.assetAudit')} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-left space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-300">{t('inspector.assetAudit')}</span>
      <button type="button" disabled={checking} onClick={() => { void check(); }}
        className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-50">
        {checking ? t('inspector.assetAuditRunning') : t('inspector.assetAuditRerun')}
      </button>
    </div>
    <p className="text-[10px] leading-relaxed text-slate-500">{t('inspector.assetAuditHint')}</p>
    {result && (result.length ? <ul className="max-h-36 space-y-1 overflow-y-auto text-[10px] text-amber-300">
      {result.slice(0, 20).map((issue, index) => <li key={`${issue.code}-${issue.entityId}-${index}`}>{issue.message}</li>)}
      {result.length > 20 && <li>{t('inspector.assetAuditMore', { count: result.length - 20 })}</li>}
    </ul> : <p role="status" className="text-[11px] text-emerald-300">{t('inspector.assetAuditPass', { count: Object.keys(assets).length })}</p>)}
  </section>;
}
