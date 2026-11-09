/** Browser verifier uses the actual loaded application stores, including Vite versioned modules. */
export async function openVerifierProject(id:string){
 const loaded=(path:string)=>performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname===path);
 const workspaceUrl=loaded('/src/stores/useWorkspaceStore.ts'),projectUrl=loaded('/src/stores/useProjectStore.ts');
 if(!projectUrl)throw Error('实际工程模块尚未加载，不能用另一个模块实例替代。');
 // Standalone UI fixtures may not have used Workspace yet. Its first real import
 // must still install into the observed live Project store (checked below).
 const {useWorkspaceStore}=await import(/* @vite-ignore */ workspaceUrl??'/src/stores/useWorkspaceStore.ts'),{useProjectStore}=await import(/* @vite-ignore */ projectUrl);
 const prior=useProjectStore.getState().projectAuthoringSession;
 if(!useWorkspaceStore.getState().openProject(id))throw Error('工程打开请求被拒绝。');
 const revision=useWorkspaceStore.getState().navigationRevision,deadline=Date.now()+8000;
 do{
  await new Promise(resolve=>setTimeout(resolve,1));
  const workspace=useWorkspaceStore.getState(),state=useProjectStore.getState();
  if(workspace.navigationRevision!==revision)throw Error('工程打开期间导航已变化。');
  if(workspace.sourceTransitionError)throw Error(workspace.sourceTransitionError);
  if(workspace.activeProjectId===id&&workspace.view==='workspace'&&state.id===id&&state.projectAuthoringSession&&state.projectAuthoringSession!==prior)return;
 }while(Date.now()<deadline);
 throw Error('工程未完成实际来源与历史安装：'+id);
}
