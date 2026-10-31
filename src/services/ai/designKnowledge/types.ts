import type { WorkflowDescriptor } from '../workflowCatalog';

export type KnowledgeOperation = WorkflowDescriptor['operation'];
export type RuleFeature = 'long-copy' | 'badge' | 'button' | 'tags' | 'person' | 'form' | 'gradient' | 'fixed-region' | 'media' | 'list' | 'detail' | 'dashboard' | 'pricing' | 'conversation' | 'empty' | 'state' | 'icon' | 'spacing' | 'typography' | 'color';
export interface DesignRule {
  id: string;
  version: number;
  status: 'active' | 'supplemental' | 'deprecated';
  replacedBy?: string;
  tier: 'contextual';
  title: string;
  aliases: string[];
  scope: { operations: KnowledgeOperation[]; devices: Array<'pc' | 'mobile'>; components: RuleFeature[] };
  triggers: RuleFeature[];
  conflictsWith: string[];
  guidance: string;
  examples: { positive: string; negative: string }[];
  implementation: { mode: 'native-token' | 'registered-source-css'; classes: string[] }[];
  exceptions: string[];
  validation: { kind: 'human'; severity: 'advisory' };
  source: { title: string; locator: string; revision: string; reuse: 'original-summary' };
  reviewedAt: string;
}
export interface RuleQuery {
  request: string;
  operation: KnowledgeOperation;
  device: 'pc' | 'mobile';
  /** Local edits must explicitly supply the target's known semantic features. */
  scope: 'page' | 'element';
  features?: RuleFeature[];
  preserveSource?: boolean;
  /** Character window for complete rules only; never the model token budget. */
  maxChars: number;
}
export interface RuleSelection {
  version: 1;
  attempts: 1 | 2;
  catalogFingerprint: string;
  queryFingerprint: string;
  selected: Array<{ rule: DesignRule; fingerprint: string; reason: string }>;
  omitted: Array<{ id: string; reason: 'budget' | 'limit' }>;
  fallback: 'none' | 'excluded-workflow' | 'unknown-target' | 'no-match' | 'budget';
  body: string;
}
