import {hasTemplateContract,compileComponentTemplate} from '../../utils/componentTemplate';
import {inspectDesignEntities,designEntitySummary} from './designEntityValidation';
import {libraryMemberLocked,libraryReadOnlyMessage,libraryReferenceIssue,verifyLibraryReferenceFiles} from './designLibraryReference';
import type { ComponentDefinition, ProjectSettings, Screen, StyleOverride, Asset } from '../../types/project';
import type { KnowledgeState } from './projectKnowledge';
import type { ProjectStorage } from '../storage/projectStorage';
import type { RestyleOutcome } from './restyleService';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import { acceptRestyleResult } from './restyleService';
import { checkGenerationSourceSafety, checkGenerationQuality, qualitySummary, type QualityReport } from './generationQuality';
import { normalizeMobileNavigation, normalizeScreenNavigation } from '../../utils/mobileNavigation';
import { projectComponentSync } from '../../utils/componentSync';
import { contentFingerprint } from './designWorkflow';
import { readProjectRenderResources, inspectProjectAssetReferences, referencedProjectAssets, screenForAssetAudit, verifyProjectAssetFiles, type ProjectAssetIssue } from './projectAssetIntegrity';
import { PageRenderCheck } from './pageRenderCheck';
import {resolveWorkflowValidation,evaluateWorkflowValidation,type WorkflowValidationReport} from './workflowValidation';
import {taskRuleSafetyIssue} from './designKnowledge/safety';
import {mergeRenderResourceFiles,renderResourceIssue} from '../storage/renderResourceSnapshot';

export interface RestyleValidationReport {
  status: 'passed' | 'blocked'; checkedAt: number; contextFingerprint: string;
  pages: Array<{id:string;name:string;candidateFingerprint:string;source?:QualityReport;quality?:QualityReport;render?:RenderedQualityReport}>;
  assetIssues: ProjectAssetIssue[];
  files?:Array<{id:string;relPath:string}>;
  message?: string;
  workflow?:WorkflowValidationReport;
}
export type RestyleValidationState = KnowledgeState & {
  settings: ProjectSettings; screens: Record<string,Screen>; overrides: Record<string,StyleOverride>; assets: Record<string,Asset>;
};
export interface CheckedRestylePlan {
  screens: Screen[]; component?: ComponentDefinition;
  referencedAssets: Asset[];
  validation: RestyleValidationReport;
}

/** Freeze and validate the exact write set. No History, project or candidate mutation is allowed here. */
export async function prepareCheckedRestyle(state: RestyleValidationState, outcome: RestyleOutcome, storage: ProjectStorage,
  options: {contextKey:string;isCurrent:()=>boolean;signal?:AbortSignal}): Promise<CheckedRestylePlan> {
  const report: RestyleValidationReport = {status:'blocked',checkedAt:Date.now(),contextFingerprint:options.contextKey,pages:[],assetIssues:[]};
  const result: CheckedRestylePlan = {screens:[],referencedAssets:[],validation:report};
  const current = () => !options.signal?.aborted && options.isCurrent()&&!taskRuleSafetyIssue(outcome.workflowContract);
  const fail = (message:string) => {report.message = taskRuleSafetyIssue(outcome.workflowContract)??message;return result;};
  try {
    if (!current()) return fail('工程已变化或重塑已取消。');
    const {target,html} = outcome;
    const referenceIssue=libraryReferenceIssue(state);if(referenceIssue)return fail(referenceIssue);
    if(target.kind==='component'&&libraryMemberLocked(state,'components',target.id))return fail(libraryReadOnlyMessage);
    const baseline = target.kind === 'screen' ? state.screens[target.id]?.htmlContent : state.components[target.id]?.templateHtml;
    if (outcome.status !== 'applied' || !html || baseline === undefined ||
      (target.kind === 'screen' ? normalizeMobileNavigation(baseline,state.settings).html : baseline) !== target.html) return fail('重塑目标或原页面基线已变化。');
    const task=resolveWorkflowValidation(outcome.workflowContract,'batch');
    if(!task.ok)return fail(task.message);
    const contract=outcome.workflowContract;
    if(contract&&(contract.target!.id!==target.id||contract.target!.baselineFingerprint!==contentFingerprint(baseline)||contract.device.profile!==state.settings.deviceProfile||contract.device.frameWidth!==state.settings.frameWidth))return fail('工作流合同的目标、基线或设备已不匹配。');
    const unsupported=task.plan.stages.find(stage=>!['source-safety','quality','structure','asset-references','asset-files','render','design-entities'].includes(stage));
    if(unsupported)return fail(`批量核验器不支持必要阶段 ${unsupported}。`);
    const qualityOptions = {deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,designSystem:state.designSystem};
    const safety = checkGenerationSourceSafety(html,qualityOptions);
    if (!safety.passed) return fail(qualitySummary(safety));
    const protectedNids = (id:string) => Object.entries(state.overrides).filter(([key])=>key.startsWith(`${id}:`)).map(([,ov])=>ov.nid);
    const accepted = acceptRestyleResult({...target,protectedNids:target.kind === 'screen' ? protectedNids(target.id) : target.protectedNids},html,qualityOptions,outcome.workflowContract);
    if (accepted.status !== 'applied') return fail(accepted.message ?? '重塑结构或质量复核未通过。');
    const checked: Screen[] = [];
    if (target.kind === 'screen') {
      result.screens = [normalizeScreenNavigation({...state.screens[target.id],htmlContent:html},state.settings)];
      checked.push(...result.screens);
    } else {
      const component = state.components[target.id];
      result.component = {...component,templateHtml:html,version:(component.version ?? 1) + (html !== component.templateHtml ? 1 : 0),updatedAt:Date.now()};
      if(hasTemplateContract(result.component))compileComponentTemplate(result.component);
      const projection = projectComponentSync(result.component,Object.values(state.screens),state.overrides);
      result.screens = projection.screens.map(screen=>normalizeScreenNavigation(screen,state.settings));
      checked.push({id:`template-${component.id}`,name:`${component.name}（模板）`,htmlContent:html,position:{x:0,y:0}},...result.screens);
    }
    report.pages = checked.map(screen=>({id:screen.id,name:screen.name,candidateFingerprint:contentFingerprint(screen.htmlContent)}));
    const entityReports=checked.map(screen=>inspectDesignEntities(screen.htmlContent,{components:{...state.components,...(result.component?{[result.component.id]:result.component}:{})},pageIds:Object.keys(state.screens),baselineHtml:screen.id===`template-${result.component?.id}`?baseline:state.screens[screen.id]?.htmlContent}));
    const entityFailure=entityReports.findIndex(report=>!report.passed);
    if(entityFailure>=0)return fail(`${checked[entityFailure].name}：${designEntitySummary(entityReports[entityFailure])}`);
    const assets = Object.values(state.assets), used = new Map<string,Asset>();
    const perPageOverrides = (id:string) => Object.fromEntries(Object.entries(state.overrides).filter(([key])=>key.startsWith(`${id}:`)));
    // L4 can reference local images too; file checks must cover what is actually rendered.
    const auditScreens = checked.map(screen=>screenForAssetAudit(screen,state.overrides));
    report.assetIssues = inspectProjectAssetReferences(auditScreens,assets).filter(issue=>checked.some(screen=>screen.id === issue.entityId));
    for (const screen of auditScreens) for (const asset of referencedProjectAssets(screen,assets)) used.set(asset.id,asset);
    result.referencedAssets = [...used.values()];
    const readResources=await readProjectRenderResources(storage,auditScreens,assets);
    report.files=readResources.files;report.assetIssues.push(...readResources.issues);
    report.assetIssues.push(...await verifyProjectAssetFiles(storage,[...used.values()]),...await verifyLibraryReferenceFiles(storage,state));
    if (!current()) return fail('核对资源期间工程已变化或重塑已取消。');
    if (report.assetIssues.length) return fail(report.assetIssues[0].message);
    for (const [index,screen] of checked.entries()) {
      if (!current()) return fail('渲染期间工程已变化或重塑已取消。');
      const source = checkGenerationSourceSafety(screen.htmlContent,qualityOptions);
      const quality = checkGenerationQuality(screen.htmlContent,{...qualityOptions,
        baselineHtml:state.screens[screen.id]?.htmlContent,protectedNids:protectedNids(screen.id)});
      report.pages[index].source = source;report.pages[index].quality = quality;
      if (!source.passed || !quality.passed) return fail(qualitySummary(!source.passed ? source : quality));
      const render = await PageRenderCheck.inspect({screen,settings:state.settings,designSystem:state.designSystem,assets,overrides:perPageOverrides(screen.id)},storage,{signal:options.signal});
      report.pages[index].render = render;
      if (!current()) return fail('渲染期间工程已变化或重塑已取消。');
      if (render.status !== 'complete' || render.findings.some(f=>f.severity === 'error')) return fail(`${screen.name}：${render.findings.find(f=>f.severity === 'error')?.message ?? render.reason ?? 'iframe 检查尚未完整通过。'}`);
      const actual=await readProjectRenderResources(storage,[screen],assets,perPageOverrides(screen.id));
      if(!current())return fail('核对渲染资源期间工程已变化或重塑已取消。');
      if(actual.issues.length)return fail(actual.issues[0].message);
      const resourceIssue=renderResourceIssue(render.resourceFiles,actual.resourceFiles);if(resourceIssue)return fail(resourceIssue);
    }
    const finalResources=await readProjectRenderResources(storage,auditScreens,assets);
    report.files=finalResources.files;report.assetIssues.push(...finalResources.issues);
    report.assetIssues.push(...await verifyProjectAssetFiles(storage,[...used.values()]),...await verifyLibraryReferenceFiles(storage,state));
    if (!current()) return fail('应用前工程已变化或重塑已取消。');
    if (report.assetIssues.length) return fail(report.assetIssues[0].message);
    const passed=(message:string)=>({status:'passed' as const,message});
    const resourceIssue=renderResourceIssue(mergeRenderResourceFiles(report.pages.map(p=>p.render?.resourceFiles??[])),finalResources.resourceFiles);
    if(resourceIssue)return fail(resourceIssue);
    report.workflow=evaluateWorkflowValidation(task.plan,{
      'design-entities':passed(entityReports.map((entities,index)=>`${checked[index].name}：${designEntitySummary(entities)}`).join('\n')),
      'source-safety':passed(`已检查 ${checked.length} 个页面/模板的实际源码。`),quality:passed(`已检查 ${checked.length} 个页面/模板的静态质量。`),
      structure:passed('已按现有严格结构规则检查，并检查实际组件投影。'),'asset-references':passed('实际写集引用已核对登记。'),
      'asset-files':passed('引用文件已于渲染前后核对存在。'),render:passed(`实际 iframe 完成 ${checked.length} 个页面/模板检查。`)});
    if(report.workflow.status!=='ready')return fail(report.workflow.checks.find(check=>check.status!=='passed')?.message??'目录验收未通过。');
    report.status = 'passed';report.checkedAt = Date.now();return result;
  } catch (error) {return fail(error instanceof Error ? error.message : '重塑验收失败，原页面未修改。');}
}
