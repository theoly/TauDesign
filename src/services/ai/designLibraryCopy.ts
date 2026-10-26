import {hasTemplateContract,compileComponentTemplate} from '../../utils/componentTemplate';
import type { Asset, ComponentDefinition, DesignLibraryBinding } from '../../types/project';
import type { DesignSystem } from '../../types/designSystem';
import type { ProjectStorage } from '../storage/projectStorage';
import { contentFingerprint } from './designWorkflow';
import { checkGenerationSourceSafety } from './generationQuality';
import { htmlIsComplete } from '../../utils/htmlCompleteness';
import { designTokenFingerprint } from '../../utils/designSystemIdentity';
import { isSafeProjectAssetPath } from './projectAssetIntegrity';
import { compileTokensToCss } from '../../utils/cssCompiler';

export interface DesignLibraryCopy {
  binding: DesignLibraryBinding;
  designSystem: DesignSystem;
  components: Record<string, ComponentDefinition>;
  assets: Record<string, Asset>;
  /** Transient file payloads: never persist in project.json or conversation records. */
  assetFiles: Array<{ relPath: string; base64Data: string }>;
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])) : value;
}
function validTokens(tokens:DesignSystem['tokens']):boolean {
  const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
  const strings=(v:unknown,keys?:string[])=>object(v)&&(keys??Object.keys(v)).length>0&&(keys??Object.keys(v)).every(k=>typeof v[k]==='string'&&Boolean((v[k] as string).trim()));
  const numbers=(v:unknown)=>object(v)&&Object.keys(v).length>0&&Object.values(v).every(n=>typeof n==='number'&&Number.isFinite(n));
  const pair=(v:unknown)=>strings(v,['light','dark']);
  return Boolean(tokens&&strings(tokens.colors,['success','warning','danger'])&&strings(tokens.colors.primary)&&strings(tokens.colors.neutral)&&
    ['background','surface','surfaceAlt','textPrimary','textSecondary','border'].every(key=>pair(tokens.colors[key as keyof typeof tokens.colors]))&&
    strings(tokens.typography,['fontFamilySans','fontFamilyMono'])&&numbers(tokens.typography.sizes)&&numbers(tokens.typography.weights)&&numbers(tokens.typography.lineHeights)&&
    numbers(tokens.spacing)&&strings(tokens.radius,['none','sm','md','lg','xl','full'])&&
    object(tokens.shadows)&&['sm','md','lg','soft','card','glow'].every(key=>pair(tokens.shadows[key as keyof typeof tokens.shadows]))&&
    strings(tokens.blur,['sm','md','lg'])&&object(tokens.personality)&&['compact','standard','relaxed'].includes(tokens.personality.density)&&
    Number.isFinite(tokens.personality.borderAlpha)&&tokens.personality.borderAlpha>=0&&tokens.personality.borderAlpha<=1);
}

/** Reads a local .aidesign source without loading pages or writing to the source folder. */
export async function readDesignLibraryCopy(storage: Pick<ProjectStorage,'readText'|'readBinary'>, assertCurrent:()=>void = ()=>{}, mode:DesignLibraryBinding['mode']='project_copy'): Promise<DesignLibraryCopy> {
  assertCurrent();
  const raw = await storage.readText('project.json');
  assertCurrent();
  if (!raw) throw new Error('所选文件夹没有 project.json，无法读取设计库。');
  if (new TextEncoder().encode(raw).byteLength > 6_000_000) throw new Error('来源工程清单超过 6 MB，请精简设计库后再导入。');
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('来源工程的 project.json 格式无效。'); }
  if (!data || typeof data.id !== 'string' || !data.id.trim() || typeof data.name !== 'string' ||
    !data.designSystem || typeof data.designSystem.id !== 'string' || typeof data.designSystem.name !== 'string' ||
    !data.designSystem.tokens || typeof data.designSystem.tokens !== 'object') throw new Error('来源工程缺少有效设计系统。');
  if (data.settings?.deviceProfile !== 'pc' && data.settings?.deviceProfile !== 'mobile') throw new Error('来源工程缺少有效设备档位。');
  try {
    if(!validTokens(data.designSystem.tokens))throw new Error();
    if (['light','dark'].some(mode=>/\b(?:undefined|NaN|Infinity)\b/.test(compileTokensToCss(data.designSystem.tokens,mode as 'light'|'dark')))) throw new Error();
  } catch { throw new Error('来源工程的 Token 不完整或无法编译，请先修复设计系统。'); }
  if (data.designSystemOrigin?.tokenVersion !== undefined && (!Number.isInteger(data.designSystemOrigin.tokenVersion) || data.designSystemOrigin.tokenVersion < 1)) throw new Error('来源 Token 版本无效。');
  const sourceId = data.id.trim();
  const sourceComponents: ComponentDefinition[] = Array.isArray(data.components) ? data.components : Object.values(data.components ?? {});
  if (sourceComponents.length > 200) throw new Error('来源工程组件超过 200 个，请先精简设计库。');
  if (sourceComponents.some(component => !component || typeof component.id !== 'string' || !component.id.trim() ||
    typeof component.name !== 'string' || (component.description!==undefined&&typeof component.description!=='string') ||
    (component.version!==undefined&&(!Number.isInteger(component.version)||component.version<1)) ||
    (component.slotDefs!==undefined&&(!Array.isArray(component.slotDefs)||component.slotDefs.some(slot=>!slot||typeof slot.slotName!=='string'||typeof slot.selector!=='string'||!['text','image','node'].includes(slot.type)||typeof slot.defaultContent!=='string'))) ||
    typeof component.templateHtml !== 'string' || !htmlIsComplete(component.templateHtml) ||
    !checkGenerationSourceSafety(component.templateHtml).passed)) throw new Error('来源工程包含不完整或不安全的组件模板。');
  for(const component of sourceComponents)if(hasTemplateContract(component))compileComponentTemplate(component);
  const sourceIds = sourceComponents.map(component => component.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('来源工程组件 ID 重复。');
  let fingerprint = contentFingerprint(JSON.stringify(canonical({version:2,id:sourceId,name:data.name,device:data.settings.deviceProfile,
    theme:[data.designSystem.id,data.designSystem.name,designTokenFingerprint(data.designSystem.tokens),data.designSystemOrigin?.tokenVersion??1],
    components: sourceComponents.map(component => [component.id,component.name,component.description,component.slotDefs,component.templateHtml,component.version??1,...(hasTemplateContract(component)?[component.templateContract]:[])]).sort(([a],[b])=>String(a).localeCompare(String(b))) })));
  const mappedIds = new Map(sourceIds.map(id => [id, `lib-${safeId(sourceId)}-${safeId(id)}`]));
  if (new Set(mappedIds.values()).size !== mappedIds.size) throw new Error('来源工程组件 ID 规范化后冲突。');
  const sourceAssets: Asset[] = Array.isArray(data.assets) ? data.assets : Object.values(data.assets ?? {});
  if (sourceAssets.some(asset=>!asset||typeof asset.id!=='string'||!asset.id||typeof asset.relPath!=='string'||typeof asset.name!=='string'||
    !['image','svg_icon'].includes(asset.type)||typeof asset.mimeType!=='string'||!asset.mimeType.startsWith('image/')||
    !['upload','ai_generated','builtin'].includes(asset.source)||(asset.rawSvg!==undefined&&typeof asset.rawSvg!=='string')||
    (asset.dimensions!==undefined&&(!Number.isFinite(asset.dimensions?.width)||!Number.isFinite(asset.dimensions?.height)))) ||
    new Set(sourceAssets.map(asset=>asset.id)).size!==sourceAssets.length || new Set(sourceAssets.map(asset=>asset.relPath)).size!==sourceAssets.length) throw new Error('来源资源登记无效或 ID/路径重复。');
  const assetsById = new Map(sourceAssets.map(asset => [asset.id, asset]));
  const assetsByPath = new Map(sourceAssets.map(asset => [asset.relPath, asset]));
  const usedAssetIds = new Set<string>();
  const documents = new Map<string, Element>();
  const localPath = /(?:^|[\s,'"(])(?:\.\/)?(assets\/(?:images|icons)\/[^\s,'"()?#]+)(?:[?#][^\s,'"()]*)?/g;
  for (const source of sourceComponents) {
    const doc = new DOMParser().parseFromString(`<body>${source.templateHtml}</body>`, 'text/html');
    if (doc.body.children.length !== 1) throw new Error(`组件「${source.name || source.id}」必须有单个根节点。`);
    const root = doc.body.firstElementChild!;
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const assetId = element.getAttribute('data-asset-id');
      if (assetId) {
        if (!assetsById.has(assetId)) throw new Error(`组件「${source.name || source.id}」引用了未登记资源 ${assetId}。`);
        usedAssetIds.add(assetId);
      }
      for (const attribute of Array.from(element.attributes)) {
        for (const match of attribute.value.matchAll(localPath)) {
          const path = match[1];
          if (!isSafeProjectAssetPath(path) || !assetsByPath.has(path)) throw new Error(`组件「${source.name || source.id}」引用了未登记或不安全的资源 ${path}。`);
          usedAssetIds.add(assetsByPath.get(path)!.id);
        }
      }
      if (element.tagName === 'STYLE') for (const match of (element.textContent ?? '').matchAll(localPath)) {
        const path = match[1];
        if (!isSafeProjectAssetPath(path) || !assetsByPath.has(path)) throw new Error(`组件「${source.name || source.id}」引用了未登记或不安全的资源 ${path}。`);
        usedAssetIds.add(assetsByPath.get(path)!.id);
      }
    }
    documents.set(source.id, root);
  }
  if (usedAssetIds.size > 100) throw new Error('来源组件引用的资源超过 100 个，请先精简设计库。');
  const assets: Record<string, Asset> = {};
  const assetFiles: DesignLibraryCopy['assetFiles'] = [];
  const mappedAssetIds = new Map<string, string>();
  const mappedPaths = new Map<string, string>();
  let totalAssetBytes = 0;
  const originalFiles = new Map<string,string>();
  for (const oldId of usedAssetIds) {
    const asset = assetsById.get(oldId)!;
    if (!isSafeProjectAssetPath(asset.relPath)) throw new Error(`资源「${asset.name}」路径不安全。`);
    const base64Data = await storage.readBinary(asset.relPath);
    assertCurrent();
    if (!base64Data) throw new Error(`资源「${asset.name}」文件缺失：${asset.relPath}。`);
    totalAssetBytes += Math.ceil(base64Data.length * 3 / 4);
    if (totalAssetBytes > 40 * 1024 * 1024) throw new Error('来源组件引用的资源总量超过 40 MB，请精简后导入。');
    const id = `lib-${safeId(sourceId)}-${safeId(oldId)}${mode==='pinned_reference'?`-${contentFingerprint(base64Data)}`:''}`;
    const extension = asset.relPath.split('.').pop()!;
    const dir = asset.relPath.startsWith('assets/icons/') ? 'icons' : 'images';
    const relPath = `assets/${dir}/${id}-${contentFingerprint(base64Data)}.${extension}`;
    if (assets[id]) throw new Error('来源资源 ID 规范化后冲突。');
    assets[id] = { ...asset, id, relPath, refCount: 0 };
    assetFiles.push({ relPath, base64Data });
    originalFiles.set(asset.relPath,base64Data);
    mappedAssetIds.set(oldId, id);
    mappedPaths.set(asset.relPath, relPath);
  }
  fingerprint = contentFingerprint(JSON.stringify({ base: fingerprint,
    assets: [...usedAssetIds].sort().map(id=>{const asset=assetsById.get(id)!;return [canonical({...asset,refCount:0}),contentFingerprint(originalFiles.get(asset.relPath)!)];}) }));
  const components: Record<string, ComponentDefinition> = {};
  for (const source of sourceComponents) {
    const root = documents.get(source.id)!;
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const oldAssetId = element.getAttribute('data-asset-id');
      if (oldAssetId) element.setAttribute('data-asset-id', mappedAssetIds.get(oldAssetId)!);
      for (const attribute of Array.from(element.attributes)) {
        const value = attribute.value.replace(localPath, (match, path: string) => match.replace(path, mappedPaths.get(path) ?? path));
        if (value !== attribute.value) element.setAttribute(attribute.name, value);
      }
      if (element.tagName === 'STYLE') {
        element.textContent = (element.textContent ?? '').replace(localPath,
          (match, path: string) => match.replace(path, mappedPaths.get(path) ?? path));
      }
    }
    for (const element of [root, ...Array.from(root.querySelectorAll('[data-component-id]'))]) {
      const oldId = element.getAttribute('data-component-id');
      if (oldId && !mappedIds.has(oldId)) throw new Error(`组件「${source.name || source.id}」引用了来源库中不存在的组件 ${oldId}。`);
      if (oldId && mappedIds.has(oldId)) element.setAttribute('data-component-id', mappedIds.get(oldId)!);
    }
    const id = mappedIds.get(source.id)!;
    components[id] = { id, name:source.name, ...(source.description!==undefined?{description:source.description}:{}),
      ...(source.slotDefs!==undefined?{slotDefs:structuredClone(source.slotDefs)}:{}), ...(hasTemplateContract(source)?{templateContract:structuredClone(source.templateContract)}:{}), templateHtml: root.outerHTML,
      origin: { kind: 'library_copy', sourceProjectId: sourceId, sourceComponentId: source.id, sourceFingerprint: fingerprint },
      version: source.version ?? 1, createdAt: Date.now(), updatedAt: Date.now() };
  }
  for(const component of Object.values(components))if(hasTemplateContract(component))compileComponentTemplate(component);
  for (const [path,bytes] of originalFiles) {
    if (await storage.readBinary(path)!==bytes) throw new Error('读取期间来源资源已变化，请重新分析设计库。');
    assertCurrent();
  }
  if (await storage.readText('project.json')!==raw) throw new Error('读取期间来源工程已变化，请重新分析设计库。');
  assertCurrent();
  return { designSystem: structuredClone({id:data.designSystem.id,name:data.designSystem.name,tokens:data.designSystem.tokens}), components, assets, assetFiles,
    binding: { mode, sourceProjectId: sourceId, sourceName: data.name,
      sourceDeviceProfile: data.settings.deviceProfile,
      sourceFingerprint: fingerprint, sourceFingerprintVersion:2, sourceTokenVersion: data.designSystemOrigin?.tokenVersion ?? 1, importedAt: Date.now() } };
}

/** Must run before installing files as well as inside the synchronous History action. */
export function assertDesignLibraryCopyCompatible(copy:DesignLibraryCopy,state:{id:string;settings:{deviceProfile:'pc'|'mobile'};components:Record<string,ComponentDefinition>;assets:Record<string,Asset>;designLibraryBinding?:DesignLibraryBinding}):void {
  for(const component of Object.values(copy.components))if(hasTemplateContract(component))compileComponentTemplate(component);
  if(!['project_copy','pinned_reference'].includes(copy.binding.mode)||!copy.binding.sourceProjectId||!copy.binding.sourceFingerprint)throw new Error('设计库副本来源信息不完整。');
  if(state.designLibraryBinding?.mode==='pinned_reference'&&(copy.binding.mode!=='pinned_reference'||copy.binding.sourceProjectId!==state.designLibraryBinding.sourceProjectId))throw new Error('只读参考只能显式更新同一来源；请先转为项目副本再更换来源或模式。');
  if(copy.binding.sourceProjectId===state.id)throw new Error('不能将当前工程作为自己的设计库来源。');
  if(copy.binding.sourceDeviceProfile!==state.settings.deviceProfile)throw new Error('来源与当前工程设备档位不同，不能复制组件样式。');
  for(const [id,component] of Object.entries(copy.components))if(state.components[id]&&(state.components[id].origin?.kind!=='library_copy'||state.components[id].origin?.sourceProjectId!==copy.binding.sourceProjectId))throw new Error(`组件 ID ${id} 与现有工程冲突，未导入设计库。`);
  for(const [id,asset] of Object.entries(copy.assets)){
    if(state.assets[id]&&state.assets[id].relPath!==asset.relPath)throw new Error(`资源 ID ${id} 与现有工程冲突，未导入设计库。`);
    if(Object.values(state.assets).some(existing=>existing.id!==id&&existing.relPath===asset.relPath))throw new Error(`资源文件 ${asset.relPath} 与现有工程冲突，未导入设计库。`);
  }
}

/** Files are installed before metadata/History changes; failed installs roll back only newly created files. */
export async function installDesignLibraryCopyFiles(copy: DesignLibraryCopy, storage: ProjectStorage): Promise<() => Promise<void>> {
  const written: string[] = [];
  try {
    for (const file of copy.assetFiles) {
      if (!isSafeProjectAssetPath(file.relPath)) throw new Error(`设计库资源路径不安全：${file.relPath}`);
      const existing = await storage.readBinary(file.relPath);
      if (existing !== null) {
        if (existing !== file.base64Data) throw new Error(`目标工程资源文件冲突：${file.relPath}`);
        continue;
      }
      await storage.ensureDir(file.relPath.substring(0, file.relPath.lastIndexOf('/')));
      written.push(file.relPath);
      await storage.writeBinary(file.relPath, file.base64Data);
    }
  } catch (error) {
    await Promise.allSettled(written.map(path => storage.remove(path)));
    throw error;
  }
  return async () => { await Promise.allSettled(written.map(path => storage.remove(path))); };
}
