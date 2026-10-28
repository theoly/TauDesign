#!/usr/bin/env python3
"""Real store/iframe/repository/history regression; isolated browser storage, no native IO claim."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def main(args):
    args.report.parent.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await getattr(pw, args.browser).launch(headless=True)
        page = await browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            await page.goto(args.url, wait_until="networkidle")
            await page.wait_for_function("Boolean(window.__projectStore)")
            seed = await page.evaluate(r'''async () => {
              const module = path => import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {neutralModernTheme}=await module('/src/utils/themePresets.ts');
              const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
              const {useHistoryStore}=await module('/src/stores/useHistoryStore.ts');
              const {ProjectRepository}=await module('/src/services/storage/projectRepository.ts');
              const {LocalStorageStorage}=await module('/src/services/storage/projectStorage.ts');
              const {setTextByNid}=await module('/src/utils/textNode.ts');
              const {flushHistorySaveChecked}=await module('/src/services/storage/historyPersistence.ts');
              const store=window.__projectStore, assert=(ok,info)=>{if(!ok)throw Error(JSON.stringify(info));};
              const id=store.getState().initNewProject({name:'副本清单验收',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              store.getState().addScreen({name:'原页',entry:'screens/original.html',htmlContent:'<main class="p-4"><p>原页保持</p></main>'},'original');
              const design=screen=>({id:screen.id,entry:screen.entry,name:screen.name,position:screen.position,htmlContent:screen.htmlContent,scopedCss:screen.scopedCss??'',metadata:screen.metadata??{}});
              const original=structuredClone(design(store.getState().screens.original)), before=useHistoryStore.getState().past.length;
              const copyId=store.getState().duplicateScreen('original');
              const copy=store.getState().screens[copyId];
              assert(copy.entry===`screens/${copyId}.html`,copy);
              assert(useHistoryStore.getState().past.length===before+1,'copy must be one History entry');
              useHistoryStore.getState().undo();assert(!store.getState().screens[copyId],'undo copy failed');
              useHistoryStore.getState().redo();assert(store.getState().screens[copyId].entry===copy.entry,'redo entry failed');
              const p=new DOMParser().parseFromString(copy.htmlContent,'text/html').querySelector('p');
              store.getState().updateScreenHtml(copyId,setTextByNid(copy.htmlContent,p.getAttribute('data-nid'),'副本独立正文'),'修改副本文字');
              const state=store.getState(), storage=new LocalStorageStorage(id), repo=new ProjectRepository(storage);
              const doc={id,name:state.name,settings:state.settings,designSystem:state.designSystem,screens:structuredClone(state.screens),screenOrder:state.screenOrder,overrides:state.overrides};
              // Reproduce a legacy inherited entry in the saved snapshot as well.
              doc.screens[copyId].entry='screens/original.html';
              await repo.save(doc);await flushHistorySaveChecked(id);
              const index=JSON.parse(await storage.readText('project.json'));
              const manifest=JSON.parse(await storage.readText(`screens/${copyId}.manifest.json`));
              const body=await storage.readText(manifest.entry);
              assert(index.screens[copyId].entry===copy.entry&&manifest.entry===copy.entry,{index,manifest});
              assert(body.includes('副本独立正文')&&!body.includes('原页保持'),body);
              assert(JSON.stringify(design(store.getState().screens.original))===JSON.stringify(original),{error:'original changed',original,after:store.getState().screens.original});
              // Persist the old bug again; loading must correct metadata without writing.
              index.screens[copyId].entry='screens/original.html';
              await storage.writeTextAtomic('project.json',JSON.stringify(index));
              return {id,copyId,original,copyEntry:copy.entry,historyCount:useHistoryStore.getState().past.length,body};
            }''')
            await page.wait_for_function("Array.from(document.querySelectorAll('iframe')).some(f=>f.contentDocument?.body?.textContent.includes('副本独立正文'))")
            await page.reload(wait_until="networkidle")
            await page.wait_for_function("Boolean(window.__projectStore)")
            reopened = await page.evaluate(r'''async seed => {
              const module=path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {ProjectRepository}=await module('/src/services/storage/projectRepository.ts');
              const {LocalStorageStorage}=await module('/src/services/storage/projectStorage.ts');
              const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
              const {useHistoryStore}=await module('/src/stores/useHistoryStore.ts');
              const {loadHistoryForProject}=await module('/src/services/storage/historyPersistence.ts');
              const storage=new LocalStorageStorage(seed.id),repo=new ProjectRepository(storage);
              const indexBefore=await storage.readText('project.json'),doc=await repo.load();
              if(doc.screens[seed.copyId].entry!==seed.copyEntry||doc.screens[seed.copyId].htmlContent!==seed.body)throw Error('Legacy entry/body mismatch');
              if(await storage.readText('project.json')!==indexBefore)throw Error('Load unexpectedly wrote files');
              window.__projectStore.getState().loadProject(JSON.stringify(doc));
              useWorkspaceStore.setState({view:'workspace',activeProjectId:seed.id});
              await loadHistoryForProject(seed.id);
              if(useHistoryStore.getState().past.length!==seed.historyCount)throw Error('History missing after reload');
              useHistoryStore.getState().undo();
              if(window.__projectStore.getState().screens[seed.copyId].htmlContent.includes('副本独立正文'))throw Error('Undo text failed after reload');
              useHistoryStore.getState().redo();
              const state=window.__projectStore.getState();
              const original=state.screens.original;
              const originalDesign={id:original.id,entry:original.entry,name:original.name,position:original.position,htmlContent:original.htmlContent,scopedCss:original.scopedCss??'',metadata:original.metadata??{}};
              if(state.screens[seed.copyId].htmlContent!==seed.body)throw Error('Redo body failed');
              if(JSON.stringify(originalDesign)!==JSON.stringify(seed.original))throw Error(JSON.stringify({error:'Original design changed',before:seed.original,after:originalDesign}));
              await repo.save({...doc,screens:state.screens});
              const index=JSON.parse(await storage.readText('project.json')),manifest=JSON.parse(await storage.readText(`screens/${seed.copyId}.manifest.json`));
              if(index.screens[seed.copyId].entry!==seed.copyEntry||manifest.entry!==seed.copyEntry||await storage.readText(manifest.entry)!==seed.body)throw Error('Saved manifest incorrect');
              return {legacyLoadCorrected:true,loadWasReadOnly:true,manifestReadsCopy:true,originalPreserved:true,copyUndoRedo:true,textHistoryAfterReload:true};
            }''', seed)
            await page.wait_for_function("Array.from(document.querySelectorAll('iframe')).some(f=>f.contentDocument?.body?.textContent.includes('副本独立正文'))")
            if errors:
                raise AssertionError(errors)
            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(args.screenshot))
            result = {"status": "passed", "browser": args.browser, "scope": "Browser fallback storage, actual store/iframe/History/ProjectRepository; not native disk IO", **reopened, "pageErrors": errors}
            args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print(json.dumps(result, ensure_ascii=False), flush=True)
        finally:
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--url", default="http://127.0.0.1:5174")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--screenshot", type=Path)
    asyncio.run(main(parser.parse_args()))
