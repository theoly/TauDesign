import type { QualityReport } from './generationQuality';
import type { ContinuationResult } from './boundedContinuation';

/** Diagnostic output shared by model generation, restyle and deterministic HTML import. */
export interface DesignExecutionRecord {
  source: 'model' | 'sectioned-model' | 'html-import' | 'local-edit';
  sectioned?: import('./sectionedGeneration').SectionedEvidence;
  rawResponse: string;
  completeHtml?: string;
  finishReason?: string;
  continuationCount: number;
  errorMessage?: string;
  warnings: string[];
  qualityReport?: QualityReport;
  localEdit?: { mode: 'element' | 'local' | 'region'; targetNids: string[]; operationCount: number };
  draftRepair?: { sourceFingerprint: string; sourceTaskId?: string; confirmedLabels: Array<{nid:string;text:string}> };
}

export function modelExecutionRecord(result: ContinuationResult, options: {
  completeHtml?: string; errorMessage?: string; qualityReport?: QualityReport; warnings?: string[];
} = {}): DesignExecutionRecord {
  const errorMessage = options.errorMessage ?? result.errorMessage;
  return {
    source: 'model', rawResponse: result.rawResponse,
    ...(options.completeHtml ? { completeHtml: options.completeHtml } : {}),
    ...(result.finishReason ? { finishReason: result.finishReason } : {}),
    continuationCount: result.continuationCount,
    ...(errorMessage ? { errorMessage } : {}),
    warnings: [...(options.warnings ?? result.warnings)],
    ...(options.qualityReport ? { qualityReport: options.qualityReport } : {})
  };
}

export function htmlImportExecutionRecord(html: string): DesignExecutionRecord {
  return { source: 'html-import', rawResponse: '', completeHtml: html, continuationCount: 0, warnings: [] };
}

/** Records the verified DOM result. Structured model replies are not available as raw stream text. */
export function localEditExecutionRecord(input: {
  html: string; qualityReport: QualityReport; mode: 'element' | 'local' | 'region'; targetNids: string[]; operationCount: number;
}): DesignExecutionRecord {
  return { source: 'local-edit', rawResponse: '', completeHtml: input.html, continuationCount: 0, warnings: [],
    qualityReport: input.qualityReport,
    localEdit: { mode: input.mode, targetNids: [...input.targetNids], operationCount: input.operationCount } };
}
