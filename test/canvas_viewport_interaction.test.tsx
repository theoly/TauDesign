import {describe,test,expect,beforeEach,afterEach,spyOn} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {InfiniteCanvas} from '../src/components/canvas/InfiniteCanvas';
import * as GenerationQuality from '../src/services/ai/generationQuality';
import {useProjectStore} from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

describe('canvas viewport interaction stays off the React path during gestures',()=>{
  let container:HTMLDivElement;let root:Root;let transformSpy:ReturnType<typeof spyOn>;

  beforeEach(async()=>{
    useProjectStore.setState({
      screens:{s1:{id:'s1',name:'P1',htmlContent:'<main data-nid="aaaaaaaa"><p data-nid="bbbbbbbb">hi</p></main>',position:{x:0,y:0},measuredHeight:800} as any},
      screenOrder:['s1'],activeScreenId:'s1',selectedNid:null,selectedNode:null,
      viewportTransform:{x:10,y:20,scale:0.5},
      stagedScreen:null,stagedValidationEvidence:null,stagedRenderQuality:null,
    } as any);
    transformSpy=spyOn(useProjectStore.getState(),'setViewportTransform');
    container=document.createElement('div');
    container.style.width='800px';container.style.height='600px';
    document.body.appendChild(container);
    root=createRoot(container);
    await act(async()=>{root.render(React.createElement(InfiniteCanvas,{}));});
    await act(async()=>{await new Promise(r=>setTimeout(r,40));});
    transformSpy.mockClear();
  });

  afterEach(()=>{
    act(()=>root.unmount());
    container.remove();
    transformSpy.mockRestore();
    useProjectStore.getState().discardStagedChange?.();
    useProjectStore.setState({stagedScreen:null,stagedValidationEvidence:null,stagedRenderQuality:null} as any);
  });

  test('wheel pan updates the world layer transform without a store commit per tick',async()=>{
    const canvas=container.firstElementChild as HTMLElement;
    const world=canvas.querySelector('.will-change-transform') as HTMLElement;
    expect(world).toBeTruthy();
    await act(async()=>{
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:40,deltaY:30}));
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:40,deltaY:30}));
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:40,deltaY:30}));
    });
    expect(transformSpy).toHaveBeenCalledTimes(0);
    expect(world.style.transform).toContain('translate3d');
    await act(async()=>{await new Promise(r=>setTimeout(r,140));});
    expect(transformSpy).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().viewportTransform.x).toBe(10-120);
    expect(useProjectStore.getState().viewportTransform.y).toBe(20-90);
  });

  test('compare-mode viewport commit does not re-run staged quality gates',async()=>{
    const baseline='<main data-nid="root"><p data-nid="keep">业务文案</p></main>';
    const draft='<main data-nid="root"><p data-nid="keep">改写文案</p></main>';
    useProjectStore.setState({
      screens:{s1:{id:'s1',name:'原页',htmlContent:baseline,position:{x:0,y:0},measuredHeight:800} as any,
        s2:{id:'s2',name:'背景页',htmlContent:'<main data-nid="bg">背景</main>',position:{x:800,y:0},measuredHeight:600} as any},
      screenOrder:['s1','s2'],activeScreenId:'s1',
      viewportTransform:{x:10,y:20,scale:0.4},
    } as any);
    useProjectStore.getState().stageScreenChange('s1',draft,'原页（对比稿）','重新设计');
    await act(async()=>{root.render(React.createElement(InfiniteCanvas,{}));});
    await act(async()=>{await new Promise(r=>setTimeout(r,80));});
    // Settle archive/measure noise before asserting pan must not reopen delivery.
    await act(async()=>{await new Promise(r=>setTimeout(r,80));});

    transformSpy.mockClear();
    const canvas=container.firstElementChild as HTMLElement;
    const world=canvas.querySelector('.will-change-transform') as HTMLElement;
    const backdrop=container.querySelector('[data-testid="comparison-backdrop"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    expect(Number.parseFloat(backdrop.style.width)).toBeLessThan(5000);
    // Background compare screens stay L0 (placeholder/thumbnail), pair keeps iframe.
    expect(container.querySelectorAll('iframe').length).toBeLessThanOrEqual(2);

    await act(async()=>{
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:30,deltaY:20}));
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:30,deltaY:20}));
    });
    expect(transformSpy).toHaveBeenCalledTimes(0);
    expect(world.style.transform).toContain('translate3d');

    await act(async()=>{await new Promise(r=>setTimeout(r,140));});
    expect(transformSpy).toHaveBeenCalledTimes(1);
    // Same LOD bucket after pan — canvas did not need interactive L2 remount.
    expect(useProjectStore.getState().viewportTransform.scale).toBe(0.4);

    // Warm cache, then prove repeated delivery reads skip HTML re-parse.
    useProjectStore.getState().getStagedDeliveryReport();
    const quality=spyOn(GenerationQuality,'checkGenerationQuality');
    useProjectStore.getState().getStagedDeliveryReport();
    useProjectStore.getState().getStagedDeliveryReport();
    expect(quality.mock.calls.length).toBe(0);
    quality.mockRestore();
  });
});
