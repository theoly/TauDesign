import {expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {InfiniteCanvas} from '../src/components/canvas/InfiniteCanvas';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
for(const readonly of [false,true])test(`empty canvas distinguishes a new project from missing files; readonly=${readonly}`,async()=>{
 const before=useProjectStore.getState(),history=useHistoryStore.getState(),previous=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{useProjectStore.getState().initNewProject({name:'空画布诊断',deviceProfile:'mobile',createSpecimen:false});await useProjectStore.getState().saveProjectChecked();useProjectStore.setState({projectSaveStatus:readonly?'readonly':null,projectSaveError:readonly?'页面正文缺失':null});
  await act(async()=>root.render(<InfiniteCanvas/>));
  const button=Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('新建空白画框'))!;expect(button.disabled).toBe(readonly);
  expect(host.textContent).toContain(readonly?'工程需要恢复页面文件':'纯净工作区 · 准备就绪');if(readonly)expect(host.textContent).not.toContain('纯净工作区 · 准备就绪');
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(before,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previous;}
});
