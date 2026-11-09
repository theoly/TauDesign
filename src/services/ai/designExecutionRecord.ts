import type { QualityReport } from './generationQuality';
import type { ContinuationResult } from './boundedContinuation';
import {embeddedMediaIssue,assertExternalMedia} from './externalMedia';
import {contentFingerprint} from './designWorkflow';

/** Diagnostic output shared by model generation, restyle and deterministic HTML import. */
export interface DesignExecutionRecord {
  source: 'model' | 'sectioned-model' | 'html-import' | 'local-edit';
  sectioned?: import('./sectionedGeneration').SectionedEvidence;
  rawResponse: string;
  responseFingerprint?:string;
  responseOmitted?:'embedded-media';
  observedResponseChars?:number;
  completeHtml?: string;
  finishReason?: string;
  continuationCount: number;
  errorMessage?: string;
  warnings: string[];
  qualityReport?: QualityReport;
  localEdit?: { mode: 'element' | 'local' | 'region'; targetNids: string[]; operationCount: number;structural?:true };
  draftRepair?: { sourceFingerprint: string; sourceTaskId?: string; confirmedLabels: Array<{nid:string;text:string}>;
    historicalPageTaskSource?:import('./designWorkflow').DesignTaskContract;
    historicalGuidanceSource?:import('./designWorkflow').DesignTaskContract };
}

export function modelExecutionRecord(result: ContinuationResult, options: {
  completeHtml?: string; errorMessage?: string; qualityReport?: QualityReport; warnings?: string[];
} = {}): DesignExecutionRecord {
  const errorMessage = options.errorMessage ?? result.errorMessage;
  return sanitizeExecutionMedia({
    source: 'model', rawResponse: result.rawResponse,
    ...(options.completeHtml ? { completeHtml: options.completeHtml } : {}),
    ...(result.finishReason ? { finishReason: result.finishReason } : {}),
    continuationCount: result.continuationCount,
    ...(errorMessage ? { errorMessage } : {}),
    warnings: [...(options.warnings ?? result.warnings)],
    ...(options.qualityReport ? { qualityReport: options.qualityReport } : {})
  });
}

/** Failed model output must not smuggle encoded media into diagnostic/conversation JSON. */
export function sanitizeExecutionMedia(record:DesignExecutionRecord):DesignExecutionRecord{
 const texts=[record.rawResponse,record.completeHtml??'',record.sectioned?.plan.shellHtml??'',...(record.sectioned?.requests.map(request=>request.rawResponse)??[])];
 if(!texts.some(text=>embeddedMediaIssue(text)))return record;
 return {...record,rawResponse:'',completeHtml:undefined,sectioned:undefined,responseOmitted:'embedded-media',responseFingerprint:contentFingerprint(JSON.stringify(texts)),observedResponseChars:record.rawResponse.length};
}

export function htmlImportExecutionRecord(html: string): DesignExecutionRecord {
  assertExternalMedia(html);
  return { source: 'html-import', rawResponse: '', completeHtml: html, continuationCount: 0, warnings: [] };
}

/** Records the verified DOM result. Structured model replies are not available as raw stream text. */
export function localEditExecutionRecord(input: {
  html: string; qualityReport: QualityReport; mode: 'element' | 'local' | 'region'; targetNids: string[]; operationCount: number;structural?:true;
}): DesignExecutionRecord {
  assertExternalMedia(input.html);
  return { source: 'local-edit', rawResponse: '', completeHtml: input.html, continuationCount: 0, warnings: [],
    qualityReport: input.qualityReport,
    localEdit: { mode: input.mode, targetNids: [...input.targetNids], operationCount: input.operationCount,...(input.structural?{structural:true as const}:{}) } };
}
