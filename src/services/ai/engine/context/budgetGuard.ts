import { compactPageReference, type PageReferenceSnapshot } from './pageReferenceContext';
export const CONTEXT_BUDGET = {
  /** 软阈值：超过此值时，@引用画框强制降级为骨架，禁用样张 Few-Shot */
  SOFT_LIMIT_CHARS: 24_000,
  /** 硬阈值 (对齐 PRD §3.2.6): 超过此值时目标待修改画框亦降级为骨架 */
  HARD_LIMIT_CHARS: 30_000
};

export interface BudgetGuardResult {
  isContextTrimmed: boolean;
  targetScreenHtml: string;
  targetIsSkeleton: boolean;
  referencedScreens: PageReferenceSnapshot[];
  warnings: string[];
}

export function enforceBudgetGuard(params: {
  targetHtml?: string;
  targetId?: string;
  targetName?: string;
  referencedScreens: PageReferenceSnapshot[];
  skeletonizeFn: (html: string) => string;
}): BudgetGuardResult {
  const { targetHtml = '', skeletonizeFn } = params;
  const referencedScreens=params.referencedScreens.map(ref=>({...ref}));
  const warnings: string[] = [];
  let isContextTrimmed = false;

  let currentTargetHtml = targetHtml;
  let targetIsSkeleton = false;

  const size=(ref:PageReferenceSnapshot)=>ref.skeletonHtml.length+(ref.styles?.length??0)+(ref.analysis?.length??0);
  // Preserve the established modification-target guard. References never alter the target.
  if(currentTargetHtml.length>CONTEXT_BUDGET.HARD_LIMIT_CHARS){
    isContextTrimmed=true;targetIsSkeleton=true;currentTargetHtml=skeletonizeFn(currentTargetHtml);
    warnings.push('目标画框超过 30k 字符硬限制，已降级为结构骨架注入。');
  }
  const total=currentTargetHtml.length+referencedScreens.reduce((sum,ref)=>sum+size(ref),0);
  if(total>CONTEXT_BUDGET.SOFT_LIMIT_CHARS){
    isContextTrimmed=true;
    warnings.push('上下文体积超出 24k 字符软限制，参考页面已压缩，保留CSS、L4与业务结构摘要；未包含的细节不应臆测。');
    let available=Math.max(0,CONTEXT_BUDGET.HARD_LIMIT_CHARS-currentTargetHtml.length);
    const omitted:string[]=[];
    const count=referencedScreens.length;
    const allowance=Math.min(12000,Math.floor(available/Math.max(1,Math.min(count,4))));
    const kept:PageReferenceSnapshot[]=[];
    for(const ref of referencedScreens){
      if(available<1200){omitted.push(ref.name);continue;}
      const compact=compactPageReference(ref,Math.min(allowance,available));
      if(size(compact)>available){omitted.push(ref.name);continue;}
      kept.push(compact);available-=size(compact);
    }
    referencedScreens.splice(0,referencedScreens.length,...kept);
    if(omitted.length)warnings.push(`预算不足，以下参考页本轮未注入：${omitted.join('、')}。不能声称已读取这些页面。`);
  }
  return {isContextTrimmed,targetScreenHtml:currentTargetHtml,targetIsSkeleton,referencedScreens,warnings};
}
