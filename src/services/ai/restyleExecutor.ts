import type { AIEngineCore, StreamTextOptions } from './engine/core/types';
import type { QualityOptions } from './generationQuality';
import type { DesignTaskContract } from './designWorkflow';
import { streamWithContinuation } from './boundedContinuation';
import { finalizeModelHtml } from './modelHtmlResult';
import { modelExecutionRecord } from './designExecutionRecord';
import { acceptRestyleResult, type RestyleOutcome, type RestyleTarget } from './restyleService';

/** The UI assembles the task context; execution, stream failure and terminal HTML handling stay in services. */
export async function executeRestyleTarget(core: AIEngineCore, options: {
  target: RestyleTarget; contract: DesignTaskContract; request: StreamTextOptions; quality: QualityOptions;
}): Promise<RestyleOutcome> {
  const { target, contract: workflowContract, request, quality } = options;
  const result = await streamWithContinuation(core, request, { allowContinuation: true });
  const finalized = finalizeModelHtml(result, { ...quality, baselineHtml: target.html, protectedNids: target.protectedNids,
    preserveNids: true, signal: request.signal, allowRawFragment: true });
  if (!finalized.html) {
    const detail = result.warnings.at(-1);
    const message = finalized.status === 'no_html' ? result.finishReason === 'length'
      ? `模型输出达到上限，页面 HTML 未完整返回；原页面未修改。${detail ? ` ${detail}` : ''}`
      : detail ? `未能提取完整 HTML：${detail}` : '模型未返回完整、有效的 HTML；原页面未修改。'
      : finalized.message;
    return { target, status: 'failed', message, workflowContract, qualityReport: finalized.qualityReport,
      executionRecord: modelExecutionRecord(result, { errorMessage: message, qualityReport: finalized.qualityReport }) };
  }
  const outcome = acceptRestyleResult(target, finalized.html, quality, workflowContract);
  return { ...outcome, executionRecord: modelExecutionRecord(result, {
    completeHtml: outcome.status === 'applied' ? finalized.html : undefined,
    errorMessage: outcome.status === 'applied' ? undefined : outcome.message, qualityReport: outcome.qualityReport
  }) };
}
