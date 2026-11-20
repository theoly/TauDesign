import React, { useState } from 'react';
import { resolveQuickPrompt, useQuickPromptsStore } from '../../stores/useQuickPromptsStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useLocaleStore, useT } from '../../stores/useLocaleStore';
import { QuickPromptItem, QuickPromptScope } from '../../types/quickPrompt';
import { Sparkles, Plus, Trash2, Edit2, RotateCcw, Check, X, Globe, FolderGit2 } from 'lucide-react';

export const QuickPromptsConfigPanel: React.FC = () => {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const { globalPrompts, addGlobalPrompt, updateGlobalPrompt, deleteGlobalPrompt, resetGlobalPrompts } =
    useQuickPromptsStore();
  const localizedGlobal = globalPrompts.map((item) => resolveQuickPrompt(item, locale));
  const {
    quickPrompts: projectPrompts = [],
    addProjectQuickPrompt,
    updateProjectQuickPrompt,
    deleteProjectQuickPrompt,
    name: projectName
  } = useProjectStore();

  // Form states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<QuickPromptScope>('project'); // 默认当前项目
  const [editingItem, setEditingItem] = useState<{ id: string; scope: QuickPromptScope } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStartEdit = (item: QuickPromptItem) => {
    const resolved = resolveQuickPrompt(item, locale);
    setEditingItem({ id: item.id, scope: item.scope });
    setTitle(resolved.title);
    setContent(resolved.content);
    setScope(item.scope);
    setErrorMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setTitle('');
    setContent('');
    setScope('project');
    setErrorMsg(null);
  };

  const handleSave = () => {
    if (!title.trim()) {
      setErrorMsg(t('settings.promptErrTitle'));
      return;
    }
    if (!content.trim()) {
      setErrorMsg(t('settings.promptErrContent'));
      return;
    }

    if (editingItem) {
      if (editingItem.scope === 'project') {
        if (scope === 'project') {
          updateProjectQuickPrompt(editingItem.id, { title, content });
        } else {
          // 移动到全局
          deleteProjectQuickPrompt(editingItem.id);
          addGlobalPrompt({ title, content });
        }
      } else {
        if (scope === 'global') {
          updateGlobalPrompt(editingItem.id, { title, content });
        } else {
          // 移动到项目
          deleteGlobalPrompt(editingItem.id);
          addProjectQuickPrompt({ title, content });
        }
      }
      handleCancelEdit();
    } else {
      if (scope === 'project') {
        addProjectQuickPrompt({ title, content });
      } else {
        addGlobalPrompt({ title, content });
      }
      setTitle('');
      setContent('');
      setScope('project');
      setErrorMsg(null);
    }
  };

  const handleDelete = (item: QuickPromptItem) => {
    if (editingItem?.id === item.id) {
      handleCancelEdit();
    }
    if (item.scope === 'project') {
      deleteProjectQuickPrompt(item.id);
    } else {
      deleteGlobalPrompt(item.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-xs">
      {/* Scrollable Container */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {/* Intro Banner */}
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-300">
            <h4 className="text-slate-100 font-semibold text-sm">{t('settings.quickPromptsPanelTitle')}</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {t('settings.quickPromptsIntro')}
            </p>
          </div>
        </div>

        {/* Add / Edit Form */}
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              {editingItem ? <Edit2 className="w-3.5 h-3.5 text-blue-400" /> : <Plus className="w-3.5 h-3.5 text-blue-400" />}
              <span>{editingItem ? t('settings.editQuickPrompt') : t('settings.addQuickPrompt')}</span>
            </span>
            {editingItem && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>{t('settings.cancelEdit')}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Title Input */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-medium">{t('settings.promptTitleLabel')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={t('settings.promptTitlePlaceholder')}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Scope Selector */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] text-slate-400 font-medium">{t('settings.promptScopeLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('project')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-left transition ${
                    scope === 'project'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-medium'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <FolderGit2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium leading-tight truncate">{t('settings.promptScopeProject')}</div>
                    <div className="text-[9px] text-slate-500 truncate">{t('settings.promptScopeProjectHint', { name: projectName || t('settings.currentProjectFallback') })}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('global')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-left transition ${
                    scope === 'global'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-medium'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium leading-tight truncate">{t('settings.promptScopeGlobal')}</div>
                    <div className="text-[9px] text-slate-500 truncate">{t('settings.promptScopeGlobalHint')}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Content Input */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 font-medium">{t('settings.promptContentLabel')}</label>
            <textarea
              rows={2}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t('settings.promptContentPlaceholder')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500 text-xs"
            />
          </div>

          {errorMsg && <p className="text-rose-400 text-[11px]">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            {editingItem && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingItem ? t('common.save') : t('settings.addQuickPrompt')}</span>
            </button>
          </div>
        </div>

        {/* Project Scoped Prompts Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-slate-200">{t('settings.projectPrompts')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                {t('settings.promptCount', { count: projectPrompts.length })}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">{t('settings.promptProjectStoredIn', { name: projectName || 'Untitled' })}</span>
          </div>

          {projectPrompts.length === 0 ? (
            <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl text-center text-slate-500 text-[11px]">
              {t('settings.promptProjectEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {projectPrompts.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col justify-between gap-2 group transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{item.title}</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded">
                        {t('settings.promptBadgeProject')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{item.content}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-900">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
                      className="p-1 text-slate-400 hover:text-blue-300 hover:bg-slate-850 rounded transition"
                      title={t('settings.promptEditTitle')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-850 rounded transition"
                      title={t('settings.promptDeleteTitle')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Prompts Section */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-200">{t('settings.globalPrompts')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                {t('settings.promptCount', { count: localizedGlobal.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={resetGlobalPrompts}
              className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
              title={t('settings.promptResetDefaultsTitle')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('settings.promptResetDefaults')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {localizedGlobal.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col justify-between gap-2 group transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">{item.title}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                      {t('settings.promptBadgeGlobal')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{item.content}</p>
                </div>
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-900">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(item)}
                    className="p-1 text-slate-400 hover:text-blue-300 hover:bg-slate-850 rounded transition"
                    title={t('settings.promptEditTitle')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-850 rounded transition"
                    title={t('settings.promptDeleteTitle')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
