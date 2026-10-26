import React, { useEffect, useState } from 'react';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { deliveryPreviewPath } from '../../services/storage/deliveryPreview';
import { isCandidatePreviewPath } from '../../services/storage/candidatePreview';
import { inspectPreviewPng, type PagePreview } from '../../services/storage/pagePreview';

/** Read image bytes only while visible. Source HTML and persisted metadata never receive data URLs. */
export function StoredPagePreview({ preview, projectId, folderPath, owner, name, active }: {
  preview?: PagePreview; projectId: string; folderPath?: string;
  owner: { kind: 'delivery' | 'candidate'; id: string }; name: string; active: boolean;
}) {
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
        if (!validPath) throw new Error('预览图片不属于此记录。');
        const binary = await createProjectStorage(projectId, folderPath).readBinary(path);
        if (binary === null) throw new Error('预览图片文件缺失，代码与验收记录仍可查看。');
        const dimensions = inspectPreviewPng(binary);
        if (dimensions.width !== width || dimensions.height !== height) throw new Error('预览图片尺寸与存档不匹配。');
        if (current) setImage({ key, src: `data:image/png;base64,${binary}` });
      } catch (error) { if (current) setImage({ key, error: error instanceof Error ? error.message : '预览图片读取失败。' }); }
    })();
    return () => { current = false; };
  }, [key, active]);
  const currentImage = image?.key === key ? image : undefined;
  return <div className="mt-2 space-y-2">
    {!preview && <p className="text-slate-500">此记录未保存预览图片。</p>}
    {preview?.status === 'failed' && <p role="alert" className="text-amber-300">预览未生成：{preview.reason} 代码与验收记录已保留。</p>}
    {preview?.status === 'ready' && <>
      <p className="text-slate-500">{width} × {height} · {preview.engine === 'foreign-object' ? '兼容渲染' : '原生渲染'} · 仅首屏</p>
      <p className="text-[10px] text-slate-600">此图记录捕获时的外观，不代表当前页面或跨浏览器像素验收。</p>
      {active && !currentImage && <p role="status" className="text-slate-500">正在读取预览…</p>}
      {currentImage?.error && <p role="alert" className="text-amber-300">{currentImage.error}</p>}
      {active && currentImage?.src && !currentImage.error && <img alt={name} src={currentImage.src}
        onError={() => setImage({ key, error: '预览图片无法解码，代码与验收记录仍可查看。' })}
        className="mx-auto h-auto max-h-80 max-w-full rounded border border-slate-700 object-contain" />}
    </>}
  </div>;
}
