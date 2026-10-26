#!/usr/bin/env python3
"""Source authoring with real UI/store/history/iframe and a persistent local file IPC fixture. No AI calls."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

INSTALL=r'''()=>{
 const prefix='source-authoring-fs:',meta=JSON.parse(localStorage.getItem('source-authoring-meta')||'null');
 window.__sourceFixture={...meta,writes:[],picks:0};
 window.__TAURI_INTERNALS__={invoke:async(cmd,params)=>{
  const f=window.__sourceFixture;
  if(cmd==='plugin:dialog|open'){f.picks++;return '/virtual/source.aidesign';}
  if(params?.root!=='/virtual/source.aidesign')throw Error('No fixture for native command '+cmd);
  const rel=params.rel??'',key=prefix+rel;
  if(cmd==='project_read_text'||cmd==='project_read_binary')return localStorage.getItem(key);
  if(cmd==='project_exists')return localStorage.getItem(key)!==null;
  if(cmd==='project_ensure_dir')return;
  if(cmd==='project_write_text_atomic'){f.writes.push(rel);localStorage.setItem(key,params.contents);return;}
  if(cmd==='project_write_binary'){f.writes.push(rel);localStorage.setItem(key,params.base64Data);return;}
  if(cmd==='project_delete'){localStorage.removeItem(key);return;}
  if(cmd==='project_list_dir')return Object.keys(localStorage).filter(k=>k.startsWith(prefix+rel.replace(/\/$/,'')+'/')).map(k=>k.slice((prefix+rel.replace(/\/$/,'')+'/').length));
  if(cmd==='project_append_line'){localStorage.setItem(key,(localStorage.getItem(key)||'')+params.line+'\n');return;}
  if(cmd==='project_read_all_lines'||cmd==='project_read_tail_lines'){const lines=(localStorage.getItem(key)||'').split('\n').filter(Boolean);return cmd==='project_read_tail_lines'?lines.slice(-params.limit):lines;}
  throw Error('Unexpected filesystem command '+cmd);
 }};
}'''

async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1600,'height':1050},locale='zh-CN')
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  args.screenshot.parent.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   fixture=await page.evaluate('''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {neutralModernTheme,techIndigoTheme}=await window.__module('/src/utils/themePresets.ts');
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const s=window.__projectStore,id=s.getState().initNewProject({name:'消费项目',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
    s.getState().addScreen({name:'消费页面',htmlContent:'<main data-nid="root" class="p-4 col gap-4"><h1>会员资料</h1></main>'},'page');
    useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
    const source={id:'authoring-source',name:'品牌源设计库',schemaVersion:1,settings:s.getState().settings,designSystem:techIndigoTheme,designSystemOrigin:{kind:'project',sourceId:techIndigoTheme.id,sourceName:techIndigoTheme.name,tokenVersion:1,updatedAt:1},
     components:{card:{id:'card',name:'品牌资料卡',version:1,createdAt:1,updatedAt:1,templateContract:{version:1},slotDefs:[{slotName:'name',selector:'[data-slot="name"]',type:'text',defaultContent:'默认姓名'}],templateHtml:'<article class="card p-4"><p data-slot="name">默认姓名</p></article>'}},assets:{},overrides:{},decisions:{},screens:{sample:{id:'sample',name:'源样张',position:{x:60,y:60}}}};
    localStorage.setItem('source-authoring-fs:project.json',JSON.stringify(source));localStorage.setItem('source-authoring-fs:screens/sample.html','<main class="p-4 col gap-4"><h1>源库样张</h1><button class="btn btn-primary">源库按钮</button></main>');
    const meta={id,sourceId:source.id,sourceName:source.name};localStorage.setItem('source-authoring-meta',JSON.stringify(meta));return meta;
   }''')
   await page.evaluate(INSTALL)
   async def theme():
    button=page.get_by_role('button',name='设计系统',exact=True)
    if await button.get_attribute('aria-pressed')!='true':await button.click()
    await page.get_by_role('button',name='完整主题编辑器',exact=True).click()
    return page.get_by_role('region',name='设计库来源与使用方式',exact=True)
   panel=await theme()
   await panel.get_by_role('radio',name='固定版本只读参考',exact=True).check()
   await panel.get_by_role('button',name='从其他工程导入只读参考',exact=True).click()
   await page.get_by_role('button',name='确认固定版本参考',exact=True).click()
   await panel.get_by_role('button',name='编辑源库：选择来源工程',exact=True).wait_for()
   initial=await page.evaluate('''()=>{
    const s=window.__projectStore.getState(),id=Object.keys(s.components)[0];s.insertComponent('page',id);
    const original=window.__projectStore.getState().screens.page.htmlContent;window.__sourceFixture.original=original;window.__sourceFixture.binding=structuredClone(s.designLibraryBinding);
    localStorage.setItem('source-authoring-original',JSON.stringify({html:original,binding:s.designLibraryBinding}));return {html:original,binding:s.designLibraryBinding};
   }''')
   await panel.get_by_role('button',name='编辑源库：选择来源工程',exact=True).click()
   await page.get_by_label('源库编辑预览',exact=True).wait_for()
   assert await page.evaluate('window.__sourceFixture.writes.length')==0
   assert await page.evaluate('window.__projectStore.getState().id')==fixture['id']
   await page.get_by_role('button',name='取消源库编辑',exact=True).click()
   await panel.get_by_role('button',name='编辑源库：选择来源工程',exact=True).click()
   await page.get_by_label('源库编辑预览',exact=True).wait_for()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-preview')))
   await page.get_by_role('button',name='确认进入源库编辑',exact=True).click()
   banner=page.get_by_role('region',name='源库编辑状态',exact=True)
   await banner.get_by_text('正在编辑源库「品牌源设计库」',exact=True).wait_for()
   assert await page.evaluate('window.__projectStore.getState().id')==fixture['sourceId']
   assert await page.get_by_text('设计库来源与使用方式',exact=True).count()==0
   await page.frame_locator('iframe[title="源样张"]').get_by_role('button',name='源库按钮',exact=True).wait_for()
   panel=await theme()
   brand=page.get_by_label('自定义品牌主色',exact=True)
   assert await brand.is_enabled()
   await brand.fill('#8b5cf6')
   await page.evaluate('window.__projectStore.getState().saveProjectChecked()')
   # Close the editor through its actual close button, then configure the source component.
   await page.get_by_role('button',name='完成',exact=True).click()
   resource=page.get_by_role('button',name='资源',exact=True)
   if await resource.get_attribute('aria-pressed')!='true':await resource.click()
   await page.get_by_role('button',name='资源中心（上传 / AI 生成）',exact=True).click()
   editor=page.get_by_role('region',name='品牌资料卡复用约束',exact=True)
   await editor.get_by_role('button',name='配置复用约束',exact=True).click()
   await editor.get_by_role('textbox',name='组件模板 HTML',exact=True).fill('<article class="card p-6"><p data-slot="name">默认姓名</p></article>')
   await editor.get_by_role('button',name='保存复用约束',exact=True).click()
   await editor.get_by_text('v2 · 模板与插槽校验',exact=True).wait_for()
   await page.evaluate('window.__projectStore.getState().saveProjectChecked()')
   edited=await page.evaluate('''async()=>{
    const s=window.__projectStore.getState(),f=window.__sourceFixture,raw=JSON.parse(localStorage.getItem('source-authoring-fs:project.json'));
    const {readProject}=await window.__module('/src/utils/projectRegistry.ts'),consumer=JSON.parse(readProject(f.id)),original=JSON.parse(localStorage.getItem('source-authoring-original'));
    if(raw.components.card.version!==2||raw.designSystem.tokens.colors.primary['500']!=='#8b5cf6')throw Error('Source edits not saved');
    if(JSON.stringify(consumer.designLibraryBinding)!==JSON.stringify(original.binding)||consumer.screens.page.htmlContent!==original.html)throw Error('Consumer silently updated');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');useHistoryStore.getState().undo();if(window.__projectStore.getState().components.card.version!==1)throw Error('Source undo');useHistoryStore.getState().redo();if(window.__projectStore.getState().components.card.version!==2)throw Error('Source redo');
    return {sourceVersion:2,color:raw.designSystem.tokens.colors.primary['500'],consumerUntouched:true,sourceUndoRedo:true,writtenFiles:f.writes};
   }''')
   await page.get_by_text('工程资源与组件中心 (Assets & Components)',exact=True).locator('..').locator('..').get_by_role('button').click()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-editing')))
   await banner.get_by_role('button',name='保存并返回「消费项目」',exact=True).click()
   await page.wait_for_function('window.__projectStore.getState().id===window.__sourceFixture.id')
   await page.get_by_role('region',name='源库编辑状态',exact=True).wait_for(state='detached')
   assert await page.evaluate('JSON.stringify(window.__projectStore.getState().designLibraryBinding)===JSON.stringify(JSON.parse(localStorage.getItem("source-authoring-original")).binding)')
   panel=await theme()
   assert await page.get_by_label('自定义品牌主色',exact=True).is_disabled()
   await panel.get_by_role('button',name='检查并更新参考',exact=True).click()
   await page.get_by_role('button',name='确认固定版本参考',exact=True).wait_for()
   await page.screenshot(path=str(args.screenshot))
   assert await page.evaluate('window.__projectStore.getState().components[Object.keys(window.__projectStore.getState().components)[0]].version')==1
   await page.get_by_role('button',name='确认固定版本参考',exact=True).click()
   await page.wait_for_function('window.__projectStore.getState().components[Object.keys(window.__projectStore.getState().components)[0]].version===2')
   updated=await page.evaluate('''()=>{
    const s=window.__projectStore.getState(),original=JSON.parse(localStorage.getItem('source-authoring-original'));
    if(s.screens.page.htmlContent!==original.html||s.designLibraryBinding.sourceFingerprint===original.binding.sourceFingerprint||s.designSystem.tokens.colors.primary['500']!=='#8b5cf6')throw Error('Explicit reference update changed instances or lost source edits');
    if(JSON.stringify(s.designLibraryBinding).includes('/virtual/'))throw Error('Source location leaked to binding');return {binding:s.designLibraryBinding,instancesUnchanged:true};
   }''')
   await page.reload(wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)');await page.evaluate(INSTALL)
   reopened=await page.evaluate('''async fixture=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');if(!useWorkspaceStore.getState().openProject(fixture.id))throw Error('Reopen');
    const s=window.__projectStore.getState(),source=JSON.parse(localStorage.getItem('source-authoring-fs:project.json'));
    if(useWorkspaceStore.getState().sourceEditing||s.designLibraryBinding.mode!=='pinned_reference'||source.components.card.version!==2||s.components[Object.keys(s.components)[0]].version!==2)throw Error('Reload lost or revived source session');
    return {temporarySessionCleared:true,sourceVersion:source.components.card.version,referenceVersion:Object.values(s.components)[0].version};
   }''',fixture)
   await page.frame_locator('iframe[title="消费页面"]').get_by_text('默认姓名',exact=True).wait_for()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-reopened')))
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'real UI/store/history/iframe; file IPC fixture backed by browser localStorage, not native dialog or real source folder; no AI calls','previewWrites':0,'cancelledPreview':True,'edited':edited,'updated':updated,'reopened':reopened,'pageErrors':errors}
   args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps({'status':'passed','browser':args.browser,'sourceVersion':2,'previewWrites':0,'consumerUntouchedUntilConfirmation':True,'pageErrors':errors},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
   print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4500:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');parser.add_argument('--screenshot',type=Path,default=Path('/tmp/library-source.png'));parser.add_argument('--report',type=Path,default=Path('/tmp/library-source.json'));asyncio.run(main(parser.parse_args()))
