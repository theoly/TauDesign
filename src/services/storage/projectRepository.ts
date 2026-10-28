import { type ProjectDocumentEntry, validateProjectDocument, isSafeProjectDocumentId, MAX_PROJECT_DOCUMENTS } from '../../types/projectDocument';
import { ProjectStorage } from './projectStorage';
import { getBaseCss } from '../../styles/baseCss';
import { getBuiltinDesignProse } from '../../styles/presets/designProse';
import { ArtifactManifest } from '../../types/project';
import { cssUrls, imageSrcsetCandidates } from '../import/htmlImportCss';

/**
 * 将画框对象或元信息规范化为标准 ArtifactManifest (REQ-OD-05 / BR-05.1)
 */
export function normalizeToArtifactManifest(
  raw: Record<string, unknown>,
  deviceProfile: 'pc' | 'mobile' = 'pc'
): ArtifactManifest {
  const id = String(raw.id || 'screen_default');
  return {
    id,
    kind: (raw.kind as ArtifactManifest['kind']) || 'screen',
    renderer: 'html-iframe',
    // Bodies are always saved/read by id. A copied legacy entry must never
    // redirect manifest readers to another page's HTML.
    entry: `screens/${id}.html`,
    title: String(raw.title || raw.name || id),
    device: (raw.device as 'pc' | 'mobile') || deviceProfile,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    metadata: (raw.metadata as Record<string, unknown>) || {}
  };
}

/**
 * 工程文件夹读写 (A2 / T-AE-40, T-AE-42, T-AE-44)。
 *
 * 落 PRD §2.7 的目录结构。此前整个工程写在单个 localStorage key 下（ISSUE-008），
 * 与 PRD D1「Tauri 桌面应用 + 工程文件夹」直接冲突，且把 `Asset.relPath` 这类
 * 本就为文件存储设计的字段架空。
 *
 * ```
 * MyProject.aidesign/
 * ├── project.json         # 主文档（不含画框 HTML 正文、不含会话）
 * ├── base.css             # 基座副本，类名白名单由此解析 (PRD §2.3.1)
 * ├── DESIGN.md            # 设计散文规范副本 (REQ-OD-03 / BR-03.2)
 * ├── screens/{id}.html    # 画框 HTML 基线，便于外部 diff 与版本管理
 * ├── screens/{id}.css     # 画框 scopedCss
 * ├── assets/images|icons  # 附件原文件
 * └── conversations/       # 会话 JSONL 分片（见 conversationStore.ts）
 * ```
 *
 * **画框 HTML 单独成文件**正是 PRD §2.7 选择文件夹的理由之一：可被 Git 版本管理、
 * 可人工检查与外部编辑、损坏时可局部恢复。
 */

const PROJECT_JSON = 'project.json';
const BASE_CSS = 'base.css';
const DESIGN_MD = 'DESIGN.md';
const LOCK_FILE = '.session.lock';

/** project.json 中的画框条目——正文外置，此处只留元信息 */
interface ScreenMeta {
  id: string;
  name: string;
  position: { x: number; y: number };
  measuredHeight?: number;
  thumbnail?: string;
  kind?: string;
  renderer?: string;
  entry?: string;
  title?: string;
  device?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 工程主文档。
 *
 * ⚠️ `screens` 的实际持久化形态是 **Record<id, Screen>**（见 useProjectStore.saveProject），
 * 尽管 `types/project.ts` 的 `ProjectData` 把它声明为 `Screen[]`——这是既有的
 * 类型与实现不符，此处按**真实形态**处理，不去改动持久化契约。
 */
export interface ProjectDocument {
  id: string;
  name: string;
  schemaVersion?: number;
  createdAt?: number;
  savedAt?: number;
  settings: Record<string, unknown>;
  designSystem: Record<string, unknown>;
  designSystemOrigin?: Record<string, unknown>;
  designLibraryBinding?: Record<string, unknown>;
  screens: Record<string, Record<string, unknown>>;
  screenOrder?: string[];
  assets?: unknown;
  components?: unknown;
  decisions?: unknown;
  overrides?: unknown;
  panelStates?: unknown;
  coverImage?: string;
  quickPrompts?: unknown;
  projectDocuments?: Record<string, ProjectDocumentEntry>;
}

type DocumentMeta = Omit<ProjectDocumentEntry, 'content' | 'originalContent'> & { contentFile?: string; originalFile?: string };
// Store autosave creates repositories per action; serialize across those instances.
const projectSaves = new Map<string, Promise<void>>();

export class ProjectRepository {
  constructor(private readonly storage: ProjectStorage) {}

  /** 写入工程。画框正文外置为独立文件，project.json 只留元信息 */
  async save(doc: ProjectDocument): Promise<void> {
    const snapshot = structuredClone(doc);
    const previous = projectSaves.get(doc.id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(() => this.saveSnapshot(snapshot));
    projectSaves.set(doc.id, operation);
    try { await operation; }
    finally { if (projectSaves.get(doc.id) === operation) projectSaves.delete(doc.id); }
  }

  private async saveSnapshot(doc: ProjectDocument): Promise<void> {
    const documents = Object.entries(doc.projectDocuments ?? {});
    if (documents.length > MAX_PROJECT_DOCUMENTS) throw new Error('最多保存 20 份项目文档');
    for (const [id, entry] of documents) {
      validateProjectDocument(entry);
      if (entry.id !== id) throw new Error('文档 ID 与索引不一致');
    }
    const oldRaw = await this.storage.readText(PROJECT_JSON);
    let previousMetas: Record<string, DocumentMeta> = {};
    try { previousMetas = oldRaw ? JSON.parse(oldRaw).projectDocuments ?? {} : {}; } catch { /* recoverable metadata */ }
    const documentMetas: Record<string, DocumentMeta> = {};
    if (documents.length) await this.storage.ensureDir('documents');
    for (const [id, entry] of documents) {
      const { content, originalContent, ...meta } = entry;
      const previous = previousMetas[id];
      if (entry.missing) {
        // Never turn a missing body into a successful empty requirements document.
        documentMetas[id] = { ...previous, ...meta, missing: true, enabled: false };
        continue;
      }
      const previousFile = previous?.contentFile;
      const reusableFile = typeof previousFile === 'string' &&
        previousFile.startsWith(`documents/${id}.`) &&
        /^[a-zA-Z0-9_-]+\.[a-f0-9-]+\.md$/.test(previousFile.slice('documents/'.length)) &&
        await this.storage.readText(previousFile) === content;
      const contentFile = reusableFile ? previousFile : `documents/${id}.${crypto.randomUUID()}.md`;
      if (!reusableFile) {
        await this.storage.writeTextAtomic(contentFile, content);
        await this.storage.writeTextAtomic(`documents/${id}.md`, content);
      }
      const originalFile = `documents/${id}.original.md`;
      const hasOriginal = await this.storage.exists(originalFile);
      if (!hasOriginal && originalContent !== undefined) await this.storage.writeTextAtomic(originalFile, originalContent);
      documentMetas[id] = { ...meta, contentFile,
        ...(hasOriginal || originalContent !== undefined || previous?.originalFile ? { originalFile } : {}) };
    }
    await this.storage.ensureDir('screens');

    const deviceProfile = (doc.settings as { deviceProfile?: 'pc' | 'mobile' }).deviceProfile ?? 'pc';

    const screenMetas: Record<string, ScreenMeta> = {};
    for (const [sid, raw] of Object.entries(doc.screens ?? {})) {
      const { htmlContent, scopedCss, ...meta } = raw;
      if (typeof htmlContent === 'string') {
        await this.storage.writeTextAtomic(`screens/${sid}.html`, htmlContent);
      }
      if (typeof scopedCss === 'string' && scopedCss) {
        await this.storage.writeTextAtomic(`screens/${sid}.css`, scopedCss);
      }

      // REQ-OD-05 / BR-05.1 & BR-05.2: 规范化 ArtifactManifest 并落盘侧车
      const manifest = normalizeToArtifactManifest({ ...raw, id: sid }, deviceProfile);
      await this.storage.writeTextAtomic(
        `screens/${sid}.manifest.json`,
        JSON.stringify(manifest, null, 2)
      );

      screenMetas[sid] = {
        ...manifest,
        name: (raw.name as string) || manifest.title,
        position: (raw.position as { x: number; y: number }) || { x: 0, y: 0 },
        measuredHeight: raw.measuredHeight as number | undefined,
        thumbnail: raw.thumbnail as string | undefined,
        metadata: (raw.metadata as Record<string, unknown>) || {}
      };
    }

    await this.storage.writeTextAtomic(BASE_CSS, getBaseCss(deviceProfile));

    // REQ-OD-03 / BR-03.2: 初始工程根目录生成 DESIGN.md 副本
    const presetId = (doc.designSystem as { id?: string })?.id?.replace(/^theme-/, '') || 'tech-blue';
    const hasDesignMd = await this.storage.exists(DESIGN_MD);
    if (!hasDesignMd) {
      const prose = getBuiltinDesignProse(presetId);
      await this.storage.writeTextAtomic(DESIGN_MD, prose.rulesMarkdown);
    }

    await this.storage.writeTextAtomic(
      PROJECT_JSON,
      JSON.stringify({ ...doc, projectDocuments: documentMetas, screens: screenMetas, savedAt: Date.now() }, null, 2)
    );
  }

  async getDesignProseMarkdown(): Promise<string | null> {
    return this.storage.readText(DESIGN_MD);
  }

  async writeDesignProseMarkdown(content: string): Promise<void> {
    await this.storage.writeTextAtomic(DESIGN_MD, content);
  }

  /** 读回工程。缺失的画框文件跳过而非整体失败——局部损坏可局部恢复 */
  async load(): Promise<ProjectDocument | null> {
    const raw = await this.storage.readText(PROJECT_JSON);
    if (!raw) return null;

    let doc: ProjectDocument;
    try {
      doc = JSON.parse(raw) as ProjectDocument;
    } catch {
      return null;
    }

    const deviceProfile = (doc.settings as { deviceProfile?: 'pc' | 'mobile' })?.deviceProfile ?? 'pc';
    const screens: Record<string, Record<string, unknown>> = {};
    for (const [sid, meta] of Object.entries(doc.screens ?? {})) {
      const htmlContent = await this.storage.readText(`screens/${sid}.html`);
      if (htmlContent === null) {
        // 单个画框文件缺失只跳过该画框——局部损坏可局部恢复，
        // 这正是 PRD §2.7 选择文件夹而非单文件的理由之一
        console.warn(`[project] 画框正文缺失，跳过: ${sid}`);
        continue;
      }
      const scopedCss = await this.storage.readText(`screens/${sid}.css`);

      // 自动补齐历史记录缺失的 renderer / entry 等契约字段 (BR-05.1)
      const norm = normalizeToArtifactManifest({ ...meta, id: sid }, deviceProfile);
      screens[sid] = {
        ...meta,
        renderer: norm.renderer,
        entry: norm.entry,
        kind: norm.kind,
        title: norm.title,
        device: norm.device,
        htmlContent,
        ...(scopedCss ? { scopedCss } : {})
      };
    }
    const projectDocuments: Record<string, ProjectDocumentEntry> = {};
    for (const [id, rawMeta] of Object.entries(doc.projectDocuments ?? {})) {
      if (!isSafeProjectDocumentId(id)) continue;
      const meta = rawMeta as unknown as DocumentMeta;
      // Only accept paths generated for this exact document; never trust JSON paths.
      const safeContentFile = meta.contentFile === `documents/${id}.md` ||
        (typeof meta.contentFile === 'string' && meta.contentFile.startsWith(`documents/${id}.`) &&
          /^[a-zA-Z0-9_-]+\.[a-f0-9-]+\.md$/.test(meta.contentFile.slice('documents/'.length)));
      const content = meta.contentFile && !safeContentFile ? null :
        await this.storage.readText(meta.contentFile ?? `documents/${id}.md`);
      const originalContent = await this.storage.readText(`documents/${id}.original.md`);
      const { contentFile: _contentFile, originalFile: _originalFile, ...entry } = meta;
      projectDocuments[id] = {
        ...entry, id, content: content ?? '',
        ...(originalContent !== null ? { originalContent } : {}),
        ...(content === null || meta.missing ? { missing: true, enabled: false } : {})
      };
    }
    return { ...doc, screens, projectDocuments };
  }

  async isValidProjectFolder(): Promise<boolean> {
    return this.storage.exists(PROJECT_JSON);
  }

  // ── 崩溃恢复 (T-AE-44 / PRD §3.8.5) ────────────────────────────────────
  //
  // 打开工程时落一个 lock，正常关闭时移除。下次打开若发现 lock 仍在，
  // 说明上次是异常退出。会话 JSONL 是追加写的，最多丢最后一行，
  // 因此恢复内容 = 最后一次自动保存 + 完整的会话行。

  async acquireLock(): Promise<void> {
    await this.storage.writeTextAtomic(LOCK_FILE, JSON.stringify({ openedAt: Date.now() }));
  }

  async releaseLock(): Promise<void> {
    await this.storage.remove(LOCK_FILE);
  }

  /** 返回上次异常退出的时间戳；正常关闭过则返回 null */
  async detectUncleanShutdown(): Promise<number | null> {
    const raw = await this.storage.readText(LOCK_FILE);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { openedAt: number }).openedAt;
    } catch {
      return Date.now();
    }
  }
}

// ── localStorage → 工程文件夹迁移 (T-AE-42) ────────────────────────────────

export interface MigrationResult {
  ok: boolean;
  screenCount: number;
  /** 迁移前的原始 JSON，失败时用于回退——绝不在验证通过前删除源数据 */
  backup: string;
  error?: string;
}

/**
 * 迁移一个工程到文件夹，**零丢失**是门禁要求，故流程是：
 *   1. 先留下完整备份；
 *   2. 写入文件夹；
 *   3. **读回并逐画框比对**，任何一处不一致即判失败；
 *   4. 失败时不触碰源数据，由调用方决定是否回退。
 *
 * 源 localStorage 数据在验证通过前绝不删除。
 */
export async function migrateProjectToFolder(
  sourceJson: string,
  storage: ProjectStorage,
  sourceStorage?: ProjectStorage
): Promise<MigrationResult> {
  const backup = sourceJson;
  let doc: ProjectDocument;
  try {
    doc = JSON.parse(sourceJson) as ProjectDocument;
  } catch (e) {
    return { ok: false, screenCount: 0, backup, error: `源数据解析失败: ${String(e)}` };
  }

  const repo = new ProjectRepository(storage);
  try {
    const assets = Object.values(doc.assets ?? {}) as { relPath?: unknown }[];
    const paths = new Set<string>();
    for (const asset of assets) {
      const path = asset?.relPath;
      if (typeof path !== 'string' || !safeMigrationAssetPath(path)) throw new Error('资源路径无效');
      paths.add(path);
    }
    for (const path of migrationResourcePaths(doc)) {
      if (!safeMigrationAssetPath(path)) throw new Error(`资源路径无效：${path}`);
      paths.add(path);
    }
    for (const path of paths) {
      const bytes = await (sourceStorage ?? storage).readBinary(path);
      if (!bytes) throw new Error(`资源文件缺失或为空：${path}`);
      if (sourceStorage) await storage.writeBinary(path, bytes);
      if (await storage.readBinary(path) !== bytes) throw new Error(`资源读回不一致：${path}`);
    }
    await repo.save(doc);
  } catch (e) {
    return { ok: false, screenCount: 0, backup, error: `写入失败: ${String(e)}` };
  }

  // 读回验证：画框数量与每个画框的 HTML 必须逐字节一致
  let reloaded: ProjectDocument | null;
  try { reloaded = await repo.load(); }
  catch (error) { return { ok: false, screenCount: 0, backup, error: `读回验证失败：${String(error)}` }; }
  if (!reloaded) {
    return { ok: false, screenCount: 0, backup, error: '读回验证失败：无法解析 project.json' };
  }
  const srcIds = Object.keys(doc.screens ?? {});
  const gotIds = Object.keys(reloaded.screens ?? {});
  if (gotIds.length !== srcIds.length) {
    return {
      ok: false,
      screenCount: gotIds.length,
      backup,
      error: `读回验证失败：画框数量不符（源 ${srcIds.length}，读回 ${gotIds.length}）`
    };
  }
  for (const sid of srcIds) {
    const got = reloaded.screens[sid];
    if (!got || got.htmlContent !== doc.screens[sid].htmlContent) {
      return { ok: false, screenCount: gotIds.length, backup, error: `读回验证失败：画框 ${sid} 内容不一致` };
    }
    if ((got.scopedCss ?? '') !== (doc.screens[sid].scopedCss ?? '')) {
      return { ok: false, screenCount: gotIds.length, backup, error: `读回验证失败：画框 ${sid} 样式不一致` };
    }
    // The repository may add missing manifest defaults. Authored fields must survive.
    const source = doc.screens[sid];
    const normalized = { ...source, ...normalizeToArtifactManifest({ ...source, id: sid },
      doc.settings.deviceProfile === 'mobile' ? 'mobile' : 'pc') };
    for (const key of Object.keys(source).filter(key => !['htmlContent', 'scopedCss'].includes(key))) {
      if (!sameMigrationValue(normalized[key as keyof typeof normalized], got[key])) {
        return { ok: false, screenCount: gotIds.length, backup, error: `读回验证失败：画框 ${sid} 字段 ${key} 不一致` };
      }
    }
  }

  for (const key of Object.keys(doc).filter(key => !['screens', 'savedAt', 'projectDocuments'].includes(key))) {
    if (!sameMigrationValue(doc[key as keyof ProjectDocument], reloaded[key as keyof ProjectDocument])) {
      return { ok: false, screenCount: gotIds.length, backup, error: `读回验证失败：工程字段 ${key} 不一致` };
    }
  }
  if (!sameMigrationValue(doc.projectDocuments ?? {}, reloaded.projectDocuments ?? {})) {
    return { ok: false, screenCount: gotIds.length, backup, error: '读回验证失败：项目文档不一致' };
  }

  return { ok: true, screenCount: gotIds.length, backup };
}

/** JSON object ordering is not meaningful; array ordering and every saved value are. */
function sameMigrationValue(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function safeMigrationAssetPath(path: string): boolean {
  return /^assets\/(?:images|icons|imports)\/[a-zA-Z0-9_./-]+$/.test(path) &&
    !path.split('/').some(part => part === '.' || part === '..' || !part);
}

/** Imported fonts and CSS images may have no entry in the image-only asset index. */
function migrationResourcePaths(doc: ProjectDocument): Set<string> {
  const values: string[] = [];
  const htmlSources = [...Object.values(doc.screens ?? {}).map(screen => ({ html: screen.htmlContent, css: screen.scopedCss })),
    ...Object.values(doc.components ?? {}).map(component => ({ html: (component as {templateHtml?: string}).templateHtml, css: undefined }))];
  for (const source of htmlSources) {
    if (typeof source.css === 'string') values.push(...cssUrls(source.css));
    const document = new DOMParser().parseFromString(typeof source.html === 'string' ? source.html : '', 'text/html');
    const visit = (root: ParentNode) => {
      for (const element of Array.from(root.querySelectorAll('*'))) {
        for (const attr of ['src', 'poster', 'href', 'xlink:href', 'background']) {
          const value = element.getAttribute(attr);if (value) values.push(value);
        }
        values.push(...imageSrcsetCandidates(element.getAttribute('srcset') ?? '').map(candidate => candidate.url));
        values.push(...cssUrls(element.getAttribute('style') ?? ''));
        if (element.localName === 'style') values.push(...cssUrls(element.textContent ?? ''));
        if (element.localName === 'template') visit((element as HTMLTemplateElement).content);
      }
    };
    visit(document);
  }
  for (const override of Object.values(doc.overrides ?? {})) {
    for (const value of Object.values((override as {declarations?: Record<string, unknown>}).declarations ?? {})) {
      if (typeof value === 'string') values.push(...cssUrls(value));
    }
  }
  return new Set(values.map(value => value.trim().replace(/^\.\//, '').split(/[?#]/)[0])
    .filter(value => value.startsWith('assets/')));
}
