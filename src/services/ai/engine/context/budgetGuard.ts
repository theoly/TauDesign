import { compactPageReference, type PageReferenceSnapshot } from './pageReferenceContext';
export const CONTEXT_BUDGET = {
  /** 软阈值：超过此值时，@引用画框强制降级为骨架，禁用样张 Few-Shot */
  SOFT_LIMIT_CHARS: 24_000,
  /** Reference context ceiling. Required target text must never be skeletonized to satisfy it. */
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
  targetIsBusinessInventory?: boolean;
  referencedScreens: PageReferenceSnapshot[];
  skeletonizeFn: (html: string) => string;
}): BudgetGuardResult {
  const { targetHtml = '' } = params;
  const referencedScreens=params.referencedScreens.map(ref=>({...ref}));
  const warnings: string[] = [];
  let isContextTrimmed = false;

  const currentTargetHtml = targetHtml;
  const targetIsSkeleton = false;

  const size=(ref:PageReferenceSnapshot)=>ref.skeletonHtml.length+(ref.styles?.length??0)+(ref.analysis?.length??0);
  // Required original text remains authoritative. Final provider capacity preflight may reject it;
  // a stripped skeleton is never a source from which a model may reconstruct the full page.
  if(currentTargetHtml.length>CONTEXT_BUDGET.HARD_LIMIT_CHARS){
    warnings.push(params.targetIsBusinessInventory?'目标业务清单超过参考上下文额度，业务文本、控件和样式仍完整保留；旧布局仅在本地保存。发送前仍需通过模型容量检查。':'目标画框超过参考上下文额度，已保留完整原文；发送前仍需通过模型容量检查，不得从删字骨架重建页面。明确小改应使用授权子树修改。');
  }
  const total=currentTargetHtml.length+referencedScreens.reduce((sum,ref)=>sum+size(ref),0);
  if(total>CONTEXT_BUDGET.SOFT_LIMIT_CHARS){
    isContextTrimmed=true;
    warnings.push(referencedScreens.length?'上下文体积超出 24k 字符软限制，参考页面按剩余额度压缩或省略；未包含的细节不应臆测。':'必需上下文超过 24k 字符软阈值，内容未裁减，发送前仍需通过模型容量检查。');
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
