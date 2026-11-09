import {expect,test} from 'bun:test';
import {buildPageRedesignSource,inspectRedesignContent,mergeRedesignBody,explicitlyRequestsPageRedesign} from '../src/services/ai/pageRedesignSource';
import {PipelineExecutor,type ExecutePipelineOptions} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {neutralModernTheme} from '../src/utils/themePresets';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {validContextManifest} from '../src/services/ai/engine/context/contextManifest';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {createChatTaskBudget} from '../src/services/ai/taskBudgetPolicy';
import {capturePageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {resolveGenerationTarget,classifyCommand} from '../src/services/ai/generationTargetResolver';
const provider={id:'redesign',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://api.openai.com/v1',apiKey:'unit-only',enabled:true};
const originalFeature=(i:number)=>`<section data-nid="feature${i}"><h2>功能${i}</h2><p>业务信息${i}</p></section>`;
const photo='<img data-nid="photo" src="https://fixture.example.test/member.png" alt="会员照片">';
const controls='<label for="email">邮箱</label><input data-nid="email" id="email" type="email" name="email" required><button data-nid="save" class="btn btn-primary">保存资料</button>'+photo;
const plan={goal:'保留全部业务信息并重设计资料页',actor:'用户',completion:['阅读资料并保存'],questions:[],features:Array.from({length:7},(_,i)=>({id:`f${i+1}`,title:`功能${i+1}`,change:'retain',basis:'user',sourceIds:['user:request'],information:[{label:`业务信息${i+1}`,kind:'display'}],interactions:[],states:[]}))};
const composition={version:1,layout:'flow',footer:'flow',regions:[{id:'section-1',role:'flow',featureIds:['f1','f2','f3']},{id:'section-2',role:'flow',featureIds:['f4','f5']},{id:'section-3',role:'flow',featureIds:['f6','f7']}]};
const pieces=['<section><h1>资料管理</h1>'+[1,2,3].map(originalFeature).join('')+'</section>','<section>'+[4,5].map(originalFeature).join('')+'</section>','<section>'+[6,7].map(originalFeature).join('')+controls+'</section>'];
const artifact=(html:string)=>`<artifact type="screen" title="资料管理">${html}</artifact>`;
test('explicit whole-page redesign routes to the existing target before the generic design/create matcher',()=>{
 const screens={old:{id:'old',name:'资料页',htmlContent:'<main>资料</main>'},other:{id:'other',name:'其它页',htmlContent:'<main>其它</main>'}};
 for(const rawPrompt of ['重新设计整页','重新设计资料页面','redesign the whole page']){
  expect(classifyCommand(rawPrompt).kind).toBe('explicit_modify');
  expect(resolveGenerationTarget({rawPrompt,screens,activeScreenId:'old'}).targetScreenId).toBe('old');
  expect(resolveGenerationTarget({rawPrompt,screens,referenceToggleScreenId:'other',activeScreenId:'old'}).targetScreenId).toBe('other');
  expect(resolveGenerationTarget({rawPrompt,screens}).action).toBe(rawPrompt.includes('资料页')?'modify_screen':'needs_reference');
 }
 expect(resolveGenerationTarget({rawPrompt:'新建页面，以当前页为参考重新设计',screens,activeScreenId:'old'}).action).toBe('create_screen');
 expect(classifyCommand('不要重新设计页面，只修改按钮颜色').kind).not.toBe('explicit_modify');
});
function fixture(size=50000){
 const html=`<!doctype html><html lang="zh-CN"><head><meta name="source-identity" content="keep"><style>.original {border-radius:14px}</style><title>原页面</title></head><body class="original" data-source="baseline"><main data-nid="root"><h1>资料管理</h1><div class="${'legacy-layout-'.repeat(Math.ceil(size/14))}"></div>${Array.from({length:7},(_,i)=>originalFeature(i+1)).join('')}${controls}</main></body></html>`;
 const transport=new MockTransport(),calls:unknown[]=[];const core=new DefaultAIEngineCore({id:'capture-redesign',stream(request,event){calls.push(request);return transport.stream(request,event);}});
 const options:ExecutePipelineOptions={input:{rawPrompt:'保留全部业务信息，重新设计整页',activeScreenId:'source',decision:{intent:'modify_screen',targetScreenId:'source',reason:'用户明确要求整页重设计'}},provider,model:'test',engineCore:core,screens:{source:{id:'source',name:'资料页',htmlContent:html,scopedCss:'.source-field{padding:17px}'}},overrides:{'source:save':{nid:'save',declarations:{height:'44px'}}},protectedNids:['save'],deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'本地合成测试',wholePageRedesign:true,writeStrategy:'auto'};
 return {html,transport,calls,options};
}
function queue(f:ReturnType<typeof fixture>,body=pieces){f.transport.queueResponse(JSON.stringify(plan),1);f.transport.queueResponse(JSON.stringify(composition),1);body.forEach(piece=>f.transport.queueResponse(artifact(piece),1));}

for(const size of [30000,50000,100000])test(`${size}-character layout redesign uses full business inventory, three planned patches and baseline-owned head`,async()=>{
 const f=fixture(size);queue(f);const result=await PipelineExecutor.execute(f.options);if(result.status!=='staged_side_by_side')throw Error(`调用${f.calls.length}次：${result.errorMessage}`);expect(result.status).toBe('staged_side_by_side');
 expect(f.calls).toHaveLength(5);expect(result.taskBudget?.requests).toBe(5);expect(result.workflowContract?.pageWriteStrategy?.mode).toBe('SectionedPatch');expect(result.workflowContract?.wholePageRedesign?.sourceFingerprint).toBe(contentFingerprint(f.html));expect(result.sectionedCheckpoint).toBeUndefined();
 const sent=JSON.stringify(f.calls);expect(sent).not.toContain('legacy-layout-legacy-layout');expect(sent).toContain('complete-business-inventory');expect(sent).toContain('source-field');expect(sent).toContain('44px');
 const before=new DOMParser().parseFromString(f.html,'text/html'),after=new DOMParser().parseFromString(result.extractedHtml!,'text/html');expect(before.head.isEqualNode(after.head)).toBe(true);expect(after.body.getAttribute('data-source')).toBe('baseline');expect(after.body.className).toBe('original');for(let i=1;i<=7;i++)expect(after.body.textContent).toContain(`业务信息${i}`);expect(after.querySelector('[data-nid="save"]')?.outerHTML).toBe(before.querySelector('[data-nid="save"]')?.outerHTML);expect(f.options.screens.source.htmlContent).toBe(f.html);
 expect(validContextManifest(result.workflowContract?.contextManifest)).toBe(true);const records=result.workflowContract!.contextManifest!.sources;expect(records.find(row=>row.id==='source')?.status).toBe('summary');expect(records.find(row=>row.id==='source:business')).toMatchObject({required:true,status:'full'});expect(capturePageTaskHistory(result.workflowContract,f.options.input.rawPrompt)).toBeDefined();
});

for(const missing of ['text','media','protected','form'] as const)test(`complete-looking redesign missing ${missing} is rejected before candidate application`,async()=>{
 const f=fixture(),body=[...pieces];if(missing==='text')body[1]=body[1].replace('业务信息4','');if(missing==='media')body[2]=body[2].replace(photo,'');if(missing==='protected')body[2]=body[2].replace('btn btn-primary','btn');if(missing==='form')body[2]=body[2].replace(' required','');queue(f,body);
 const result=await PipelineExecutor.execute(f.options);expect(result.status).toBe('rejected_by_quality');expect(result.stagedScreen).toBeUndefined();expect(result.qualityReport?.passed).toBe(false);expect(f.options.screens.source.htmlContent).toBe(f.html);
});

test('oversized atomic request or an element reference cannot silently become a whole-page rewrite',async()=>{
 const f=fixture();f.options.writeStrategy='atomic';expect((await PipelineExecutor.execute(f.options)).status).toBe('error');expect(f.calls).toHaveLength(0);
 const local=fixture();local.options.input.decision!.elementNid='save';expect((await PipelineExecutor.execute(local.options)).status).toBe('error');expect(local.calls).toHaveLength(0);
});

test('business text is never truncated to fit a model window; capacity rejection sends zero HTTP',async()=>{
 const f=fixture();f.options.screens.source.htmlContent=f.html.replace('资料管理</h1>','资料管理</h1><p>'+'全部必要业务'.repeat(20000)+'</p>');
 const result=await PipelineExecutor.execute(f.options);expect(result.status).toBe('error');expect(f.calls).toHaveLength(0);expect(result.errorMessage).toMatch(/容量|Token|上下文|capaci/i);
});

test('source extraction includes template business text, form attributes and full source styles without changing the input',()=>{
 const html='<style>.x{padding:19px}</style><main data-nid="root"><p>完整说明</p><template><label>校验失败</label><input name="code" pattern="[0-9]{4}" required></template><button data-nid="save" class="btn">保存</button></main>',source=buildPageRedesignSource(html,{deviceProfile:'mobile',protectedNids:['save']});
 expect(source.texts.map(row=>row.text)).toContain('校验失败');expect(source.controls.some(row=>row.attributes.pattern==='[0-9]{4}')).toBe(true);expect(source.sourceStyles.stylesheets).toContain('.x{padding:19px}');expect(source.protectedNodes[0].attributes.class).toBe('btn');expect(source.sourceFingerprint).toBe(contentFingerprint(html));
 const copy=mergeRedesignBody('<html lang="zh"><head><style>body{background:white}</style></head><body class="old">原文</body></html>','<main>新布局</main>');expect(copy).toContain('class="old"');expect(copy).toContain('body{background:white}');expect(()=>mergeRedesignBody(copy,'<style>body{color:red}</style><main>越权</main>')).toThrow('head');
 const basic=buildPageRedesignSource('<main><p>旧文案</p><button>保存</button></main>',{deviceProfile:'pc'});expect(inspectRedesignContent(basic,'<main><p>新文案</p><button>保存</button></main>','将旧文案改为新文案')).toEqual([]);expect(inspectRedesignContent(basic,'<main><button>保存</button></main>','调整布局').some(f=>f.code==='redesign_content_missing')).toBe(true);
 expect(explicitlyRequestsPageRedesign('不要重新设计页面，只改按钮')).toBe(false);expect(explicitlyRequestsPageRedesign('重新设计资料页面')).toBe(true);
});

test('changed inventory identity cannot be adopted as a different old-page authorization',()=>{
 const f=fixture(),source=buildPageRedesignSource(f.html,{deviceProfile:'mobile',protectedNids:['save']}),meta={version:1 as const,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source))};
 const report=checkGenerationQuality(pieces.join(''),{deviceProfile:'mobile',baselineHtml:f.html,protectedNids:['save'],wholePageRedesign:{...meta,inventoryFingerprint:'forged'}});expect(report.passed).toBe(false);expect(report.findings.some(row=>row.code==='redesign_source_invalid')).toBe(true);
});

test('explicit optionality, preset edits and field removal remain possible; styling never authorizes dropping controls',()=>{
 const baseline='<main><label for="email">邮箱</label><input data-nid="email" id="email" type="email" name="email" required value="old@example.test"><button>保存</button></main>',source=buildPageRedesignSource(baseline,{deviceProfile:'pc'});
 expect(inspectRedesignContent(source,baseline.replace(' required',''),'将邮箱改为选填',baseline)).toEqual([]);
 expect(inspectRedesignContent(source,baseline.replace('old@example.test','new@example.test'),'设置邮箱默认值为new@example.test',baseline)).toEqual([]);
 expect(inspectRedesignContent(source,'<main><button>保存</button></main>','删除邮箱输入框',baseline)).toEqual([]);
 expect(inspectRedesignContent(source,'<main><button>保存</button></main>','去掉邮箱边框',baseline).some(row=>row.code==='redesign_control_missing')).toBe(true);
 expect(inspectRedesignContent(source,baseline.replace('required','required="required"'),'重新设计布局',baseline)).toEqual([]);
 const choices='<main><label><input data-nid="a" type="radio" name="choice" value="a">甲</label><label><input data-nid="b" type="radio" name="choice" value="b">乙</label><select name="status"><option>请选择</option><option>完成</option></select></main>';
 expect(inspectRedesignContent(buildPageRedesignSource(choices,{deviceProfile:'pc'}),choices,'重新设计布局',choices)).toEqual([]);
 const hidden='<style>.keep{padding:19px}</style><main>原说明<template><style>.error{color:red}</style><label><input name="code" required>校验反馈</label></template></main>',merged=mergeRedesignBody(hidden,'<main>原说明</main>');
 expect(merged).toContain('.keep{padding:19px}');expect(merged).toContain('.error{color:red}');expect(inspectRedesignContent(buildPageRedesignSource(hidden,{deviceProfile:'pc'}),merged,'重新设计布局',hidden)).toEqual([]);
});

test('node ids mentioned as preservation notes do not turn confirmed whole-page scope back into an element edit',async()=>{
 const f=fixture();f.options.input.rawPrompt+='，保留 nid="save" 的按钮样式';queue(f);const result=await PipelineExecutor.execute(f.options);expect(result.status).toBe('staged_side_by_side');
});

test('a failed region preserves only completed work and continues within the same original ledger',async()=>{
 const f=fixture(),budget=createChatTaskBudget(true);f.options.taskBudget=budget;f.options.pageTaskPlanning={};f.transport.queueResponse(JSON.stringify(plan),1);f.transport.queueResponse(JSON.stringify(composition),1);f.transport.queueResponse(artifact(pieces[0]),1);
 f.transport.enqueueScenario({events:[{type:'Error',kind:'network_error',message:'temporary'}],delayMs:1});
 const failed=await PipelineExecutor.execute(f.options);expect(failed.status).toBe('error');expect(failed.sectionedCheckpoint?.completed).toHaveLength(1);expect(failed.workflowContract?.contextManifest).toBeDefined();expect(budget.snapshot().requests).toBe(4);
 f.transport.queueResponse(artifact(pieces[1]),1);f.transport.queueResponse(artifact(pieces[2]),1);
 const continued=await PipelineExecutor.execute({...f.options,writeStrategy:undefined,sectioned:{resume:failed.sectionedCheckpoint},resumeContract:failed.workflowContract,pageTaskPlanning:{snapshot:failed.workflowContract!.pageTaskPlan}});budget.close();expect(continued.status).toBe('staged_side_by_side');if(continued.status!=='staged_side_by_side')throw Error(continued.errorMessage);expect(budget.snapshot().requests).toBe(6);expect(f.calls).toHaveLength(6);expect(continued.extractedHtml).toContain('source-identity');expect(continued.extractedHtml).toContain('业务信息7');
});
