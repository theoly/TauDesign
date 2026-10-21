import { useEffect, useState } from 'react';
import type { Screen } from '../types/project';
import { useProjectStore } from '../stores/useProjectStore';
import { createProjectStorage } from '../services/storage/projectStorage';
import { resolveImportedResources } from '../services/import/importResources';

/** Resolve binaries only in rendering memory. Persistent screen HTML always keeps relative paths. */
export function useScreenResources(screen: Screen | undefined) {
  const projectId = useProjectStore(state => state.id);
  const folderPath = useProjectStore(state => state.folderPath);
  const [resolved, setResolved] = useState<{ key: string; htmlContent: string; scopedCss?: string; error?: string }>();
  const imported = !!screen?.metadata?.importedHtml || /assets\/images\/[a-f0-9]{64}\./.test((screen?.htmlContent ?? '') + (screen?.scopedCss ?? ''));
  const key = `${projectId}\0${folderPath ?? ''}\0${screen?.id}\0${screen?.htmlContent}\0${screen?.scopedCss ?? ''}`;
  useEffect(() => {
    if (!imported || !screen) return;
    let current = true;
    resolveImportedResources(screen.htmlContent, screen.scopedCss, createProjectStorage(projectId, folderPath))
      .then(result => { if (current) setResolved({ key, ...result }); })
      .catch(error => { if (current) setResolved({ key, htmlContent: screen.htmlContent, scopedCss: screen.scopedCss, error: error instanceof Error ? error.message : '资源读取失败' }); });
    return () => { current = false; };
  }, [key, imported]);
  const ready = !imported || resolved?.key === key;
  return {
    screen: screen && imported && resolved?.key === key ? { ...screen, htmlContent: resolved.htmlContent, scopedCss: resolved.scopedCss } : screen,
    loading: !ready,
    error: imported && ready ? resolved?.error : undefined
  };
}
