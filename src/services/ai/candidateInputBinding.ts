import type {StagedCandidateData} from '../storage/candidateRepository';
import {pageCreationContext,type PageCreationState} from './pageCreationValidation';

export function isCandidateInputFingerprint(value:unknown):value is string {
 return typeof value==='string'&&/^[a-f0-9]{8}$/.test(value);
}
/** Same complete input scope as generation/repair. A render refresh cannot renew authorization. */
export function candidateInputIssue(candidate:Pick<StagedCandidateData,'inputContextFingerprint'>,state:PageCreationState):string|undefined {
 const frozen=candidate.inputContextFingerprint;
 if(frozen===undefined)return '旧候选缺少完整输入快照，不能确认原授权仍有效；请重新发起任务。原候选仍可查看。';
 if(!isCandidateInputFingerprint(frozen))return '候选完整输入快照损坏，未恢复执行权限；请重新发起任务。';
 if(frozen!==pageCreationContext(state))return '原页面、项目文档（含AI归纳）、导航信息或其他任务输入已变化；请重新发起任务，复验不能更新原授权。';
}
