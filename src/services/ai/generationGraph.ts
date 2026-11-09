import {TaskBudget} from './taskBudget';
export interface GenerationNode {
 id:string;kind:'project-shell'|'shared-branch'|'page-leaf';pageIds:string[];output:string;
 sharedRegions:string[];privateRegions:string[];mutableSlots:string[];
 status:'planned'|'generated'|'blocked';children:GenerationNode[];
}
export interface GenerationTree {version:1;taskId:string;root:GenerationNode}
export function validateGenerationTree(tree:GenerationTree,expectedPageIds?:readonly string[]):void{
 if(tree?.version!==1||!/^design-[a-z0-9-]+$/.test(tree.taskId)||tree.root?.kind!=='project-shell')throw Error('生成树缺少合法根任务。');
 const ids=new Set<string>(),outputs=new Set<string>(),seen=new Set<GenerationNode>(),leafPages=new Set<string>();let count=0;
 const visit=(node:GenerationNode,depth:number):string[]=>{
  if(!node||seen.has(node)||depth>8||++count>64)throw Error('生成树循环、过深或节点过多。');seen.add(node);
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(node.id)||ids.has(node.id)||!/^artifacts\/[a-z0-9-]+\.html$/.test(node.output)||outputs.has(node.output)||!['project-shell','shared-branch','page-leaf'].includes(node.kind)||!['planned','generated','blocked'].includes(node.status)||!Array.isArray(node.children))throw Error('生成节点身份/产物重复或越界。');
  for(const values of [node.pageIds,node.sharedRegions,node.privateRegions,node.mutableSlots])if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!v||v.length>200)||new Set(values).size!==values.length)throw Error('生成节点页面/区域合同无效。');
  if(node.kind==='page-leaf'&&(!node.pageIds.length||node.children.length))throw Error('页面叶子不能再派发子任务。');
  if(node.kind!=='page-leaf'&&!node.children.length)throw Error('共享分支必须包含完整子任务。');
  if(depth>0&&node.kind==='project-shell')throw Error('生成树只能有一个项目根。');
  ids.add(node.id);outputs.add(node.output);
  if(node.kind==='page-leaf'){for(const id of node.pageIds){if(leafPages.has(id))throw Error('同一页面不能由多个叶子重复生成。');leafPages.add(id);}return [...node.pageIds];}
  const pages=node.children.flatMap(child=>visit(child,depth+1));
  if(pages.length!==node.pageIds.length||pages.some(id=>!node.pageIds.includes(id)))throw Error('共享分支页面集合与叶子任务不一致。');
  return pages;
 };
 visit(tree.root,0);
 if(![...seen].some(node=>node.kind==='page-leaf'))throw Error('生成树未包含完整页面叶子，不能派发。');
 if(expectedPageIds&&(expectedPageIds.length!==leafPages.size||new Set(expectedPageIds).size!==expectedPageIds.length||expectedPageIds.some(id=>!leafPages.has(id))))throw Error('生成树未覆盖全部已确认页面。');
}
export interface GeneratedFragment {html:string;fingerprint:string}
/** Dependency scheduling is code-owned. A generated status in a file alone grants no execution authority. */
export async function executeGenerationTree(tree:GenerationTree,options:{budget:TaskBudget;concurrency:1|2;signal?:AbortSignal;isCurrent:()=>boolean;
 generate:(node:Readonly<GenerationNode>,ancestors:ReadonlyArray<GeneratedFragment>)=>Promise<GeneratedFragment>;
 /** Supplied by a live, explicitly confirmed recovery; never read a status flag as permission. */
 recover?:(node:Readonly<GenerationNode>,ancestors:ReadonlyArray<GeneratedFragment>)=>Promise<GeneratedFragment|undefined>;
 verify:(node:Readonly<GenerationNode>,output:GeneratedFragment,ancestors:ReadonlyArray<GeneratedFragment>)=>Promise<void>;
 persist:(tree:GenerationTree,node:GenerationNode,output?:GeneratedFragment)=>Promise<void>;
 onProgress?:(tree:GenerationTree)=>void;
}):Promise<{tree:GenerationTree;outputs:Map<string,GeneratedFragment>}>{
 validateGenerationTree(tree);
 if(options.concurrency!==1&&options.concurrency!==2)throw Error('同级并发上限仅允许1或2。');
 const current=structuredClone(tree),outputs=new Map<string,GeneratedFragment>();let persistence:Promise<unknown>=Promise.resolve();
 let active=0;const waiting:Array<()=>void>=[];
 const acquire=()=>new Promise<()=>void>(resolve=>{const release=()=>{const next=waiting.shift();if(next)next();else active--;};const enter=()=>resolve(release);if(active<options.concurrency){active++;enter();}else waiting.push(enter);});
 if(JSON.stringify(current).includes('"status":"generated"'))throw Error('旧生成状态须经显式恢复任务重新核验，不能直接执行。');
 const guard=()=>{options.budget.assertActive();if(options.signal?.aborted)throw Error('生成树任务已取消。');if(!options.isCurrent())throw Error('生成树来源已变化，未提交结果。');};
 const run=async(node:GenerationNode,ancestors:GeneratedFragment[])=>{
  const release=await acquire();let result:GeneratedFragment;
  try{result=await options.budget.run(async()=>{
   guard();const recovered=await options.recover?.(structuredClone(node),ancestors.map(v=>({...v})));guard();
   const result=recovered??await options.generate(structuredClone(node),ancestors.map(v=>({...v})));guard();
   if(!result?.html?.trim()||typeof result.fingerprint!=='string')throw Error('父片段没有完整产物。');
   await options.verify(structuredClone(node),result,ancestors.map(v=>({...v})));guard();
   // Siblings can finish together. Publish only committed statuses, never a sibling's tentative
   // generated flag; serialize snapshots so a slower older manifest cannot erase a later one.
   const save=persistence.catch(()=>{}).then(async()=>{
    guard();const snapshot=structuredClone(current);
    const mark=(candidate:GenerationNode):void=>{if(candidate.id===node.id)candidate.status='generated';else candidate.children.forEach(mark);};mark(snapshot.root);
    try{await options.persist(snapshot,{...structuredClone(node),status:'generated'},result);}catch(error){options.budget.cancel('生成树产物保存失败。');throw error;}
    guard();node.status='generated';outputs.set(node.id,{...result});
   });persistence=save;await save;
   try{options.onProgress?.(structuredClone(current));}catch{/* display callbacks do not grant or revoke authority */}
   return result;
  },options.signal);}catch(error){options.budget.cancel(error instanceof Error?error.message:'生成树节点失败，停止剩余任务。');throw error;}finally{release();}
  // Each bounded batch awaits parents; there is no unbounded recursive Promise.all.
  for(let i=0;i<node.children.length;i+=options.concurrency){
   const batch=node.children.slice(i,i+options.concurrency);
   const settled=await Promise.allSettled(batch.map(child=>run(child,[...ancestors,result])));
   const failed=settled.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;
  }
 };
 try{await run(current.root,[]);guard();return {tree:current,outputs};}
 catch(error){
  const block=(node:GenerationNode)=>{if(node.status!=='generated')node.status='blocked';node.children.forEach(block);};block(current.root);
  // A cancelled budget can release run() while an uncooperative disk write is still pending.
  // Queue the terminal snapshot behind that write; never let an older generated snapshot win.
  // Keep cancellation responsive even if IO never settles. The queued tombstone remains live.
  const terminal=persistence.catch(()=>{}).then(()=>options.persist(structuredClone(current),structuredClone(current.root)));
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([terminal,new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);})]);}catch{/* original failure remains authoritative */}finally{if(timer)clearTimeout(timer);}
  throw error;
 }
}
