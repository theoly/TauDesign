import { compareStructure, StructureDiff } from '../../../../../utils/structureGuard';
import { PipelineContext } from '../types';
import { parseHtmlCopy } from '../../../../../utils/htmlDocument';

export interface GuardCheckResult {
  passed: boolean;
  structureDiff?: StructureDiff;
  reason?: string;
}

/** 显式「按参考图重绘整页」口令，命中即视为用户已授权结构变动 (BR-GRM-01) */
const IMAGE_REWRITE_KEYWORDS = [
  '按附件图片精准修改',
  '按附件图片修改',
  '按附件图精准修改',
  '按图精准修改',
  '按图修改',
  '精准修改',
  '按参考图修改'
];

export function checkStructureIntegrity(
  context: PipelineContext,
  generatedHtml: string
): GuardCheckResult {
  if (context.intent !== 'modify_screen' || !context.targetScreen?.htmlContent) {
    return { passed: true };
  }

  const prompt = context.input.rawPrompt;
  // 引用只授权该子树，不能让无关操作或兄弟内容消失。
  const nid = context.input.decision?.elementNid || /\bnid=["']([^"']+)["']/.exec(prompt)?.[1];
  if (nid) {
    const original = parseHtmlCopy(context.targetScreen.htmlContent);
    const candidate = parseHtmlCopy(generatedHtml);
    const find = (doc: Document) => Array.from(doc.querySelectorAll('[data-nid]')).find(el => el.getAttribute('data-nid') === nid);
    const before = find(original.doc), after = find(candidate.doc);
    if (!before || (!after && !/(删除|移除|去掉)/.test(prompt))) return { passed: false, reason: '引用目标不存在或被意外删除，无法确认局部修改范围。' };
    before.remove(); after?.remove();
    const diff = compareStructure(original.serialize(), candidate.serialize());
    return { passed: diff.ok && diff.textChanged === 0, structureDiff: diff,
      reason: diff.ok && diff.textChanged === 0 ? '修改限定在引用节点子树内' : '结构守卫拦截：修改超出了引用节点范围。' };
  }

  // 1.5 用户上传参考图并显式要求「按图精准修改」，整页按图重绘即为其本意，守卫放行 (BR-GRM-01)
  if (context.input.attachment && IMAGE_REWRITE_KEYWORDS.some((kw) => prompt.includes(kw))) {
    return {
      passed: true,
      reason: '用户携带参考图并显式要求按图精准修改整页，结构守卫自动放行'
    };
  }

  // 2. 用户明确要求结构性修改（增、删、改、替换、填充等），守卫自动放行
  if (context.hasExplicitStructuralChangeIntent) {
    return {
      passed: true,
      reason: '用户输入明确包含增删或结构调整需求，守卫自动放行'
    };
  }

  const beforeHtml = context.targetScreen.htmlContent;
  const diff = compareStructure(beforeHtml, generatedHtml);

  // If strict structure matches
  if (diff.ok) {
    return { passed: true, structureDiff: diff };
  }

  // Otherwise, reject to prevent silent data destruction
  return {
    passed: false,
    structureDiff: diff,
    reason: `结构守卫拦截: 检测到原有节点被非预期修改 (新增 ${diff.added.length} 处, 丢失 ${diff.removed.length} 处)`
  };
}
