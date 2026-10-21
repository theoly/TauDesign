import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HtmlImportDialog } from '../../canvas/HtmlImportDialog';
import { useProjectStore } from '../../../stores/useProjectStore';
import { Accordion } from '../Accordion';
import { Copy, Plus, Search, Trash2, FileCode } from 'lucide-react';

/** 侧边栏「页面」视图 (PRD §3.0.3 / §3.3.2) */
export const ScreensPanel: React.FC = () => {
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
      title="页面画框"
      badge={screenOrder.length}
      actions={
        <>
        <button onClick={() => setShowImport(true)} className="p-0.5 text-slate-400 hover:text-blue-400 rounded" title="导入 HTML 页面" aria-label="导入 HTML 页面"><FileCode className="w-3.5 h-3.5" /></button>
        <button
          onClick={handleAddNewScreen}
          className="p-0.5 text-slate-400 hover:text-blue-400 rounded"
          title="新建空白画框"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        </>
      }
    >
      <div className="px-2 pb-1.5">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-slate-500 absolute left-2" />
          <input
            type="text"
            placeholder="搜索页面"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-6 pr-2 py-1 text-slate-300 text-[11px] focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="space-y-0.5 px-1.5">
        {filteredIds.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-slate-600">没有匹配的页面</p>
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
                const next = window.prompt('重命名页面', s.name);
                if (next && next.trim()) renameScreen(id, next.trim());
              }}
              className={`group px-2 py-1.5 rounded-md cursor-pointer transition flex items-center justify-between text-[11px] ${
                isActive ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`font-mono text-[10px] ${isActive ? 'text-white/70' : 'text-slate-500'}`}>
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
                  className={`p-0.5 rounded hover:text-blue-200 ${isActive ? 'text-white/80' : 'text-slate-400'}`}
                  title="复制画框"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除画框「${s.name}」吗？`)) removeScreen(id);
                  }}
                  className={`p-0.5 rounded hover:text-red-300 ${isActive ? 'text-white/80' : 'text-slate-400'}`}
                  title="删除画框"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
    {showImport && createPortal(<HtmlImportDialog onClose={() => setShowImport(false)} />, document.body)}
    </>
  );
};
