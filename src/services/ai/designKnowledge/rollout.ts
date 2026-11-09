import type {summarizeExperiment} from './experiment';

// A local report/model/upload cannot mutate a compiled release decision. Explicit opt-in remains separate.
export const DEFAULT_DESIGN_RULES_ENABLED=false;
export interface RolloutChecks {offlineCurrent:boolean;offlinePassed:boolean;traceAccountingVerified:boolean;nativeCurrent:boolean;nativePassed:boolean;finalAcceptanceCurrent:boolean;finalAcceptancePassed:boolean}
export function designRuleRolloutReadiness(experiment:ReturnType<typeof summarizeExperiment>,checks:RolloutChecks){
 const gates={...experiment.gates,...checks},blockers=Object.entries(gates).filter(([,passed])=>passed!==true).map(([name])=>name),eligible=blockers.length===0;
 return {version:1 as const,planId:experiment.planId,eligible,mode:eligible?'eligible-for-release-review' as const:'optional' as const,defaultEnabled:DEFAULT_DESIGN_RULES_ENABLED,blockers,
  limitations:['Readiness is recomputed from private local experiment records; it does not change application defaults or adopted pages.',
   'Human identity depends on explicit independent blind-review declarations; this verifier cannot authenticate reviewers.',
   'Windows/Linux native acceptance gaps remain disclosed; source, package and publication are separate scopes.']};
}
