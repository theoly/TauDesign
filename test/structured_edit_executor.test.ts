import {expect,test} from 'bun:test';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
import {buildDesignTaskContract,buildRestyleContract} from '../src/services/ai/designWorkflow';
import {neutralModernTheme} from '../src/utils/themePresets';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {useProjectStore} from '../src/stores/useProjectStore';
import {captureModificationSnapshot,isModificationSnapshotCurrent} from '../src/services/ai/modificationReview';
import type {ComponentDefinition,Decision,Screen,Asset} from '../src/types/project';

const source='<main data-nid="root"><section data-nid="region"><h1 data-nid="title" class="text-sm">标题</h1></section><section data-nid="region2"><p data-nid="description">说明</p></section><aside data-nid="other">'+Array.from({length:20},(_,i)=>`<p data-nid="keep${i}">保留${i}</p>`).join('')+'</aside></main>';
const base=():StructuredEditOptions=>({mode:'local',screen:{id:'a',name:'页面',htmlContent:source},request:'仅加粗标题',
  settings:{deviceProfile:'mobile',frameWidth:390,useCustomNavigation:false},designSystem:neutralModernTheme,colorMode:'light',
  contract:buildDesignTaskContract({intent:'modify_screen',request:'仅加粗标题',target:{id:'a',name:'页面',htmlContent:source},
    deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:title']}),
  local:{operations:[{nid:'title',type:'add_classes',value:'font-bold'}],allowedNids:['title']},isCurrent:()=>true});
const binding={provider:defaultProviders[0],model:'test'};
function coreWith(generate:(schema:any,request:any)=>Promise<any>):AIEngineCore{return {generateObject:generate,streamText:()=>{throw new Error('Must not request full HTML');}};}

test('deterministic local execution yields a full copy and actual record without a provider or store writes',async()=>{
  const options=base(),result=await executeStructuredEdit(undefined,options);
  expect(result.status).toBe('ready');if(result.status!=='ready')throw new Error(result.message);
  const doc=new DOMParser().parseFromString(result.html,'text/html');
  expect(doc.querySelector('[data-nid="title"]')?.classList.contains('font-bold')).toBe(true);
  expect(doc.querySelector('[data-nid="other"]')?.outerHTML).toBe(new DOMParser().parseFromString(source,'text/html').querySelector('[data-nid="other"]')?.outerHTML);
  expect(options.screen.htmlContent).toBe(source);expect(result.executionRecord).toMatchObject({source:'local-edit',rawResponse:'',completeHtml:result.html,localEdit:{mode:'local',targetNids:['title'],operationCount:1}});
});
for(const mismatch of ['analysis','baseline','target','device','scope'] as const)test(`rejects ${mismatch} contract before requesting structured operations`,async()=>{
  const options=base();options.binding=binding;options.local!.supplement=true;let requests=0;
  if(mismatch==='analysis')options.contract=buildDesignTaskContract({intent:'modify_screen',reviewRequired:true,request:'优化',deviceProfile:'mobile',frameWidth:390});
  if(mismatch==='baseline')options.contract.target!.baselineFingerprint='stale';
  if(mismatch==='target')options.contract.target!.id='other';
  if(mismatch==='device')options.contract.device.profile='pc';
  if(mismatch==='scope')options.contract.allowedChanges=['element:keep1'];
  const result=await executeStructuredEdit(coreWith(async()=>{requests++;return {requiresPageRewrite:false,operations:[]};}),options);
  expect(result.status).toBe('failed');expect(requests).toBe(0);expect('html'in result).toBe(false);
});
test('element execution stays inside the referenced subtree and never returns an expanded page rewrite',async()=>{
  const options=base();options.mode='element';options.elementNid='region';options.binding=binding;
  options.contract=buildDesignTaskContract({intent:'modify_screen',request:options.request,target:{id:'a',name:'页面',htmlContent:source},elementNid:'region',deviceProfile:'mobile',frameWidth:390});
  const result=await executeStructuredEdit(coreWith(async()=>({requiresPageRewrite:false,operations:[{nid:'title',type:'add_classes',value:'font-bold'}]})),options);
  expect(result.status).toBe('ready');expect(result.executionRecord.localEdit).toMatchObject({mode:'element',targetNids:['title'],operationCount:1});
  const denied=await executeStructuredEdit(coreWith(async()=>({requiresPageRewrite:false,operations:[{nid:'keep1',type:'add_classes',value:'font-bold'}]})),options);
  expect(denied.status).toBe('failed');expect('html'in denied).toBe(false);
});
test('supplement merges confirmed operations while retaining the immutable input snapshot',async()=>{
  const options=base();options.binding=binding;options.local!.supplement=true;
  const result=await executeStructuredEdit(coreWith(async()=>{
    options.local!.operations[0].nid='keep1';options.contract.request='被污染';options.screen.htmlContent='<main>被污染</main>';
    return {requiresPageRewrite:false,operations:[{nid:'title',type:'add_classes',value:'text-xl'}]};
  }),options);
  expect(result.status).toBe('ready');if(result.status!=='ready')throw new Error(result.message);
  expect(result.html).not.toContain('被污染');expect(result.contract.request).toBe('仅加粗标题');expect(result.executionRecord.localEdit?.operationCount).toBe(2);
});
for(const interrupt of ['cancel','stale'] as const)test(`${interrupt} during a non-cooperating structured request prevents partial candidate and next region request`,async()=>{
  const options=base(),controller=new AbortController();options.mode='region';options.regionNids=['region','region2'];
  options.contract.allowedChanges=['element:region','element:region2'];options.binding=binding;options.signal=controller.signal;
  let current=true,requests=0;options.isCurrent=()=>current;
  const result=await executeStructuredEdit(coreWith(async()=>{requests++;if(interrupt==='cancel')controller.abort();else current=false;
    return {nid:'region',html:'<section data-nid="region" class="p-4"><h1 data-nid="title" class="text-sm">标题</h1></section>'};}),options);
  expect(result.status).toBe(interrupt==='cancel'?'cancelled':'stale');expect(requests).toBe(1);expect('html'in result).toBe(false);
});
test('region execution preserves other areas and records the actual replacement count',async()=>{
  const options=base();options.mode='region';options.regionNids=['region'];options.contract.allowedChanges=['element:region'];options.binding=binding;
  const result=await executeStructuredEdit(coreWith(async()=>({nid:'region',html:'<section data-nid="region" class="p-4"><h1 data-nid="title" class="text-sm">标题</h1></section>'})),options);
  expect(result.status).toBe('ready');expect(result.executionRecord.localEdit).toMatchObject({mode:'region',targetNids:['region'],operationCount:1});
});
test('style-only local restyle refuses text operations and retains a truthful failure record',async()=>{
  const options=base();options.allowText=false;options.local!.operations=[{nid:'title',type:'set_text',value:'新标题'}];
  options.contract=buildRestyleContract({scope:'single',target:{id:'a',name:'页面',html:source},deviceProfile:'mobile',frameWidth:390});
  const result=await executeStructuredEdit(undefined,options);
  expect(result.status).toBe('failed');expect(result.executionRecord.errorMessage).toBeTruthy();expect(result.executionRecord.completeHtml).toBeUndefined();
});
test('transport failure and incomplete region output cannot produce a partial candidate',async()=>{
  for(const generate of [async()=>{throw new Error('offline');},async()=>({nid:'region',html:'<section data-nid="region"><h1>残缺'})]){
    const options=base();options.mode='region';options.regionNids=['region'];options.contract.allowedChanges=['element:region'];options.binding=binding;
    const result=await executeStructuredEdit(coreWith(generate),options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);
  }
});
for(const change of ['origin','decision','component','reference','metadata','asset'] as const)test(`${change} changes invalidate the live snapshot and stop later region requests`,async()=>{
  const live={...useProjectStore.getState(),id:'snapshot-fixture',folderPath:undefined,
    screens:{a:{id:'a',name:'页面',htmlContent:source,position:{x:0,y:0}},reference:{id:'reference',name:'参考页面',htmlContent:'<main>原参考</main>',position:{x:450,y:0}}} as Record<string,Screen>,
    designSystem:neutralModernTheme,projectDocuments:{},decisions:{} as Record<string,Decision>,components:{} as Record<string,ComponentDefinition>,
    assets:{} as Record<string,Asset>,overrides:{},designSystemOrigin:{kind:'project' as const,sourceId:'original',updatedAt:1}};
  const snapshot=captureModificationSnapshot(live,'a'),options=base();
  options.mode='region';options.regionNids=['region','region2'];options.contract.allowedChanges=['element:region','element:region2'];options.binding=binding;
  options.isCurrent=()=>isModificationSnapshotCurrent(live,snapshot);let requests=0;
  const result=await executeStructuredEdit(coreWith(async(schema)=>{
    requests++;const nid=schema.properties.nid.enum[0];
    if(change==='origin')live.designSystemOrigin.sourceId='different';
    if(change==='decision')live.decisions.rule={id:'rule',text:'新增全局规则',scope:'global',active:true,source:{kind:'auto_extracted',createdAt:1}};
    if(change==='component')live.components.shared={id:'shared',name:'共享组件',templateHtml:'<section>新模板</section>',createdAt:1,updatedAt:1};
    if(change==='reference')live.screens.reference.htmlContent='<main>已修改参考</main>';
    if(change==='metadata')live.screens.a.metadata={navigationTitle:'新导航标题'};
    if(change==='asset')live.assets.photo={id:'photo',name:'新图片',type:'image',mimeType:'image/png',source:'upload',refCount:1,relPath:'assets/images/new.png'};
    return {nid,html:nid==='region'?'<section data-nid="region" class="p-4"><h1 data-nid="title" class="text-sm">标题</h1></section>':'<section data-nid="region2" class="p-4"><p data-nid="description">说明</p></section>'};
  }),options);
  expect(result.status).toBe('stale');expect(requests).toBe(1);expect('html'in result).toBe(false);
});
test('missing authorized nodes are rejected before spending a supplement model request',async()=>{
  const options=base();options.binding=binding;options.local!.supplement=true;options.local!.allowedNids=['missing'];options.contract.allowedChanges=['element:missing'];let requests=0;
  const result=await executeStructuredEdit(coreWith(async()=>{requests++;return {requiresPageRewrite:false,operations:[]};}),options);
  expect(result.status).toBe('failed');expect(requests).toBe(0);
});
test('a project change accompanying transport failure is still reported as stale',async()=>{
  const options=base();options.binding=binding;options.local!.supplement=true;let current=true;options.isCurrent=()=>current;
  const result=await executeStructuredEdit(coreWith(async()=>{current=false;throw new Error('offline');}),options);
  expect(result.status).toBe('stale');expect('html'in result).toBe(false);
});
test('canvas positioning and measurement alone keep an existing modification snapshot current',()=>{
  const live={...useProjectStore.getState(),screens:{a:{id:'a',name:'页面',htmlContent:source,position:{x:0,y:0},measuredHeight:100}}};
  const snapshot=captureModificationSnapshot(live,'a');live.screens.a.position.x=450;live.screens.a.measuredHeight=900;
  expect(isModificationSnapshotCurrent(live,snapshot)).toBe(true);
});
for(const field of ['htmlContent','scopedCss'] as const)test(`specimen target ${field} stays independently protected even when excluded from project knowledge`,()=>{
  const live={...useProjectStore.getState(),screens:{a:{id:'a',name:'样张',htmlContent:source,scopedCss:'.sample{padding:var(--space-1)}',position:{x:0,y:0},metadata:{kind:'specimen' as const}}}};
  const snapshot=captureModificationSnapshot(live,'a');live.screens.a[field]+=' changed';
  expect(isModificationSnapshotCurrent(live,snapshot)).toBe(false);
});
test('mobile navigation normalization cannot repair an incomplete source into an accepted local edit',async()=>{
  const options=base();options.screen.htmlContent='<div class="status-bar">9:41</div>'+source.slice(0,-7);
  options.contract=buildDesignTaskContract({intent:'modify_screen',request:options.request,target:options.screen,deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:title']});
  const result=await executeStructuredEdit(undefined,options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);
});
test('structured requests cannot bypass a tampered catalog validation plan',async()=>{
  const options=base();options.binding=binding;options.local!.supplement=true;options.contract.validationPlan!.stages=[];let requests=0;
  const result=await executeStructuredEdit(coreWith(async()=>{requests++;return {requiresPageRewrite:false,operations:[]};}),options);
  expect(result.status).toBe('failed');expect(requests).toBe(0);
});

import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {useHistoryStore} from '../src/stores/useHistoryStore';
for(const mode of ['element','local','region'] as const)test(`${mode} rejects a valid but output-limited model object without partial candidate or store writes`,async()=>{
 const input=base();input.mode=mode;input.binding=binding;input.elementNid=mode==='element'?'region':undefined;input.local!.supplement=true;input.regionNids=['region','region2'];
 input.contract=buildDesignTaskContract({intent:'modify_screen',request:input.request,target:input.screen,deviceProfile:'mobile',frameWidth:390,elementNid:input.elementNid,allowedChanges:mode==='region'?['element:region','element:region2']:mode==='local'?['element:title']:undefined});
 const answer=mode==='region'?{nid:'region',html:'<section data-nid="region" class="p-4"><h1 data-nid="title" class="text-sm">标题</h1></section>'}:{requiresPageRewrite:false,reason:'partial',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]};
 const transport=new MockTransport([{events:[{type:'Delta',text:JSON.stringify(answer)},{type:'Done',finish_reason:'length'}],delayMs:1}]);let calls=0;const stream=transport.stream.bind(transport);transport.stream=(...args)=>{calls++;return stream(...args);};
 const before=useProjectStore.getState().screens,past=useHistoryStore.getState().past.length;
 const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
 expect(result.status).toBe('failed');expect(result.executionRecord.errorMessage).toContain('输出上限');expect('html' in result).toBe(false);expect(calls).toBe(1);
 expect(useProjectStore.getState().screens).toBe(before);expect(useHistoryStore.getState().past.length).toBe(past);
});
