import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';

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
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const t = useT();
  const resolvedConfirm = confirmLabel ?? t('common.confirmDelete');
  const resolvedCancel = cancelLabel ?? t('common.cancel');
  return createPortal(
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    data-testid="confirm-dialog"
    onClick={onCancel}
    onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
  >
    <div
      className="w-full max-w-sm rounded-xl border border-host-border-strong bg-host-dialog p-5 text-xs shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h3 id="confirm-dialog-title" className="flex items-center gap-2 text-sm font-semibold text-host-primary">
        <AlertTriangle className="h-4 w-4 text-host-danger" aria-hidden />
        <span>{title}</span>
      </h3>
      <div className="mt-3 leading-relaxed text-host-secondary">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-host-border bg-host-sunken px-4 py-2 text-host-primary hover:border-host-border-strong transition"
          data-testid="confirm-dialog-cancel"
        >
          {resolvedCancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg border border-host-danger/40 bg-host-sunken px-4 py-2 font-medium text-host-danger hover:bg-host-danger/10 transition"
          data-testid="confirm-dialog-confirm"
        >
          {resolvedConfirm}
        </button>
      </div>
    </div>
  </div>,
  document.body
);
};
