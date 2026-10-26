import { useEffect, useMemo, useState } from 'react';
import type { Asset, Screen } from '../types/project';
import { useProjectStore } from '../stores/useProjectStore';
import { createProjectStorage } from '../services/storage/projectStorage';
import { resolveImportedResources } from '../services/import/importResources';
import { referencedProjectAssetPaths } from '../services/ai/projectAssetIntegrity';

/** Resolve binaries only in rendering memory. Persistent screen HTML always keeps relative paths. */
export function useScreenResources(screen: Screen | undefined) {
  const projectId = useProjectStore(state => state.id);
  const folderPath = useProjectStore(state => state.folderPath);
  const assets = useProjectStore(state => state.assets);
  const registeredPaths = useMemo(() => new Set(Object.values(assets).map(asset => asset.relPath)), [assets]);
  const [resolved, setResolved] = useState<{ key: string; assets: Record<string,Asset>; htmlContent: string; scopedCss?: string; error?: string }>();
  const needsResources = useMemo(() => Boolean(screen && (screen.metadata?.importedHtml ||
    /assets\/images\/[a-f0-9]{64}\./.test(screen.htmlContent + (screen.scopedCss ?? '')) ||
    referencedProjectAssetPaths(screen).some(path => registeredPaths.has(path)))),
    [screen?.htmlContent,screen?.scopedCss,screen?.metadata?.importedHtml,registeredPaths]);
  const key = `${projectId}\0${folderPath ?? ''}\0${screen?.id}\0${screen?.htmlContent}\0${screen?.scopedCss ?? ''}`;
  useEffect(() => {
    if (!needsResources || !screen) return;
    let current = true;
    resolveImportedResources(screen.htmlContent, screen.scopedCss, createProjectStorage(projectId, folderPath), registeredPaths)
      .then(result => { if (current) setResolved({ key, assets, ...result }); })
      .catch(error => { if (current) setResolved({ key, assets, htmlContent: screen.htmlContent, scopedCss: screen.scopedCss, error: error instanceof Error ? error.message : '资源读取失败' }); });
    return () => { current = false; };
  }, [key, needsResources, registeredPaths]);
  const ready = !needsResources || (resolved?.key === key && resolved.assets === assets);
  return {
    screen: screen && needsResources && resolved?.key === key && resolved.assets === assets ? { ...screen, htmlContent: resolved.htmlContent, scopedCss: resolved.scopedCss } : screen,
    loading: !ready,
    error: needsResources && ready ? resolved?.error : undefined
  };
}
