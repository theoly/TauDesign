import { CanvasToolCall } from './canvasToolExecutor';
import { resolveScreenTitle } from '../../utils/screenTitle';
import { PromptBuilder } from '../ai/promptBuilder';

export interface ToolResolutionContext {
  rawResponse: string;
  userPrompt: string;
  activeScreenId: string | null;
  screens: Record<string, { id: string; name: string; htmlContent: string }>;
  extractedHtml?: string;
  artifactMetadata?: { identifier?: string; title?: string };
  /**
   * 上游 `resolveGenerationTarget` 的裁决 (BR-GT-06)。传入后本解析器只负责
   * 「整页 or 局部片段」的形态判断，不再用关键词二次推断动作与目标画框。
   */
  decision?: {
    intent: 'create_screen' | 'modify_screen';
    targetScreenId: string | null;
    styleReferenceScreenId?: string | null;
    elementNid?: string | null;
  };
}

/**
 * 模型输出是「局部元素片段」还是「整页重写」：
 * 不含根容器，且要么带上了该元素的 nid、要么短到不可能是整页
 */
function isPartialElementFragment(html: string, nid: string): boolean {
  return (
    !html.includes('<main') &&
    !html.includes('<body') &&
    (html.includes(`data-nid="${nid}"`) || html.length < 500)
  );
}

/**
 * 确定性工具解析器 (Tool Resolver - KISS 原则)
 *
 * 桥接大模型非结构化/半结构化输出与画布工具契约，
 * 严格依据上下文与引用优先级裁决动作，杜绝意图漂移。
 */
export function resolveToolFromAIResponse(
  context: ToolResolutionContext
): CanvasToolCall | null {
  const { userPrompt, activeScreenId, screens, extractedHtml, artifactMetadata, decision } = context;

  if (!extractedHtml) {
    return null;
  }

  // 0. 上游已裁决：直接落地，绝不再猜 (BR-GT-06)
  if (decision) {
    const target = decision.targetScreenId && screens[decision.targetScreenId]
      ? screens[decision.targetScreenId]
      : null;

    if (decision.intent === 'modify_screen' && target) {
      if (decision.elementNid && isPartialElementFragment(extractedHtml, decision.elementNid)) {
        return {
          tool: 'patch_element',
          params: { screenId: target.id, nid: decision.elementNid, elementHtml: extractedHtml }
        };
      }
      return {
        tool: 'modify_screen',
        params: { screenId: target.id, title: target.name, html: extractedHtml }
      };
    }

    return {
      tool: 'create_screen',
      params: {
        title: resolveScreenTitle({
          artifactTitle: artifactMetadata?.title,
          userPrompt,
          html: extractedHtml
        }),
        html: extractedHtml,
        screenId:
          artifactMetadata?.identifier &&
          artifactMetadata.identifier !== 'screen_new' &&
          artifactMetadata.identifier !== 'screen_default' &&
          !screens[artifactMetadata.identifier]
            ? artifactMetadata.identifier
            : undefined,
        referencedScreenId: decision.styleReferenceScreenId || undefined
      }
    };
  }

  // 1. 强特征优先：检测用户是否附带了元素引用 (BR-CT-01)
  const elementRefMatch = userPrompt.match(/\[引用元素\s+nid="([^"]+)"(?:\s+画框="([^"]+)")?/);
  const nidFallbackMatch = userPrompt.match(/nid="([^"]+)"/);
  const targetNid = elementRefMatch ? elementRefMatch[1] : (nidFallbackMatch ? nidFallbackMatch[1] : null);
  const referencedScreenName = elementRefMatch ? elementRefMatch[2] : null;

  if (targetNid) {
    // 确定目标画框
    let targetScreenId = activeScreenId;
    if (referencedScreenName) {
      const found = Object.entries(screens).find(([, s]) => s.name === referencedScreenName);
      if (found) targetScreenId = found[0];
    }
    if (!targetScreenId) {
      const found = Object.entries(screens).find(([, s]) => s.htmlContent.includes(`data-nid="${targetNid}"`));
      if (found) targetScreenId = found[0];
    }
    if (!targetScreenId && Object.keys(screens).length > 0) {
      targetScreenId = Object.keys(screens)[0];
    }

    if (targetScreenId && screens[targetScreenId]) {
      // 区分是整页重构还是局部元素片段
      if (isPartialElementFragment(extractedHtml, targetNid)) {
        return {
          tool: 'patch_element',
          params: {
            screenId: targetScreenId,
            nid: targetNid,
            elementHtml: extractedHtml
          }
        };
      }

      // 模型输出了包含该元素的新完整页面
      return {
        tool: 'modify_screen',
        params: {
          screenId: targetScreenId,
          title: screens[targetScreenId].name,
          html: extractedHtml
        }
      };
    }
  }

  // 2. 检查是否有明确的画框修改指代
  const modifyKeywords = [
    '改', '修改', '调整', '优化', '重构', '替换', '换成', '重做',
    '去掉', '删除', '更新', '微调', '完善', '把', '按附件图片精准修改',
    '按附件图片修改', '精准修改', '按图修改'
  ];
  const hasModifyKeyword = modifyKeywords.some((kw) => userPrompt.includes(kw));

  // 严格新建指令词（仅当纯新建且不含修改语义时生效）
  const strictCreateKeywords = [
    '新建页面', '新建画框', '创建新页面', '创建新画框', '生成新页面',
    '设计新页面', '加一个页面', '加个页面', '新页面', '做一张新页面', '再来一个页面',
    '再加一个页面', '加一张新页面'
  ];
  const hasDualCreateModify = userPrompt.includes('创建/修改');
  const isStrictCreate = strictCreateKeywords.some((kw) => userPrompt.includes(kw));

  // 用户通过 @ 显式提及了现有画框 (优先最长名称精准匹配，支持空格与括号，如 @充值魔方点 (AI 方案))
  let mentionedTarget: { id: string; name: string } | null = null;
  const sortedScreens = Object.entries(screens).sort(([, a], [, b]) => b.name.length - a.name.length);
  for (const [sId, s] of sortedScreens) {
    if (userPrompt.includes(`@${s.name}`) || userPrompt.includes(`@${sId}`)) {
      mentionedTarget = { id: sId, name: s.name };
      break;
    }
  }

  // 若未带 @，检查提示词中是否直接包含现有画框全名
  if (!mentionedTarget) {
    for (const [sId, s] of sortedScreens) {
      if (s.name && s.name.length >= 2 && userPrompt.includes(s.name)) {
        mentionedTarget = { id: sId, name: s.name };
        break;
      }
    }
  }

  // 判定是否严格要求创建新画框
  const isExplicitCreate = hasDualCreateModify
    ? (!activeScreenId && !mentionedTarget)
    : (isStrictCreate && !hasModifyKeyword && !userPrompt.includes('修改'));

  const requestedId = artifactMetadata?.identifier;

  // a) 用户通过 @ 或直接提及了现有画框，且包含明确修改意图
  if (mentionedTarget && hasModifyKeyword && !isExplicitCreate) {
    return {
      tool: 'modify_screen',
      params: {
        screenId: mentionedTarget.id,
        title: mentionedTarget.name,
        html: extractedHtml
      }
    };
  }

  // b) 用户开启了画框引用 (activeScreenId 有效)，或工程有显式修改意图：
  let targetScreenId = mentionedTarget ? mentionedTarget.id : activeScreenId;
  if (!targetScreenId && hasModifyKeyword && !isExplicitCreate && Object.keys(screens).length > 0) {
    targetScreenId = Object.keys(screens)[0];
  }

  if (
    targetScreenId &&
    screens[targetScreenId] &&
    !isExplicitCreate &&
    (hasModifyKeyword || requestedId === targetScreenId)
  ) {
    return {
      tool: 'modify_screen',
      params: {
        screenId: targetScreenId,
        title: screens[targetScreenId].name,
        html: extractedHtml
      }
    };
  }

  // 3. 默认为新建画框 (create_screen)
  const candidateId =
    artifactMetadata?.identifier &&
    artifactMetadata.identifier !== 'screen_new' &&
    artifactMetadata.identifier !== 'screen_default'
      ? artifactMetadata.identifier
      : undefined;

  let referencedScreenId: string | undefined = undefined;
  if (referencedScreenName) {
    const found = Object.entries(screens).find(([, s]) => s.name === referencedScreenName);
    if (found) referencedScreenId = found[0];
  }
  if (!referencedScreenId) {
    const mentions = PromptBuilder.parseMentions(userPrompt);
    for (const mention of mentions) {
      const cleanMention = mention.trim().toLowerCase();
      const found = Object.entries(screens).find(([, s]) => {
        const sName = s.name.trim().toLowerCase();
        return sName === cleanMention || cleanMention.includes(sName) || sName.includes(cleanMention);
      });
      if (found) {
        referencedScreenId = found[0];
        break;
      }
    }
  }
  if (!referencedScreenId) {
    // 检查提示词中是否直接包含某个画框的全名
    const found = Object.entries(screens).find(([, s]) => s.name && userPrompt.includes(s.name));
    if (found) {
      referencedScreenId = found[0];
    }
  }
  if (!referencedScreenId && activeScreenId && screens[activeScreenId]) {
    const refKeywords = ['参考', '基于', '类似', '右侧', '右边', '根据', '衍生'];
    if (refKeywords.some((kw) => userPrompt.includes(kw))) {
      referencedScreenId = activeScreenId;
    }
  }

  return {
    tool: 'create_screen',
    params: {
      title: resolveScreenTitle({
        artifactTitle: artifactMetadata?.title,
        userPrompt,
        html: extractedHtml
      }),
      html: extractedHtml,
      screenId: candidateId,
      referencedScreenId
    }
  };
}
