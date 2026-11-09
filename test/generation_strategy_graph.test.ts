import {test,expect} from 'bun:test';
import {choosePageWriteStrategy,SECTIONED_HTML_BYTES,allocateOutputSteps} from '../src/services/ai/generationStrategy';
import {executeGenerationTree,validateGenerationTree,type GenerationNode,type GenerationTree} from '../src/services/ai/generationGraph';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
test('TRAE routes resolve 4–6/7+, exact byte limit, state base and derived priority',()=>{
 const route=(n:number,bytes=100)=>choosePageWriteStrategy({majorSections:n,estimatedHtmlBytes:bytes});
 expect(route(3).mode).toBe('SkeletonMainAtomic');for(const n of [4,6])expect(route(n).mode).toBe('SectionPlanThenWrite');expect(route(7).mode).toBe('SectionedPatch');
 expect(route(3,SECTIONED_HTML_BYTES).mode).toBe('SkeletonMainAtomic');expect(route(3,SECTIONED_HTML_BYTES+1).mode).toBe('SectionedPatch');
 expect(choosePageWriteStrategy({majorSections:2,estimatedHtmlBytes:1,stateBase:true}).mode).toBe('SectionedPatch');
 expect(choosePageWriteStrategy({majorSections:12,estimatedHtmlBytes:100000,derived:true,mutableRegions:['a']}).mode).toBe('DerivedCopyMutableOnly');
 expect(()=>choosePageWriteStrategy({majorSections:7,estimatedHtmlBytes:1,requested:'atomic'})).toThrow();expect(()=>choosePageWriteStrategy({estimatedHtmlBytes:1,derived:true})).toThrow();
});
test('budget plan reserves later regions, includes required calls and rejects infeasible work before dispatch',()=>{
 const steps=[{id:'one',minTokens:1000,targetTokens:3000,maxTokens:4000,minRequests:1,weight:3},{id:'two',minTokens:2000,targetTokens:4000,maxTokens:5000,minRequests:1,weight:1}];
 const allocated=allocateOutputSteps(steps,8000,2,1800);expect(allocated.reduce((n,s)=>n+s.tokens,0)).toBe(6200);expect(allocated[1].tokens).toBeGreaterThanOrEqual(2000);
 expect(()=>allocateOutputSteps(steps,4000,2,1800)).toThrow('父预算不足');expect(()=>allocateOutputSteps(steps,8000,1)).toThrow('父预算不足');
});
const node=(id:string,kind:GenerationNode['kind'],children:GenerationNode[]=[]):GenerationNode=>({id,kind,children,pageIds:kind==='page-leaf'?[id]:children.flatMap(child=>child.pageIds),output:`artifacts/${id}.html`,sharedRegions:[],privateRegions:[],mutableSlots:[],status:'planned'});
const tree=():GenerationTree=>({version:1,taskId:'design-graph-test',root:node('root','project-shell',[node('branch','shared-branch',[node('a','page-leaf'),node('b','page-leaf')]),node('c','page-leaf')])});
const budget=()=>new TaskBudget({maxRequests:20,maxRequestedOutputTokens:20000,maxDurationMs:10000,maxRequestDurationMs:10000});
test('tree dependencies persist before child dispatch and global sibling concurrency never exceeds two',async()=>{
 const saved=new Set<string>();let active=0,peak=0;const order:string[]=[];
 const result=await executeGenerationTree(tree(),{budget:budget(),concurrency:2,isCurrent:()=>true,
  async generate(n,ancestors){active++;peak=Math.max(peak,active);if(n.id!=='root')expect(saved.has('root')).toBe(true);if(['a','b'].includes(n.id)){expect(saved.has('branch')).toBe(true);expect(ancestors).toHaveLength(2);}await new Promise(r=>setTimeout(r,2));active--;const html=`<main>${n.id}</main>`;order.push(n.id);return {html,fingerprint:contentFingerprint(html)};},
  async verify(_n,v){expect(v.fingerprint).toBe(contentFingerprint(v.html));},async persist(_t,n,v){if(v)saved.add(n.id);}});
 expect(peak).toBeLessThanOrEqual(2);expect(result.outputs.size).toBe(5);expect(order.indexOf('branch')).toBeLessThan(order.indexOf('a'));
});
test('missing/duplicate/cyclic trees and disk-generated statuses cannot be used as authorization',async()=>{
 const duplicate=tree();duplicate.root.children[1].id='branch';expect(()=>validateGenerationTree(duplicate)).toThrow();
 const cyclic=tree();cyclic.root.children.push(cyclic.root);expect(()=>validateGenerationTree(cyclic)).toThrow();
 const disk=tree();disk.root.status='generated';await expect(executeGenerationTree(disk,{budget:budget(),concurrency:1,isCurrent:()=>true,generate:async()=>{throw Error('must not run');},verify:async()=>{},persist:async()=>{}})).rejects.toThrow('恢复任务');
});
test('failed parent does not dispatch descendants or publish a generated tree',async()=>{
 const calls:string[]=[],records:GenerationTree[]=[];
 await expect(executeGenerationTree(tree(),{budget:budget(),concurrency:2,isCurrent:()=>true,generate:async n=>{calls.push(n.id);throw Error('provider failure');},verify:async()=>{},persist:async t=>{records.push(t);}})).rejects.toThrow('provider failure');
 expect(calls).toEqual(['root']);expect(records.at(-1)?.root.status).toBe('blocked');
});
test('concurrent sibling manifests never expose unpersisted output or lose earlier committed statuses',async()=>{
 const t:GenerationTree={version:1,taskId:'design-persistence-race',root:node('root','project-shell',[node('a','page-leaf'),node('b','page-leaf')])};
 const disk=new Set<string>(),records:GenerationTree[]=[];let writes=0,peak=0;
 await executeGenerationTree(t,{budget:budget(),concurrency:2,isCurrent:()=>true,async generate(n){return {html:`<main>${n.id}</main>`,fingerprint:n.id};},async verify(){},async persist(snapshot,n,output){
  if(!output)return;writes++;peak=Math.max(peak,writes);await new Promise(r=>setTimeout(r,n.id==='a'?8:1));
  const visit=(node:GenerationNode)=>{if(node.status==='generated'&&node.id!==n.id)expect(disk.has(node.id)).toBe(true);node.children.forEach(visit);};visit(snapshot.root);
  disk.add(n.id);records.push(snapshot);writes--;
 }});
 expect(peak).toBe(1);expect(records.at(-1)?.root.children.every(child=>child.status==='generated')).toBe(true);
});
test('tree page ownership must match every branch and the externally confirmed page set',()=>{
 const t=tree();expect(()=>validateGenerationTree(t,['a','b','c'])).not.toThrow();expect(()=>validateGenerationTree(t,['a','b','c','missing'])).toThrow('全部');
 const mismatch=tree();mismatch.root.children[0].pageIds=['a'];expect(()=>validateGenerationTree(mismatch)).toThrow('集合');
 const duplicate=tree();duplicate.root.children[1].pageIds=['a'];expect(()=>validateGenerationTree(duplicate)).toThrow('重复');
});

test('explicit recovery rechecks and republishes each reused parent before dispatching descendants on the new tree',async()=>{
 const saved=new Set<string>(),verified:string[]=[],generated:string[]=[],restored:string[]=[],ledger=budget();
 try{const output=await executeGenerationTree(tree(),{budget:ledger,concurrency:2,isCurrent:()=>true,
  async recover(n,ancestors){if(n.id==='root'||n.id==='branch'||n.id==='a'){if(n.id!=='root')expect(saved.has('root')).toBe(true);if(n.id==='a'){expect(saved.has('branch')).toBe(true);expect(ancestors).toHaveLength(2);}restored.push(n.id);const html=`<main>${n.id}</main>`;return {html,fingerprint:contentFingerprint(html)};}},
  async generate(n){generated.push(n.id);if(n.id==='b')expect(saved.has('branch')).toBe(true);return {html:`<main>${n.id}</main>`,fingerprint:n.id};},
  async verify(n,_output,ancestors){verified.push(n.id);if(n.id==='a')expect(ancestors).toHaveLength(2);},async persist(_snapshot,n,result){if(result){expect(verified).toContain(n.id);saved.add(n.id);}}
 });expect(restored).toEqual(['root','branch','a']);expect(generated.sort()).toEqual(['b','c']);expect(output.outputs.size).toBe(5);expect(ledger.snapshot().requests).toBe(0);
 }finally{ledger.close();}
});
test('an invalid restored ancestor blocks all descendants and cannot fall back to a paid regeneration silently',async()=>{
 let calls=0;const ledger=budget();
 try{await expect(executeGenerationTree(tree(),{budget:ledger,concurrency:2,isCurrent:()=>true,recover:async()=>({html:'<main>tampered</main>',fingerprint:'mismatch'}),generate:async()=>{calls++;throw Error('must not generate');},verify:async()=>{throw Error('artifact identity changed');},persist:async()=>{}})).rejects.toThrow('artifact identity changed');expect(calls).toBe(0);
 }finally{ledger.close();}
});
