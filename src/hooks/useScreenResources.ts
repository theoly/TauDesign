import {createMediaResourceSession} from '../services/storage/mediaResourceSession';
import {createMediaDiagnostic} from '../services/storage/mediaDiagnostics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Asset, Screen } from '../types/project';
import { useProjectStore } from '../stores/useProjectStore';
import { createProjectStorage } from '../services/storage/projectStorage';
import { resolveImportedResources } from '../services/import/importResources';
import { referencedProjectAssetPaths } from '../services/ai/projectAssetIntegrity';
import {createRenderResourceSnapshot,type RenderResourceFile} from '../services/storage/renderResourceSnapshot';
const emptyFiles:RenderResourceFile[]=[];

/** Resolve binaries only in rendering memory. Persistent screen HTML always keeps relative paths. */
export function useScreenResources(screen: Screen | undefined,refreshKey=0,usage:'preview'|'export'='preview') {
  const projectId = useProjectStore(state => state.id);
  const folderPath = useProjectStore(state => state.folderPath);
  const assets = useProjectStore(state => state.assets);
  const registeredPaths = useMemo(() => new Set(Object.values(assets).map(asset => asset.relPath)), [assets]);
  const [retryRevision,retry]=useState(0);
  const retryResources=useCallback(()=>{createMediaDiagnostic({screenId:screen?.id,usage,scope:'screen'})('retry','started');retry(value=>value+1);},[screen?.id,usage]);
  const [resolved, setResolved] = useState<{ key: string; assets: Record<string,Asset>; htmlContent: string; scopedCss?: string; resourceFiles?:RenderResourceFile[];error?: string }>();
  const needsResources = useMemo(() => Boolean(screen && (screen.metadata?.importedHtml ||
    /assets\/(?:images|icons|imports|media)\//.test(screen.htmlContent + (screen.scopedCss ?? '')) ||
    referencedProjectAssetPaths(screen).some(path => registeredPaths.has(path)))),
    [screen?.htmlContent,screen?.scopedCss,screen?.metadata?.importedHtml,registeredPaths]);
  const key = `${usage}\0${projectId}\0${folderPath ?? ''}\0${screen?.id}\0${screen?.htmlContent}\0${screen?.scopedCss ?? ''}\0${refreshKey}\0${retryRevision}`;
  useEffect(() => {
    if (!needsResources || !screen) return;
    let current = true,settled=false;const context={screenId:screen.id,usage,scope:'screen' as const},diagnostic=createMediaDiagnostic(context),media=usage==='preview'?createMediaResourceSession(context):undefined;
    diagnostic('resource-read','started');
    const snapshot=createRenderResourceSnapshot(createProjectStorage(projectId,folderPath));
    resolveImportedResources(screen.htmlContent, screen.scopedCss, snapshot.storage, registeredPaths,media?{referenceUrl:media.url}:undefined)
      .then(async result => { const resourceFiles=await snapshot.files();settled=true;diagnostic('resolve',current?'completed':'canceled');if (current) setResolved({ key, assets, ...result,resourceFiles }); })
      .catch(error => { settled=true;diagnostic('resolve',current?'failed':'canceled',{error,category:'read'});void media?.close().catch(()=>{});if (current) setResolved({ key, assets, htmlContent: screen.htmlContent, scopedCss: screen.scopedCss, error: error instanceof Error ? error.message : '资源读取失败' }); });
    return () => { current = false;diagnostic('close',settled?'completed':'canceled');void media?.close().catch(()=>{}); };
  }, [key, needsResources, registeredPaths]);
  const ready = !needsResources || (resolved?.key === key && resolved.assets === assets);
  return {
    screen: screen && needsResources && resolved?.key === key && resolved.assets === assets ? { ...screen, htmlContent: resolved.htmlContent, scopedCss: resolved.scopedCss } : screen,
    loading: !ready,
    resourceFiles:needsResources&&ready?resolved?.resourceFiles??emptyFiles:emptyFiles,
    retry:retryResources,
    error: needsResources && ready ? resolved?.error : undefined
  };
}

/** L4 is hot-applied separately: resolving a local CSS URL must not rebuild the authored DOM. */
export function useStyleResources(css:string,refreshKey=0,usage:'preview'|'export'='preview',screenId?:string){
 const projectId=useProjectStore(s=>s.id),folderPath=useProjectStore(s=>s.folderPath),assets=useProjectStore(s=>s.assets);
 const paths=useMemo(()=>new Set(Object.values(assets).map(a=>a.relPath)),[assets]);
 const [retryRevision,retry]=useState(0);
 const retryResources=useCallback(()=>{createMediaDiagnostic({screenId,usage,scope:'style'})('retry','started');retry(value=>value+1);},[screenId,usage]);
 const key=JSON.stringify([usage,projectId,folderPath,css,refreshKey,retryRevision]),needed=/assets\/(?:images|icons|imports|media)\//.test(css);
 const [resolved,setResolved]=useState<{key:string;assets:typeof assets;css:string;files:RenderResourceFile[];error?:string}>();
 useEffect(()=>{
  if(!needed)return;
  let current=true,settled=false;const context={screenId,usage,scope:'style' as const},diagnostic=createMediaDiagnostic(context),media=usage==='preview'?createMediaResourceSession(context):undefined;const snapshot=createRenderResourceSnapshot(createProjectStorage(projectId,folderPath));
  diagnostic('resource-read','started');
  void resolveImportedResources('<body></body>',css,snapshot.storage,paths,media?{referenceUrl:media.url}:undefined).then(async value=>{
   const files=await snapshot.files();settled=true;diagnostic('resolve',current?'completed':'canceled');if(current)setResolved({key,assets,css:value.scopedCss??css,files});
  }).catch(error=>{settled=true;diagnostic('resolve',current?'failed':'canceled',{error,category:'read'});void media?.close().catch(()=>{});if(current)setResolved({key,assets,css,files:[],error:error instanceof Error?error.message:'样式资源读取失败。'});});
  return ()=>{current=false;diagnostic('close',settled?'completed':'canceled');void media?.close().catch(()=>{});};
 },[key,needed,paths,screenId]);
 const ready=!needed||(resolved?.key===key&&resolved.assets===assets);
 return {css:needed&&ready?resolved!.css:css,loading:!ready,error:needed&&ready?resolved?.error:undefined,retry:retryResources,
  resourceFiles:needed&&ready?resolved!.files:emptyFiles};
}
