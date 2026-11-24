import React from 'react';
import { useHistoryStore } from '../../../stores/useHistoryStore';
import { useProjectStore } from '../../../stores/useProjectStore';
import { useT } from '../../../stores/useLocaleStore';
import { Accordion } from '../Accordion';
import { Camera, Redo2, Undo2 } from 'lucide-react';

/** 侧边栏「历史」视图 (PRD §3.0.3 / §3.8) */
export const HistoryPanel: React.FC = () => {
  const t = useT();
  const { past, future, checkpoints, canUndo, canRedo, undo, redo } = useHistoryStore();
  const { updateScreenHtml } = useProjectStore();

  const fmt = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <>
      <div className="px-2 py-1.5 border-b border-host-border flex gap-1.5">
        <button
          onClick={() => undo()}
          disabled={!canUndo()}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-host-border bg-host-sunken hover:bg-host-elevated disabled:opacity-30 text-host-primary rounded-md text-[11px] transition"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>{t('common.undo')}</span>
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo()}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-host-border bg-host-sunken hover:bg-host-elevated disabled:opacity-30 text-host-primary rounded-md text-[11px] transition"
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span>{t('common.redo')}</span>
        </button>
      </div>

      <Accordion panelKey="history.undo" title={t('layout.historyUndoStack')} badge={past.length}>
        {past.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-host-tertiary">{t('layout.historyEmpty')}</p>
        ) : (
          <div className="space-y-0.5 px-1.5">
            {past
              .slice()
              .reverse()
              .map((h, i) => (
                <div
                  key={h.id}
                  className={`px-2 py-1 rounded-md text-[11px] truncate ${
                    i === 0 ? 'bg-host-elevated text-host-primary font-medium' : 'text-host-secondary hover:bg-host-elevated/60'
                  }`}
                  title={h.label}
                >
                  {h.label}
                </div>
              ))}
          </div>
        )}
      </Accordion>

      {future.length > 0 && (
        <Accordion panelKey="history.redo" title={t('layout.historyRedoStack')} badge={future.length} defaultOpen={false}>
          <div className="space-y-0.5 px-1.5">
            {future.map((h) => (
              <div key={h.id} className="px-2 py-1 rounded-md text-[11px] text-host-tertiary truncate" title={h.label}>
                {h.label}
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* D17：每轮 AI 操作前自动建还原点，比依赖用户手动打快照可靠 */}
      <Accordion panelKey="history.checkpoints" title={t('layout.historyCheckpoints')} badge={checkpoints.length}>
        {checkpoints.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-host-tertiary leading-relaxed">
            {t('layout.historyCheckpointHint')}
          </p>
        ) : (
          <div className="space-y-0.5 px-1.5">
            {checkpoints.map((cp) => (
              <button
                key={cp.id}
                onClick={() =>
                  updateScreenHtml(
                    cp.screenSnapshot.screenId,
                    cp.screenSnapshot.htmlContent,
                    t('layout.historyRestoreTo', { label: cp.label })
                  )
                }
                className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-host-secondary hover:bg-host-elevated hover:text-host-primary transition flex items-center gap-1.5"
                title={t('layout.historyRestoreHere')}
              >
                <Camera className="w-3 h-3 text-host-brand shrink-0" />
                <span className="truncate flex-1">{cp.label}</span>
                <span className="text-[10px] text-host-tertiary shrink-0">{fmt(cp.timestamp)}</span>
              </button>
            ))}
          </div>
        )}
      </Accordion>
    </>
  );
};
