import {test,expect} from 'bun:test';
import {businessItems,validateBusinessOwners,businessDuty,readBusinessDuties} from '../src/services/ai/businessInventoryOwnership';
import {buildPageRedesignSource} from '../src/services/ai/pageRedesignSource';
import {compileSectionPlan,generateTaskPage} from '../src/services/ai/pageTaskGeneration';
import {defaultPageComposition} from '../src/services/ai/pageComposition';
import {choosePageWriteStrategy} from '../src/services/ai/generationStrategy';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
const source=buildPageRedesignSource('<main><h1>保留标题</h1><label>邮箱<input data-nid="email" required></label><button data-nid="save">保存</button><img src="https://example.test/media.png" alt="业务图片"></main>',{deviceProfile:'mobile',protectedNids:['save']});
const plan={goal:'资料管理',actor:'用户',completion:['阅读资料'],questions:[],features:Array.from({length:7},(_,i)=>({id:`f${i+1}`,title:`功能${i+1}`,change:'add' as const,basis:'user' as const,sourceIds:['user:request'],information:[{label:`内容${i}`,kind:'display' as const}],interactions:[],states:[]}))};
const composition=defaultPageComposition(plan),ids=composition.regions.map(r=>r.id),owners=ids.map((regionId,i)=>({regionId,itemIds:i?[]:businessItems(source).map(item=>item.id)}));
test('所有原文/控件/媒体/保护项必须唯一归属，存档核对完整内容及来源',()=>{
 expect(new Set(businessItems(source).map(i=>i.kind))).toEqual(new Set(['text','control','media','protected']));
 const valid=validateBusinessOwners(source,ids,owners);expect(valid).toEqual(owners);
 const compiled=compileSectionPlan(plan,'mobile','资料',composition,undefined,{source,owners});
 expect(readBusinessDuties(source,compiled)?.owners).toEqual(owners);
 const corrupt=structuredClone(compiled),data=JSON.parse(corrupt.sections[0].requirements);data.businessInventory.items[0].value.text='被篡改';corrupt.sections[0].requirements=JSON.stringify(data);
 expect(()=>readBusinessDuties(source,corrupt)).toThrow('来源');
 expect(()=>validateBusinessOwners(source,ids,owners.map(row=>({...row,itemIds:[]})))).toThrow('完整');
 expect(()=>validateBusinessOwners(source,ids,[...owners.slice(0,1),{...owners[1],itemIds:owners[0].itemIds},...owners.slice(2)])).toThrow('重复');
});
test('真实编码归属请求占原父预算，缺失项目时不发送区块生成请求',async()=>{
 const transport=new MockTransport();transport.queueResponse(JSON.stringify({owners:owners.map(row=>({...row,itemIds:[]}))}),1);
 const ledger=new TaskBudget({maxRequests:8,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});let requests=0;
 const core=withTaskBudget(new DefaultAIEngineCore({id:'wire',stream(r,e){requests++;return transport.stream(r,e);}}),ledger);
 try{await expect(generateTaskPage(core,{provider:{id:'test',name:'test',protocol:'openai_compatible',baseUrl:'https://invalid.test/v1',apiKey:'',isEnabled:true},model:'test',messages:[{role:'user',content:'保留全部业务'}]},{strategy:choosePageWriteStrategy({plan,estimatedHtmlBytes:100}),plan,composition,businessSource:source,request:'保留全部业务',device:'mobile',title:'页面',contextKey:'source',budget:ledger})).rejects.toThrow('完整');expect(requests).toBe(1);expect(ledger.snapshot().requests).toBe(1);}finally{ledger.close();}
});

test('空业务清单由程序确定归属，不发送空enum的模型请求',async()=>{
 const empty=buildPageRedesignSource('<main></main>',{deviceProfile:'mobile'}),transport=new MockTransport();for(let i=0;i<3;i++)transport.queueResponse(`<artifact><article>区域${i}</article></artifact>`,1);
 const ledger=new TaskBudget({maxRequests:8,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});let requests=0;
 const core=withTaskBudget(new DefaultAIEngineCore({id:'wire',stream(r,e){requests++;return transport.stream(r,e);}}),ledger);
 try{const result=await generateTaskPage(core,{provider:{id:'test',name:'test',protocol:'openai_compatible',baseUrl:'https://invalid.test/v1',apiKey:'',isEnabled:true},model:'test',messages:[{role:'user',content:'补充页面功能'}]},{strategy:choosePageWriteStrategy({plan,estimatedHtmlBytes:100}),plan,composition,businessSource:empty,device:'mobile',title:'页面',contextKey:'empty',budget:ledger});expect(result.errorMessage).toBeUndefined();expect(requests).toBe(3);expect(ledger.snapshot().requests).toBe(3);}finally{ledger.close();}
});
