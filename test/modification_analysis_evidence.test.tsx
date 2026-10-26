import {afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ModificationReviewSource} from '../src/components/chat/ModificationReviewSource';
import {ModificationReviewCard} from '../src/components/chat/ModificationReviewCard';
import {analyzeScreenModification,buildModificationReviewReceipt,isModificationReviewReceipt} from '../src/services/ai/modificationReview';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {defaultTheme} from '../src/utils/themePresets';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined,host:HTMLDivElement|undefined;
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();root=undefined;});
async function render(node:React.ReactNode){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(node));}
async function fixture(){
  const target={id:'a',name:'页面',htmlContent:'<main data-nid="root"><p data-nid="p">保留文字</p></main>'};
  const contract=buildDesignTaskContract({intent:'modify_screen',reviewRequired:true,request:'优化页面',target,deviceProfile:'pc',frameWidth:1440,designSystem:defaultTheme});
  let attempts=0;
  const result=await analyzeScreenModification({generateObject:async()=>++attempts===1?{}:{summary:'检查完成',items:[{title:'改善标题',reason:'不突出',change:'调整字重',scope:'local',operations:[{nid:'missing',type:'add_classes',value:'font-bold'}]}]}} as AIEngineCore,
    {provider:defaultProviders[0],model:'controlled',html:target.htmlContent,name:target.name,request:contract.request,designSystem:defaultTheme,mode:'light',workflowContract:contract});
  return {result,receipt:buildModificationReviewReceipt(result,['suggestion-1'],'保留颜色',target)};
}
test('分析卡展示真实纠正次数和不安全局部操作降级原因',async()=>{
  const {result}=await fixture();await render(<ModificationReviewCard review={{...result,status:'ready'}} onConfirm={()=>{}} onCancel={()=>{}}/>);
  expect(host!.textContent).toContain('查看分析检查记录');expect(host!.textContent).toContain('共请求 2 次');
  expect(host!.textContent).toContain('含一次格式纠正');expect(host!.textContent).toContain(result.evidence!.downgrades[0].reason);
  expect(host!.textContent).toContain('不代表视觉验收');
});
test('来源组件只读展示所选要求，JSON重开保持证据，不恢复确认按钮',async()=>{
  const {receipt}=await fixture();const restored=JSON.parse(JSON.stringify(receipt));
  expect(isModificationReviewReceipt(restored)).toBe(true);await render(<ModificationReviewSource receipt={restored}/>);
  expect(host!.textContent).toContain('已确认的分析来源');expect(host!.textContent).toContain('改善标题');
  expect(host!.textContent).toContain('保留颜色');expect(host!.querySelector('button')).toBeNull();
});
test('损坏来源诊断被隔离，旧无来源记录正常显示',async()=>{
  const {receipt}=await fixture();(receipt.analysis.evidence as any).downgrades={wrong:true};
  expect(isModificationReviewReceipt(receipt)).toBe(false);await render(<><ModificationReviewSource receipt={receipt}/><span>其它验收记录</span><ModificationReviewSource receipt={undefined}/></>);
  expect(host!.textContent).toContain('来源记录不完整');expect(host!.textContent).toContain('其它验收记录');
});
