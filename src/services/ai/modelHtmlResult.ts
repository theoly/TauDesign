import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { htmlIsComplete } from '../../utils/htmlCompleteness';
import { extractArtifact } from './engine/pipeline/interceptors/streamTransform';
import { checkGenerationQuality, checkGenerationSourceSafety, qualitySummary, type QualityOptions, type QualityReport } from './generationQuality';
import type { ContinuationResult } from './boundedContinuation';
import { isOutputLimit } from './generationContinuation';

export interface ModelHtmlResult {
  status: 'valid' | 'error' | 'no_html' | 'rejected_by_quality';
  html?: string;
  artifact?: NonNullable<ReturnType<typeof extractArtifact>>;
  qualityReport?: QualityReport;
  message?: string;
}

/** Shared terminal validation. Never parse/normalize a truncated or unsafe stream into an apparently valid page. */
export function finalizeModelHtml(result: ContinuationResult, options: QualityOptions & {
  signal?: AbortSignal; allowRawFragment?: boolean;
} = {}): ModelHtmlResult {
  if (options.signal?.aborted || result.errorMessage) return { status: 'error', message: options.signal?.aborted ? '生成已取消' : result.errorMessage };
  const artifact = extractArtifact(result.rawResponse);
  const raw = artifact?.html ?? (options.allowRawFragment && result.rawResponse.trim().startsWith('<') && htmlIsComplete(result.rawResponse.trim())
    ? result.rawResponse.trim() : undefined);
  if (!raw) return { status: 'no_html', message: isOutputLimit(result.finishReason)
    ? '模型达到输出上限，但尚未收到可续写的 HTML 片段；本次未生成页面。请拆分需求后设计，或从头重新生成。'
    : '模型未输出有效的 HTML 代码块' };
  if (artifact && !artifact.isComplete) {
    const atLimit = isOutputLimit(result.finishReason);
    const message = atLimit ? `模型达到输出上限，页面仍未完整返回，尚未应用。${result.checkpoint ? '已保留已生成片段，可继续未完成设计，或先拆分为多个页面。' : '请拆分为局部/区块修改或多个页面。'}` : '模型输出未完整返回（页面产物未闭合），原页面未修改。';
    return { status: 'rejected_by_quality', artifact, message, qualityReport: { passed: false, findings: [{
      code: 'incomplete_artifact', severity: 'error', message, actual: result.finishReason ?? '未收到完整闭合产物',
      expected: '完整页面及闭合产物，不能将流式片段作为最终候选'
    }] } };
  }
  const source = checkGenerationSourceSafety(raw, options);
  if (!source.passed) return { status: 'rejected_by_quality', artifact: artifact ?? undefined, qualityReport: source, message: qualitySummary(source) };
  const html = normalizeMobileNavigation(raw, options).html;
  const qualityReport = checkGenerationQuality(html, options);
  return { status: qualityReport.passed ? 'valid' : 'rejected_by_quality', artifact: artifact ?? undefined, html, qualityReport,
    ...(!qualityReport.passed ? { message: qualitySummary(qualityReport) } : {}) };
}
