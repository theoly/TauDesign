import {expect,test} from 'bun:test';
import {isCandidateValidationEvidence,type CandidateValidationEvidence,canConfirmCandidateStructure} from '../src/services/ai/candidateValidation';
import {isQualityReport,isPassedRender} from '../src/services/ai/evidenceSchema';
import {isWorkflowValidationReport,evaluateWorkflowValidation} from '../src/services/ai/workflowValidation';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {isPageCreationEvidence,type PageCreationEvidence} from '../src/services/ai/pageCreationValidation';
import {loadStagedCandidate,saveStagedCandidate} from '../src/services/storage/candidateRepository';
const html='<main><button>保存</button></main>',error={code:'error',severity:'error' as const,message:'错误',actual:'坏值',expected:'正确值'};
function evidence():CandidateValidationEvidence{return {version:1,capturedAt:1,candidateFingerprint:contentFingerprint(html),contextFingerprint:'context',projectFingerprint:'project',baselineFingerprint:'baseline',viewport:{profile:'mobile',width:390,height:844},designSystem:{id:'theme',tokenFingerprint:'theme'},
 source:{passed:true,findings:[]},quality:{passed:true,findings:[]},render:{status:'complete',inspected:2,findings:[]},delivery:{status:'ready',checks:['task','source','quality','entities','assets','asset_files','render'].map(id=>({id:id as any,status:'passed',message:'通过'}))}};}
const badKinds=['quality-error','quality-false','source-error','status','empty','duplicate','missing-render','render-error','render-pending','negative-count','finding-shape','missing-gate','workflow-blocked'] as const;
for(const kind of badKinds)test(`${kind} contradiction is rejected and removed from restored diagnostics while HTML survives`,async()=>{
 const v=evidence();
 if(kind==='quality-error')v.quality.findings=[error];if(kind==='quality-false')v.quality.passed=false;if(kind==='source-error')v.source.findings=[error];
 if(kind==='status')v.delivery.checks[0].status='blocked';if(kind==='empty')v.delivery.checks=[];if(kind==='duplicate')v.delivery.checks.push(v.delivery.checks[0]);
 if(kind==='missing-render')delete v.render;if(kind==='render-error')v.render!.findings=[error];if(kind==='render-pending')v.render!.status='pending';if(kind==='negative-count')v.render!.inspected=-1;
 if(kind==='finding-shape')v.quality.findings=[{...error,actual:undefined} as any];if(kind==='missing-gate')v.delivery.checks=v.delivery.checks.filter(c=>c.id!=='assets');
 if(kind==='workflow-blocked'){const c=buildDesignTaskContract({intent:'modify_screen',request:'调整间距',target:{id:'page',name:'页',htmlContent:html},deviceProfile:'mobile',frameWidth:390});v.delivery.workflow=evaluateWorkflowValidation(c.validationPlan!,{});}
 expect(isCandidateValidationEvidence(v)).toBe(false);
 const id=`runtime-${kind}`;await saveStagedCandidate(id,undefined,{candidateId:'candidate-test',targetScreenId:'page',screenName:'页',newHtml:html,baselineFingerprint:'baseline',projectFingerprint:'project',designOriginFingerprint:'origin',validationEvidence:v});
 const restored=await loadStagedCandidate(id);expect(restored!.newHtml).toBe(html);expect(restored!.validationEvidence).toBeUndefined();
});
test('consistent blocked/pending diagnostics stay readable; unrelated project assets remain advisory',()=>{
 const v=evidence();expect(isCandidateValidationEvidence(v)).toBe(true);
 v.projectAssets={checkedAt:1,screenCount:2,files:[{id:'other',relPath:'assets/images/other.png'}],issues:[{code:'missing_asset_file',entityId:'other',message:'其它页面缺资源'}]};expect(isCandidateValidationEvidence(v)).toBe(true);
 delete v.render;v.delivery.checks.find(c=>c.id==='render')!.status='pending';v.delivery.status='pending';expect(isCandidateValidationEvidence(v)).toBe(true);
 v.render={status:'complete',inspected:2,findings:[error]};v.delivery.checks.find(c=>c.id==='render')!.status='blocked';v.delivery.status='blocked';expect(isCandidateValidationEvidence(v)).toBe(true);
});
test('quality reports cannot claim pass with errors or claim failure without errors',()=>{
 expect(isQualityReport({passed:true,findings:[error]})).toBe(false);expect(isQualityReport({passed:false,findings:[]})).toBe(false);
 expect(isQualityReport({passed:false,findings:[error]})).toBe(true);expect(isPassedRender({status:'complete',inspected:0,findings:[]})).toBe(true);
});
function creation():PageCreationEvidence{
 const contract=buildDesignTaskContract({intent:'create_screen',request:'新建',deviceProfile:'mobile',frameWidth:390});return {version:1,checkedAt:1,contextFingerprint:'context',pageFingerprint:'page',tokenFingerprint:'token',contract,
 workflow:evaluateWorkflowValidation(contract.validationPlan!,Object.fromEntries(contract.validationPlan!.stages.map(id=>[id,{status:'passed',message:'通过'}]))),source:{passed:true,findings:[]},quality:{passed:true,findings:[]},render:{status:'complete',inspected:2,findings:[]},files:[]};
}
test('creation report validates actual nested evidence and its frozen checker plan',()=>{
 const e=creation();expect(isPageCreationEvidence(e)).toBe(true);
 for(const change of ['error','plan','empty','render'] as const){const bad=JSON.parse(JSON.stringify(e)) as PageCreationEvidence;if(change==='error')bad.source.findings=[error];if(change==='plan')bad.workflow.plan.fingerprint='changed';if(change==='empty'){bad.workflow.plan.stages=[];bad.workflow.checks=[];}if(change==='render')bad.render.status='unavailable';expect(isPageCreationEvidence(bad)).toBe(false);}
});
test('workflow diagnostics reject unknown stages, empty canvas proof and contradictory aggregate status',()=>{
 const report=creation().workflow;expect(isWorkflowValidationReport(report)).toBe(true);
 expect(isWorkflowValidationReport({...report,plan:{...report.plan,stages:[]},checks:[]})).toBe(false);
 const unknown=structuredClone(report);(unknown.plan.stages as any)[0]='invented';(unknown.checks as any)[0].id='invented';expect(isWorkflowValidationReport(unknown)).toBe(false);
 expect(isWorkflowValidationReport({...report,status:'blocked'})).toBe(false);
});
