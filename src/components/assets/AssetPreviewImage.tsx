import React, { useEffect, useState } from 'react';
import type { Asset } from '../../types/project';
import { useProjectStore } from '../../stores/useProjectStore';
import { createProjectStorage } from '../../services/storage/projectStorage';

/** Asset binaries are project-relative files; only the thumbnail needs a runtime data URL. */
export const AssetPreviewImage: React.FC<{ asset: Asset; className?: string }> = ({ asset, className }) => {
  const projectId = useProjectStore(state => state.id), folderPath = useProjectStore(state => state.folderPath);
  const key = `${projectId}:${asset.relPath}`;
  const [resolved, setResolved] = useState<{ key: string; url: string }>();
  useEffect(() => {
    if (!asset.relPath.startsWith('assets/')) return;
    let active = true;
    createProjectStorage(projectId, folderPath).readBinary(asset.relPath)
      .then(data => { if (active && data) setResolved({ key, url: `data:${asset.mimeType};base64,${data}` }); })
      .catch(() => { /* The native image fallback still supplies an accessible name. */ });
    return () => { active = false; };
  }, [key, folderPath, asset.mimeType]);
  return <img src={resolved?.key === key ? resolved.url : asset.relPath.startsWith('assets/') ? undefined : asset.relPath} alt={asset.name} className={className} />;
};
