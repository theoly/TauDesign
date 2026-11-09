import {expect,test} from 'bun:test';
import {compileMultiPageTree,materializeTreeSlot,verifyTreeInheritance,generateMultiPageTree} from '../src/services/ai/multiPageTree';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {readDesignTask} from '../src/services/storage/designTaskRepository';
import {neutralModernTheme} from '../src/utils/themePresets';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
import {endpointIdentity} from '../src/services/ai/modelCapabilities';
const provider={id:'p',name:'p',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'not-a-real-key',isEnabled:true,models:[]};
const plan=()=>({version:1 as const,rootRequirements:'项目公共标题',groups:[{id:'branch-form',parentId:'root',requirements:'表单共用说明'},{id:'branch-inner',parentId:'branch-form',requirements:'内层共同说明'}],leaves:[{pageId:'a',parentId:'branch-inner'},{pageId:'b',parentId:'branch-inner'}]});
test('complete nested planning rejects omitted, duplicated, disconnected and cyclic branches',()=>{
 const valid=compileMultiPageTree(plan(),'design-tree',['a','b']);expect(valid.tree.root.children[0].children[0].pageIds).toEqual(['a','b']);
 for(const corrupt of [()=>({...plan(),leaves:[plan().leaves[0],plan().leaves[0]]}),()=>({...plan(),groups:[...plan().groups,{id:'branch-lost',parentId:'branch-lost',requirements:'x'}]}),()=>({...plan(),groups:plan().groups.map(g=>({...g,parentId:g.id==='branch-form'?'branch-inner':'branch-form'}))})])expect(()=>compileMultiPageTree(corrupt(),'design-tree',['a','b'])).toThrow();
});
test('DOM materialization keeps shared siblings and final repair cannot mutate them',()=>{
 const parent='<main class="col"><header>共享文案</header><div data-generation-slot="content-root"></div><footer>共享底栏</footer></main>';
 const page=materializeTreeSlot(parent,'content-root','<main><p>私有正文</p></main>',true);expect(page).toContain('共享底栏');expect(page).toContain('data-generation-region');expect(()=>verifyTreeInheritance(parent,'content-root',page)).not.toThrow();
 const styled=materializeTreeSlot(parent,'content-root','<main class="container-max col gap-4 p-4" data-nid="private-root"><p>保留布局</p></main>',true),doc=new DOMParser().parseFromString(styled,'text/html');
 expect(doc.querySelector('[data-nid="private-root"]')?.getAttribute('class')).toBe('container-max col gap-4 p-4');expect(doc.querySelectorAll('main')).toHaveLength(1);expect(()=>verifyTreeInheritance(parent,'content-root',styled)).not.toThrow();
 expect(()=>verifyTreeInheritance(parent,'content-root',page.replace('共享文案','篡改'))).toThrow('共享祖先');expect(()=>materializeTreeSlot(parent,'content-root','<style>body{}</style>')).toThrow();
});
test('nested production orchestration persists each verified ancestor before leaves, caps concurrency and archives one authoritative tree',async()=>{
 const storage=new LocalStorageStorage('tree-test:'+crypto.randomUUID()),contract=buildDesignTaskContract({intent:'create_screen',request:'创建两页',deviceProfile:'mobile',frameWidth:390});
 const budget=new TaskBudget({maxRequests:20,maxRequestedOutputTokens:69136,maxDurationMs:30000,maxRequestDurationMs:30000});
 let actual=0,peak=0;const order:string[]=[];
 const core:AIEngineCore={async generateObject(){return plan() as any;},streamText(options){const step=options.provenance!.stepId;order.push(step);const slot='content-'+step;const text=`<artifact identifier="shared" type="screen" title="共享"><main class="col"><p>${step}</p><div data-generation-slot="${slot}"></div></main></artifact>`;return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:1,outputTokens:1}),finishReasonPromise:Promise.resolve('stop'),abort(){}};}};
 const configured={...provider,modelCapabilities:{m:{version:1 as const,revision:'r1',endpointIdentity:endpointIdentity(provider),source:'user' as const,maxConcurrency:2 as const}}};
 const result=await generateMultiPageTree({storage,projectId:'project',contextFingerprint:'f',contract,core,request:{provider:configured,model:'m',messages:[{role:'user',content:'创建两页'}]},pages:[{id:'a',name:'A',requirements:'正文'},{id:'b',name:'B',requirements:'正文'}],designSystem:neutralModernTheme,device:'mobile',concurrency:2,budget,isCurrent:()=>true,async leaf(id,ancestor,slot){
  const saved=await readDesignTask(storage,'project',contract.taskId);expect(saved?.tree?.root.status).toBe('generated');expect(saved?.tree?.root.children[0].children[0].status).toBe('generated');expect(saved?.parts.some(p=>p.stepId==='branch-inner')).toBe(true);
  actual++;peak=Math.max(peak,actual);await new Promise(r=>setTimeout(r,id==='a'?8:1));actual--;return materializeTreeSlot(ancestor.html,slot,`<main><p>${id}</p></main>`,true);
 }});
 expect(order).toEqual(['root','branch-form','branch-inner']);expect(peak).toBe(2);expect(result.leaves.size).toBe(2);
 const before=await readDesignTask(storage,'project',contract.taskId);expect(before?.task.state).toBe('draft');expect(before?.tree?.root.children[0].children[0].children.every(n=>n.status==='generated')).toBe(true);
 for(const leaf of result.leaves.values())expect(contentFingerprint(leaf)).toBeTruthy();await result.markDelivered();expect((await readDesignTask(storage,'project',contract.taskId))?.task.state).toBe('completed');
});
for(const reason of ['unknown','length','content_filter'])test(`a closed shared artifact with ${reason} cannot dispatch any descendant`,async()=>{
 const storage=new LocalStorageStorage('tree-negative:'+crypto.randomUUID()),contract=buildDesignTaskContract({intent:'create_screen',request:'创建两页',deviceProfile:'mobile',frameWidth:390});
 const budget=new TaskBudget({maxRequests:12,maxRequestedOutputTokens:69136,maxDurationMs:10000,maxRequestDurationMs:10000});let leaves=0;
 const core:AIEngineCore={async generateObject(){return {...plan(),groups:[],leaves:[{pageId:'a',parentId:'root'},{pageId:'b',parentId:'root'}]} as any;},streamText(){const text='<artifact><main><div data-generation-slot="content-root"></div></main></artifact>';return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve(reason),abort(){}};}};
 await expect(generateMultiPageTree({storage,projectId:'project',contextFingerprint:'f',contract,core,request:{provider,model:'m',messages:[{role:'user',content:'两页'}]},pages:[{id:'a',name:'A',requirements:'正文'},{id:'b',name:'B',requirements:'正文'}],designSystem:neutralModernTheme,device:'mobile',concurrency:1,budget,isCurrent:()=>true,async leaf(){leaves++;return '<main>不应生成</main>';}})).rejects.toThrow();
 expect(leaves).toBe(0);expect((await readDesignTask(storage,'project',contract.taskId))?.task.state).toBe('blocked');budget.close();
});
