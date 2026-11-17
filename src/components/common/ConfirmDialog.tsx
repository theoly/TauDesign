import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Host-UI confirmation for destructive actions. Prefer this over window.confirm in Tauri WebView. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = '确认删除',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}) => createPortal(
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    data-testid="confirm-dialog"
    onClick={onCancel}
    onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
  >
    <div
      className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 text-xs shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h3 id="confirm-dialog-title" className="flex items-center gap-2 text-sm font-bold text-slate-100">
        <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden />
        <span>{title}</span>
      </h3>
      <div className="mt-3 leading-relaxed text-slate-400">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-slate-800 px-4 py-2 text-slate-200 hover:bg-slate-700"
          data-testid="confirm-dialog-cancel"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500"
          data-testid="confirm-dialog-confirm"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>,
  document.body
);
