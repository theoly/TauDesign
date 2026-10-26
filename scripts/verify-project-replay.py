#!/usr/bin/env python3
"""Read-only real-project replay: repository migration, reopen, device snapshots and HTML/PNG exports.

Source folders are never written. Actual file IO for ProjectStorage is bridged to Python;
this exercises the real TS repository/export code, not Tauri dialogs or native PNG capture.
"""
from __future__ import annotations
import argparse
import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import platform
import shutil
import tempfile
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_file(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not relative or Path(relative).is_absolute() or root.resolve() not in path.parents:
        raise ValueError('File path must stay inside its assigned project folder')
    if any(part in ('.', '..') for part in relative.split('/')):
        raise ValueError('Noncanonical project path')
    return path


def source_snapshot(root: Path) -> dict[str, str]:
    """Only render/migration inputs, excluding unrelated conversations and transient locks."""
    document = json.loads((root / 'project.json').read_text())
    paths = {'project.json'}
    if (root / 'assets').exists():
        paths.update(str(path.relative_to(root)) for path in (root / 'assets').rglob('*') if path.is_file())
    for screen_id in document.get('screens', {}):
        paths.add(f'screens/{screen_id}.html')
        css = f'screens/{screen_id}.css'
        if safe_file(root, css).exists():
            paths.add(css)
    for meta in document.get('projectDocuments', {}).values():
        for key in ('contentFile', 'originalFile'):
            if meta.get(key): paths.add(meta[key])
        if not meta.get('contentFile'): paths.add(f'documents/{meta["id"]}.md')
    assets = document.get('assets', {})
    for asset in assets.values() if isinstance(assets, dict) else assets:
        paths.add(asset['relPath'])
    return {path: digest(safe_file(root, path).read_bytes()) for path in sorted(paths)}


def baseline_identity(environment: dict, source: str, screen_id: str, viewport: dict) -> dict:
    return {'environment': environment, 'source': source, 'screenId': screen_id, 'viewport': viewport}


def assert_baseline_identity(expected: dict, actual: dict) -> None:
    if expected != actual:
        raise ValueError('Baseline environment/source/page/device changed; review and explicitly update the baseline')


def png_health(path: Path, size: tuple[int, int]) -> dict:
    with Image.open(path) as image:
        if image.size != size: raise ValueError(f'PNG size mismatch: {image.size} != {size}')
        colors = image.convert('RGB').resize((96, 96)).getcolors(96*96)
        dominant = max(count for count, _ in colors) / (96*96)
        if dominant > .995: raise ValueError('PNG is effectively blank')
        return {'size': list(image.size), 'dominantColorRatio': round(dominant, 6)}


async def main(args) -> int:
    source = args.project.resolve()
    output = args.artifacts.resolve()
    baselines = args.baselines.resolve()
    if source == output or source in output.parents or source == baselines or source in baselines.parents:
        raise ValueError('Outputs and baselines must not be inside the source project')
    before = source_snapshot(source)
    source_hash = digest(json.dumps(before, sort_keys=True).encode())
    output.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'sourceFingerprint': source_hash, 'sourceFileCount': len(before),
              'scope': 'real project files read only; real TS repository/store/iframe documents/exports; Python filesystem bridge in temporary target; no native dialogs/capture or AI', 'cases': []}
    spec = importlib.util.spec_from_file_location('compare_visual', Path(__file__).with_name('compare-visual.py'))
    comparison = importlib.util.module_from_spec(spec); spec.loader.exec_module(comparison)
    with tempfile.TemporaryDirectory(prefix='taudesign-replay-') as temp:
        target = Path(temp)
        async with async_playwright() as p:
            browser = await getattr(p, args.browser).launch(headless=True)
            report['environment'] = environment = {'browser': args.browser, 'version': browser.version,
                 'platform': platform.system(), 'release': platform.release(), 'machine': platform.machine(), 'scale': 1, 'locale': 'zh-CN'}
            environment_key = f'{platform.system()}-{platform.release()}-{platform.machine()}/{args.browser}-{browser.version}'
            baseline_root = baselines / environment_key
            manifest_path = baseline_root / 'manifest.json'
            manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'version': 1, 'cases': {}}
            if manifest.get('version') != 1: raise ValueError('Unsupported baseline manifest')
            staged_baselines = {}
            context = await browser.new_context(viewport={'width': 1600, 'height': 1000}, locale='zh-CN', device_scale_factor=1)
            page = await context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            async def file_io(params):
                root = source if params['root'] == 'source' else target if params['root'] == 'target' else None
                if root is None: raise ValueError('Unknown assigned project')
                path = safe_file(root, params['rel'])
                op = params['op']
                if op in ('text', 'binary'):
                    if not path.is_file(): return None
                    return path.read_text() if op == 'text' else base64.b64encode(path.read_bytes()).decode()
                if op == 'exists': return path.exists()
                if params['root'] == 'source': raise ValueError('Source writes are forbidden')
                if op == 'dir': path.mkdir(parents=True, exist_ok=True); return
                if op in ('write', 'writeBinary'):
                    path.parent.mkdir(parents=True, exist_ok=True)
                    temporary = path.with_name(path.name+'.pending')
                    temporary.write_bytes(params['text'].encode() if op == 'write' else base64.b64decode(params['text'], validate=True))
                    os.replace(temporary, path); return
                if op == 'remove': path.unlink(missing_ok=True); return
                raise ValueError('Unsupported IO operation')
            await page.expose_function('__replayIO', file_io)
            try:
                await page.goto(args.url, wait_until='networkidle'); await page.wait_for_function('Boolean(window.__projectStore)')
                environment['fontMetrics'] = await page.evaluate(r'''()=>{const c=document.createElement('canvas').getContext('2d');return ['Arial','PingFang SC','system-ui'].map(font=>{c.font=`16px "${font}"`;return {font,width:c.measureText('TauDesign 会员资料 012345').width};});}''')
                initial = await page.evaluate(r'''async()=>{
                  window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
                  window.__replayStorage=root=>({kind:'folder',readText:rel=>window.__replayIO({root,rel,op:'text'}),readBinary:rel=>window.__replayIO({root,rel,op:'binary'}),exists:rel=>window.__replayIO({root,rel,op:'exists'}),ensureDir:rel=>window.__replayIO({root,rel,op:'dir'}),writeTextAtomic:(rel,text)=>window.__replayIO({root,rel,text,op:'write'}),writeBinary:(rel,text)=>window.__replayIO({root,rel,text,op:'writeBinary'}),remove:rel=>window.__replayIO({root,rel,op:'remove'})});
                  const {ProjectRepository,migrateProjectToFolder}=await window.__module('/src/services/storage/projectRepository.ts');
                  const source=window.__replayStorage('source'),target=window.__replayStorage('target'),doc=await new ProjectRepository(source).load();
                  if(!doc)throw Error('Source project unreadable');
                  window.__replaySource=doc;const migration=await migrateProjectToFolder(JSON.stringify(doc),target,source);
                  if(!migration.ok)throw Error(migration.error);
                  const reopened=await new ProjectRepository(target).load();
                  if(Object.keys(reopened.screens).length!==Object.keys(doc.screens).length)throw Error('Reopen lost pages');
                  if(JSON.stringify(reopened.overrides)!==JSON.stringify(doc.overrides))throw Error('Reopen lost overrides');
                  window.__replayReopened=reopened;
                  const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
                  window.__projectStore.getState().loadProjectDocument(reopened);useWorkspaceStore.setState({view:'workspace',activeProjectId:reopened.id});
                  return {projectId:doc.id,name:doc.name,profile:doc.settings.deviceProfile,screenCount:migration.screenCount,screens:Object.values(doc.screens).map(s=>({id:s.id,name:s.name})),migrated:true,reopened:true};
                }''')
                report['project'] = initial
                selected = args.screen or [screen['id'] for screen in initial['screens'][:3]]
                devices = args.device or (['mobile-compact','mobile-standard','mobile-tall'] if initial['profile']=='mobile' else ['pc-laptop','pc-standard'])
                valid_ids = {screen['id'] for screen in initial['screens']}
                if any(screen not in valid_ids for screen in selected): raise ValueError('Selected screen does not exist')
                for screen_id in selected:
                    for device in devices:
                        built = await page.evaluate(r'''async({screenId,device})=>{
                          const s=window.__projectStore.getState();s.setReferenceDevice(device);s.setActiveScreen(screenId);
                          const state=window.__projectStore.getState(),screen=state.screens[screenId];
                          if(state.settings.referenceDevice?.id!==device)throw Error('Wrong device/profile');
                          const {resolveProjectViewport}=await window.__module('/src/utils/referenceDevice.ts');
                          const {compileTokensToCss}=await window.__module('/src/utils/cssCompiler.ts');const {getBaseCss}=await window.__module('/src/styles/baseCss.ts');
                          const {resolveImportedResources}=await window.__module('/src/services/import/importResources.ts');
                          const {buildScreenDocument}=await window.__module('/src/utils/screenDocument.ts');
                          const {buildStandaloneHtml}=await window.__module('/src/utils/exportRenderer.ts');
                          const {exportScreenPng}=await window.__module('/src/utils/pngExporter.ts');
                          const {resolveThemeColors}=await window.__module('/src/utils/semanticColors.ts');
                          const viewport=resolveProjectViewport(state.settings),allowed=new Set(Object.values(state.assets).map(a=>a.relPath));
                          const resources=await resolveImportedResources(screen.htmlContent,screen.scopedCss,window.__replayStorage('target'),allowed);
                          let screenOverrides=Object.entries(state.overrides).filter(([key])=>key.startsWith(screenId+':')).map(([,o])=>`[data-nid="${o.nid}"]{${Object.entries(o.declarations).filter(([,v])=>v!==''&&v!==null&&v!==undefined).map(([p,v])=>`${p}:${v} !important`).join(';')}}`).join('\n');
                          screenOverrides=(await resolveImportedResources('<body></body>',screenOverrides,window.__replayStorage('target'),allowed)).scopedCss||'';
                          const resolved={...screen,...resources},options={tokensCss:compileTokensToCss(state.designSystem.tokens,state.settings.colorMode),baseCss:getBaseCss(state.settings.deviceProfile),screenOverrides,deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,viewportWidth:viewport.width,viewportHeight:viewport.height};
                          const {PageRenderCheck}=await window.__module('/src/services/ai/pageRenderCheck.ts');
                          const quality=await PageRenderCheck.inspect({screen,designSystem:state.designSystem,settings:state.settings,assets:Object.values(state.assets),overrides:Object.fromEntries(Object.entries(state.overrides).filter(([key])=>key.startsWith(screenId+':')))},window.__replayStorage('target'));
                          if(quality.status!=='complete')throw Error('Actual render check incomplete: '+quality.reason);
                          const canvas=buildScreenDocument(resolved,{...options,includeMobileChrome:true,staticImage:true});
                          const html=buildStandaloneHtml(resolved,options);
                          const png=await exportScreenPng(resolved,{...options,width:viewport.width,scale:1,clipToHeight:true,clipHeight:viewport.height,bgColor:resolveThemeColors(state.designSystem.tokens,state.settings.colorMode).values.background},{isNativeAvailable:()=>false});
                          return {canvas,html,quality,png:png.dataUrl,engine:png.engine,viewport,name:screen.name,sourceUnchanged:state.screens[screenId].htmlContent===window.__replayReopened.screens[screenId].htmlContent};
                        }''', {'screenId': screen_id, 'device': device})
                        if not built['sourceUnchanged']: raise ValueError('Device/export mutated authored HTML')
                        key = f'{screen_id}-{device}'
                        case_dir = output / key;case_dir.mkdir(exist_ok=True)
                        viewport = built['viewport']
                        png_path = case_dir / 'export.png'
                        png_path.write_bytes(base64.b64decode(built['png'].split(',',1)[1]))
                        health = png_health(png_path, (viewport['width'],viewport['height']))
                        (case_dir / 'export.html').write_text(built['html'])
                        render = await context.new_page()
                        await render.set_viewport_size({'width':viewport['width'],'height':viewport['height']})
                        resource_errors = []
                        render.on('requestfailed', lambda request: resource_errors.append(request.url))
                        render.on('pageerror', lambda error: resource_errors.append(str(error)))
                        await render.set_content(built['canvas'],wait_until='load')
                        await render.evaluate('document.fonts.ready')
                        await render.locator('img').evaluate_all('async images=>Promise.all(images.map(image=>image.decode()))')
                        geometry = await render.evaluate('''()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,chrome:document.querySelectorAll('[data-taudesign-mobile-chrome]').length,text:document.body.innerText.length,controls:Array.from(document.querySelectorAll('button,a')).filter(e=>getComputedStyle(e).display!=='none').map(e=>({nid:e.getAttribute('data-nid'),text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.text).slice(0,50)})''')
                        if resource_errors or geometry['text'] < 20: raise ValueError(f'Incomplete render: {resource_errors}')
                        canvas_path = case_dir / 'canvas.png'
                        await render.screenshot(path=str(canvas_path),full_page=True,animations='disabled',caret='hide')
                        await render.set_content(built['html'],wait_until='load');await render.evaluate('document.fonts.ready')
                        await render.locator('img').evaluate_all('async images=>Promise.all(images.map(image=>image.decode()))')
                        exported = await render.evaluate('''()=>({chrome:document.querySelectorAll('[data-taudesign-mobile-chrome]').length,runtimeViewport:document.querySelectorAll('style[data-taudesign-runtime="viewport"]').length,text:document.body.innerText.length,controls:Array.from(document.querySelectorAll('button,a')).map(e=>e.textContent.trim()).filter(Boolean)})''')
                        if exported['chrome'] or exported['runtimeViewport'] or exported['text'] < 20: raise ValueError('HTML export contains runtime device chrome or lost content')
                        if resource_errors: raise ValueError(f'Export resources incomplete: {resource_errors}')
                        # All authored nonempty action labels survive; chrome back/capsule labels are excluded by NID.
                        if any(control['nid'] and control['text'] not in exported['controls'] for control in geometry['controls']): raise ValueError('HTML export lost action label')
                        await render.screenshot(path=str(case_dir/'html.png'),full_page=True,animations='disabled',caret='hide')
                        await render.close()
                        identity = baseline_identity(environment, source_hash, screen_id, viewport)
                        case = {'id':key,'name':built['name'],'device':device,'viewport':viewport,'geometry':geometry,'quality':built['quality'],'html':exported,'png':{'engine':built['engine'],**health},'comparisons':{}}
                        previous = manifest['cases'].get(key)
                        if not args.update_baseline:
                            if not previous: raise ValueError(f'No baseline for {key}; explicitly initialize after review')
                            assert_baseline_identity(previous['identity'],identity)
                        for kind,actual in [('canvas',canvas_path),('png',png_path),('html',case_dir/'html.png')]:
                            reference = baseline_root / f'{key}-{kind}.png'
                            if args.update_baseline:
                                staged_baselines[reference] = actual
                                case['comparisons'][kind] = {'status':'baseline_initialized','reference':str(reference)}
                            else:
                                if not reference.is_file() or digest(reference.read_bytes())!=previous['images'][kind]: raise ValueError(f'Baseline missing/tampered: {reference}')
                                metrics=comparison.compare(reference,actual,case_dir/f'{kind}-diff.png',12)
                                passed=metrics['size_matches'] and metrics['changed_pixel_ratio']<=args.threshold
                                case['comparisons'][kind]={'status':'passed' if passed else 'failed',**metrics}
                        report['cases'].append(case)
                        if args.update_baseline:
                            manifest['cases'][key]={'identity':identity,'images':{kind:digest(actual.read_bytes()) for kind,actual in [('canvas',canvas_path),('png',png_path),('html',case_dir/'html.png')]}}
                        print(json.dumps({'case':key,'status':'baseline_initialized' if args.update_baseline else 'checked'},ensure_ascii=False),flush=True)
                report['pageErrors']=errors
                if errors: raise ValueError('Application page errors')
                if source_snapshot(source)!=before: raise ValueError('Source changed during replay')
                report['sourceUnchanged']=True
                if args.update_baseline:
                    baseline_root.mkdir(parents=True,exist_ok=True)
                    for reference,actual in staged_baselines.items(): shutil.copyfile(actual,reference)
                    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
                    report['status']='baseline_initialized'
                else: report['status']='passed' if all(metric['status']=='passed' for case in report['cases'] for metric in case['comparisons'].values()) else 'failed'
            except Exception as error:
                report['status']='failed';report['reason']=str(error);report['pageErrors']=errors
                report['sourceUnchanged']=source_snapshot(source)==before
            finally:
                (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
                lines=['# Real project replay', '', f"Status: {report['status']}", f"Source SHA256: {source_hash}", f"Source unchanged: {report.get('sourceUnchanged')}", '', report['scope'], '', '| Page | Device | Render | Findings | Pixel checks |', '|---|---|---|---|---|']
                for case in report['cases']:
                    lines.append(f"| {case['name']} | {case['device']} | {case['quality']['status']} | {len(case['quality']['findings'])} | {', '.join(kind+': '+metric['status'] for kind,metric in case['comparisons'].items())} |")
                lines.extend(['', '## Existing source findings (diagnostic; regression PASS does not mean design defects absent)', ''])
                for case in report['cases']:
                    for finding in case['quality']['findings']:
                        lines.append(f"- {case['name']} / {case['device']} / {finding.get('nid')}: {finding['code']} — {finding['message']}")
                if report.get('reason'): lines.extend(['', str(report['reason'])])
                (output/'report.md').write_text('\n'.join(lines)+'\n')
                await browser.close()
    print(json.dumps({'status':report['status'],'cases':len(report['cases']),'report':str(output/'report.json'),'reason':report.get('reason')},ensure_ascii=False))
    return 0 if report['status'] in ('passed','baseline_initialized') else 1


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project',type=Path,required=True)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screen',action='append')
    parser.add_argument('--device',action='append')
    parser.add_argument('--artifacts',type=Path,required=True)
    parser.add_argument('--baselines',type=Path,default=Path('test/visual-baselines/real-project'))
    parser.add_argument('--threshold',type=float,default=.005)
    parser.add_argument('--update-baseline',action='store_true')
    args=parser.parse_args()
    if not 0<=args.threshold<=1: parser.error('threshold must be between 0 and 1')
    raise SystemExit(asyncio.run(main(args)))
