#!/usr/bin/env python3
"""Explicit template/slot UI, semantic sync and real candidate render/adoption gates. No AI calls."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1600,'height':1050},locale='zh-CN')
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  args.screenshot.parent.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle')
   await page.wait_for_function('Boolean(window.__projectStore)')
   fixture=await page.evaluate('''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    const s=window.__projectStore,id=s.getState().initNewProject({name:'组件模板插槽验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
    const template='<article class="card p-4 col gap-3"><h2 data-slot="name" class="font-semibold">默认姓名</h2><p class="text-secondary">固定提示</p><div data-slot="body" class="col gap-2"><span>默认正文</span></div></article>';
    const componentId=s.getState().createComponent('会员资料卡',template);
    const source='<main data-nid="root" class="col gap-4 p-4"><h1 class="text-xl font-bold">会员资料</h1>'+template.replace('<article','<article data-nid="instance" data-component-id="'+componentId+'" data-component-instance="member" data-component-version="1"').replace('默认姓名','保留姓名').replace('<span>默认正文</span>','<p data-nid="bio">保留个人介绍</p>')+'<button class="btn btn-primary">保存资料</button></main>';
    s.getState().addScreen({name:'原页面',htmlContent:source},'old');
    const slots=[{slotName:'name',selector:'[data-slot="name"]',type:'text',defaultContent:'默认姓名'},{slotName:'body',selector:'[data-slot="body"]',type:'node',defaultContent:'默认正文'}];
    useWorkspaceStore.setState({view:'workspace',activeProjectId:id});window.__slots={id,componentId,template,source,slots};
    return {...window.__slots,history:useHistoryStore.getState().past.length};
   }''')
   async def open_assets():
    resource=page.get_by_role('button',name='资源',exact=True)
    if await resource.get_attribute('aria-pressed')!='true':await resource.click()
    await page.get_by_role('button',name='资源中心（上传 / AI 生成）',exact=True).click()
    await page.get_by_text('工程资源与组件中心 (Assets & Components)',exact=True).wait_for()
   await open_assets()
   editor=page.get_by_role('region',name='会员资料卡复用约束',exact=True)
   await editor.get_by_role('button',name='配置复用约束',exact=True).click()
   await editor.get_by_role('checkbox',name='启用固定模板与插槽校验',exact=True).check()
   await editor.get_by_role('textbox',name='组件插槽 JSON',exact=True).fill('{invalid')
   await editor.get_by_role('button',name='保存复用约束',exact=True).click()
   await editor.get_by_text('插槽 JSON 格式不正确。',exact=True).wait_for()
   assert await page.evaluate('window.__projectStore.getState().components[window.__slots.componentId].version')==1
   await editor.get_by_role('textbox',name='组件插槽 JSON',exact=True).fill(json.dumps(fixture['slots'],ensure_ascii=False))
   await editor.get_by_role('button',name='保存复用约束',exact=True).click()
   await editor.get_by_text('复用约束已保存；原页面保持不变，可按需同步实例。',exact=True).wait_for()
   enabled=await page.evaluate('''async fixture=>{
    const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    if(s.components[fixture.componentId].version!==2||s.screens.old.htmlContent!==fixture.source||useHistoryStore.getState().past.length!==fixture.history+1)throw Error('Enabling changed instances/version/history');
    useHistoryStore.getState().undo();if(window.__projectStore.getState().components[fixture.componentId].templateContract)throw Error('Undo failed');
    useHistoryStore.getState().redo();if(!window.__projectStore.getState().components[fixture.componentId].templateContract)throw Error('Redo failed');
    return {version:2,historyDelta:1,originalUntouched:true,undoRedo:true};
   }''',fixture)
   await page.get_by_role('button',name='批量同步',exact=True).click()
   await page.wait_for_function('window.__projectStore.getState().screens.old.htmlContent.includes(\'data-component-version="2"\')')
   await editor.get_by_role('button',name='配置复用约束',exact=True).click()
   reordered=fixture['template'].replace('<h2 data-slot="name" class="font-semibold">默认姓名</h2>','').replace('</article>','<h2 data-slot="name" class="font-semibold">新默认姓名</h2></article>').replace('固定提示','新版固定提示')
   await editor.get_by_role('textbox',name='组件模板 HTML',exact=True).fill(reordered)
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-config')))
   await editor.get_by_role('button',name='保存复用约束',exact=True).click()
   await editor.get_by_text('v3 · 模板与插槽校验',exact=True).wait_for()
   await page.get_by_role('button',name='批量同步',exact=True).click()
   synced=await page.evaluate('''async()=>{
    const s=window.__projectStore.getState(),f=window.__slots,html=s.screens.old.htmlContent;
    const {inspectDesignEntities}=await window.__module('/src/services/ai/designEntityValidation.ts');
    const doc=new DOMParser().parseFromString(html,'text/html'),report=inspectDesignEntities(html,{components:s.components,pageIds:['old']});
    if(!report.passed||report.templateCount!==1||doc.querySelector('[data-slot="name"]').textContent!=='保留姓名'||doc.querySelector('[data-slot="body"]').textContent!=='保留个人介绍'||!html.includes('新版固定提示')||!html.includes('data-component-version="3"'))throw Error('Slots reordered/lost or current template wrong');
    window.__slots.synced=html;return {version:3,report,preservedName:true,preservedBody:true,fixedTemplateUpdated:true};
   }''')
   # An open form cannot overwrite a changed definition; pinned reference is actually disabled.
   await editor.get_by_role('button',name='配置复用约束',exact=True).click()
   await page.evaluate('window.__projectStore.getState().updateComponent(window.__slots.componentId,{description:"外部更新"})')
   await editor.get_by_role('button',name='保存复用约束',exact=True).click()
   await editor.get_by_text('工程或组件定义已变化，请取消后重新打开配置。',exact=True).wait_for()
   await editor.get_by_role('button',name='取消配置',exact=True).click()
   await page.evaluate('''async()=>{
    const s=window.__projectStore.getState(),{buildLibraryReferenceSnapshot}=await window.__module('/src/services/ai/designLibraryReference.ts');
    window.__projectStore.setState({designLibraryBinding:{mode:'pinned_reference',referenceSnapshot:buildLibraryReferenceSnapshot(s.designSystem,s.components,s.assets)}});
   }''')
   assert await editor.get_by_role('button',name='配置复用约束',exact=True).is_disabled()
   await page.evaluate('window.__projectStore.setState({designLibraryBinding:undefined})')
   await page.get_by_text('工程资源与组件中心 (Assets & Components)',exact=True).locator('..').locator('..').get_by_role('button').click()
   # Do not stub iframe inspection: the actual candidate surface must complete.
   await page.evaluate('''()=>{const f=window.__slots,s=window.__projectStore.getState();s.stageScreenChange('old',f.synced.replace('class="card p-4 col gap-3"','class="card p-6 col gap-3"'),'模板不一致候选');}''')
   await page.wait_for_function('window.__projectStore.getState().stagedRenderQuality?.report.status==="complete"')
   await page.get_by_role('alert').get_by_text('设计实体引用未通过',exact=False).wait_for()
   blocked=await page.evaluate('''async()=>{const s=window.__projectStore.getState();if(await s.adoptStagedChange()||await s.forceAdoptStagedChange()||await s.keepBothScreens())throw Error('Strict mismatch adoption allowed');return {delivery:s.getStagedDeliveryReport(),render:s.stagedRenderQuality.report};}''')
   for label in ['采纳新版 (替换原版)','两版都留']:
    buttons=page.get_by_role('button',name=label,exact=True)
    for i in range(await buttons.count()):assert await buttons.nth(i).is_disabled()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-blocked')))
   await page.evaluate('''()=>{const f=window.__slots,s=window.__projectStore.getState();s.stageScreenChange('old',f.synced.replace('保留姓名','新姓名'),'仅修改姓名插槽');}''')
   await page.wait_for_function('window.__projectStore.getState().getStagedDeliveryReport().status==="ready"')
   summary=page.get_by_text('查看验收记录',exact=True).first
   if await summary.locator('..').get_attribute('open') is None:await summary.click()
   await page.get_by_text('已核对 1 个固定模板与插槽合同。',exact=False).first.wait_for()
   await page.screenshot(path=str(args.screenshot))
   await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).first.click()
   await page.wait_for_function('!window.__projectStore.getState().stagedScreen')
   applied=await page.evaluate('''async()=>{
    const s=window.__projectStore.getState(),{DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts'),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts'),record=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('old',10)).records[0];
    if(!record.candidate.validationEvidence.delivery.checks.find(c=>c.id==='entities').message.includes('1 个固定模板与插槽合同'))throw Error('No actual template proof archived');
    useHistoryStore.getState().undo();if(!window.__projectStore.getState().screens.old.htmlContent.includes('保留姓名'))throw Error('Adoption undo');
    useHistoryStore.getState().redo();if(!window.__projectStore.getState().screens.old.htmlContent.includes('新姓名'))throw Error('Adoption redo');
    return {archiveId:record.id,proof:record.candidate.validationEvidence.delivery,undoRedo:true};
   }''')
   await page.reload(wait_until='networkidle')
   await page.wait_for_function('Boolean(window.__projectStore)')
   reopened=await page.evaluate('''async fixture=>{
    const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path),{useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
    if(!useWorkspaceStore.getState().openProject(fixture.id))throw Error('Reopen');
    const s=window.__projectStore.getState();if(s.components[fixture.componentId].version!==3||s.components[fixture.componentId].templateContract?.version!==1||!s.screens.old.htmlContent.includes('新姓名'))throw Error('Contract/slots/content lost on reload');
    return {version:3,contract:s.components[fixture.componentId].templateContract,slots:s.components[fixture.componentId].slotDefs};
   }''',fixture)
   await page.frame_locator('iframe[title="原页面"]').get_by_text('新姓名',exact=True).wait_for()
   await open_assets()
   await page.get_by_text('v3 · 模板与插槽校验',exact=True).wait_for()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-reopened')))
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'actual component editor, slot sync, candidate iframe/adoption/archives/reload; no AI or external Provider requests','enabled':enabled,'synced':synced,'staleFormBlocked':True,'readOnlyDisabled':True,'blocked':blocked,'applied':applied,'reopened':reopened,'pageErrors':errors}
   args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps({'status':'passed','browser':args.browser,'syncedVersion':3,'templateCount':synced['report']['templateCount'],'pageErrors':errors},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
   print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4000:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--url',default='http://127.0.0.1:5174')
 parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
 parser.add_argument('--screenshot',type=Path,default=Path('/tmp/component-template.png'))
 parser.add_argument('--report',type=Path,default=Path('/tmp/component-template.json'))
 asyncio.run(main(parser.parse_args()))
