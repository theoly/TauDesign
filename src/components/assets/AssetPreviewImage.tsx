import React, { useEffect, useState } from 'react';
import type { Asset } from '../../types/project';
import { useProjectStore } from '../../stores/useProjectStore';
import { createProjectStorage } from '../../services/storage/projectStorage';

/** Asset binaries are project-relative files; only the thumbnail needs a runtime data URL. */
export const AssetPreviewImage: React.FC<{ asset: Asset; className?: string;mask?:boolean }> = ({ asset, className,mask }) => {
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
  const url=resolved?.key===key?resolved.url:asset.relPath.startsWith('assets/')?undefined:asset.relPath;
  return mask?<span role="img" aria-label={asset.name} className={className} style={{display:'block',backgroundColor:'currentColor',maskImage:url?`url("${url}")`:undefined,WebkitMaskImage:url?`url("${url}")`:undefined,maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat',maskPosition:'center',WebkitMaskPosition:'center',maskSize:'contain',WebkitMaskSize:'contain'}}/>:<img src={url} alt={asset.name} className={className} />;
};
