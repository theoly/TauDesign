/**
 * 页面标题裁决：未显式指定时从生成内容提炼，禁止把提示词前缀当成标题。
 * （微信顶栏 / 画框名共用此结果）
 */

const PLACEHOLDER = /^(?:page title|新设计页|新页面|贴切精简页面标题(?:\(不超过20字\))?|页面标题)$/i;

/** 清洗与精炼页面标题（贴切且尽量简短，不超过 20 汉字）。 */
export function sanitizeScreenTitle(rawTitle?: string): string {
  if (!rawTitle) return '新页面';
  let t = rawTitle.trim();
  t = t.replace(/\s*[\(（\[【](?:AI|新版|方案|候选|草稿).*?[\)）\]】]/gi, '').trim();
  t = t.replace(/^(?:页面|设计|原型)[:：\s]*/, '');
  if (t.length > 20) t = t.slice(0, 20);
  return t.trim() || '新页面';
}

/** 角色设定 / 长需求前缀等，绝不能落成导航标题。 */
export function isPromptLikeTitle(title: string, userPrompt?: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t || PLACEHOLDER.test(t)) return true;
  if (/^(?:你是|你是一名|作为一名?|请你|请作为|请为|Please\s+act|You\s+are\b)/i.test(t)) return true;
  if (/资深(?:UI|UX|产品)|原生小程序的资深|高保真中文|只设计页面与交互|以下是完整约束|优先于工具内默认/i.test(t)) return true;
  if (t.length >= 16 && /(?:设计高保真|小程序|移动页面|交付可编辑)/.test(t)) return true;
  if (!userPrompt?.trim()) return false;
  const head = userPrompt.replace(/\s+/g, ' ').trim();
  if (!head) return false;
  // Short prompts that equal the title are real page names, not truncated briefs.
  if (head === t) return false;
  // 标题基本是更长提示词开头截断
  if (head.startsWith(t) && t.length >= 6 && head.length > t.length) return true;
  const head20 = head.slice(0, 20);
  if (
    head.length > t.length &&
    t.length >= 8 &&
    (head20.startsWith(t.slice(0, 8)) || t.startsWith(head20.slice(0, 8)))
  ) {
    return true;
  }
  return false;
}

/** 用户明确点名的页面标题（「新建“材料上传”页」等）。 */
export function extractExplicitTitleFromPrompt(userPrompt?: string): string | undefined {
  if (!userPrompt?.trim()) return undefined;
  const text = userPrompt.trim();
  const patterns = [
    /(?:页面|画框)?(?:标题|名称)\s*(?:为|是|叫|：|:)\s*[「『""']([^」』""'\n]{1,20})[」』""']/,
    /(?:页面|画框)?(?:标题|名称)\s*(?:为|是|叫|：|:)\s*([^\n，。；;]{1,20})/,
    /新建(?:一个)?(?:页面|画框)?\s*[「『""']([^」』""'\n]{1,20})[」』""']/,
    /(?:页面|画框)\s*[「『""']([^」』""'\n]{1,20})[」』""']/,
    /title\s*(?:is|=|:)\s*[「『""']([^」』""'\n]{1,20})[」』""']/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const raw = m?.[1]?.trim();
    if (!raw || isPromptLikeTitle(raw, userPrompt)) continue;
    return sanitizeScreenTitle(raw);
  }
  return undefined;
}

/** 从 LLM 生成的页面 DOM 提炼标题（优先业务 h1）。 */
export function extractTitleFromHtml(html?: string): string | undefined {
  if (!html?.trim()) return undefined;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selectors = [
    'main h1',
    '[data-region="header"] h1',
    '[data-region="main"] h1',
    'h1',
    'main h2',
    '[data-region="header"] h2',
    'h2'
  ];
  for (const sel of selectors) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      if (el.closest('.td-mini-chrome, .status-bar, .appbar, .tabbar, .cta-fixed')) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2 || text.length > 48) continue;
      if (isPromptLikeTitle(text)) continue;
      return sanitizeScreenTitle(text);
    }
  }
  return undefined;
}

/**
 * 统一裁决页面标题。
 * 优先级：用户显式指定 → 合格的 artifact title → 页面正文标题 → 兜底「新页面」。
 */
export function resolveScreenTitle(options: {
  artifactTitle?: string;
  userPrompt?: string;
  html?: string;
}): string {
  const explicit = extractExplicitTitleFromPrompt(options.userPrompt);
  if (explicit) return explicit;

  const artifact = options.artifactTitle?.trim();
  if (artifact && !isPromptLikeTitle(artifact, options.userPrompt)) {
    return sanitizeScreenTitle(artifact);
  }

  const fromHtml = extractTitleFromHtml(options.html);
  if (fromHtml) return fromHtml;

  return '新页面';
}
