import { classifyIntent } from '../../../intentClassifier';
import { proposeTokenChange } from '../../../styleTags';
import { PipelineInput, PipelineIntent } from '../types';

export interface IntentAnalysisResult {
  intent: PipelineIntent;
  reason: string;
  hasExplicitStructuralChangeIntent: boolean;
  themeProposal?: any;
}

const STRUCTURAL_CHANGE_KEYWORDS = [
  '新增', '增加', '加一个', '添加', '删除', '去掉', '补充', '移除', '插一个',
  '填充', '替换', '重构', '换成', '做成', '重做', '插入',
  'add', 'remove', 'delete', 'insert', 'append', 'replace', 'refactor', 'fill'
];

export function analyzePipelineIntent(
  input: PipelineInput,
  currentTokens?: any
): IntentAnalysisResult {
  // 确认卡片的字段标题不是结构修改请求。“用户补充：无”不能令每次修改全页放行。
  const rawLower = input.rawPrompt.replace(/用户补充[:：]\s*/g, '').toLowerCase();
  // 上游已裁决时直接采信，杜绝流水线内再判一次导致的意图漂移 (BR-GT-06)
  const classified = input.decision
    ? { intent: input.decision.intent, reason: input.decision.reason }
    : classifyIntent(input.rawPrompt, Boolean(input.activeScreenId));

  const hasExplicitStructuralChangeIntent = STRUCTURAL_CHANGE_KEYWORDS.some((kw) =>
    rawLower.includes(kw.toLowerCase())
  );

  let themeProposal: any = null;
  if (classified.intent === 'change_theme' && currentTokens) {
    themeProposal = proposeTokenChange(input.rawPrompt, currentTokens);
  }

  return {
    intent: classified.intent as PipelineIntent,
    reason: classified.reason,
    hasExplicitStructuralChangeIntent,
    themeProposal
  };
}
