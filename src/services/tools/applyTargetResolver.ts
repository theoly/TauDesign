import { CanvasToolCall } from './canvasToolExecutor';
import { resolveToolFromAIResponse } from './toolResolver';

export interface ApplyTargetParams {
  /** 待落地的页面 HTML */
  html: string;
  /** 用户本轮的原始诉求（严禁传入 AI 响应文本） */
  userPrompt: string;
  screens: Record<string, { id: string; name: string; htmlContent: string }>;
  /** 本轮显式引用的画框 */
  referencedScreenId?: string | null;
  /** 本轮修改前快照所属画框 */
  snapshotScreenId?: string | null;
  /** 兜底画框（如当前活跃画框） */
  fallbackScreenId?: string | null;
  /** 本轮曾被结构守卫拦截（守卫仅对有目标画框的修改意图生效） */
  isGuardRejected?: boolean;
  /** 用户诉求是否为显式修改意图 */
  isModifyIntent?: boolean;
  /** 确需新建时使用的画框标题 */
  createTitle?: string;
}

/**
 * 裁决一段已生成 HTML 的最终落点 (BR-GRM-02 / BR-GRM-03)
 *
 * 始终以「用户原始诉求 + 本轮引用画框」为依据；
 * 已引用画框且为修改诉求（含守卫拦截态）时绑定原目标，进入候选交付门禁，
 * 只有确实无目标可循时才回退新建，杜绝修改诉求漂移为新建页面。
 */
export function resolveApplyToolCall(params: ApplyTargetParams): CanvasToolCall | null {
  const {
    html,
    userPrompt,
    screens,
    referencedScreenId,
    snapshotScreenId,
    fallbackScreenId,
    isGuardRejected,
    isModifyIntent,
    createTitle
  } = params;

  const pick = (id?: string | null) => (id && screens[id] ? id : null);
  const targetScreenId = pick(referencedScreenId) || pick(snapshotScreenId) || pick(fallbackScreenId);

  let toolCall = resolveToolFromAIResponse({
    rawResponse: html,
    userPrompt,
    activeScreenId: targetScreenId,
    screens,
    extractedHtml: html
  });

  const mustModify =
    Boolean(targetScreenId) &&
    (Boolean(isGuardRejected) || (Boolean(pick(referencedScreenId)) && Boolean(isModifyIntent)));

  if (mustModify && targetScreenId && toolCall?.tool === 'create_screen') {
    toolCall = {
      tool: 'modify_screen',
      params: {
        screenId: targetScreenId,
        title: screens[targetScreenId].name,
        html
      }
    };
  }

  if (toolCall && toolCall.tool === 'create_screen' && createTitle) {
    toolCall = { ...toolCall, params: { ...toolCall.params, title: createTitle } };
  }

  return toolCall;
}
