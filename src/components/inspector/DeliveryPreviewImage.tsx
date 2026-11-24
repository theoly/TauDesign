import React, { useState } from 'react';
import type { DeliveryRecord } from '../../services/storage/deliveryRepository';
import { StoredPagePreview } from '../canvas/StoredPagePreview';
import { useT } from '../../stores/useLocaleStore';

export function DeliveryPreviewImage({ record, projectId, folderPath }: { record: DeliveryRecord; projectId: string; folderPath?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-slate-400">{t('inspector.deliveryPreviewSummary')}</summary>
    {record.projectId === projectId ? <StoredPagePreview preview={record.preview} projectId={projectId} folderPath={folderPath}
      owner={{ kind: 'delivery', id: record.id }} name={t('inspector.deliveryPreviewName', { name: record.after.name })} active={open} />
      : <p role="alert" className="text-amber-300">{t('inspector.deliveryPreviewForeign')}</p>}
  </details>;
}
