import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {assessedFinding,findingDisposition,findingRequirement,renderFindingsForDisplay} from '../src/services/ai/findingPolicy';
import {isQualityFinding,isQualityReport,isRenderedQualityReport,isPassedRender} from '../src/services/ai/evidenceSchema';
import {QualityReportCard} from '../src/components/chat/QualityReportCard';
import {RenderedQualityCard} from '../src/components/chat/RenderedQualityCard';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {stageResourceReport} from './helpers/renderResourceProof';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import type {QualityFinding} from '../src/services/ai/generationQuality';

const details={nid:'action01',message:'可复核原因',actual:'实测值',expected:'合同要求'};
const required=assessedFinding('render-controls','failed',{code:'render_action_invisible_label',...details});
const unknown=assessedFinding('render-completion','unverified',{code:'render_check_unverified',...details});
const contrastUnknown=assessedFinding('contrast-support','unverified',{code:'render_contrast_unverified',...details});
const warning=assessedFinding('contrast','failed',{code:'render_contrast',...details});
const advice=assessedFinding('icon-sizing','advice',{code:'unbounded_icon',...details});
const legacy:QualityFinding={code:'old-code',severity:'warning',...details};

test('four display categories preserve legacy severity and derive requirement from app checks',()=>{
 expect([required,warning,contrastUnknown,advice].map(findingDisposition)).toEqual(['blocker','warning','unverified','advisory']);
 expect(findingRequirement(unknown)).toBe('required');expect(findingDisposition(unknown)).toBe('unverified');
 expect([warning,contrastUnknown,advice,legacy].map(findingRequirement)).toEqual(['advisory','advisory','advisory','advisory']);
 expect(isQualityReport({passed:true,findings:[legacy,warning,contrastUnknown,advice]})).toBe(true);
 expect(isQualityReport({passed:true,findings:[unknown]})).toBe(false);
});
for(const [name,value] of Object.entries({
 'null':{...required,assessment:null},
 'unknown check':{...required,assessment:{checkId:'from-document',status:'failed'}},
 'prototype check':{...required,assessment:{checkId:'toString',status:'failed'}},
 'object check':{...required,assessment:{checkId:{toString:null},status:'failed'}},
 'unknown status':{...required,assessment:{checkId:'render-controls',status:'passed'}},
 'document grade':{...required,assessment:{...required.assessment,requirement:'advisory'}},
 'wrong code':{...required,assessment:advice.assessment,severity:'warning'},
 'downgraded severity':{...required,severity:'warning'},
 'downgraded legacy':{...required,assessment:undefined,severity:'warning'},
 'missing metadata':{...contrastUnknown,assessment:undefined},
}))test(`invalid finding rejected: ${name}`,()=>{
 expect(isQualityFinding(value)).toBe(false);
 expect(isRenderedQualityReport({status:'complete',inspected:1,findings:[value]})).toBe(false);
 expect(isPassedRender({status:'complete',inspected:1,findings:[value]})).toBe(false);
 expect(findingDisposition(value as QualityFinding)).toBe('blocker');
});
test('unsupported checker combinations cannot be manufactured by the factory',()=>{
 expect(()=>assessedFinding('render-controls','advice',{code:'render_action_invisible_label',...details})).toThrow();
 expect(()=>assessedFinding('icon-sizing','advice',{code:'active_content',...details})).toThrow();
});
test('actual source SVG heuristic emits advice and retains its old warning severity',()=>{
 const result=checkGenerationQuality('<main><div class="icon-box"><svg data-nid="illustration"><path d="M1 1h8"/></svg></div></main>');
 const finding=result.findings.find(f=>f.code==='unbounded_icon')!;
 expect(finding.assessment).toEqual({checkId:'icon-sizing',status:'advice'});expect(finding.severity).toBe('warning');expect(result.passed).toBe(true);
});
for(const status of ['pending','incomplete','unavailable'] as const)test(`UI discloses required ${status} without mutating/claiming an executed result`,()=>{
 const report={status,inspected:0,findings:[],reason:'资源或环境未就绪'};
 const display=renderFindingsForDisplay(report);expect(display).toHaveLength(1);expect(report.findings).toHaveLength(0);
 expect(findingDisposition(display[0])).toBe('unverified');expect(findingRequirement(display[0])).toBe('required');
 expect(isPassedRender(report)).toBe(false);
 const markup=renderToStaticMarkup(<RenderedQualityCard report={report}/>);
 expect(markup).toContain('1 项未验证');expect(markup).toContain('必需检查');expect(markup).toContain(report.reason);
 expect(markup).not.toContain('未发现已覆盖规则的问题');
});
test('shared result UI presents category, requirement, actual evidence and correct node callback',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let located='';
 try{
  await act(async()=>root.render(<QualityReportCard report={{passed:false,findings:[required,warning,contrastUnknown,advice]}} onLocate={nid=>{located=nid;}}/>));
  for(const text of ['1 项阻断','1 项警告','1 项未验证','1 项设计建议','必需检查','建议类检查','实测值','合同要求','[action01]'])expect(host.textContent).toContain(text);
  act(()=>host.querySelector('button')!.click());expect(located).toBe('action01');
 }finally{act(()=>root.unmount());host.remove();}
});

const baseline='<main data-nid="root0001"><button data-nid="action01" class="btn">提交</button></main>';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();const store=useProjectStore.getState();
 store.initNewProject({name:'检查等级矩阵',deviceProfile:'pc',createSpecimen:false});store.addScreen({name:'页面',htmlContent:baseline,position:{x:0,y:0}},'target');
});
afterEach(async()=>{
 const store=useProjectStore.getState();store.discardStagedChange();await loadStagedCandidate(store.id);
 useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);
});
for(const mode of ['adoptStagedChange','forceAdoptStagedChange','keepBothScreens'] as const){
 for(const row of [
  {name:'required failed',finding:required,allowed:false},
  {name:'required unverified',finding:unknown,allowed:false},
  {name:'advisory unverified',finding:contrastUnknown,allowed:true},
  {name:'advisory warning',finding:warning,allowed:true},
  {name:'design advice',finding:advice,allowed:true},
  {name:'invalid downgrade',finding:{...required,severity:'warning'} as QualityFinding,allowed:false},
  {name:'invalid legacy downgrade',finding:{...required,assessment:undefined,severity:'warning'} as QualityFinding,allowed:false},
 ])test(`${mode}: ${row.name} uses actual shared gates and persists compatible diagnostics`,async()=>{
  const store=useProjectStore.getState();const html=baseline.replace('class="btn"','class="btn btn-primary"');
  const contract=buildDesignTaskContract({intent:'modify_screen',request:'调整主按钮样式',target:{id:'target',name:'页面',htmlContent:baseline},deviceProfile:'pc',frameWidth:1440});
  store.stageScreenChange('target',html,'候选',contract.request,contract);
  const findings=row.allowed?[row.finding]:[row.finding,advice];
  await stageResourceReport({status:'complete',inspected:2,findings});
  const saved=await loadStagedCandidate(store.id);expect(saved).not.toBeNull();
  if(!row.name.startsWith('invalid'))expect(saved!.validationEvidence?.render?.findings).toEqual(findings);
  expect(await store[mode]()).toBe(row.allowed);
  if(row.allowed){
   const repository=new DeliveryRepository(createProjectStorage(store.id,store.folderPath),store.id);
   const resultId=mode==='keepBothScreens'?Object.keys(useProjectStore.getState().screens).find(id=>id!=='target')!:'target';
   const records=await repository.listForScreen(resultId);expect(records.invalidFiles).toBe(0);expect(records.records).toHaveLength(1);
   expect(records.records[0].candidate.validationEvidence?.render?.findings).toEqual([row.finding]);
  }
  if(!row.allowed){expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);expect(useProjectStore.getState().stagedScreen).not.toBeNull();}
 });
 for(const status of ['pending','incomplete','unavailable'] as const)test(`${mode}: ${status} is not unlocked by advisory information`,async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('target',baseline,'候选');
  await stageResourceReport({status,inspected:0,findings:[advice],reason:'环境未就绪'});
  expect(await store[mode]()).toBe(false);
 });
}
