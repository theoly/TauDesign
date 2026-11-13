import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {test,expect} from 'bun:test';
import {ModelCapacitySettings} from '../src/components/settings/ModelCapacitySettings';
import {useAIConfigStore,defaultBindings} from '../src/stores/useAIConfigStore';
import {encodeModelRequest} from '../src/services/ai/modelRequestCodec';
import {resolveModelCapability} from '../src/services/ai/modelCapabilities';

test('saved capacity and role cap reach the wire; invalid values leave configuration unchanged and endpoint drift is blocked',()=>{
 const before=useAIConfigStore.getState(),stored=localStorage.getItem('ai_designer_providers_v1');
 const provider={id:'capacity-settings',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'test-key',isEnabled:true,defaultModel:'m'};
 try{
  useAIConfigStore.setState({providers:[provider],bindings:{...defaultBindings,code:{role:'code',providerId:provider.id,modelId:'m'}}});
  const store=useAIConfigStore.getState();store.setModelCapability(provider.id,'m',{contextWindow:16000,maxOutputTokens:6000,mediaInput:'native-part'});store.setRoleOutputLimit('code',3000);
  const binding=store.getActiveProviderForRole('code')!,profile=resolveModelCapability(binding.provider,'m')!;
  expect(profile.source).toBe('user');expect(profile.contextWindow).toBe(16000);
  expect(encodeModelRequest({...binding,model:binding.modelId,messages:[{role:'user',content:'小页面'}],maxTokens:8192}).transportRequest.body.max_tokens).toBe(3000);
  const frozen=JSON.stringify(useAIConfigStore.getState().providers);
  expect(()=>store.setModelCapability(provider.id,'m',{contextWindow:1024,maxOutputTokens:2048})).toThrow();expect(()=>store.setRoleOutputLimit('code',1)).toThrow();
  expect(JSON.stringify(useAIConfigStore.getState().providers)).toBe(frozen);
  store.updateProvider(provider.id,{baseUrl:'https://changed.test/v1'});
  expect(()=>encodeModelRequest({...store.getActiveProviderForRole('code')!,model:'m',messages:[{role:'user',content:'小页面'}]})).toThrow('过期');
  store.setModelCapability(provider.id,'m');store.setRoleOutputLimit('code');expect(store.getActiveProviderForRole('code')!.provider.requestOutputCaps).toBeUndefined();
 }finally{useAIConfigStore.setState(before,true);if(stored===null)localStorage.removeItem('ai_designer_providers_v1');else localStorage.setItem('ai_designer_providers_v1',stored);}
});
test('capacity form validates before saving and exposes limits only for roles bound to the current model',()=>{
 const before=useAIConfigStore.getState(),stored=localStorage.getItem('ai_designer_providers_v1');
 const provider={id:'capacity-ui',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'',isEnabled:true};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const fill=(label:string,value:string)=>act(()=>{const input=host.querySelector(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 const click=()=>act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='保存模型容量')!.click());
 try{
  useAIConfigStore.setState({providers:[provider],bindings:{...defaultBindings,code:{role:'code',providerId:provider.id,modelId:'m'}}});
  act(()=>root.render(<ModelCapacitySettings provider={provider} model="m"/>));
  expect(host.querySelector('[aria-label="code角色输出上限"]')).not.toBeNull();expect(host.querySelector('[aria-label="chat角色输出上限"]')).toBeNull();
  fill('模型上下文窗口','1024');fill('模型最大输出','2048');click();expect(useAIConfigStore.getState().providers[0].modelCapabilities).toBeUndefined();expect(host.textContent).toContain('输出上限须小于');
  fill('模型上下文窗口','16000');click();expect(useAIConfigStore.getState().providers[0].modelCapabilities?.m.contextWindow).toBe(16000);expect(host.textContent).toContain('仍受本轮总额度');
 }finally{act(()=>root.unmount());host.remove();useAIConfigStore.setState(before,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;if(stored===null)localStorage.removeItem('ai_designer_providers_v1');else localStorage.setItem('ai_designer_providers_v1',stored);}
});
