import {test,expect} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {repairCompressedBodyCards} from '../src/utils/textLayoutRepair';
import {compareStructure} from '../src/utils/structureGuard';
import {extractClassWhitelist} from '../src/utils/cssCompiler';
import {getBaseCss} from '../src/styles/baseCss';
import {TextLayoutRepairDialog} from '../src/components/canvas/TextLayoutRepairDialog';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
const html='<main data-nid="page"><article data-nid="card" class="list-item p-3 r-md bg-surface-alt border border-subtle"><div data-nid="header" class="row justify-between gap-2"><span>具体邀约</span><div data-nid="actions" class="row gap-1"><button class="btn btn-sm">复制</button><button class="btn btn-sm">采用</button></div></div><p data-nid="copy" class="text-md">这周六西湖边有个版画展，我多了一张票，一起去看看吗？</p></article><footer data-nid="footer">其它区域</footer></main>';
test('类名修复保留元素结构、文案和其它区域；全部新增类来自权威白名单',()=>{
 const result=repairCompressedBodyCards(html,['copy','copy']);expect(result.count).toBe(1);expect(result.rootNids).toEqual(['card']);
 expect(compareStructure(html,result.html)).toMatchObject({ok:true,textChanged:0});
 const before=new DOMParser().parseFromString(html,'text/html'),after=new DOMParser().parseFromString(result.html,'text/html');
 expect(after.querySelector('[data-nid="footer"]')!.outerHTML).toBe(before.querySelector('[data-nid="footer"]')!.outerHTML);
 expect(after.querySelector('article')!.classList.contains('list-item')).toBe(false);
 const allowed=new Set(extractClassWhitelist(getBaseCss('mobile')));for(const el of after.querySelectorAll('[class]'))for(const c of el.classList)expect(allowed.has(c)).toBe(true);
 expect(after.querySelector('[data-nid="header"]')!.classList.contains('wrap')).toBe(true);
});
test('不确定、重复或受保护的布局不修复，原始HTML保持不变',()=>{
 for(const nids of [['card'],['copy','missing']])expect(()=>repairCompressedBodyCards(html,nids)).toThrow();
 for(const nid of ['page','card','copy','actions'])expect(()=>repairCompressedBodyCards(html,['copy'],[nid])).toThrow('保护');
 expect(()=>repairCompressedBodyCards(html.replace('class="list-item','style="display:flex" class="list-item'),['copy'])).toThrow('行内');
 expect(()=>repairCompressedBodyCards(html.replace('<footer','<p data-nid="copy"></p><footer'),['copy'])).toThrow('不唯一');
});
test('预览后工程变化拒绝；确认只暂存副本，不静默覆盖原页',async()=>{
 const prior=useProjectStore.getState(),history=useHistoryStore.getState(),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  prior.initNewProject({name:'局部布局修复',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'建议卡片',htmlContent:html,position:{x:0,y:0}},'s');useHistoryStore.getState().restore(null);
  await act(async()=>root.render(<TextLayoutRepairDialog screenId="s" textNids={['copy']} onClose={()=>{}}/>));
  await act(async()=>host.querySelectorAll('button')[1].click());
  expect(useProjectStore.getState().screens.s.htmlContent).toBe(html);expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('col');expect(useHistoryStore.getState().past.length).toBe(0);
  act(()=>useProjectStore.getState().discardStagedChange());await act(async()=>root.render(<TextLayoutRepairDialog key="fresh" screenId="s" textNids={['copy']} onClose={()=>{}}/>));
  act(()=>useProjectStore.getState().updateScreenHtml('s',html.replace('其它区域','人工变更')));
  await act(async()=>host.querySelectorAll('button')[1].click());expect(host.textContent).toContain('已变化');expect(useProjectStore.getState().stagedScreen).toBeNull();
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;}
});
