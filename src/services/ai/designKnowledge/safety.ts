import type {DesignTaskContract} from '../designWorkflow';

export type RuleEvidencePurpose = 'execute' | 'history';
export interface RuleSafetyPolicy {
  readonly revision: string;
  readonly withdrawals: readonly {readonly id:string; readonly throughVersion:number; readonly reason:string}[];
}
// Bundled application policy only. A project, imported file or model response cannot supply it.
// No existing rule has a confirmed safety withdrawal. Future entries require code review.
const bundled:RuleSafetyPolicy=Object.freeze({revision:'2026-10-31.1',withdrawals:Object.freeze([])});
export const DesignRuleSafety={read:():RuleSafetyPolicy=>bundled};

export function ruleSafetyIssue(rules:readonly {id:string;version:number}[],policy=DesignRuleSafety.read()):string|undefined {
  if(!policy||typeof policy.revision!=='string'||!policy.revision.trim()||!Array.isArray(policy.withdrawals)||
    policy.withdrawals.some(w=>!w||typeof w.id!=='string'||!w.id||!Number.isSafeInteger(w.throughVersion)||w.throughVersion<1||typeof w.reason!=='string'||!w.reason.trim()))return '应用规则安全策略无效，未授权继续执行。';
  for(const rule of rules){
    if(!rule||typeof rule.id!=='string'||!Number.isSafeInteger(rule.version)||rule.version<1)return '规则安全身份无法读取。';
    const withdrawal=policy.withdrawals.find(w=>w.id===rule.id&&rule.version<=w.throughVersion);
    if(withdrawal)return `规则 ${rule.id}@${rule.version} 已被安全撤回：${withdrawal.reason}（策略 ${policy.revision}）。不能继续执行或采纳，请重新发起任务。历史记录仍可查看。`;
  }
}

/** Include confirmed analysis provenance; it cannot authorize execution using withdrawn rules. */
export function taskRuleSafetyIssue(contract:DesignTaskContract|undefined):string|undefined {
  const seen=new Set<DesignTaskContract>();
  let current=contract;
  while(current){
    if(seen.has(current)||seen.size>=4)return '规则来源链无效，未授权继续执行。';
    seen.add(current);
    if(current.designGuidance!==undefined){
      const selected=current.designGuidance?.selection?.selected;
      if(!Array.isArray(selected))return '规则安全身份无法读取。';
      const issue=ruleSafetyIssue(selected.map(s=>s?.rule));if(issue)return issue;
    }
    current=current.modificationReview?.analysis?.workflowContract;
  }
}
