import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import React, { useEffect, useState } from 'react';
import type { Screen } from '../../types/project';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { DeliveryRepository, type DeliveryRecord } from '../../services/storage/deliveryRepository';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { EvidenceRecord } from '../canvas/CandidateEvidencePanel';
import { DeliveryPreviewImage } from './DeliveryPreviewImage';
import { RestyleDeliveryHistoryPanel } from './RestyleDeliveryHistoryPanel';
import {VisualEvidencePanel} from './VisualEvidencePanel';

const modes = { replace: '替换原页', 'force-replace': '强制采纳', 'keep-both': '保留两版', 'confirm-structure-keep-both': '确认结构变更并保留两版', 'confirm-structure-replace': '确认结构变更并替换' };
const statuses = { prepared: '状态待确认', applied: '已应用', aborted: '已取消' };

export function DeliveryHistoryPanel({ projectId, folderPath, screen, revision, notice }: {
  projectId: string; folderPath?: string; screen: Screen; revision: number; notice?: string | null;
}) {
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
    }).catch(() => { if (!cancelled) setError('交付记录读取失败，请检查工程文件后重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, folderPath, screenId, revision, limit, refresh]);

  return <section aria-label="页面交付历史" className="w-full space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left text-[11px]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-300">页面交付历史</span>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-md bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-50">刷新</button>
    </div>
    {notice && <p role="alert" className="text-amber-300">{notice}</p>}
    {loading && <p role="status" className="text-slate-500">正在读取交付记录…</p>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {!!invalidFiles && <p role="alert" className="text-amber-300">有 {invalidFiles} 份损坏或不匹配的记录未显示，其它记录可正常查看。</p>}
    {!loading && !error && !records.length && <p className="text-slate-500">暂无单页采纳记录；重塑记录可在下方展开查看。</p>}
    {records.map(record => {
      const request = record.candidate.modificationRequest ?? record.candidate.workflowContract?.request;
      const matches = record.resultFingerprint === contentFingerprint(screen.htmlContent) && (record.after.scopedCss ?? '') === (screen.scopedCss ?? '');
      return <details key={record.id} className="rounded-lg border border-slate-800 p-2">
        <summary className="cursor-pointer text-slate-300">{modes[record.mode]} · {statuses[record.status]}<span className="mt-1 block text-[10px] text-slate-500">{new Date(record.createdAt).toLocaleString()}</span></summary>
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap break-words text-slate-400">{typeof request === 'string' ? request : '未记录原始请求'}</p>
          <p className="text-slate-500">{matches ? '当前 HTML/CSS 与此交付版本一致。' : '当前页面已与此交付版本不同，可能已编辑或撤销。'}</p>
          {record.reason && <p className="text-amber-300">{record.reason}</p>}
          {record.status === 'prepared' && <p className="text-amber-300">档案准备记录已保存，应用状态未完成确认。</p>}
          <ModificationReviewSource receipt={record.candidate.workflowContract?.modificationReview} />
          <DeliveryPreviewImage record={record} projectId={projectId} folderPath={folderPath} />
          {record.status==='applied'&&<VisualEvidencePanel projectId={projectId} folderPath={folderPath} kind="single" eventId={record.id} screenId={record.after.id}/>}
          <details><summary className="cursor-pointer text-slate-400">修改前后页面代码</summary>
            <p className="my-1 text-slate-500">修改前 · {record.before.name}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{record.before.htmlContent.slice(0, 10000)}</pre>
            <p className="my-1 text-slate-500">交付版本 · {record.after.name}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{record.after.htmlContent.slice(0, 10000)}</pre>
            <p className="text-[10px] text-slate-600">每版最多显示 10,000 字符，完整代码与样式保存在工程交付档案中。</p>
          </details>
          <details><summary className="cursor-pointer text-slate-400">交付时的验收记录</summary>
            <p className="my-2 text-amber-300">历史证据仅供回溯，不表示当前页面已经通过检查。</p>
            <EvidenceRecord evidence={record.candidate.validationEvidence!} />
          </details>
        </div>
      </details>;
    })}
    {hasMore && limit < 200 && <button type="button" onClick={() => setLimit(value => value + 10)} className="text-blue-300">查看更多记录</button>}
    {hasMore && limit >= 200 && <p className="text-slate-500">已显示最近 200 份记录，更早的档案仍保留在工程 deliveries 目录中。</p>}
    <RestyleDeliveryHistoryPanel projectId={projectId} folderPath={folderPath} screen={screen} revision={revision} notice={notice}/>
  </section>;
}
