import {afterEach,beforeEach,expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRenderCoverage,validRenderCoverage,renderCoverageDescription} from '../src/services/ai/renderCoverage';
import {isPassedRender,isRenderedQualityReport} from '../src/services/ai/evidenceSchema';
import {RenderedQualityCard} from '../src/components/chat/RenderedQualityCard';
import {RenderCoverageDetails} from '../src/components/chat/RenderCoverageDetails';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {stageResourceReport} from './helpers/renderResourceProof';

const entry={reason:'badge-corner-contact' as const,count:1,nids:['control']};
const clean={status:'complete' as const,inspected:2,findings:[]};
test('legacy render records remain readable; unsupported advisory scope never impersonates a pass',()=>{
 expect(isPassedRender(clean)).toBe(true);expect(isPassedRender({...clean,coverage:[entry]})).toBe(true);
 expect(renderCoverageDescription(entry).outcome).toBe('unverified');
 const html=renderToStaticMarkup(<RenderedQualityCard report={{...clean,coverage:[entry]}}/>);
 expect(html).toContain('部分规则未验证');expect(html).toContain('不代表检查通过');expect(html).toContain('control');expect(html).toContain('墨迹');
 expect(html).not.toContain('未发现已覆盖规则的问题');
});
for(const [name,value] of Object.entries({
 'null':null,'not array':entry,'unknown reason':[{...entry,reason:'skip-required'}],
 'wrong reason type':[{...entry,reason:{toString:null}}],
 'forged pass':[{...entry,outcome:'passed'}],'forged grade':[{...entry,requirement:'required'}],
 'negative count':[{...entry,count:-1}],'zero count':[{...entry,count:0}],
 'fraction count':[{...entry,count:1.5}],'too many':[{...entry,count:10001}],
 'duplicate ids':[{...entry,count:2,nids:['control','control']}],
 'ids exceed count':[{...entry,nids:['a','b']}],
 'empty id':[{...entry,nids:['']}],'wrong ids':[{...entry,nids:'control'}],
 'duplicate reasons':[entry,entry],
}))test(`invalid coverage ${name} rejects the report and remains safe to display`,()=>{
 expect(validRenderCoverage(value)).toBe(false);expect(isRenderedQualityReport({...clean,coverage:value})).toBe(false);expect(isPassedRender({...clean,coverage:value})).toBe(false);
 expect(renderToStaticMarkup(<RenderCoverageDetails coverage={value as any}/>)).toContain('格式不合法');
 const card=renderToStaticMarkup(<RenderedQualityCard report={{...clean,coverage:value as any}}/>);
 expect(card).toContain('检查范围记录不可用');expect(card).not.toContain('未发现已覆盖规则的问题');
});
test('coverage collector counts actual unique elements, deduplicates callbacks and bounds node samples',()=>{
 const collector=createRenderCoverage();
 for(let index=0;index<20;index++){
  const el=document.createElement('button');el.setAttribute('data-nid',`node${index}`);
  collector.note('inactive-control',el);collector.note('inactive-control',el);
 }
 const report=collector.entries();expect(report).toHaveLength(1);expect(report[0].count).toBe(20);expect(report[0].nids).toHaveLength(8);expect(validRenderCoverage(report)).toBe(true);
 report[0].nids.push('outside');expect(collector.entries()[0].nids).toHaveLength(8);
 const description=renderCoverageDescription(entry);(description as any).message='changed';expect(renderCoverageDescription(entry).message).not.toBe('changed');
});

const baseline='<main data-nid="root"><button data-nid="control" class="btn">保存</button></main>';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();const store=useProjectStore.getState();store.initNewProject({name:'适用性记录',deviceProfile:'pc',createSpecimen:false});store.addScreen({name:'页面',htmlContent:baseline,position:{x:0,y:0}},'target');});
afterEach(async()=>{const store=useProjectStore.getState();store.discardStagedChange();await loadStagedCandidate(store.id);useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
for(const mode of ['adoptStagedChange','forceAdoptStagedChange','keepBothScreens'] as const){
 test(`${mode}: advisory scope persists without blocking otherwise valid delivery`,async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('target',baseline,'候选');await stageResourceReport({...clean,coverage:[entry]});
  const saved=await loadStagedCandidate(store.id);expect(saved?.validationEvidence?.render?.coverage).toEqual([entry]);expect(await store[mode]()).toBe(true);
  const resultId=mode==='keepBothScreens'?Object.keys(useProjectStore.getState().screens).find(id=>id!=='target')!:'target';
  const records=await new DeliveryRepository(createProjectStorage(store.id,store.folderPath),store.id).listForScreen(resultId);
  expect(records.invalidFiles).toBe(0);expect(records.records[0].candidate.validationEvidence?.render?.coverage).toEqual([entry]);
 });
 for(const kind of ['required-failure','unavailable','invalid-coverage','explicit-hidden-text'] as const)test(`${mode}: scope explanation cannot waive ${kind}`,async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('target',kind==='explicit-hidden-text'?baseline.replace('<button ','<button disabled '):baseline,'候选',kind==='explicit-hidden-text'?'按钮文案改为“确认提交”':undefined);
  await stageResourceReport({...clean,status:kind==='unavailable'?'unavailable':'complete',coverage:kind==='invalid-coverage'?[{...entry,reason:'skip-required'} as any]:kind==='explicit-hidden-text'?[{reason:'inactive-control',count:1,nids:['control']}]:[entry],
   findings:kind==='required-failure'?[{code:'render_action_invisible_label',severity:'error',message:'不可见操作',actual:'无',expected:'可见'}]:[]});
  if(kind==='explicit-hidden-text')expect((await loadStagedCandidate(store.id))?.validationEvidence?.quality.findings.some(f=>f.code==='required_action_text_missing')).toBe(true);
  expect(await store[mode]()).toBe(false);expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
 });
}
