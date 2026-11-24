import React, { useEffect, useState } from 'react';
import { useT } from '../../stores/useLocaleStore';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { deliveryPreviewPath } from '../../services/storage/deliveryPreview';
import { isCandidatePreviewPath } from '../../services/storage/candidatePreview';
import { inspectPreviewPng, type PagePreview } from '../../services/storage/pagePreview';

/** Read image bytes only while visible. Source HTML and persisted metadata never receive data URLs. */
export function StoredPagePreview({ preview, projectId, folderPath, owner, name, active }: {
  preview?: PagePreview; projectId: string; folderPath?: string;
  owner: { kind: 'delivery' | 'candidate'; id: string }; name: string; active: boolean;
}) {
  const t = useT();
  const [image, setImage] = useState<{ key: string; src?: string; error?: string }>();
  const path = preview?.status === 'ready' ? preview.relPath : '';
  const width = preview?.status === 'ready' ? preview.width : 0, height = preview?.status === 'ready' ? preview.height : 0;
  const key = JSON.stringify([projectId, folderPath, owner.kind, owner.id, path, width, height]);
  useEffect(() => {
    let current = true;
    setImage(undefined);
    if (!active || !path) return;
    void (async () => {
      try {
        const validPath = owner.kind === 'delivery' ? path === deliveryPreviewPath(owner.id) : isCandidatePreviewPath(path, owner.id);
        if (!validPath) throw new Error(t('quality.storedPreviewForeign'));
        const binary = await createProjectStorage(projectId, folderPath).readBinary(path);
        if (binary === null) throw new Error(t('quality.storedPreviewMissing'));
        const dimensions = inspectPreviewPng(binary);
        if (dimensions.width !== width || dimensions.height !== height) throw new Error(t('quality.storedPreviewDimensionMismatch'));
        if (current) setImage({ key, src: `data:image/png;base64,${binary}` });
      } catch (error) { if (current) setImage({ key, error: error instanceof Error ? error.message : t('quality.storedPreviewReadFailed') }); }
    })();
    return () => { current = false; };
  }, [key, active]);
  const currentImage = image?.key === key ? image : undefined;
  return <div className="mt-2 space-y-2">
    {!preview && <p className="text-slate-500">{t('quality.storedPreviewNone')}</p>}
    {preview?.status === 'failed' && <p role="alert" className="text-amber-300">{t('quality.storedPreviewFailed', { reason: preview.reason })}</p>}
    {preview?.status === 'ready' && <>
      <p className="text-slate-500">{t('quality.storedPreviewMeta', { width, height, engine: preview.engine === 'foreign-object' ? t('export.engineCompat') : t('export.engineNative') })}</p>
      <p className="text-[10px] text-slate-600">{t('quality.storedPreviewDisclaimer')}</p>
      {active && !currentImage && <p role="status" className="text-slate-500">{t('quality.storedPreviewLoading')}</p>}
      {currentImage?.error && <p role="alert" className="text-amber-300">{currentImage.error}</p>}
      {active && currentImage?.src && !currentImage.error && <img alt={name} src={currentImage.src}
        onError={() => setImage({ key, error: t('quality.storedPreviewDecodeError') })}
        className="mx-auto h-auto max-h-80 max-w-full rounded border border-slate-700 object-contain" />}
    </>}
  </div>;
}
