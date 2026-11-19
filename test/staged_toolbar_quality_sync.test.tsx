import {afterEach,beforeEach,describe,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {InfiniteCanvas} from '../src/components/canvas/InfiniteCanvas';
import {findingSummary} from '../src/components/chat/QualityFindings';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {buildPageRedesignSource} from '../src/services/ai/pageRedesignSource';
import {checkStagedCandidateQuality} from '../src/services/ai/stagedCandidateQuality';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useProjectStore} from '../src/stores/useProjectStore';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

describe('staged toolbar quality sync',()=>{
  let host:HTMLDivElement,root:Root,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;

  beforeEach(()=>{
    prior=useProjectStore.getState();
    history=useHistoryStore.getState();
    host=document.createElement('div');
    document.body.append(host);
    root=createRoot(host);
  });

  afterEach(()=>{
    act(()=>root.unmount());
    host.remove();
    useProjectStore.setState(prior,true);
    useHistoryStore.setState(history,true);
  });

  test('对比顶栏与交付检查使用同一整页重设计质量门，阻断项不会被漏报为0',async()=>{
    const store=useProjectStore.getState();
    store.initNewProject({name:'质量同步',deviceProfile:'mobile',createSpecimen:false});
    const baseline='<main data-nid="root"><section data-nid="region" aria-label="资料"><h1>资料管理</h1><p data-nid="keep-a">必须保留的业务文案甲</p><p data-nid="keep-b">必须保留的业务文案乙</p><button data-nid="save" class="btn">保存</button></section></main>';
    store.addScreen({name:'原页',htmlContent:baseline},'page');
    const live=useProjectStore.getState();
    const page=live.screens.page;
    const source=buildPageRedesignSource(page.htmlContent,{deviceProfile:'mobile',protectedNids:live.getProtectedNids('page')});
    const draft='<main data-nid="root"><section data-nid="region" aria-label="资料"><h1>资料管理</h1><p data-nid="keep-a">已改写文案</p><button data-nid="save" class="btn">保存</button></section></main>';
    const contract=buildDesignTaskContract({
      intent:'modify_screen',
      request:'保留全部业务信息，重新设计整页',
      target:{id:'page',name:'原页',htmlContent:page.htmlContent},
      deviceProfile:'mobile',
      frameWidth:390,
      designSystem:live.designSystem,
      protectedNids:live.getProtectedNids('page'),
    });
    contract.wholePageRedesign={
      version:1,
      sourceFingerprint:source.sourceFingerprint,
      inventoryFingerprint:contentFingerprint(JSON.stringify(source)),
    };
    live.stageScreenChange('page',draft,'原页（未通过验收的对比稿）','保留全部业务信息，重新设计整页',contract);

    const expected=checkStagedCandidateQuality(draft,{
      deviceProfile:'mobile',
      useCustomNavigation:live.settings.useCustomNavigation,
      designSystem:live.designSystem,
      baselineHtml:page.htmlContent,
      protectedNids:live.getProtectedNids('page'),
      modificationRequest:'保留全部业务信息，重新设计整页',
      workflowContract:contract,
    });
    expect(expected.passed).toBe(false);
    expect(expected.findings.some(f=>f.code==='redesign_content_missing')).toBe(true);
    expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('blocked');

    await act(async()=>{root.render(<InfiniteCanvas/>);});

    expect(host.textContent).toContain('结果未通过检查');
    expect(host.textContent).toContain(findingSummary(expected.findings));
    expect(host.textContent).not.toMatch(/设计检查提示 · 0 项阻断 · 0 项警告/);
    expect(host.textContent).toMatch(/暂不能采纳：.*整页重设计遗漏/);
  });
});
