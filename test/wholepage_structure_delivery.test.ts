import {expect,test} from 'bun:test';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {buildPageRedesignSource} from '../src/services/ai/pageRedesignSource';
import {inspectWorkflowStructure,resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';

const baseline='<main data-nid="root"><h1 data-nid="title">资料管理</h1><label for="email">邮箱</label><input data-nid="email" id="email" type="email" name="email" required><button data-nid="save" class="btn btn-primary">保存资料</button><img data-nid="photo" src="https://fixture.example.test/member.png" alt="会员照片"></main>';
const reflow='<main data-nid="root"><section data-nid="heading"><h1 data-nid="title">资料管理</h1></section><section data-nid="form"><label for="email">邮箱</label><input data-nid="email" id="email" type="email" name="email" required><img data-nid="photo" src="https://fixture.example.test/member.png" alt="会员照片"></section><footer><button data-nid="save" class="btn btn-primary">保存资料</button></footer></main>';
function fixture(profile:'pc'|'mobile'='pc',html=baseline,useCustomNavigation=false){
 const policy={deviceProfile:profile,useCustomNavigation};
 const contract=buildDesignTaskContract({intent:'modify_screen',request:'保留全部信息，调整页面排版',target:{id:'page',name:'资料页',htmlContent:html},deviceProfile:profile,frameWidth:profile==='pc'?1440:390,protectedNids:['save']});
 const source=buildPageRedesignSource(html,{...policy,protectedNids:contract.protectedNids});
 contract.wholePageRedesign={version:1,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source))};
 return {contract,policy};
}
for(const profile of ['pc','mobile'] as const)test(`${profile}: complete page authorization survives delivery structure revalidation`,()=>{
 const {contract,policy}=fixture(profile);
 expect(inspectWorkflowStructure(contract,baseline,reflow,policy).passed).toBe(true);
 // Preservation notes containing a nid must not become a second element scope.
 contract.request+='；保留 nid="save" 按钮原文';
 expect(inspectWorkflowStructure(contract,baseline,reflow,policy).passed).toBe(true);
 const plan=resolveWorkflowValidation(contract,'candidate');
 expect(plan.ok).toBe(true);
 if(plan.ok)for(const stage of ['source-safety','quality','asset-references','asset-files','render','design-entities','structure'])expect(plan.plan.stages).toContain(stage);
});
for(const mutation of ['source','inventory','baseline','target','element','element-scope','mixed-scope','empty-scope','protection','operation','version','extra-property','device'] as const)test(`whole-page delivery rejects inconsistent ${mutation} authority`,()=>{
 const {contract,policy}=fixture();
 if(mutation==='source')contract.wholePageRedesign!.sourceFingerprint='forged';
 if(mutation==='inventory')contract.wholePageRedesign!.inventoryFingerprint='forged';
 if(mutation==='baseline')contract.target!.baselineFingerprint='forged';
 if(mutation==='target')contract.target!.id='another';
 if(mutation==='element')contract.elementNid='title';
 if(mutation==='element-scope')contract.allowedChanges=['element:title'];
 if(mutation==='mixed-scope')contract.allowedChanges.push('element:title');
 if(mutation==='empty-scope')contract.allowedChanges=[];
 if(mutation==='protection')contract.protectedNids=[];
 if(mutation==='operation')contract.operation='restyle';
 if(mutation==='version')(contract.wholePageRedesign as unknown as {version:number}).version=2;
 if(mutation==='extra-property')Object.assign(contract.wholePageRedesign!,{authorized:true});
 if(mutation==='device')policy.deviceProfile='mobile';
 expect(inspectWorkflowStructure(contract,baseline,reflow,policy).passed).toBe(false);
});
test('changed source and missing or duplicate protected nodes cannot reuse the old inventory',()=>{
 const {contract,policy}=fixture();
 for(const html of [baseline.replace('资料管理','新资料'),baseline.replace('data-nid="save"','data-nid="other"'),baseline.replace('</main>','<button data-nid="save">重复</button></main>')]){
  contract.target!.baselineFingerprint=contentFingerprint(html);
  expect(inspectWorkflowStructure(contract,html,reflow,policy).passed).toBe(false);
 }
});
test('mobile navigation uses the same source policy and raw baseline identity as initial planning',()=>{
 const html='<header class="navbar"><h1>旧导航</h1></header>'+baseline;
 for(const custom of [false,true]){
  const {contract,policy}=fixture('mobile',html,custom);
  expect(inspectWorkflowStructure(contract,html,'<header class="navbar"><h1>旧导航</h1></header>'+reflow,policy).passed).toBe(true);
  expect(inspectWorkflowStructure(contract,html,reflow,{...policy,useCustomNavigation:!custom}).passed).toBe(false);
 }
});
test('ordinary page and local contracts retain their strict structural and outside-scope checks',()=>{
 const {contract,policy}=fixture();delete contract.wholePageRedesign;
 expect(inspectWorkflowStructure(contract,baseline,reflow,policy).passed).toBe(false);
 contract.allowedChanges=['element:title'];contract.elementNid='title';
 expect(inspectWorkflowStructure(contract,baseline,baseline.replace('资料管理','我的资料'),policy).passed).toBe(true);
 expect(inspectWorkflowStructure(contract,baseline,baseline.replace('保存资料','越界改写'),policy).passed).toBe(false);
});
for(const defect of ['business','form','media','protected','inline-media'] as const)test(`layout authorization cannot bypass the ${defect} quality gate`,()=>{
 const {contract,policy}=fixture();
 let html=reflow;
 if(defect==='business')html=html.replace('资料管理','');
 if(defect==='form')html=html.replace(' required','');
 if(defect==='media')html=html.replace('<img data-nid="photo" src="https://fixture.example.test/member.png" alt="会员照片">','');
 if(defect==='protected')html=html.replace('class="btn btn-primary"','class="btn"');
 if(defect==='inline-media')html=html.replace('https://fixture.example.test/member.png','data:image/png;base64,AAAA');
 const report=checkGenerationQuality(html,{deviceProfile:'pc',baselineHtml:baseline,protectedNids:contract.protectedNids,wholePageRedesign:contract.wholePageRedesign,modificationRequest:contract.request});
 expect(report.passed).toBe(false);
 // Structure authorization is not an adoption or quality override.
 if(defect!=='inline-media')expect(inspectWorkflowStructure(contract,baseline,html,policy).passed).toBe(true);
});
