import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {AIProviderModal} from '../src/components/settings/AIProviderModal';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
let root:Root|undefined,host:HTMLDivElement|undefined,prior:ReturnType<typeof useAIConfigStore.getState>,storage:string|null,actState:unknown;
const key='ai_designer_providers_v1';
beforeEach(()=>{prior=useAIConfigStore.getState();storage=localStorage.getItem(key);actState=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;useAIConfigStore.setState({providers:defaultProviders,bindings:defaultBindings,autoReferenceDesignRules:false});});
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();root=undefined;host=undefined;useAIConfigStore.setState(prior,true);if(storage===null)localStorage.removeItem(key);else localStorage.setItem(key,storage);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=actState;});
test('one opt-in control persists only the application AI preference and preserves the current project/history',()=>{
 const project=useProjectStore.getState(),history=useHistoryStore.getState();host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(<AIProviderModal onClose={()=>{}}/>));
 const control=host.querySelector<HTMLInputElement>('input[aria-label="自动参考设计规则"]')!;expect(control.checked).toBe(false);expect(host.textContent).toContain('默认关闭，仅影响后续新任务');
 act(()=>control.click());expect(control.checked).toBe(true);expect(JSON.parse(localStorage.getItem(key)!).autoReferenceDesignRules).toBe(true);
 expect(useProjectStore.getState()).toBe(project);expect(useHistoryStore.getState()).toBe(history);
 act(()=>control.click());expect(useAIConfigStore.getState().autoReferenceDesignRules).toBe(false);expect(JSON.parse(localStorage.getItem(key)!).autoReferenceDesignRules).toBe(false);
});
test('provider and role changes preserve the opt-in; disabling never removes bindings or adopted project content',()=>{
 const s=useAIConfigStore.getState();s.setAutoReferenceDesignRules(true);s.addProvider({...defaultProviders[0],id:'control-temp'});s.updateProvider('control-temp',{name:'changed'});s.setRoleBinding('code',{role:'code',providerId:'control-temp',modelId:'fixture'});s.deleteProvider('control-temp');
 expect(useAIConfigStore.getState().autoReferenceDesignRules).toBe(true);expect(JSON.parse(localStorage.getItem(key)!).autoReferenceDesignRules).toBe(true);
 const before=useAIConfigStore.getState(),project=useProjectStore.getState();before.setAutoReferenceDesignRules(false);expect(useAIConfigStore.getState().providers).toBe(before.providers);expect(useAIConfigStore.getState().bindings).toBe(before.bindings);expect(useProjectStore.getState()).toBe(project);
});
test('actual configuration initialization treats missing/invalid preferences as off and restores only explicit true',async()=>{
 for(const [index,value] of [undefined,'true',1,null,false,true].entries()){
  localStorage.setItem(key,JSON.stringify({providers:defaultProviders,bindings:defaultBindings,...(value!==undefined?{autoReferenceDesignRules:value}:{})}));
  const module=await import(`../src/stores/useAIConfigStore.ts?rule-control-${index}-${crypto.randomUUID()}`);
  expect(module.useAIConfigStore.getState().autoReferenceDesignRules).toBe(value===true);
 }
});
