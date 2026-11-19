import React, { useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { isDesktopRuntime } from '../../services/storage/folderPicker';
import { openProjectDirectory } from '../../services/storage/projectDirectory';
import {MediaMigrationPanel} from './MediaMigrationPanel';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { useT } from '../../stores/useLocaleStore';

function ProjectDirectory({ folderPath }: { folderPath?: string }) {
  const t = useT();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const hasFolder = Boolean(folderPath?.trim());
  const desktop = isDesktopRuntime();
  const disabledReason = !hasFolder ? t('settings.builtinStorage')
    : !desktop ? t('settings.desktopOnly') : '';

  const openDirectory = async () => {
    if (!folderPath || disabledReason || lock.current) return;
    lock.current = true;
    setOpening(true);
    setError('');
    try {
      await openProjectDirectory(folderPath);
    } catch (cause) {
      setError(t('settings.openDirectoryFailed', {
        error: cause instanceof Error ? cause.message : String(cause),
      }));
    } finally {
      lock.current = false;
      setOpening(false);
    }
  };

  return (
    <section aria-label={t('settings.projectDirectory')} className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-slate-200">{t('settings.projectPath')}</h3>
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <p aria-label={t('settings.projectPath')} title={folderPath} className="min-w-0 flex-1 w-full select-text break-all whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
          {hasFolder ? folderPath : t('settings.noLocalFolder')}
        </p>
        <button type="button" data-testid="open-project-directory" onClick={openDirectory} disabled={Boolean(disabledReason) || opening}
          title={disabledReason || t('settings.openDirectoryTitle')} aria-busy={opening}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <FolderOpen className="w-3.5 h-3.5" />
          {opening ? t('settings.openingDirectory') : t('settings.openDirectory')}
        </button>
      </div>
      {disabledReason && <p className="text-xs leading-relaxed text-slate-400">{disabledReason}</p>}
      {error && <p role="alert" className="break-all text-xs leading-relaxed text-red-400">{error}</p>}
    </section>
  );
}

export function ProjectSettingsPanel() {
  const t = useT();
  const id = useProjectStore(state => state.id);
  const name = useProjectStore(state => state.name);
  const folderPath = useProjectStore(state => state.folderPath);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{t('settings.title')}</h2>
        <p className="mt-1 text-xs text-slate-400 break-all">{t('settings.currentProject', { name })}</p>
      </div>
      <LanguageSwitcher />
      <ProjectDirectory key={JSON.stringify([id, folderPath])} folderPath={folderPath} />
      <MediaMigrationPanel key={`media:${id}:${folderPath??''}`} />
    </div>
  );
}
