import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildDesignBrief, renderDesignBrief } from '../src/services/ai/designBrief';
import { techBlueTheme } from '../src/utils/themePresets';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultBindings, defaultProviders } from '../src/stores/useAIConfigStore';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { DesignBriefCard } from '../src/components/chat/DesignBriefCard';
import { RenderedQualityCard } from '../src/components/chat/RenderedQualityCard';
import { stripEditorChromeClasses } from '../src/utils/exportRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const input = { request:'创建会员列表', designSystem:techBlueTheme, device:'mobile' as const, mode:'light' as const, globalDecisions:['列表复用人物行'], components:[] };

describe('可复用的设计简表',()=>{
  test('目标可变而工程风格身份保持；主题、决策变化则身份更新',()=>{
    const first=buildDesignBrief(input), second=buildDesignBrief({...input,request:'创建会员详情'});
    expect(first.contextId).toBe(second.contextId);expect(first.goal).not.toBe(second.goal);expect(second.layout).toContain('详情完整');
    expect(buildDesignBrief({...input,mode:'dark'}).contextId).not.toBe(first.contextId);
    expect(buildDesignBrief({...input,globalDecisions:['改用其他组件']}).contextId).not.toBe(first.contextId);
    expect(buildDesignBrief(JSON.parse(JSON.stringify(input))).contextId).toBe(first.contextId);
    expect(buildDesignBrief({...input,globalDecisions:['A','B']}).contextId).toBe(buildDesignBrief({...input,globalDecisions:['B','A']}).contextId);
  });
  test('简表注入真正的模型请求，修改/主题/问题不引入新建计划',async()=>{
    const provider={...defaultProviders[0],apiKey:'test'};
    for(const intent of ['create_screen','modify_screen','question','change_theme'] as const){
      const transport=new MockTransport();transport.queueResponse('<artifact identifier="new" type="screen" title="新页"><main>示例</main></artifact>');
      const core=new DefaultAIEngineCore(transport);
      const brief=buildDesignBrief(input);
      await PipelineExecutor.execute({input:{rawPrompt:intent==='change_theme'?'主题改为深色':'创建会员页面',activeScreenId:null,decision:{intent,targetScreenId:null,reason:'test'}},provider,model:'test',engineCore:core,screens:{},deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'',designSystem:techBlueTheme,designBrief:brief});
      const request=transport.lastRequest?.messages || (transport.lastRequest?.body as any)?.messages;
      const prompt=request?.find((m:any)=>m.role==='system')?.content || '';
      if(intent==='create_screen')expect(prompt).toContain(renderDesignBrief(brief));
      else expect(prompt).not.toContain('TASK DESIGN BRIEF');
    }
  });
});

describe('简表展示与画框渲染接线',()=>{
  let host:HTMLDivElement,root:Root;
  beforeEach(()=>{
    localStorage.clear();useProjectStore.getState().initNewProject({name:'P1',deviceProfile:'mobile',designSystem:techBlueTheme,createSpecimen:false});
    useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'test'}:p),bindings:defaultBindings});
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
  });
  afterEach(()=>{act(()=>root.unmount());host.remove();});
  test('对话所展示的简表就是传入Pipeline的对象，不增加模型调用或确认',async()=>{
    const executor=spyOn(PipelineExecutor,'execute').mockResolvedValue({status:'no_html',rawResponse:'fixture'});
    let engine!:ReturnType<typeof useAIEngineChat>;
    function Harness(){engine=useAIEngineChat();return <>{engine.messages.map(m=>m.designBrief?<DesignBriefCard key={m.id} brief={m.designBrief}/>:null)}</>;}
    try{
      await act(async()=>{root.render(<Harness/>);});
      await act(async()=>{await engine.sendMessage('新建一个会员列表页面');});
      const brief=engine.messages.find(m=>m.designBrief)?.designBrief;
      expect(brief).toBeDefined();expect(executor).toHaveBeenCalledTimes(1);expect(executor.mock.calls[0][0].designBrief).toBe(brief);
      expect(host.textContent).toContain('本次设计方向');expect(host.textContent).toContain('新建一个会员列表页面');
    }finally{executor.mockRestore();}
  });
  test('scopedCss热更新保持srcdoc与iframe实例，候选高亮不操作原页，导出剥离高亮',async()=>{
    const id=useProjectStore.getState().addScreen({name:'原页面',htmlContent:'<main data-nid="root"><p data-nid="text">文案</p></main>'});
    const original=useProjectStore.getState().screens[id];
    const render=(css:string,focus?:string)=>root.render(<><ScreenFrame screen={original} lodLevel={2}/><ScreenFrame screen={{...original,id:'preview',scopedCss:css}} lodLevel={2} isStaged qualityFocusNid={focus}/></>);
    await act(async()=>{render('.row{gap:var(--space-4)}');});
    const frames=host.querySelectorAll('iframe');const candidate=frames[1],doc=candidate.contentDocument!;
    doc.head.innerHTML='<style id="scoped-css"></style>';doc.body.innerHTML=original.htmlContent;
    frames[0].contentDocument!.body.innerHTML=original.htmlContent;
    const srcdoc=candidate.srcdoc;
    await act(async()=>{render('.row{gap:var(--space-6)}','text');});
    expect(host.querySelectorAll('iframe')[1]).toBe(candidate);expect(candidate.srcdoc).toBe(srcdoc);
    expect(doc.getElementById('scoped-css')?.textContent).toContain('--space-6');
    expect(doc.querySelector('[data-nid="text"]')?.classList.contains('aidesign-quality-target')).toBe(true);
    expect(frames[0].contentDocument!.querySelector('.aidesign-quality-target')).toBeNull();
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(original.htmlContent);
    expect(stripEditorChromeClasses(doc.body.innerHTML)).not.toContain('aidesign-quality-target');
  });
  test('延迟load事件不会把已经热更新的scopedCss、Token或L4回滚',async()=>{
    const id=useProjectStore.getState().addScreen({name:'延迟加载',htmlContent:'<main data-nid="root"><p data-nid="text">内容</p></main>'});
    const source=useProjectStore.getState().screens[id];
    const render=(css:string)=>root.render(<ScreenFrame screen={{...source,scopedCss:css}} lodLevel={2}/>);
    await act(async()=>{render('.before{gap:var(--space-2)}');});
    const iframe=host.querySelector('iframe')!,doc=iframe.contentDocument!;
    doc.head.innerHTML='<style id="scoped-css"></style><style id="tokens"></style><style id="overrides"></style>';
    doc.body.innerHTML=source.htmlContent;
    await act(async()=>{
      useProjectStore.getState().setOverride(id,'text',{color:'var(--color-danger)'});
      const current=useProjectStore.getState().designSystem;
      useProjectStore.getState().setDesignSystem({...current,tokens:{...current.tokens,colors:{...current.tokens.colors,primary:{...current.tokens.colors.primary,'500':'#487568'}}}});
      render('.after{gap:var(--space-6)}');
    });
    const ids=['scoped-css','tokens','overrides'];
    const expected=ids.map(id=>doc.getElementById(id)!.textContent);
    expect(expected[0]).toContain('.after');expect(expected[1]).toContain('#487568');expect(expected[2]).toContain('--color-danger');
    act(()=>iframe.dispatchEvent(new Event('load')));
    expect(ids.map(id=>doc.getElementById(id)!.textContent)).toEqual(expected);
  });
  test('缺少nid的候选副本重渲染时保持节点身份，不产生检查循环',async()=>{
    const screen={id:'preview',name:'候选',position:{x:0,y:0},htmlContent:'<main><p>无nid内容</p></main>'};
    const receive=()=>{};
    await act(async()=>{root.render(<ScreenFrame screen={screen} lodLevel={2} isStaged renderQualityKey="version1" onRenderQuality={receive}/>);});
    const iframe=host.querySelector('iframe')!,srcdoc=iframe.srcdoc;
    await act(async()=>{root.render(<ScreenFrame screen={{...screen,name:'重渲染候选'}} lodLevel={2} isStaged renderQualityKey="version1" onRenderQuality={receive}/>);});
    expect(iframe.srcdoc).toBe(srcdoc);
  });
  test('未完成检查不显示通过；报告定位按钮回传正确nid',async()=>{
    let selected='';
    await act(async()=>root.render(<RenderedQualityCard report={{status:'incomplete',inspected:1,reason:'图片待加载',findings:[{code:'render_unexpected_wrap',severity:'warning',nid:'button1',message:'按钮换行',actual:'2行',expected:'完整单行'}]}} onLocate={nid=>{selected=nid;}}/>));
    expect(host.textContent).toContain('渲染检查未完成');expect(host.textContent).not.toContain('未发现已覆盖规则的问题');
    act(()=>host.querySelector('button')!.click());expect(selected).toBe('button1');
  });
});
