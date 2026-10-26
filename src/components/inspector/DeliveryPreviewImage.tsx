import React, { useState } from 'react';
import type { DeliveryRecord } from '../../services/storage/deliveryRepository';
import { StoredPagePreview } from '../canvas/StoredPagePreview';

export function DeliveryPreviewImage({ record, projectId, folderPath }: { record: DeliveryRecord; projectId: string; folderPath?: string }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-slate-400">交付首屏预览</summary>
    {record.projectId === projectId ? <StoredPagePreview preview={record.preview} projectId={projectId} folderPath={folderPath}
      owner={{ kind: 'delivery', id: record.id }} name={`${record.after.name} · 交付首屏预览`} active={open} />
      : <p role="alert" className="text-amber-300">预览图片不属于此工程。</p>}
  </details>;
}
