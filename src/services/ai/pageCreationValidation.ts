import {inspectDesignEntities,designEntitySummary} from './designEntityValidation';
import {inspectMultiPageScope,validMultiPageScope} from './multiPageContract';
import {inspectCreationSources,inspectReferenceInput,validReferenceImageIdentity,validLibrarySourceIdentity,creationSourceStages} from './workflowSources';
import {libraryReferenceIssue,verifyLibraryReferenceFiles} from './designLibraryReference';
import type {DesignSystem} from '../../types/designSystem';
import type {HtmlImportPreviewReceipt} from '../../types/htmlImport';
import type {Asset, DesignSystemOrigin, ProjectSettings, Screen} from '../../types/project';
import type {KnowledgeState} from './projectKnowledge';
import {knowledgeFingerprint} from './projectKnowledge';
import type {ProjectStorage} from '../storage/projectStorage';
import {contentFingerprint, type DesignTaskContract} from './designWorkflow';
import {designTokenFingerprint} from '../../utils/designSystemIdentity';
import {normalizeScreenNavigation} from '../../utils/mobileNavigation';
import {NidEngine} from '../../utils/nidEngine';
import {checkGenerationSourceSafety,checkGenerationQuality,qualitySummary,type QualityReport} from './generationQuality';
import {readProjectRenderResources,inspectProjectAssetReferences,referencedProjectAssets,verifyProjectAssetFiles} from './projectAssetIntegrity';
import {PageRenderCheck} from './pageRenderCheck';
import type {RenderedQualityReport} from '../../utils/renderedQuality';
import {resolveWorkflowValidation,evaluateWorkflowValidation,isWorkflowValidationReport,type WorkflowValidationReport} from './workflowValidation';
import {taskRuleSafetyIssue} from './designKnowledge/safety';
import {renderResourceIssue,type RenderResourceFile} from '../storage/renderResourceSnapshot';
import type {PageRepairRecord} from './pageRepairRecord';
import {isPageRepairRecord} from './pageRepairRecord';
import {repairGuidanceIssue} from './designKnowledge/repairTrace';
import {isQualityReport,isRenderedQualityReport,isPassedRender} from './evidenceSchema';
import {taskProvenanceIssue} from './taskProvenance';
import {draftExecutionIssue} from './draftExecutionSource';
import {getTokenLintContext} from '../../utils/tokenLint';

export type PageCreationState=KnowledgeState & {settings:ProjectSettings;assets:Record<string,Asset>;designSystemOrigin?:DesignSystemOrigin};
export interface PageCreationEvidence {
  execution?: import('./designExecutionRecord').DesignExecutionRecord;
  version:1;checkedAt:number;contextFingerprint:string;pageFingerprint:string;contract:DesignTaskContract;
  workflow:WorkflowValidationReport;source:QualityReport;quality:QualityReport;render:RenderedQualityReport;
  files:Array<{id:string;relPath:string}>;tokenFingerprint:string;
  repair?:PageRepairRecord;
}
export type PreparedNewPage={status:'ready';screen:Screen;evidence:PageCreationEvidence}|{status:'blocked';message:string;renderFailure?:{screen:Screen;render:RenderedQualityReport};repair?:PageRepairRecord};
/** Include rendering metadata and resources; moving the canvas or measuring pages is not a design change. */
export function pageCreationContext(state:PageCreationState):string {
  return contentFingerprint(JSON.stringify([knowledgeFingerprint(state),Object.entries(state.projectDocuments).sort(([a],[b])=>a.localeCompare(b)),state.designSystemOrigin,state.assets,
    Object.entries(state.screens).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.htmlContent,s.scopedCss,s.metadata])]));
}
export function createdPageFingerprint(screen:Pick<Screen,'htmlContent'|'scopedCss'|'metadata'>):string {
  return contentFingerprint(JSON.stringify([screen.htmlContent,screen.scopedCss??'',screen.metadata?.navigationTitle??'']));
}
/** Binds loaded preview + explicit confirmation to exactly the current converted content and effective theme/device. */
export function importPreviewFingerprint(screen:Pick<Screen,'name'|'htmlContent'|'scopedCss'|'metadata'>,settings:ProjectSettings,designSystem:DesignSystem):string {
  return contentFingerprint(JSON.stringify([screen.name,createdPageFingerprint(screen),screen.metadata?.importedHtml,settings,
    designSystem.id,designTokenFingerprint(designSystem.tokens)]));
}
/** Pure preparation. Actual viewport evidence is required; this function never writes project or History state. */
export async function prepareNewPage(state:PageCreationState,screen:Screen,contract:DesignTaskContract,storage:ProjectStorage,
  options:{isCurrent:()=>boolean;signal?:AbortSignal;purpose?:'create'|'import';preview?:HtmlImportPreviewReceipt}):Promise<PreparedNewPage> {
  const current=()=>!options.signal?.aborted&&options.isCurrent()&&!taskRuleSafetyIssue(contract);
  const fail=(message:string)=>({status:'blocked' as const,message:taskRuleSafetyIssue(contract)??message});
  try{
    if(!current())return fail('生成上下文已变化或创建已取消，请重新生成。');
    const referenceIssue=libraryReferenceIssue(state);if(referenceIssue)return fail(referenceIssue);
    const importing=options.purpose==='import';
    const task=resolveWorkflowValidation(contract,importing?'import':'create');if(!task.ok)return fail(task.message);
    if(importing){
      const metadata=screen.metadata?.importedHtml;
      if(!metadata||!contract.target||contract.sourceName!==metadata.fileName||
        (metadata.workflow&&(metadata.workflow.id!==contract.workflowId||metadata.workflow.strategy!==contract.strategy||metadata.workflow.sourceFingerprint!==contract.target.baselineFingerprint||metadata.workflow.deviceProfile!==state.settings.deviceProfile||metadata.workflow.frameWidth!==state.settings.frameWidth||metadata.workflow.designSystemId!==state.designSystem.id))||
        contract.allowedChanges.length!==1||(metadata.mode==='selective'?!contract.allowedChanges[0].startsWith('tokens:')||JSON.stringify(contract.allowedChanges[0].slice(7).split(',').filter(Boolean).sort())!==JSON.stringify([...metadata.categories].sort()):contract.allowedChanges[0]!==`import:${metadata.mode}`)||
        contract.workflowId!==`import-html-${metadata.mode}`||
        !options.preview||options.preview.version!==1||options.preview.fingerprint!==importPreviewFingerprint(screen,state.settings,state.designSystem))return fail('导入结果缺少当前转换预览的确认，或源工作流信息不匹配。');
    }
    if(typeof contract.taskId!=='string'||!contract.taskId||(!importing&&!contract.allowedChanges.includes('new-screen'))||contract.device.profile!==state.settings.deviceProfile||contract.device.frameWidth!==state.settings.frameWidth||
      (contract.knowledgeFingerprint&&contract.knowledgeFingerprint!==knowledgeFingerprint(state))||
      (contract.designSystem&&(contract.designSystem.id!==state.designSystem.id||
        (contract.designSystem.tokenFingerprint&&contract.designSystem.tokenFingerprint!==designTokenFingerprint(state.designSystem.tokens))))||
      (contract.designSystemOrigin&&(['kind','sourceId','sourceFingerprint','tokenVersion','tokenFingerprint'] as const).some(key=>contract.designSystemOrigin![key]!==state.designSystemOrigin?.[key])))return fail('新建任务的设备、设计系统、知识或授权已变化。');
    const multiPageIssue=importing?undefined:inspectMultiPageScope(contract,screen,Object.keys(state.screens));
    if(multiPageIssue)return fail(multiPageIssue);
    const sources=importing?{checks:{},issue:undefined}:inspectCreationSources(contract,state,screen.htmlContent);
    if(sources.issue)return fail(sources.issue);
    const unsupported=task.plan.stages.find(stage=>![ 'source-safety','quality','asset-references','asset-files','render','design-entities',...(importing?['import-preview']:['reference-input','library-binding','multi-page-scope'])].includes(stage));
    if(unsupported)return fail(`页面核验器不支持必要阶段 ${unsupported}。`);
    const qualityOptions={deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,designSystem:state.designSystem,
      tokenLintContext:importing?getTokenLintContext(screen):'project-tokens' as const};
    const source=checkGenerationSourceSafety(screen.htmlContent,qualityOptions);if(!source.passed)return fail(qualitySummary(source));
    const normalized=normalizeScreenNavigation({...screen,htmlContent:NidEngine.injectNids(screen.htmlContent)},state.settings);
    const quality=checkGenerationQuality(normalized.htmlContent,qualityOptions);if(!quality.passed)return fail(qualitySummary(quality));
    const entities=inspectDesignEntities(normalized.htmlContent,{components:state.components,pageIds:[...Object.keys(state.screens),screen.id,...(contract.multiPage?.pageIds??[])]});
    if(!entities.passed)return fail(designEntitySummary(entities));
    const assets=Object.values(state.assets),references=inspectProjectAssetReferences([normalized],assets).filter(issue=>issue.entityId===screen.id);
    if(references.length)return fail(references[0].message);
    const files=referencedProjectAssets(normalized,assets);
    let readFiles:Array<{id:string;relPath:string}>=[];
    let resourceFiles:RenderResourceFile[]=[];
    const checkFiles=async()=>{
      const rendered=await readProjectRenderResources(storage,[normalized],assets);readFiles=rendered.files;resourceFiles=rendered.resourceFiles;
      return [...await verifyProjectAssetFiles(storage,files),...rendered.issues,...await verifyLibraryReferenceFiles(storage,state)];
    };
    const issues=await checkFiles();
    if(!current())return fail('核对资源期间工程已变化或创建已取消。');
    if(issues.length)return fail(issues[0].message);
    const render=await PageRenderCheck.inspect({screen:normalized,settings:state.settings,designSystem:state.designSystem,assets,overrides:{}},storage,{signal:options.signal});
    if(!current())return fail('渲染期间工程已变化或创建已取消。');
    if(render.status!=='complete'||render.findings.some(f=>f.severity==='error'))return {...fail(render.findings.find(f=>f.severity==='error')?.message??render.reason??'新页面的实际渲染检查未完整通过。'),renderFailure:{screen:normalized,render}};
    const finalFiles=await checkFiles();
    if(!current())return fail('应用前工程已变化或创建已取消。');
    if(finalFiles.length)return fail(finalFiles[0].message);
    const resourceIssue=renderResourceIssue(render.resourceFiles,resourceFiles);if(resourceIssue)return fail(resourceIssue);
    const workflow=evaluateWorkflowValidation(task.plan,{
      ...sources.checks,
      'design-entities':{status:'passed',message:designEntitySummary(entities)},
      ...(contract.multiPage?{'multi-page-scope':{status:'passed' as const,message:`确认计划 ${contract.multiPage.planId} 第${contract.multiPage.index+1}/${contract.multiPage.total}页身份和静态关联已核对；尚未加入画布。`}}:{}),
      'source-safety':{status:'passed',message:'提交校验的 HTML 完整且无不安全活动内容。'},quality:{status:'passed',message:'规范化后的页面静态检查通过。'},
      'asset-references':{status:'passed',message:'全部工程资源引用已登记。'},'asset-files':{status:'passed',message:`应用前复核 ${new Set([...files.map(f=>f.relPath),...readFiles.map(f=>f.relPath)]).size} 个实际文件。`},
      render:{status:'passed',message:`参考设备 iframe 检查 ${render.inspected} 个节点，无严重问题。`},
      ...(importing?{'import-preview':{status:'passed' as const,message:'已加载并确认当前转换结果的预览。'}}:{})
    });
    if(workflow.status!=='ready')return fail(workflow.checks.find(c=>c.status!=='passed')!.message);
    return {status:'ready',screen:normalized,evidence:{version:1,checkedAt:Date.now(),contextFingerprint:pageCreationContext(state),
      pageFingerprint:createdPageFingerprint(normalized),contract,workflow,source,quality,render,files:[...new Map([...files.map(({id,relPath})=>({id,relPath})),...readFiles].map(file=>[file.relPath,file])).values()],
      tokenFingerprint:designTokenFingerprint(state.designSystem.tokens)}};
  }catch(error){return fail(error instanceof Error?error.message:'新页面校验失败。');}
}
/** External project metadata is diagnostic, never an authorization to skip current checks. */
export function isPageCreationEvidence(value:unknown):value is PageCreationEvidence {
  const e=value as PageCreationEvidence|undefined;
  return Boolean(e&&e.version===1&&Number.isFinite(e.checkedAt)&&typeof e.contextFingerprint==='string'&&typeof e.pageFingerprint==='string'&&typeof e.tokenFingerprint==='string'&&
    e.contract&&!taskProvenanceIssue(e.contract)&&!draftExecutionIssue(e.execution,undefined,'history')&&(!e.contract.multiPage||validMultiPageScope(e.contract.multiPage))&&(!e.contract.referenceImage||validReferenceImageIdentity(e.contract.referenceImage))&&(!e.contract.librarySource||validLibrarySourceIdentity(e.contract.librarySource))&&
    (!creationSourceStages(e.contract.workflowId).includes('reference-input')||inspectReferenceInput(e.contract).status==='passed')&&
    (!creationSourceStages(e.contract.workflowId).includes('library-binding')||validLibrarySourceIdentity(e.contract.librarySource))&&typeof e.contract.taskId==='string'&&typeof e.contract.request==='string'&&e.contract.device&&['mobile','pc'].includes(e.contract.device.profile)&&Number.isFinite(e.contract.device.frameWidth)&&isWorkflowValidationReport(e.workflow)&&e.workflow.plan.workflowId===e.contract.workflowId&&
    (e.contract.validationPlan===undefined||JSON.stringify(e.workflow.plan)===JSON.stringify(e.contract.validationPlan))&&isQualityReport(e.source)&&isQualityReport(e.quality)&&
    isRenderedQualityReport(e.render)&&
    Array.isArray(e.files)&&e.files.every(f=>f&&typeof f.id==='string'&&typeof f.relPath==='string')&&
    (e.repair===undefined||(isPageRepairRecord(e.repair)&&e.repair.status==='repaired'&&e.repair.contextFingerprint===e.contextFingerprint&&!repairGuidanceIssue(e.repair.guidance,e.contract,true,'history')))&&
    (e.workflow.status!=='ready'||(e.source.passed&&e.quality.passed&&isPassedRender(e.render))));
}
