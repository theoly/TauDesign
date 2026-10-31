import {expect,test} from 'bun:test';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import {inspectWorkflowStructure} from '../src/services/ai/workflowValidation';
import {capturePageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {neutralModernTheme} from '../src/utils/themePresets';
import {makeGuidancePacket} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const source='<main data-nid="page0001"><section data-nid="card0001"><h2 data-nid="title001">会员资料</h2><a data-nid="link0001" href="/legal" aria-label="服务协议">服务协议</a><button data-nid="save0001" type="button" class="btn btn-primary">保存</button></section><aside data-nid="aside001">'+Array.from({length:18},(_,i)=>`<p data-nid="keep${i}">OUTSIDE_PRIVATE_${i}</p>`).join('')+'</aside></main>';
const replacement='<section data-nid="card0001" class="col gap-4"><h2 data-nid="title001">会员资料</h2><label>邮箱<input class="input"/></label><a data-nid="link0001" href="/legal" aria-label="服务协议">服务协议</a><button data-nid="save0001" type="button" class="btn btn-primary">保存</button></section>';
const task={...chatPageTaskPlan,goal:'填写邮箱后保存',features:[{...chatPageTaskPlan.features[0],title:'邮箱',information:[{label:'邮箱',kind:'input' as const}],interactions:[{label:'保存',precondition:'邮箱已填写',outcome:'显示反馈',targetScreenId:''}]}]};
function fixture(image=false){
 const request='在所引用卡片内增加邮箱输入框和保存后的校验反馈';
 const options:StructuredEditOptions={mode:'element',elementNid:'card0001',screen:{id:'page',name:'资料页',htmlContent:source},request,
  contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料页',htmlContent:source},elementNid:'card0001',deviceProfile:'mobile',frameWidth:390}),
  settings:{deviceProfile:'mobile',frameWidth:390},designSystem:neutralModernTheme,colorMode:'light',binding:{provider:{id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'ELEMENT_SECRET'},model:image?'fixture-vision':'fixture'},isCurrent:()=>true};
 if(image){options.attachment={name:'参考.png',dataUrl:'data:image/png;base64,YQ=='};options.imageUrl=options.attachment.dataUrl;}
 const response=image?{...task,features:task.features.map(f=>({...f,basis:'image',sourceIds:[`image:${referenceImageIdentity(options.attachment!).fingerprint}`]}))}:task;
 const transport=new MockTransport(),requests:any[]=[];
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 return {options,core,requests,transport,response};
}
for(const image of [false,true])test(`explicit subtree ${image?'image':'text'} modification plans then returns scoped JSON and a bound historical record`,async()=>{
 const f=fixture(image);f.transport.queueResponse(JSON.stringify(f.response));f.transport.queueResponse(JSON.stringify({nid:'card0001',html:replacement}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.message);
 expect(f.requests).toHaveLength(2);expect(f.requests[0].body.response_format.json_schema.schema.properties.features).toBeDefined();expect(f.requests[1].body.response_format.json_schema.schema.properties.nid.enum).toEqual(['card0001']);
 expect(JSON.stringify(f.requests[0].body.messages)).not.toContain('OUTSIDE_PRIVATE');expect(f.requests[1].body.messages[0].content).toContain('PAGE TASK PLAN');
 expect(result.contract.elementNid).toBe('card0001');expect(result.contract.allowedChanges).toEqual(['element:card0001']);
 expect(result.executionRecord.localEdit).toMatchObject({mode:'element',structural:true,targetNids:['card0001']});expect(result.taskBudget).toMatchObject({requests:2,requestedOutputTokens:7168,closed:true});
 const before=new DOMParser().parseFromString(source,'text/html'),after=new DOMParser().parseFromString(result.html,'text/html');
 expect(before.querySelector('aside')!.isEqualNode(after.querySelector('aside')!)).toBe(true);expect(after.querySelector('a')!.getAttribute('href')).toBe('/legal');expect(after.querySelector('input')).not.toBeNull();
 expect(inspectWorkflowStructure(result.contract,source,result.html,f.options.settings).passed).toBe(true);
 const wrapped=`[引用元素 nid="card0001" 画框="资料页" 标签=<section>]\n元素片段:\n<section>旧片段</section>\n\n${f.options.request}`;
 const history=capturePageTaskHistory(result.contract,wrapped);expect(history).toBeDefined();expect(JSON.stringify(history)).not.toContain('ELEMENT_SECRET');
 expect(capturePageTaskHistory(result.contract,wrapped.replace('nid="card0001"','nid="other"'))).toBeUndefined();
 expect(capturePageTaskHistory(result.contract,wrapped.replace('画框="资料页"','画框="另一页"'))).toBeUndefined();
 if(image){expect(JSON.stringify(history)).not.toContain(f.options.attachment!.dataUrl);expect(result.contract.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(f.options.attachment!).fingerprint);}
});
test('decorative structure adds an icon using one bounded fragment request without business planning',async()=>{
 const f=fixture();f.options.request='在该卡片新增图标';f.options.contract.request=f.options.request;
 f.transport.queueResponse(JSON.stringify({nid:'card0001',html:replacement.replace('<label>邮箱<input class="input"/></label>','<svg class="icon" viewBox="0 0 24 24"><path d="M2 2L20 20"/></svg>')}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');expect(f.requests).toHaveLength(1);expect(result.contract.pageTaskPlan).toBeUndefined();expect(result.taskBudget?.requestedOutputTokens).toBe(4096);expect(result.executionRecord.localEdit?.structural).toBe(true);
});
test('subtree generation cannot hijack existing link, accessible name or button behavior attributes',async()=>{
 for(const html of [replacement.replace('href="/legal"','href="/wrong"'),replacement.replace('aria-label="服务协议"','aria-label="别的操作"'),replacement.replace('type="button"','type="submit"'),replacement.replace('type="button"','type="button" disabled')]){
  const f=fixture();f.transport.queueResponse(JSON.stringify(task));f.transport.queueResponse(JSON.stringify({nid:'card0001',html}));
  const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);expect(result.executionRecord.errorMessage).toContain('语义属性');
 }
});
test('an interactive root cannot gain a nested input or choose an ancestor instead',async()=>{
 const f=fixture();f.options.elementNid='link0001';f.options.contract.elementNid='link0001';f.options.contract.allowedChanges=['element:link0001'];
 f.transport.queueResponse(JSON.stringify(task));f.transport.queueResponse(JSON.stringify({nid:'link0001',html:'<a data-nid="link0001" href="/legal" aria-label="服务协议">服务协议<input class="input"/></a>'}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect(result.executionRecord.errorMessage).toContain('嵌套交互');expect('html'in result).toBe(false);expect(f.requests).toHaveLength(2);
});
test('missing, oversized and protected element roots are rejected before any planning request',async()=>{
 for(const root of ['missing','page0001','card0001']){
  const f=fixture();f.options.elementNid=root;f.options.contract.elementNid=root;f.options.contract.allowedChanges=[`element:${root}`];if(root==='card0001')f.options.protectedNids=['save0001'];
  expect((await executeStructuredEdit(f.core,f.options)).status).toBe('failed');expect(f.requests).toHaveLength(0);
 }
});
test('quoted structural words in a label change retain the finite text operation protocol',async()=>{
 const f=fixture();f.options.request='把按钮文案改成“增加邮箱输入框”';f.options.contract.request=f.options.request;
 f.transport.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'仅修改文案',operations:[{nid:'save0001',type:'set_text',value:'增加邮箱输入框'}]}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');expect(f.requests).toHaveLength(1);expect(f.requests[0].body.response_format.json_schema.schema.properties.operations).toBeDefined();expect(result.executionRecord.localEdit?.structural).toBeUndefined();expect(result.taskBudget?.requestedOutputTokens).toBe(2048);
});
test('critical subtree questions stop before HTML and finite JSON guidance cannot be reused for a fragment protocol',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify({...task,questions:['邮箱是否必填？']}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect(f.requests).toHaveLength(1);expect(result.contract.pageTaskPlan?.plan.questions).toHaveLength(1);
 const mixed=fixture();mixed.options.contract.designGuidance=makeGuidancePacket(mixed.options.contract,selectDesignRules({request:'按钮',operation:'modify',device:'mobile',scope:'element',features:['button'],maxChars:800}),'finite-json');expect((await executeStructuredEdit(mixed.core,mixed.options)).status).toBe('failed');expect(mixed.requests).toHaveLength(0);
});
