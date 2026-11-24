import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HtmlImportDialog } from '../../canvas/HtmlImportDialog';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { useProjectStore } from '../../../stores/useProjectStore';
import { useT } from '../../../stores/useLocaleStore';
import { Accordion } from '../Accordion';
import { Copy, Plus, Search, Trash2, FileCode } from 'lucide-react';

/** 侧边栏「页面」视图 (PRD §3.0.3 / §3.3.2) */
export const ScreensPanel: React.FC = () => {
  const t = useT();
  const {
    screens,
    screenOrder,
    activeScreenId,
    settings,
    setActiveScreen,
    panToScreen,
    addBlankScreen,
    removeScreen,
    duplicateScreen,
    renameScreen
  } = useProjectStore();

  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredIds = screenOrder.filter((id) => {
    const s = screens[id];
    return s && s.name.toLowerCase().includes(search.trim().toLowerCase());
  });

  const handleAddNewScreen = () => {
    addBlankScreen();
  };

  const handleSelectScreen = (id: string) => {
    panToScreen(id);
  };

  return (
    <><Accordion
      panelKey="screens.list"
      title={t('layout.screensTitle')}
      badge={screenOrder.length}
      actions={
        <>
        <button onClick={() => setShowImport(true)} className="p-0.5 text-host-secondary hover:text-host-brand rounded" title={t('layout.importHtml')} aria-label={t('layout.importHtml')}><FileCode className="w-3.5 h-3.5" /></button>
        <button
          onClick={handleAddNewScreen}
          className="p-0.5 text-host-secondary hover:text-host-brand rounded"
          title={t('layout.newScreen')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        </>
      }
    >
      <div className="px-2 pb-1.5">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-host-tertiary absolute left-2" />
          <input
            type="text"
            placeholder={t('layout.searchScreens')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-host-sunken border border-host-border rounded-md pl-6 pr-2 py-1 text-host-primary placeholder:text-host-tertiary text-[11px] focus:outline-none focus:border-host-accent"
          />
        </div>
      </div>

      <div className="space-y-0.5 px-1.5">
        {filteredIds.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-host-tertiary">{t('layout.noMatchingScreens')}</p>
        )}
        {filteredIds.map((id) => {
          const s = screens[id];
          if (!s) return null;
          const isActive = id === activeScreenId;
          const index = screenOrder.indexOf(id);

          return (
            <div
              key={id}
              onClick={() => handleSelectScreen(id)}
              onDoubleClick={() => {
                const next = window.prompt(t('layout.renameScreen'), s.name);
                if (next && next.trim()) renameScreen(id, next.trim());
              }}
              className={`group px-2 py-1.5 rounded-md cursor-pointer transition flex items-center justify-between text-[11px] ${
                isActive ? 'bg-host-accent-subtle text-host-brand border border-host-accent/30 font-medium' : 'text-host-secondary border border-transparent hover:bg-host-elevated hover:text-host-primary'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`font-mono text-[10px] ${isActive ? 'text-host-brand/70' : 'text-host-tertiary'}`}>
                  {index + 1}
                </span>
                <span className="truncate">{s.name}</span>
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateScreen(id);
                  }}
                  className={`p-0.5 rounded hover:text-host-brand ${isActive ? 'text-host-brand/80' : 'text-host-secondary'}`}
                  title={t('layout.duplicateScreen')}
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(id);
                  }}
                  className={`p-0.5 rounded hover:text-host-danger ${isActive ? 'text-host-brand/80' : 'text-host-secondary'}`}
                  title={t('layout.deleteScreen')}
                  data-testid="screens-panel-delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
    {confirmDeleteId && screens[confirmDeleteId] && (
      <ConfirmDialog
        title={t('layout.deleteScreen')}
        message={<>{t('layout.deleteScreenConfirm', { name: screens[confirmDeleteId].name })}</>}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          removeScreen(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    )}
    {showImport && createPortal(<HtmlImportDialog onClose={() => setShowImport(false)} />, document.body)}
    </>
  );
};
