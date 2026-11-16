import type { PageComposition } from './pageComposition';
import type { PageKind } from './designBrief';

/**
 * Kind × device composition priors (E3).
 * Aligns with PageComposition layout/region roles; primaryCta matches mother compositionHint vocabulary.
 */

export type PrimaryCtaPlacement = 'inline' | 'toolbar' | 'cta-fixed' | 'none';

export interface PageKindTemplate {
  pageKind: PageKind;
  device: 'pc' | 'mobile';
  /** Stable id for BeautyPreflight.compositionRef (template path; mothers come later). */
  templateId: string;
  layout: PageComposition['layout'];
  regionRoles: Array<PageComposition['regions'][number]['role']>;
  footer: PageComposition['footer'];
  primaryCta: PrimaryCtaPlacement;
  /** Short visual-anchor label for preflight. */
  visualAnchor: string;
}

type Device = 'pc' | 'mobile';

function id(device: Device, kind: PageKind, variant: string): string {
  return `${device}-${kind}-${variant}`;
}

const TEMPLATES: Record<PageKind, Record<Device, PageKindTemplate>> = {
  list: {
    pc: {
      pageKind: 'list', device: 'pc', templateId: id('pc', 'list', 'table'),
      layout: 'flow', regionRoles: ['header', 'main', 'footer'], footer: 'flow',
      primaryCta: 'toolbar', visualAnchor: '工具条与主列表'
    },
    mobile: {
      pageKind: 'list', device: 'mobile', templateId: id('mobile', 'list', 'cards'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'toolbar', visualAnchor: '顶筛选与卡片列表'
    }
  },
  form: {
    pc: {
      pageKind: 'form', device: 'pc', templateId: id('pc', 'form', 'grouped'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '分组表单主体'
    },
    mobile: {
      pageKind: 'form', device: 'mobile', templateId: id('mobile', 'form', 'sheet'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '单列表单卡'
    }
  },
  detail: {
    pc: {
      pageKind: 'detail', device: 'pc', templateId: id('pc', 'detail', 'profile'),
      layout: 'two-column', regionRoles: ['header', 'main', 'secondary'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '摘要与详情双栏'
    },
    mobile: {
      pageKind: 'detail', device: 'mobile', templateId: id('mobile', 'detail', 'hero'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '全宽英雄区与内容卡'
    }
  },
  dashboard: {
    pc: {
      pageKind: 'dashboard', device: 'pc', templateId: id('pc', 'dashboard', 'metrics'),
      layout: 'flow', regionRoles: ['header', 'main', 'secondary'], footer: 'flow',
      primaryCta: 'toolbar', visualAnchor: '指标卡与主图表区'
    },
    mobile: {
      pageKind: 'dashboard', device: 'mobile', templateId: id('mobile', 'dashboard', 'stack'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '指标横滑与纵向区块'
    }
  },
  pricing: {
    pc: {
      pageKind: 'pricing', device: 'pc', templateId: id('pc', 'pricing', 'compare'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '套餐对比卡'
    },
    mobile: {
      pageKind: 'pricing', device: 'mobile', templateId: id('mobile', 'pricing', 'stack'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '纵向套餐卡'
    }
  },
  conversation: {
    pc: {
      pageKind: 'conversation', device: 'pc', templateId: id('pc', 'conversation', 'suggest'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '长阅读正文流'
    },
    mobile: {
      pageKind: 'conversation', device: 'mobile', templateId: id('mobile', 'conversation', 'reading'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '建议正文阅读区'
    }
  },
  landing: {
    pc: {
      pageKind: 'landing', device: 'pc', templateId: id('pc', 'landing', 'hero'),
      layout: 'flow', regionRoles: ['header', 'main', 'footer'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '品牌英雄区与单一主操作'
    },
    mobile: {
      pageKind: 'landing', device: 'mobile', templateId: id('mobile', 'landing', 'hero'),
      layout: 'flow', regionRoles: ['header', 'main', 'footer'], footer: 'cta',
      primaryCta: 'cta-fixed', visualAnchor: '全宽英雄区与底栏主操作'
    }
  },
  settings: {
    pc: {
      pageKind: 'settings', device: 'pc', templateId: id('pc', 'settings', 'sections'),
      layout: 'sidebar-main', regionRoles: ['sidebar', 'main'], footer: 'flow',
      primaryCta: 'none', visualAnchor: '分组设置与说明'
    },
    mobile: {
      pageKind: 'settings', device: 'mobile', templateId: id('mobile', 'settings', 'grouped'),
      layout: 'flow', regionRoles: ['header', 'main'], footer: 'flow',
      primaryCta: 'none', visualAnchor: '分组设置列表'
    }
  },
  empty: {
    pc: {
      pageKind: 'empty', device: 'pc', templateId: id('pc', 'empty', 'state'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '居中空态与单一主操作'
    },
    mobile: {
      pageKind: 'empty', device: 'mobile', templateId: id('mobile', 'empty', 'state'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '居中空态与触控主按钮'
    }
  },
  result: {
    pc: {
      pageKind: 'result', device: 'pc', templateId: id('pc', 'result', 'success'),
      layout: 'flow', regionRoles: ['main', 'footer'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '结果摘要与后续操作'
    },
    mobile: {
      pageKind: 'result', device: 'mobile', templateId: id('mobile', 'result', 'status'),
      layout: 'flow', regionRoles: ['main', 'footer'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '状态结果与主次按钮'
    }
  },
  unknown: {
    pc: {
      pageKind: 'unknown', device: 'pc', templateId: id('pc', 'unknown', 'neutral'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '中性主内容区'
    },
    mobile: {
      pageKind: 'unknown', device: 'mobile', templateId: id('mobile', 'unknown', 'neutral'),
      layout: 'flow', regionRoles: ['main'], footer: 'flow',
      primaryCta: 'inline', visualAnchor: '中性主内容区'
    }
  }
};

export function getPageKindTemplate(pageKind: PageKind, device: Device): PageKindTemplate {
  return structuredClone(TEMPLATES[pageKind][device]);
}

/** All kind×device templates (for tests / catalog checks). */
export function listPageKindTemplates(): PageKindTemplate[] {
  const out: PageKindTemplate[] = [];
  for (const kind of Object.keys(TEMPLATES) as PageKind[]) {
    out.push(structuredClone(TEMPLATES[kind].pc), structuredClone(TEMPLATES[kind].mobile));
  }
  return out;
}
