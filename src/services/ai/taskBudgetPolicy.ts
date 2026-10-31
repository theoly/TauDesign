import {TaskBudget} from './taskBudget';
import {RESTYLE_PATCH_THRESHOLD} from './restylePatches';

/** Preserve existing per-target worst-case allowances; budgets scale only with confirmed work. */
export function createRestyleBudget(targets:ReadonlyArray<{html:string}>):TaskBudget {
  const count=Math.max(1,targets.length);
  return new TaskBudget({maxRequests:Math.max(1,targets.reduce((n,t)=>n+(t.html.length>RESTYLE_PATCH_THRESHOLD?16:3),0)),
    maxRequestedOutputTokens:32768*count,maxDurationMs:600000*count,maxRequestDurationMs:600000});
}
export function createPlanningBudget():TaskBudget {
  return new TaskBudget({maxRequests:2,maxRequestedOutputTokens:8192,maxDurationMs:1800000,maxRequestDurationMs:900000});
}
export function createMultiPageBudget(count:number):TaskBudget {
  if(!Number.isInteger(count)||count<1||count>8)throw Error('批次页面数量无效。');
  return new TaskBudget({maxRequests:count*4,maxRequestedOutputTokens:count*(32768+1800),maxDurationMs:count*900000,maxRequestDurationMs:900000});
}
export function createSingleRequestBudget(outputTokens:number):TaskBudget {
  return new TaskBudget({maxRequests:1,maxRequestedOutputTokens:outputTokens,maxDurationMs:900000,maxRequestDurationMs:900000});
}
export function createChatTaskBudget(sectioned=false):TaskBudget {
  return new TaskBudget({maxRequests:sectioned?14:4,maxRequestedOutputTokens:32768+1800,maxDurationMs:900000,maxRequestDurationMs:900000});
}
