#!/usr/bin/env python3
"""Exercise actual migration UI/store/readers with local file IPC fixture; no AI or native dialog/capture."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
INSTALL=r'''()=>{
 window.__bundle={picks:0,writes:[]};
 window.__TAURI_INTERNALS__={invoke:async(cmd,params)=>{
  const f=window.__bundle,prefix='bundle-target:';
  if(cmd==='plugin:dialog|open'){
   f.picks++;const id=window.__projectStore.getState().id;
   f.source=Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('aidesign:fs:'+id+':')||key==='ai_designer_history_'+id).map(key=>[key,localStorage.getItem(key)]));
   return f.nextRoot||'/virtual/bundle.aidesign';
  }
  if(!['/virtual/bundle.aidesign','/virtual/failure.aidesign'].includes(params?.root))throw Error('Not a filesystem fixture: '+cmd);
  const rel=params.rel||'',key=(params.root==='/virtual/failure.aidesign'?'bundle-failure:':prefix)+rel;
  if(cmd==='project_read_text'||cmd==='project_read_binary')return localStorage.getItem(key);
  if(cmd==='project_exists')return localStorage.getItem(key)!==null;
  if(cmd==='project_ensure_dir')return;
  if(cmd==='project_write_text_atomic'){if(params.root==='/virtual/failure.aidesign'&&rel==='conversations/index.json')throw Error('simulated disk full');f.writes.push(rel);localStorage.setItem(key,params.contents);return;}
  if(cmd==='project_write_binary'){f.writes.push(rel);localStorage.setItem(key,params.base64Data);return;}
  if(cmd==='project_delete'){localStorage.removeItem(key);return;}
  if(cmd==='project_list_dir'&&params.root==='/virtual/failure.aidesign')return [];
  if(cmd==='project_list_dir')return Object.keys(localStorage).filter(k=>k.startsWith(prefix+rel.replace(/\/$/,'')+'/')).map(k=>k.slice((prefix+rel.replace(/\/$/,'')+'/').length));
  if(cmd==='project_append_line'){localStorage.setItem(key,(localStorage.getItem(key)||'')+params.line+'\n');return;}
  if(cmd==='project_read_all_lines'||cmd==='project_read_tail_lines'){const lines=(localStorage.getItem(key)||'').split('\n').filter(Boolean);return cmd==='project_read_tail_lines'?lines.slice(-params.limit):lines;}
  throw Error('Unsupported native operation '+cmd);
 }};
}'''
async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN');errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  args.artifacts.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   seed=await page.evaluate(r'''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts'),{useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const s=window.__projectStore,id=s.getState().initNewProject({name:'完整档案迁移',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
    const html='<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title" class="text-xl">迁移档案验证</h1><button data-nid="action" class="btn btn-primary">提交</button></main>';
    s.getState().addScreen({name:'资料页',htmlContent:html,position:{x:0,y:0}},'page');useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
    s.getState().stageScreenChange('page',html.replace('>提交</button>','>确认提交</button>'),'第一候选','确认按钮文案');return {id};
   }''')
   await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
   await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).last.click()
   await page.wait_for_function('window.__projectStore.getState().stagedScreen===null')
   await page.evaluate(r'''async()=>{
    const {acceptRestyleResult}=await window.__module('/src/services/ai/restyleService.ts');const s=window.__projectStore.getState();
    const outcome=acceptRestyleResult({kind:'screen',id:'page',name:'资料页',html:s.screens.page.htmlContent},s.screens.page.htmlContent.replace('p-4','p-6'),{designSystem:s.designSystem,deviceProfile:'mobile'});
    const result=await s.applyRestyleOutcome(outcome);if(!result.applied)throw Error(JSON.stringify(result));
    window.__projectStore.getState().stageScreenChange('page',window.__projectStore.getState().screens.page.htmlContent.replace('确认提交','再次确认'),'待采纳候选','再次确认按钮');
   }''')
   await page.wait_for_function("window.__projectStore.getState().stagedPreview?.report?.status==='ready'&&!window.__projectStore.getState().stagedPreview?.pending&&window.__projectStore.getState().stagedCandidateSaveStatus==='saved'")
   archives=await page.evaluate(r'''async()=>{
    const s=window.__projectStore.getState(),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts'),storage=createProjectStorage(s.id);
    const {DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts'),{RestyleDeliveryRepository}=await window.__module('/src/services/storage/restyleDeliveryRepository.ts');
    const delivery=(await new DeliveryRepository(storage,s.id).listForScreen('page')).records[0],restyle=(await new RestyleDeliveryRepository(storage,s.id).list()).records[0];
    if(delivery.preview.status!=='ready'||restyle.pages[0].preview.status!=='ready')throw Error('Preview missing before migration');
    const removed=structuredClone(delivery);removed.id=delivery.id+'-deleted';removed.status='prepared';removed.before.id=removed.after.id='removed-page';removed.preview.relPath=`assets/images/delivery-preview-${removed.id}.png`;
    await storage.writeBinary(removed.preview.relPath,await storage.readBinary(delivery.preview.relPath));const repo=new DeliveryRepository(storage,s.id);await repo.prepare(removed);await repo.finish(removed,'applied');
    const {ConversationStore}=await window.__module('/src/services/storage/conversationStore.ts'),conv=new ConversationStore(storage);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');ctx.fillStyle='#eb4466';ctx.fillRect(0,0,16,16);await storage.writeBinary('assets/images/conversation.png',canvas.toDataURL('image/png').split(',')[1]);
    for(const [month,text] of [[8,'迁移会话第一月'],[9,'迁移会话第二月']])if(!await conv.appendTurn({turnId:'turn-'+month,ts:new Date(2026,month,25).getTime(),user:{text,attachments:['assets/images/conversation.png']},assistant:{text:'该记录必须保留'}}))throw Error('Conversation seed failed');
    await storage.appendLine('conversations/2026-10.jsonl','{broken row');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');localStorage.setItem('bundle-id',s.id);
    return {deliveryId:delivery.id,deletedDeliveryId:removed.id,restyleId:restyle.id,candidateId:s.stagedScreen.candidateId,historyCount:useHistoryStore.getState().past.length,previewPaths:[delivery.preview.relPath,restyle.pages[0].preview.relPath,s.stagedPreview.report.relPath,removed.preview.relPath]};
   }''')
   await page.evaluate(r'''async()=>{const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');useWorkspaceStore.getState().backToManager();}''')
   await page.evaluate(INSTALL)
   await page.get_by_role('button',name='迁移',exact=True).click()
   await page.get_by_text('已迁移',exact=False).wait_for()
   notice=await page.get_by_text('已迁移',exact=False).inner_text();assert '损坏记录' in notice,notice
   copied=await page.evaluate(r'''async archives=>{
    const id=localStorage.getItem('bundle-id'),source=window.__bundle.source;
    for(const [key,value] of Object.entries(source)){
     if(localStorage.getItem(key)!==value)throw Error('Source altered: '+key);
     const rel=key.startsWith('ai_designer_history_')?'history.json':key.slice(('aidesign:fs:'+id+':').length);
     if(localStorage.getItem('bundle-target:'+rel)!==value)throw Error('Archive lost or changed: '+rel);
    }
    const {listProjects}=await window.__module('/src/utils/projectRegistry.ts');if(listProjects().find(p=>p.id===id).folderPath!=='/virtual/bundle.aidesign')throw Error('Location not published');
    if(JSON.stringify(JSON.parse(localStorage.getItem('bundle-target:project.json'))).includes('再次确认'))throw Error('Candidate leaked into current page');
    return {files:Object.keys(source).length,sourceUnchanged:true,folderPublished:true,notice:'corrupt row preserved'};
   }''',archives)
   await page.screenshot(path=str(args.artifacts/'migrated.png'))
   await page.reload(wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)');await page.evaluate(INSTALL)
   reopened=await page.evaluate(r'''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const store=window.__projectStore,restore=store.getState().restoreStagedCandidate;
    store.setState({restoreStagedCandidate:(...args)=>{const result=restore(...args),s=store.getState();window.__restoration={renderCleared:s.stagedRenderQuality===null,status:s.getStagedDeliveryReport().status};return result;}});
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');const result=await useWorkspaceStore.getState().openLocalFolder();if(!result.ok)throw Error(result.message);
    const s=store.getState(),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts'),storage=createProjectStorage(s.id,s.folderPath);
    const {DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts'),{RestyleDeliveryRepository}=await window.__module('/src/services/storage/restyleDeliveryRepository.ts'),{ConversationStore}=await window.__module('/src/services/storage/conversationStore.ts'),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    const delivery=(await new DeliveryRepository(storage,s.id).listForScreen('page')).records,deleted=(await new DeliveryRepository(storage,s.id).listForScreen('removed-page')).records,restyle=(await new RestyleDeliveryRepository(storage,s.id).list()).records,turns=await new ConversationStore(storage).loadRecent();
    if(delivery.length!==1||deleted.length!==1||restyle.length!==1||turns.length!==2||!s.stagedScreen)throw Error('Restored archive counts wrong');
    const paths=[delivery[0].preview.relPath,deleted[0].preview.relPath,restyle[0].pages[0].preview.relPath,s.stagedScreen.preview.relPath,'assets/images/conversation.png'];
    for(const path of paths){const image=new Image();image.src='data:image/png;base64,'+await storage.readBinary(path);await image.decode();}
    return {delivery:delivery[0].id,deleted:deleted[0].id,restyle:restyle[0].id,turns:turns.map(t=>t.user.text),candidateId:s.stagedScreen.candidateId,historyCount:useHistoryStore.getState().past.length,decodedImages:paths.length,restoration:window.__restoration};
   }''')
   assert reopened['candidateId']==archives['candidateId'] and reopened['historyCount']==archives['historyCount']
   assert reopened['restoration']=={'renderCleared':True,'status':'blocked'},reopened
   await page.wait_for_function("window.__projectStore.getState().stagedRenderQuality?.report.status==='complete'")
   assert await page.evaluate("window.__projectStore.getState().getStagedDeliveryReport().status==='blocked'")
   for name in ['采纳新版 (替换原版)','两版都留']:
    assert await page.get_by_role('button',name=name,exact=True).last.is_disabled()
   assert not await page.evaluate('window.__projectStore.getState().forceAdoptStagedChange()')
   await page.get_by_text('查看验收记录',exact=True).click()
   # Historical preview remains independently decodable even when current context is blocked.
   await page.get_by_label('候选首屏预览',exact=True).get_by_role('img').first.evaluate('(img)=>img.decode()')
   await page.screenshot(path=str(args.artifacts/'reopened.png'))
   await page.get_by_text('迁移会话第二月',exact=True).wait_for()
   failures=await page.evaluate(r"""async()=>{
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts'),{neutralModernTheme}=await window.__module('/src/utils/themePresets.ts'),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts'),{ConversationStore}=await window.__module('/src/services/storage/conversationStore.ts'),{listProjects,readProject}=await window.__module('/src/utils/projectRegistry.ts');
    const firstProject=localStorage.getItem('bundle-target:project.json'),out=[];
    for(const kind of ['conflict','disk-full']){
     const s=window.__projectStore,id=s.getState().initNewProject({name:'失败验证-'+kind,deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
     s.getState().addScreen({name:'原页',htmlContent:'<main class="p-4">失败时原页必须保留</main>'},'original');
     useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
     await new ConversationStore(createProjectStorage(id)).appendTurn({turnId:kind,ts:new Date(2026,9,25).getTime(),user:{text:'原始会话'},assistant:{text:'必须保留'}});
     useWorkspaceStore.getState().backToManager();window.__bundle.nextRoot=kind==='conflict'?'/virtual/bundle.aidesign':'/virtual/failure.aidesign';
     const result=await useWorkspaceStore.getState().migrateProject(id);
     if(result.ok||listProjects().find(p=>p.id===id).folderPath)throw Error('Failure published location');
     if(!readProject(id)||!(await createProjectStorage(id).readText('conversations/2026-10.jsonl')).includes('原始会话'))throw Error('Failure lost original');
     if(localStorage.getItem('bundle-target:project.json')!==firstProject)throw Error('Conflict overwrote migrated project');
     if(kind==='conflict'&&!result.message.includes('目标已有'))throw Error(result.message);
     if(kind==='disk-full'&&!result.message.includes('simulated disk full'))throw Error(result.message);
     out.push({kind,ok:result.ok,sourceRetained:true,locationNotPublished:true,message:result.message});
    }return out;
   }""")
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'real UI/store/render/readers; filesystem IPC fixture backed by browser localStorage; no native dialogs or captures and no AI calls','notice':notice,'archives':archives,'copied':copied,'reopened':reopened,'freshRenderComplete':True,'migratedCandidateExpired':True,'allAdoptionModesBlocked':True,'failures':failures,'pageErrors':errors}
   (args.artifacts/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'status':'passed','browser':args.browser,'copiedFiles':copied['files'],'decodedImages':reopened['decodedImages']},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.artifacts/'failure.png'));print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-3500:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');parser.add_argument('--artifacts',type=Path,required=True);asyncio.run(main(parser.parse_args()))
