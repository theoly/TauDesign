import { useEffect, useMemo, useState } from 'react';
import type { Asset, Screen } from '../types/project';
import { useProjectStore } from '../stores/useProjectStore';
import { createProjectStorage } from '../services/storage/projectStorage';
import { resolveImportedResources } from '../services/import/importResources';
import { referencedProjectAssetPaths } from '../services/ai/projectAssetIntegrity';
import {createRenderResourceSnapshot,type RenderResourceFile} from '../services/storage/renderResourceSnapshot';
const emptyFiles:RenderResourceFile[]=[];

/** Resolve binaries only in rendering memory. Persistent screen HTML always keeps relative paths. */
export function useScreenResources(screen: Screen | undefined,refreshKey=0) {
  const projectId = useProjectStore(state => state.id);
  const folderPath = useProjectStore(state => state.folderPath);
  const assets = useProjectStore(state => state.assets);
  const registeredPaths = useMemo(() => new Set(Object.values(assets).map(asset => asset.relPath)), [assets]);
  const [resolved, setResolved] = useState<{ key: string; assets: Record<string,Asset>; htmlContent: string; scopedCss?: string; resourceFiles?:RenderResourceFile[];error?: string }>();
  const needsResources = useMemo(() => Boolean(screen && (screen.metadata?.importedHtml ||
    /assets\/(?:images|icons|imports)\//.test(screen.htmlContent + (screen.scopedCss ?? '')) ||
    referencedProjectAssetPaths(screen).some(path => registeredPaths.has(path)))),
    [screen?.htmlContent,screen?.scopedCss,screen?.metadata?.importedHtml,registeredPaths]);
  const key = `${projectId}\0${folderPath ?? ''}\0${screen?.id}\0${screen?.htmlContent}\0${screen?.scopedCss ?? ''}\0${refreshKey}`;
  useEffect(() => {
    if (!needsResources || !screen) return;
    let current = true;
    const snapshot=createRenderResourceSnapshot(createProjectStorage(projectId,folderPath));
    resolveImportedResources(screen.htmlContent, screen.scopedCss, snapshot.storage, registeredPaths)
      .then(async result => { const resourceFiles=await snapshot.files();if (current) setResolved({ key, assets, ...result,resourceFiles }); })
      .catch(error => { if (current) setResolved({ key, assets, htmlContent: screen.htmlContent, scopedCss: screen.scopedCss, error: error instanceof Error ? error.message : '资源读取失败' }); });
    return () => { current = false; };
  }, [key, needsResources, registeredPaths]);
  const ready = !needsResources || (resolved?.key === key && resolved.assets === assets);
  return {
    screen: screen && needsResources && resolved?.key === key && resolved.assets === assets ? { ...screen, htmlContent: resolved.htmlContent, scopedCss: resolved.scopedCss } : screen,
    loading: !ready,
    resourceFiles:needsResources?resolved?.resourceFiles??emptyFiles:emptyFiles,
    error: needsResources && ready ? resolved?.error : undefined
  };
}

/** L4 is hot-applied separately: resolving a local CSS URL must not rebuild the authored DOM. */
export function useStyleResources(css:string,refreshKey=0){
 const projectId=useProjectStore(s=>s.id),folderPath=useProjectStore(s=>s.folderPath),assets=useProjectStore(s=>s.assets);
 const paths=useMemo(()=>new Set(Object.values(assets).map(a=>a.relPath)),[assets]);
 const key=JSON.stringify([projectId,folderPath,css,refreshKey]),needed=/assets\/(?:images|icons|imports)\//.test(css);
 const [resolved,setResolved]=useState<{key:string;assets:typeof assets;css:string;files:RenderResourceFile[];error?:string}>();
 useEffect(()=>{
  if(!needed)return;
  let current=true;const snapshot=createRenderResourceSnapshot(createProjectStorage(projectId,folderPath));
  void resolveImportedResources('<body></body>',css,snapshot.storage,paths).then(async value=>{
   const files=await snapshot.files();if(current)setResolved({key,assets,css:value.scopedCss??css,files});
  }).catch(error=>{if(current)setResolved({key,assets,css,files:[],error:error instanceof Error?error.message:'样式资源读取失败。'});});
  return ()=>{current=false;};
 },[key,needed,paths]);
 const ready=!needed||(resolved?.key===key&&resolved.assets===assets);
 return {css:needed&&ready?resolved!.css:css,loading:!ready,error:needed&&ready?resolved?.error:undefined,
  resourceFiles:needed&&ready?resolved!.files:emptyFiles};
}
