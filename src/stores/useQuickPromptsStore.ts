import { create } from 'zustand';
import { QuickPromptItem } from '../types/quickPrompt';
import { t, type Locale } from '../i18n';
import { getUiLocale } from './useLocaleStore';

const STORAGE_KEY = 'ai_designer_global_quick_prompts_v1';

/** Builtin id → i18n slug under settings.builtinPrompts.* */
export const BUILTIN_PROMPT_SLUGS: Record<string, 'mobileAdaptive' | 'microTexture' | 'formValidation' | 'emptyState' | 'interactionFeedback'> = {
  'builtin-mobile-adaptive': 'mobileAdaptive',
  'builtin-micro-texture': 'microTexture',
  'builtin-form-validation': 'formValidation',
  'builtin-empty-state': 'emptyState',
  'builtin-interaction-feedback': 'interactionFeedback',
};

/** Canonical builtin shells (zh stored as fallback; UI resolves by locale). */
export const DEFAULT_BUILTIN_PROMPTS: QuickPromptItem[] = [
  {
    id: 'builtin-mobile-adaptive',
    title: '📱 移动端适配',
    content: '请优化移动端小屏幕适配，调整留白间距、字体层级并吸底主操作按钮。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-micro-texture',
    title: '🎨 优化微质感',
    content: '请为卡片与组件增加细腻微边框、柔和投影与轻微背景渐变，提升质感。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-form-validation',
    title: '💡 完善表单',
    content: '补充表单输入验证状态、清晰的错误提示文案与辅助说明。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-empty-state',
    title: '🧩 补充空状态',
    content: '设计该页面的空状态 (Empty State) 插图与引导操作按钮。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-interaction-feedback',
    title: '⚡ 增加状态反馈',
    content: '补充操作的 Loading 加载态、禁用态 (Disabled) 与成功完成提示。',
    scope: 'global',
    isBuiltin: true
  }
];

/** Overlay localized title/content for untouched built-in prompts. */
export function resolveQuickPrompt(item: QuickPromptItem, locale: Locale = getUiLocale()): QuickPromptItem {
  if (!item.isBuiltin) return item;
  const slug = BUILTIN_PROMPT_SLUGS[item.id];
  if (!slug) return item;
  return {
    ...item,
    title: t(`settings.builtinPrompts.${slug}.title`, undefined, locale),
    content: t(`settings.builtinPrompts.${slug}.content`, undefined, locale),
  };
}

export function defaultBuiltinPrompts(locale: Locale = getUiLocale()): QuickPromptItem[] {
  return DEFAULT_BUILTIN_PROMPTS.map((item) => resolveQuickPrompt(item, locale));
}

function loadGlobalPrompts(): QuickPromptItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Older saves may omit isBuiltin; known ids stay localizable until the user edits them.
        return parsed.map((item: QuickPromptItem) => {
          if (!BUILTIN_PROMPT_SLUGS[item.id] || item.isBuiltin === false) return item;
          return { ...item, isBuiltin: true };
        });
      }
    }
  } catch (e) {
    // ignore
  }
  return defaultBuiltinPrompts();
}

function saveGlobalPrompts(prompts: QuickPromptItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch (e) {
    // ignore
  }
}

interface QuickPromptsState {
  globalPrompts: QuickPromptItem[];
  addGlobalPrompt: (prompt: { title: string; content: string }) => QuickPromptItem;
  updateGlobalPrompt: (id: string, updates: { title?: string; content?: string }) => void;
  deleteGlobalPrompt: (id: string) => void;
  resetGlobalPrompts: () => void;
}

export const useQuickPromptsStore = create<QuickPromptsState>((set, get) => ({
  globalPrompts: loadGlobalPrompts(),

  addGlobalPrompt: ({ title, content }) => {
    const newPrompt: QuickPromptItem = {
      id: `global-qp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      content: content.trim(),
      scope: 'global',
      createdAt: Date.now()
    };
    const updated = [...get().globalPrompts, newPrompt];
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
    return newPrompt;
  },

  updateGlobalPrompt: (id, updates) => {
    const updated = get().globalPrompts.map((p) => {
      if (p.id !== id) return p;
      return {
        ...p,
        // User-edited builtins become custom so locale overlay no longer overrides their copy.
        ...(p.isBuiltin ? { isBuiltin: false } : {}),
        ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
        ...(updates.content !== undefined ? { content: updates.content.trim() } : {})
      };
    });
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
  },

  deleteGlobalPrompt: (id) => {
    const updated = get().globalPrompts.filter((p) => p.id !== id);
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
  },

  resetGlobalPrompts: () => {
    const defaults = defaultBuiltinPrompts();
    set({ globalPrompts: defaults });
    saveGlobalPrompts(defaults);
  }
}));
