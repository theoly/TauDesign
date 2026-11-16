import type { ProjectStorage } from '../services/storage/projectStorage';
import { computeMotherContentFingerprint } from './fingerprint';
import { ingestMotherHtml } from './ingest';
import type {
  MotherIngestResult,
  MotherOrigin,
  MotherPage,
  MotherPageKind,
  MotherPageMeta,
  MotherRegionExcerpt
} from './types';

/** Project-local mother library lives under `.aidesign/mothers/` (sidecar; not managed snapshot). */
export const MOTHERS_DIR = 'mothers';
export const MOTHERS_INDEX = `${MOTHERS_DIR}/index.json`;

export type MotherSaveOrigin = Extract<MotherOrigin, 'project-local' | 'user-global'>;

export interface MotherIndexEntry {
  id: string;
  updatedAt: string;
}

export interface MotherIndexDocument {
  version: 1;
  entries: MotherIndexEntry[];
}

export interface SaveMotherResult {
  ok: boolean;
  mother?: MotherPage;
  ingest: MotherIngestResult;
  error?: string;
}

const SAFE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;

export function isSafeMotherId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

function motherDir(id: string): string {
  return `${MOTHERS_DIR}/${id}`;
}

function emptyIndex(): MotherIndexDocument {
  return { version: 1, entries: [] };
}

async function readIndex(storage: ProjectStorage): Promise<MotherIndexDocument> {
  const raw = await storage.readText(MOTHERS_INDEX);
  if (raw === null) return emptyIndex();
  try {
    const parsed = JSON.parse(raw) as MotherIndexDocument;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return emptyIndex();
    return {
      version: 1,
      entries: parsed.entries.filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          isSafeMotherId(entry.id) &&
          typeof entry.updatedAt === 'string'
      )
    };
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(storage: ProjectStorage, index: MotherIndexDocument): Promise<void> {
  await storage.ensureDir(MOTHERS_DIR);
  await storage.writeTextAtomic(MOTHERS_INDEX, JSON.stringify(index, null, 2));
}

async function loadRegions(storage: ProjectStorage, id: string): Promise<MotherRegionExcerpt[]> {
  const prefix = `${motherDir(id)}/regions`;
  let names: string[] = [];
  try {
    names = await storage.listDir(prefix);
  } catch {
    return [];
  }
  const regions: MotherRegionExcerpt[] = [];
  for (const name of names.filter((n) => n.endsWith('.html')).sort()) {
    const html = await storage.readText(`${prefix}/${name}`);
    if (html === null) continue;
    regions.push({ role: name.replace(/\.html$/i, ''), html });
  }
  return regions;
}

/** Load one project-local mother; missing files → null (legacy projects without mothers/ stay empty). */
export async function loadProjectLocalMother(
  storage: ProjectStorage,
  id: string
): Promise<MotherPage | null> {
  if (!isSafeMotherId(id)) return null;
  const dir = motherDir(id);
  const metaRaw = await storage.readText(`${dir}/meta.json`);
  const bodyHtml = await storage.readText(`${dir}/body.html`);
  if (metaRaw === null || bodyHtml === null) return null;
  let meta: MotherPageMeta;
  try {
    meta = JSON.parse(metaRaw) as MotherPageMeta;
  } catch {
    return null;
  }
  if (meta.id !== id || meta.origin !== 'project-local') return null;
  const regions = await loadRegions(storage, id);
  const fingerprint = computeMotherContentFingerprint(bodyHtml, regions);
  if (meta.contentFingerprint !== fingerprint) return null;
  return { meta, bodyHtml, regions };
}

/** List project-local mothers. Missing `mothers/` or index → []. */
export async function listProjectLocalMothers(storage: ProjectStorage): Promise<MotherPage[]> {
  const index = await readIndex(storage);
  const mothers: MotherPage[] = [];
  for (const entry of index.entries) {
    const mother = await loadProjectLocalMother(storage, entry.id);
    if (mother) mothers.push(mother);
  }
  return mothers;
}

/**
 * Persist a sealed mother under project-local `mothers/{id}/`.
 * Caller must pass ingest-clean HTML (this re-checks ingest before write).
 */
export async function saveMotherProjectLocal(
  storage: ProjectStorage,
  mother: MotherPage
): Promise<SaveMotherResult> {
  const { meta, bodyHtml, regions } = mother;
  if (!isSafeMotherId(meta.id)) {
    return {
      ok: false,
      ingest: { ok: false, unknownClassCount: 0, issues: [] },
      error: '母版 id 非法'
    };
  }
  if (meta.origin !== 'project-local') {
    return {
      ok: false,
      ingest: { ok: false, unknownClassCount: 0, issues: [] },
      error: '仅支持 origin=project-local 写入工程库'
    };
  }
  const fingerprint = computeMotherContentFingerprint(bodyHtml, regions);
  const sealed: MotherPage = {
    meta: { ...meta, contentFingerprint: fingerprint, origin: 'project-local' },
    bodyHtml,
    regions
  };
  const ingest = ingestMotherHtml({
    bodyHtml: sealed.bodyHtml,
    device: sealed.meta.device,
    regions: sealed.regions,
    meta: { contentFingerprint: sealed.meta.contentFingerprint }
  });
  if (!ingest.ok) {
    return { ok: false, ingest, error: '母版未通过 ingest 门禁' };
  }

  const dir = motherDir(sealed.meta.id);
  await storage.ensureDir(dir);
  await storage.writeTextAtomic(`${dir}/meta.json`, JSON.stringify(sealed.meta, null, 2));
  await storage.writeTextAtomic(`${dir}/body.html`, sealed.bodyHtml);
  if (sealed.regions.length) {
    await storage.ensureDir(`${dir}/regions`);
    for (const region of sealed.regions) {
      const role = region.role.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
      if (!role) continue;
      await storage.writeTextAtomic(`${dir}/regions/${role}.html`, region.html);
    }
  }

  const index = await readIndex(storage);
  const updatedAt = new Date().toISOString();
  const nextEntries = [
    ...index.entries.filter((entry) => entry.id !== sealed.meta.id),
    { id: sealed.meta.id, updatedAt }
  ].sort((a, b) => a.id.localeCompare(b.id));
  await writeIndex(storage, { version: 1, entries: nextEntries });

  return { ok: true, mother: sealed, ingest };
}

/**
 * user-global mother library stub.
 * No appData/path helper exists in this codebase yet — wire later when one lands.
 */
export async function saveMotherUserGlobal(_mother: MotherPage): Promise<SaveMotherResult> {
  return {
    ok: false,
    ingest: { ok: false, unknownClassCount: 0, issues: [] },
    error: 'user-global 母版库尚未接线（缺少 appData 路径助手）'
  };
}

export async function listUserGlobalMothers(): Promise<MotherPage[]> {
  // Stub: no appData path helper — always empty until wired.
  return [];
}

export interface DraftMotherFromScreenInput {
  bodyHtml: string;
  device: 'pc' | 'mobile';
  pageKind?: MotherPageKind;
  title?: string;
  id?: string;
  regions?: MotherRegionExcerpt[];
}

/** Build a project-local mother draft from current screen HTML + run ingest. */
export function draftMotherFromScreen(input: DraftMotherFromScreenInput): {
  mother: MotherPage;
  ingest: MotherIngestResult;
} {
  const regions = input.regions ?? [];
  const bodyHtml = input.bodyHtml;
  const fingerprint = computeMotherContentFingerprint(bodyHtml, regions);
  const slugBase = (input.title ?? 'screen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const id =
    input.id && isSafeMotherId(input.id)
      ? input.id
      : `local-${slugBase || 'screen'}-${fingerprint.slice(0, 6)}`;
  const meta: MotherPageMeta = {
    id: isSafeMotherId(id) ? id : `local-screen-${fingerprint.slice(0, 8)}`,
    version: '1.0.0',
    status: 'active',
    device: input.device,
    pageKind: input.pageKind ?? 'list',
    aliases: input.title ? [input.title] : [],
    features: [],
    density: 'standard',
    compositionHint: {
      layout: 'flow',
      regionRoles: ['main'],
      primaryCta: 'inline'
    },
    applicableWhen: ['用户从当前画框保存的工程母版'],
    notApplicableWhen: [],
    statesShown: ['filled'],
    promptBudgetChars: 1200,
    license: { source: 'authored', note: 'project-local save from active screen' },
    origin: 'project-local',
    contentFingerprint: fingerprint,
    review: {
      reviewer: 'user',
      date: new Date().toISOString().slice(0, 10),
      renderPass: true
    }
  };
  const mother: MotherPage = { meta, bodyHtml, regions };
  const ingest = ingestMotherHtml({
    bodyHtml,
    device: meta.device,
    regions,
    meta: { contentFingerprint: fingerprint }
  });
  return { mother, ingest };
}

/** Convenience: draft + project-local persist in one step. */
export async function saveActiveScreenAsProjectMother(
  storage: ProjectStorage,
  input: DraftMotherFromScreenInput
): Promise<SaveMotherResult> {
  const { mother, ingest } = draftMotherFromScreen(input);
  if (!ingest.ok) {
    return { ok: false, ingest, error: '当前画框未通过母版 ingest 门禁' };
  }
  return saveMotherProjectLocal(storage, mother);
}
