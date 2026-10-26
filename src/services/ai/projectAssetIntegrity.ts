import type { Asset, Screen, StyleOverride } from '../../types/project';
import type { ProjectStorage } from '../storage/projectStorage';
import { resolveImportedResources } from '../import/importResources';

export interface ProjectAssetIssue {
  code: 'invalid_asset_path' | 'unresolved_asset_id' | 'unregistered_asset_reference' | 'missing_asset_file' | 'asset_check_unavailable';
  entityId: string;
  message: string;
}

export interface ProjectAssetAuditReport {
  checkedAt: number;
  screenCount: number;
  files: Array<{ id: string; relPath: string }>;
  issues: ProjectAssetIssue[];
}

/** Read the same local URL locations that the renderer materializes, including
 * imported fonts. Base64 and the materialized copy are ephemeral, never evidence. */
export async function readProjectRenderResources(storage: ProjectStorage, screens: Screen[], assets: Asset[],
  overrides: Record<string, StyleOverride> = {}): Promise<Pick<ProjectAssetAuditReport, 'files' | 'issues'>> {
  const files = new Map<string, {id:string;relPath:string}>(), issues: ProjectAssetIssue[] = [];
  const registered = new Map(assets.map(asset => [asset.relPath, asset]));
  for (const screen of screens) {
    const tracked = Object.create(storage) as ProjectStorage;
    let readFailed = false;
    tracked.readBinary = async path => {
      files.set(path, {id:registered.get(path)?.id ?? `render-resource:${path}`,relPath:path});
      try {
        const bytes = await storage.readBinary(path);
        if (bytes === null) {
          readFailed = true;
          const message = `页面「${screen.name}」的资源文件 ${path} 不存在。`;
          issues.push({code:'missing_asset_file',entityId:screen.id,message});
          throw new Error(message);
        }
        return bytes;
      } catch (error) {
        if (!readFailed) {
          readFailed = true;
          issues.push({code:'asset_check_unavailable',entityId:screen.id,
            message:`无法读取页面「${screen.name}」的资源文件 ${path}：${error instanceof Error ? error.message : String(error)}`});
        }
        throw error;
      }
    };
    try {
      const audit = screenForAssetAudit(screen, overrides);
      await resolveImportedResources(audit.htmlContent, audit.scopedCss, tracked, new Set(registered.keys()));
    } catch (error) {
      if (!readFailed) issues.push({code:'asset_check_unavailable',entityId:screen.id,
        message:`页面「${screen.name}」资源读取检查未完成：${error instanceof Error ? error.message : String(error)}`});
    }
  }
  return {files:[...files.values()],issues};
}

export function isSafeProjectAssetPath(path: string): boolean {
  return /^assets\/(?:images|icons)\/[a-zA-Z0-9_.-]+$/.test(path) && !path.split('/').includes('..');
}

/** Read-only projection of all page styles; never persist the audit CSS back into the page. */
export function screenForAssetAudit(screen: Screen, overrides: Record<string, StyleOverride>): Screen {
  return { ...screen, scopedCss: [screen.scopedCss ?? '', ...Object.entries(overrides)
    .filter(([key]) => key.startsWith(`${screen.id}:`))
    .flatMap(([, override]) => Object.values(override.declarations))].join('\n') };
}

export function referencedProjectAssetPaths(screen: Screen): string[] {
  const doc = new DOMParser().parseFromString(screen.htmlContent ?? '', 'text/html');
  const values: string[] = [];
  for (const element of Array.from(doc.querySelectorAll('[src], [poster], [href], [srcset]'))) {
    for (const attr of ['src', 'poster', 'href']) {
      const value = element.getAttribute(attr);
      if (value) values.push(value);
    }
    const srcset = element.getAttribute('srcset');
    if (srcset) values.push(...srcset.split(',').map(item => item.trim().split(/\s+/)[0]));
  }
  const styles = [screen.scopedCss ?? '', ...Array.from(doc.querySelectorAll('style, [style]'))
    .map(element => element.getAttribute('style') ?? element.textContent ?? '')];
  for (const style of styles) {
    for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) values.push(match[2]);
  }
  return [...new Set(values.map(value => value.trim().replace(/^\.\//, '').split(/[?#]/)[0])
    .filter(value => /^assets\/(?:images|icons)\//.test(value)))];
}

/** Pure metadata/reference audit. The optional storage check below supplies physical evidence. */
export function inspectProjectAssetReferences(screens: Screen[], assets: Asset[]): ProjectAssetIssue[] {
  const issues: ProjectAssetIssue[] = [];
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const byPath = new Map(assets.map(asset => [asset.relPath, asset]));
  for (const asset of assets) {
    if (!isSafeProjectAssetPath(asset.relPath)) issues.push({ code: 'invalid_asset_path', entityId: asset.id, message: `资源「${asset.name}」路径必须是工程内的安全图片或图标路径。` });
  }
  for (const screen of screens) {
    const doc = new DOMParser().parseFromString(screen.htmlContent ?? '', 'text/html');
    for (const element of Array.from(doc.querySelectorAll('[data-asset-id]'))) {
      const assetId = element.getAttribute('data-asset-id')?.trim();
      if (assetId && !byId.has(assetId)) issues.push({ code: 'unresolved_asset_id', entityId: screen.id, message: `页面「${screen.name}」引用了未登记资源 ${assetId}。` });
    }
    for (const path of referencedProjectAssetPaths(screen)) {
      if (!byPath.has(path)) issues.push({ code: 'unregistered_asset_reference', entityId: screen.id, message: `页面「${screen.name}」引用了未登记资源文件 ${path}。` });
    }
  }
  return issues;
}

/** Registered files actually used by one page, including references retained from its baseline. */
export function referencedProjectAssets(screen: Screen, assets: Asset[]): Asset[] {
  const registered = new Map(assets.map(asset => [asset.relPath, asset]));
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const ids = new Set<string>();
  for (const path of referencedProjectAssetPaths(screen)) {
    const asset = registered.get(path);
    if (asset) ids.add(asset.id);
  }
  const doc = new DOMParser().parseFromString(screen.htmlContent ?? '', 'text/html');
  for (const element of Array.from(doc.querySelectorAll('[data-asset-id]'))) {
    const asset = byId.get(element.getAttribute('data-asset-id') ?? '');
    if (asset) ids.add(asset.id);
  }
  return assets.filter(asset => ids.has(asset.id));
}

/** Registered files newly used by a candidate, compared with its original page. */
export function newlyReferencedProjectAssets(original: Screen, candidate: Screen, assets: Asset[]): Asset[] {
  const baseline = new Set(referencedProjectAssets(original, assets).map(asset => asset.id));
  return referencedProjectAssets(candidate, assets).filter(asset => !baseline.has(asset.id));
}

/** Uses the same project storage abstraction as save/load; no browser URL fetches or guessed files. */
export async function verifyProjectAssetFiles(storage: ProjectStorage, assets: Asset[]): Promise<ProjectAssetIssue[]> {
  const issues: ProjectAssetIssue[] = assets.filter(asset => !isSafeProjectAssetPath(asset.relPath)).map(asset => ({
    code: 'invalid_asset_path', entityId: asset.id, message: `资源「${asset.name}」路径必须是工程内的安全图片或图标路径。`
  }));
  const safeAssets = assets.filter(asset => isSafeProjectAssetPath(asset.relPath));
  for (let start = 0; start < safeAssets.length; start += 8) {
    const batch = safeAssets.slice(start, start + 8);
    const results = await Promise.all(batch.map(async asset => {
      try { return await storage.exists(asset.relPath) ? null : { code: 'missing_asset_file' as const, entityId: asset.id,
        message: `资源「${asset.name}」已登记，但文件 ${asset.relPath} 不存在。` }; }
      catch { return { code: 'asset_check_unavailable' as const, entityId: asset.id,
        message: `无法核对资源「${asset.name}」的文件是否存在。` }; }
    }));
    for (const result of results) if (result) issues.push(result);
  }
  return issues;
}

/** Records exactly which project files were checked; existence is not an image decode guarantee. */
export async function auditProjectAssets(storage: ProjectStorage, screens: Screen[], assets: Asset[]): Promise<ProjectAssetAuditReport> {
  const references = inspectProjectAssetReferences(screens, assets);
  const fileIssues = await verifyProjectAssetFiles(storage, assets);
  const rendered = await readProjectRenderResources(storage,screens,assets);
  return { checkedAt: Date.now(), screenCount: screens.length,
    files: [...new Map([...assets.map(asset => ({ id: asset.id, relPath: asset.relPath })),...rendered.files].map(file=>[file.relPath,file])).values()],
    issues: [...new Map([...references, ...fileIssues,...rendered.issues].map(issue => [`${issue.code}:${issue.entityId}:${issue.message}`, issue])).values()] };
}
