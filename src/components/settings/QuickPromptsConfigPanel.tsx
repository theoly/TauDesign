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
    <div className="flex-1 flex flex-col overflow-hidden bg-host-dialog text-host-primary text-xs">
      {/* Scrollable Container */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {/* Intro Banner */}
        <div className="p-4 bg-host-sunken border border-host-border rounded-xl flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-host-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-host-secondary">
            <h4 className="text-host-primary font-semibold text-sm">{t('settings.quickPromptsPanelTitle')}</h4>
            <p className="text-[11px] text-host-secondary leading-relaxed">
              {t('settings.quickPromptsIntro')}
            </p>
          </div>
        </div>

        {/* Add / Edit Form */}
        <div className="p-4 bg-host-sunken border border-host-border rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-host-primary flex items-center gap-1.5">
              {editingItem ? <Edit2 className="w-3.5 h-3.5 text-host-brand" /> : <Plus className="w-3.5 h-3.5 text-host-brand" />}
              <span>{editingItem ? t('settings.editQuickPrompt') : t('settings.addQuickPrompt')}</span>
            </span>
            {editingItem && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-host-secondary hover:text-host-primary text-[11px] flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>{t('settings.cancelEdit')}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Title Input */}
            <div className="space-y-1">
              <label className="text-[11px] text-host-secondary font-medium">{t('settings.promptTitleLabel')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={t('settings.promptTitlePlaceholder')}
                className="w-full bg-host-elevated border border-host-border rounded-lg px-2.5 py-1.5 text-host-primary focus:outline-none focus:border-host-accent text-xs"
              />
            </div>

            {/* Scope Selector */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] text-host-secondary font-medium">{t('settings.promptScopeLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('project')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-left transition ${
                    scope === 'project'
                      ? 'bg-host-accent-subtle border-host-accent/40 text-host-brand font-medium'
                      : 'bg-host-elevated border-host-border text-host-secondary hover:text-host-primary hover:border-host-border-strong'
                  }`}
                >
                  <FolderGit2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium leading-tight truncate">{t('settings.promptScopeProject')}</div>
                    <div className="text-[9px] text-host-tertiary truncate">{t('settings.promptScopeProjectHint', { name: projectName || t('settings.currentProjectFallback') })}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('global')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-left transition ${
                    scope === 'global'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-medium'
                      : 'bg-host-elevated border-host-border text-host-secondary hover:text-host-primary hover:border-host-border-strong'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium leading-tight truncate">{t('settings.promptScopeGlobal')}</div>
                    <div className="text-[9px] text-host-tertiary truncate">{t('settings.promptScopeGlobalHint')}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Content Input */}
          <div className="space-y-1">
            <label className="text-[11px] text-host-secondary font-medium">{t('settings.promptContentLabel')}</label>
            <textarea
              rows={2}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t('settings.promptContentPlaceholder')}
              className="w-full bg-host-elevated border border-host-border rounded-lg px-2.5 py-1.5 text-host-primary focus:outline-none focus:border-host-accent text-xs"
            />
          </div>

          {errorMsg && <p className="text-host-danger text-[11px]">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            {editingItem && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1.5 bg-host-elevated hover:bg-host-chrome border border-host-border text-host-secondary hover:text-host-primary rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-1.5 bg-host-accent hover:bg-host-accent-hover text-host-on-accent rounded-lg font-medium transition shadow-sm"
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
              <FolderGit2 className="w-4 h-4 text-host-brand" />
              <span className="font-semibold text-host-primary">{t('settings.projectPrompts')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-host-accent-subtle text-host-brand font-mono">
                {t('settings.promptCount', { count: projectPrompts.length })}
              </span>
            </div>
            <span className="text-[10px] text-host-tertiary">{t('settings.promptProjectStoredIn', { name: projectName || 'Untitled' })}</span>
          </div>

          {projectPrompts.length === 0 ? (
            <div className="p-4 bg-host-sunken border border-host-border rounded-xl text-center text-host-tertiary text-[11px]">
              {t('settings.promptProjectEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {projectPrompts.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-host-sunken border border-host-border hover:border-host-border-strong rounded-xl flex flex-col justify-between gap-2 group transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-host-primary">{item.title}</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-host-accent-subtle text-host-brand border border-host-accent/40 rounded">
                        {t('settings.promptBadgeProject')}
                      </span>
                    </div>
                    <p className="text-[11px] text-host-secondary line-clamp-2 leading-relaxed">{item.content}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-host-border">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
                      className="p-1 text-host-secondary hover:text-host-brand hover:bg-host-elevated rounded transition"
                      title={t('settings.promptEditTitle')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="p-1 text-host-secondary hover:text-host-danger hover:bg-host-elevated rounded transition"
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
        <div className="space-y-2 pt-2 border-t border-host-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-host-warning" />
              <span className="font-semibold text-host-primary">{t('settings.globalPrompts')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                {t('settings.promptCount', { count: localizedGlobal.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={resetGlobalPrompts}
              className="text-[10px] text-host-tertiary hover:text-host-primary flex items-center gap-1 transition"
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
                className="p-3 bg-host-sunken border border-host-border hover:border-host-border-strong rounded-xl flex flex-col justify-between gap-2 group transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-host-primary">{item.title}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                      {t('settings.promptBadgeGlobal')}
                    </span>
                  </div>
                  <p className="text-[11px] text-host-secondary line-clamp-2 leading-relaxed">{item.content}</p>
                </div>
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-host-border">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(item)}
                    className="p-1 text-host-secondary hover:text-host-brand hover:bg-host-elevated rounded transition"
                    title={t('settings.promptEditTitle')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="p-1 text-host-secondary hover:text-host-danger hover:bg-host-elevated rounded transition"
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
