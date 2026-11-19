import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../../stores/useProjectStore';
import { useAIConfigStore } from '../../../stores/useAIConfigStore';
import { useT } from '../../../stores/useLocaleStore';
import type { ProjectDocumentEntry } from '../../../types/projectDocument';
import { readUploadedTextFile } from '../../../services/ai/textFileContext';
import { createAIEngineCore } from '../../../services/ai/engine/core';
import { generateProjectKnowledge, knowledgeFingerprint } from '../../../services/ai/projectKnowledge';

type Editor = { entry: ProjectDocumentEntry; baseline?: ProjectDocumentEntry };
type Draft = { content: string; fingerprint: string; previous?: ProjectDocumentEntry; documentsSnapshot: string };
type Session = { editor?: Editor; draft?: Draft; error?: string; showOriginal?: boolean };
// Memory only: returning from ProjectManager must not discard an explicitly unsaved draft.
const retainedSessions = new Map<string, Session>();
const identity = (state: { id: string; folderPath?: string }) => JSON.stringify([state.id, state.folderPath || '']);
const snapshot = (entry?: ProjectDocumentEntry) => JSON.stringify(entry);
const isDirty = (editor?: Editor) => Boolean(editor && (!editor.baseline || snapshot(editor.entry) !== snapshot(editor.baseline)));
const control = 'rounded border border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-40';
const field = 'w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50';

/** Local drafts stay mounted in SideBar and are isolated by both project id and folder. */
export const ProjectDocumentsPanel: React.FC = () => {
  const t = useT();
  const state = useProjectStore();
  const projectKey = identity(state);
  const [sessions, setSessions] = useState<Record<string, Session>>(() => Object.fromEntries(retainedSessions));
  const session = sessions[projectKey] || {};
  const { editor, draft } = session;
  const [runningKey, setRunningKey] = useState<string>();
  const job = useRef<AbortController>();
  const revision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = runningKey === projectKey;
  const fingerprint = knowledgeFingerprint(state);
  const documents = Object.values(state.projectDocuments);
  const update = (changes: Partial<Session>, key = projectKey) => {
    retainedSessions.set(key, { ...retainedSessions.get(key), ...changes });
    setSessions(Object.fromEntries(retainedSessions));
  };
  const error = (message: string) => update({ error: message });

  useEffect(() => {
    setRunningKey(undefined);
    return () => { job.current?.abort(); job.current = undefined; revision.current++; };
  }, [projectKey]);

  const guard = () => {
    if (isDirty(editor)) { error(t('docs.errSaveOrDiscard')); return false; }
    if (draft) { error(t('docs.errAdoptOrDiscardDraft')); return false; }
    if (busy) { error(t('docs.errFinishOrCancel')); return false; }
    revision.current++;
    return true;
  };
  const open = (entry: ProjectDocumentEntry) => {
    if (!guard()) return;
    update({ editor: { entry: { ...entry }, baseline: { ...entry } }, error: undefined, showOriginal: false });
  };
  const edit = (changes: Partial<ProjectDocumentEntry>) => {
    if (!editor) return;
    revision.current++;
    update({ editor: { ...editor, entry: { ...editor.entry, ...changes } }, error: undefined });
  };
  const newEntry = (title = t('docs.newDocument'), content = '', source: 'manual' | 'upload' = 'manual') => {
    const now = Date.now();
    const entry: ProjectDocumentEntry = { id: `doc-${crypto.randomUUID()}`, title, content, source, enabled: true, createdAt: now, updatedAt: now, ...(source === 'upload' ? { originalContent: content } : {}) };
    update({ editor: { entry }, error: undefined, showOriginal: false });
  };
  const save = () => {
    if (!editor || identity(useProjectStore.getState()) !== projectKey) return;
    const live = useProjectStore.getState().projectDocuments[editor.entry.id];
    if (snapshot(live) !== snapshot(editor.baseline)) { error(t('docs.errDocChanged')); return; }
    try {
      const now = Date.now();
      const entry: ProjectDocumentEntry = editor.entry.source === 'ai'
        ? { id: `doc-${crypto.randomUUID()}`, title: `${editor.entry.title}${t('docs.manualRevisionSuffix')}`, content: editor.entry.content, source: 'manual', enabled: editor.entry.enabled, createdAt: now, updatedAt: now }
        : { ...editor.entry, missing: false, updatedAt: now };
      useProjectStore.getState().upsertProjectDocument(entry);
      const saved = useProjectStore.getState().projectDocuments[entry.id];
      revision.current++;
      update({ editor: { entry: { ...saved }, baseline: { ...saved } }, error: undefined });
    } catch (cause) { error(cause instanceof Error ? cause.message : String(cause)); }
  };
  const discard = () => {
    revision.current++;
    const live = editor && useProjectStore.getState().projectDocuments[editor.entry.id];
    update({ editor: live ? { entry: { ...live }, baseline: { ...live } } : undefined, error: undefined, showOriginal: false });
  };
  const toggle = () => {
    if (!editor || !guard()) return;
    const live = useProjectStore.getState().projectDocuments[editor.entry.id];
    if (!live || live.missing) { error(t('docs.errMissingBeforeEnable')); return; }
    try {
      useProjectStore.getState().upsertProjectDocument({ ...live, enabled: !live.enabled, updatedAt: Date.now() });
      const saved = useProjectStore.getState().projectDocuments[live.id];
      update({ editor: { entry: { ...saved }, baseline: { ...saved } }, error: undefined });
    } catch (cause) { error(String(cause)); }
  };
  const remove = () => {
    if (!editor || !guard()) return;
    useProjectStore.getState().removeProjectDocument(editor.entry.id);
    update({ editor: undefined, error: undefined, showOriginal: false });
  };
  const importFile = async (file?: File) => {
    if (!file || !guard()) return;
    if (!/\.(md|txt)$/i.test(file.name)) { error(t('docs.errFileType')); return; }
    const startedRevision = revision.current;
    try {
      const reference = await readUploadedTextFile(file, 'upload');
      if (identity(useProjectStore.getState()) !== projectKey || startedRevision !== revision.current) return;
      newEntry(reference.name, reference.content, 'upload');
    } catch (cause) {
      if (identity(useProjectStore.getState()) === projectKey && startedRevision === revision.current) error(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const generate = async () => {
    if (!guard()) return;
    const binding = useAIConfigStore.getState().getActiveProviderForRole('code');
    if (!binding || !binding.modelId.trim() || !binding.provider.isEnabled || (binding.provider.protocol !== 'ollama_native' && !binding.provider.apiKey.trim())) { error(t('docs.errConfigureModel')); return; }
    const input = useProjectStore.getState();
    if (identity(input) !== projectKey) { error(t('docs.errProjectSwitched')); return; }
    const initialFingerprint = knowledgeFingerprint(input);
    const previous = input.projectDocuments['project-analysis'];
    const documentsSnapshot = JSON.stringify(input.projectDocuments);
    const startedRevision = revision.current;
    const controller = new AbortController();
    job.current = controller;
    setRunningKey(projectKey); update({ error: undefined });
    try {
      const result = await generateProjectKnowledge(createAIEngineCore(), { state: input, provider: binding.provider, model: binding.modelId, signal: controller.signal });
      if (controller.signal.aborted || job.current !== controller) return;
      const current = useProjectStore.getState();
      if (identity(current) !== projectKey || startedRevision !== revision.current || JSON.stringify(current.projectDocuments) !== documentsSnapshot || knowledgeFingerprint(current) !== initialFingerprint || result.sourceFingerprint !== initialFingerprint || snapshot(current.projectDocuments['project-analysis']) !== snapshot(previous)) {
        update({ error: t('docs.errStaleOrganize') }); return;
      }
      update({ draft: { content: result.content, fingerprint: initialFingerprint, previous, documentsSnapshot }, error: undefined });
    } catch (cause) {
      if (!controller.signal.aborted && identity(useProjectStore.getState()) === projectKey) error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (job.current === controller) { job.current = undefined; setRunningKey(undefined); }
    }
  };
  const cancel = () => { job.current?.abort(); job.current = undefined; setRunningKey(undefined); update({ error: t('docs.errOrganizeCancelled') }); };
  const adopt = () => {
    if (!draft) return;
    const current = useProjectStore.getState();
    if (identity(current) !== projectKey || knowledgeFingerprint(current) !== draft.fingerprint || JSON.stringify(current.projectDocuments) !== draft.documentsSnapshot || snapshot(current.projectDocuments['project-analysis']) !== snapshot(draft.previous) || isDirty(editor)) {
      error(t('docs.errStaleDraft')); return;
    }
    try {
      const now = Date.now();
      const entry: ProjectDocumentEntry = { id: 'project-analysis', title: t('docs.analysisTitle'), content: draft.content, source: 'ai', enabled: true, createdAt: draft.previous?.createdAt || now, updatedAt: now, sourceFingerprint: draft.fingerprint };
      current.upsertProjectDocument(entry);
      const saved = useProjectStore.getState().projectDocuments[entry.id];
      update({ draft: undefined, editor: { entry: { ...saved }, baseline: { ...saved } }, error: undefined });
    } catch (cause) { error(cause instanceof Error ? cause.message : String(cause)); }
  };

  const sourceLabel = (source: ProjectDocumentEntry['source']) =>
    source === 'upload' ? t('docs.sourceUpload') : source === 'ai' ? t('docs.sourceAi') : t('docs.sourceManual');

  const draftModal = draft && createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
      <section role="dialog" aria-modal="true" aria-label={t('docs.draftDialogAria')} className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-xl">
        <h2 className="text-lg font-semibold">{t('docs.draftTitle')}</h2>
        <p className="my-2 text-xs text-slate-400">{t('docs.draftHint')}</p>
        {session.error && <p role="alert" className="my-2 text-sm text-amber-300">{session.error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <label className="text-sm">{t('docs.previousSummary')}<textarea aria-label={t('docs.previousSummary')} readOnly value={draft.previous?.content || t('docs.noPreviousSummary')} className={`${field} mt-2 h-80`} /></label>
          <label className="text-sm">{t('docs.newDraft')}<textarea aria-label={t('docs.draftAria')} value={draft.content} onChange={event => update({ draft: { ...draft, content: event.target.value } })} className={`${field} mt-2 h-80`} /></label>
        </div>
        <div className="flex justify-end gap-2"><button className={control} onClick={() => update({ draft: undefined, error: undefined })}>{t('docs.discardDraft')}</button><button className={`${control} bg-blue-600`} onClick={adopt}>{t('docs.adoptDraft')}</button></div>
      </section>
    </div>, document.body);

  return <div className="p-3 space-y-3 text-slate-300" data-testid="project-documents-panel">
    <p className="text-xs text-slate-400 leading-relaxed">{t('docs.intro')}</p>
    <div className="flex flex-wrap gap-2"><button className={control} disabled={busy} onClick={() => { if (guard()) newEntry(); }}>{t('docs.newDocument')}</button><button className={control} disabled={busy} onClick={() => { if (guard()) fileInput.current?.click(); }}>{t('docs.importFile')}</button><button className={control} disabled={busy} onClick={generate}>{t('docs.aiOrganize')}</button>{busy && <button className={control} onClick={cancel}>{t('docs.cancelOrganize')}</button>}</div>
    <input ref={fileInput} type="file" accept=".md,.txt" aria-label={t('docs.importAria')} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }} />
    {busy && <p role="status" className="text-xs text-blue-300">{t('docs.organizing')}</p>}
    {session.error && <p role="alert" className="text-xs text-amber-300">{session.error}</p>}
    <div className="space-y-1" aria-label={t('docs.listAria')}>
      {documents.length === 0 && <p className="py-4 text-xs text-slate-500">{t('docs.empty')}</p>}
      {documents.map(entry => <div key={entry.id} className={`rounded border p-2 ${editor?.entry.id === entry.id ? 'border-blue-500/60 bg-blue-500/10' : 'border-slate-800'}`}>
        <button className="w-full text-left text-sm break-words" disabled={busy} onClick={() => open(entry)}>{entry.title}</button>
        <p className="mt-1 text-[11px] text-slate-500">{sourceLabel(entry.source)} · {entry.missing ? t('docs.missingDisabled') : entry.enabled ? t('docs.enabled') : t('docs.disabled')}{entry.source === 'ai' && entry.sourceFingerprint !== fingerprint && <span className="text-amber-400">{t('docs.staleHint')}</span>}</p>
      </div>)}
    </div>
    {editor && <div className="border-t border-slate-700 pt-3 space-y-3">
      {editor.entry.source === 'ai' && <p className="text-xs text-blue-300">{t('docs.aiEditHint')}</p>}
      {isDirty(editor) && <p className="text-xs text-amber-300">{t('docs.dirtyHint')}</p>}
      {editor.entry.missing && <p className="text-xs text-amber-300">{t('docs.missingHint')}</p>}
      <label className="block text-xs space-y-1"><span>{t('docs.titleLabel')}</span><input aria-label={t('docs.titleAria')} className={field} disabled={busy} value={editor.entry.title} onChange={event => edit({ title: event.target.value })} /></label>
      <label className="block text-xs space-y-1"><span>{t('docs.bodyLabel')}</span><textarea aria-label={t('docs.bodyAria')} className={`${field} min-h-64`} disabled={busy} value={editor.entry.content} onChange={event => edit({ content: event.target.value })} /></label>
      <div className="flex flex-wrap gap-2"><button className={`${control} bg-blue-600`} disabled={busy} onClick={save}>{t('docs.saveDocument')}</button><button className={control} disabled={busy} onClick={discard}>{t('docs.discardChanges')}</button>{editor.baseline && <><button className={control} disabled={busy || editor.entry.missing} onClick={toggle}>{editor.entry.enabled ? t('docs.disableDocument') : t('docs.enableDocument')}</button><button className={`${control} text-red-300`} disabled={busy} onClick={remove}>{t('docs.deleteDocument')}</button></>}</div>
      {editor.entry.originalContent !== undefined && <div className="space-y-2"><button className={control} onClick={() => update({ showOriginal: !session.showOriginal })}>{session.showOriginal ? t('docs.hideOriginal') : t('docs.showOriginal')}</button>{session.showOriginal && <><pre className="whitespace-pre-wrap break-words text-xs rounded bg-slate-950 p-2 max-h-64 overflow-auto">{editor.entry.originalContent}</pre><button className={control} disabled={busy} onClick={() => { if (isDirty(editor)) { error(t('docs.errSaveOrDiscard')); return; } edit({ content: editor.entry.originalContent! }); }}>{t('docs.restoreOriginal')}</button></>}</div>}
    </div>}
    {draftModal}
  </div>;
};
