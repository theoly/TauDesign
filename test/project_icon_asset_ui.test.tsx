import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {AssetModal} from '../src/components/assets/AssetModal';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultBindings,defaultProviders} from '../src/stores/useAIConfigStore';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {inspectExternalMedia} from '../src/services/ai/externalMedia';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let container:HTMLDivElement,root:Root,prior:ReturnType<typeof useProjectStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,copied:string[];
const originalStream=DefaultAIEngineCore.prototype.streamText,originalClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');
beforeEach(()=>{prior=useProjectStore.getState();config=useAIConfigStore.getState();history=useHistoryStore.getState();copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{copied.push(text);}}});useProjectStore.getState().initNewProject({name:'图标UI',deviceProfile:'mobile',createSpecimen:false});useHistoryStore.getState().restore(null);useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture-only'})),bindings:defaultBindings});container=document.createElement('div');document.body.append(container);root=createRoot(container);act(()=>root.render(<AssetModal onClose={()=>{}}/>));});
afterEach(()=>{act(()=>root.unmount());container.remove();DefaultAIEngineCore.prototype.streamText=originalStream;if(originalClipboard)Object.defineProperty(navigator,'clipboard',originalClipboard);else delete (navigator as any).clipboard;useProjectStore.setState(prior,true);useAIConfigStore.setState(config,true);useHistoryStore.setState(history,true);});
const button=(text:string)=>Array.from(container.querySelectorAll('button')).find(el=>el.textContent?.trim()===text)!;
async function settle(check:()=>boolean){for(let i=0;i<100&&!check();i++)await act(async()=>{await new Promise(done=>setTimeout(done,10));});expect(check()).toBe(true);}

test('builtin click saves once and copies an external reference instead of SVG drawing bytes',async()=>{
 const tab=Array.from(container.querySelectorAll('button')).find(el=>el.textContent?.includes('内置矢量图标'))!;expect(tab).toBeDefined();act(()=>tab.click());
 const label=Array.from(container.querySelectorAll('span')).find(el=>el.textContent==='用户 (User)')!;expect(label).toBeDefined();act(()=>label.click());await settle(()=>copied.length===1);
 expect(Object.values(useProjectStore.getState().assets)).toHaveLength(1);expect(copied[0]).toContain('assets/icons/');expect(copied[0]).not.toContain('<circle');expect(inspectExternalMedia(copied[0]).violations).toEqual([]);expect(useHistoryStore.getState().past).toHaveLength(1);
});

test('AI SVG remains a host preview until explicitly saved; default copy publishes only a resource reference',async()=>{
 const transport=new MockTransport();transport.queueResponse('<circle cx="12" cy="12" r="8"/>',1);const core=new DefaultAIEngineCore(transport);DefaultAIEngineCore.prototype.streamText=function(options){return originalStream.call(core,options);};
 const tab=Array.from(container.querySelectorAll('button')).find(el=>el.textContent?.includes('AI 矢量'))!;expect(tab).toBeDefined();act(()=>tab.click());
 const input=container.querySelector('input[placeholder^="输入图标概念"]') as HTMLInputElement;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'圆形图标');input.dispatchEvent(new Event('input',{bubbles:true}));});act(()=>button('生成图标').click());await settle(()=>Boolean(container.querySelector('pre')));
 expect(Object.values(useProjectStore.getState().assets)).toHaveLength(0);act(()=>button('保存图标并复制页面引用').click());await settle(()=>copied.length===1);
 expect(Object.values(useProjectStore.getState().assets)[0].source).toBe('ai_generated');expect(copied[0]).not.toContain('<circle');expect(copied[0]).toContain('assets/icons/');expect(inspectExternalMedia(copied[0]).violations).toEqual([]);
});
