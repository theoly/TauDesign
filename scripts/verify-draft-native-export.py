#!/usr/bin/env python3
"""Actual macOS Tauri save/restart/native PNG on isolated accepted B and photograph copies.

No Provider, video samples, original project writes or mocked native renderer.
The photograph is a built-in macOS wallpaper thumbnail, not a private album.
"""
import argparse,hashlib,json,os,platform,shutil,signal,struct,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parents[1]
SAMPLES=ROOT/'doc/draft-targeted-repair/evidence/real-samples/2026-11-13'
MEDIA=ROOT/'doc/draft-targeted-repair/evidence/media-delivery'
ORIGINAL=Path('/Users/theoly/workspace/aqmf/aqmf-app-pub-design')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()

def phase_run(root,phase,output,timeout):
    report=root/f'report-{phase}.json';config=root/f'tauri-{phase}.json'
    url='http://127.0.0.1:5174/test/fixtures/draft-native-export.html?'+urlencode({'root':str(root),'phase':phase})
    config.write_text(json.dumps({'productName':'TauDesign Isolated Native Photo Acceptance','identifier':'com.taudesign.native-draft-photo',
        'build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},'app':{'windows':[{'label':'main','title':'TauDesign · Isolated Native Photo Export','url':url,'width':1100,'height':850}]},'bundle':{'active':False}}))
    with (output/f'{phase}-process.log').open('w') as log:
        process=subprocess.Popen(['pnpm','exec','tauri','dev','--config',str(config),'--no-watch'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            deadline=time.monotonic()+timeout
            while not report.exists():
                if process.poll() is not None:raise RuntimeError(f'{phase} exited before its real native report')
                if time.monotonic()>deadline:raise TimeoutError(f'{phase} did not report within {timeout}s')
                time.sleep(.5)
            value=json.loads(report.read_text());shutil.copy2(report,output/report.name)
            if value.get('runtime')!='real-tauri' or value.get('status')!='passed':raise RuntimeError(f'{phase}: {value.get("error","native validation failed")}')
            print(json.dumps({'phase':phase,'status':'passed','exports':value['exports']},ensure_ascii=False),flush=True)
            return value
        finally:
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                process.wait(timeout=10)

def main(args):
    if platform.system()!='Darwin':raise RuntimeError('This verifier requires actual macOS Tauri')
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    selected=json.loads((SAMPLES/'source-integrity.json').read_text())['before'];paths=[ORIGINAL/name for name in selected]
    before={str(p):sha(p) for p in paths}
    source_paths=['test/fixtures/draft-native-export.html','src/utils/nativeExport.ts','src/utils/pngExporter.ts','src/utils/exportRenderer.ts','src/utils/screenDocument.ts','src-tauri/src/png_export.rs','src-tauri/src/media_resource.rs']
    inputs={p:sha(ROOT/p) for p in source_paths}
    result={'status':'running','scope':__doc__.strip(),'sourceInputs':inputs,'phases':[],'videoSamples':'excluded by user','exports':[]}
    try:
        with tempfile.TemporaryDirectory(prefix='taudesign-draft-native-',dir='/private/tmp') as temporary:
            root=Path(temporary);(root/'project').mkdir();b=SAMPLES/'b-padded'
            manifest=json.loads((ORIGINAL/'project.json').read_text());context=json.loads((b/'context.json').read_text());assets=[]
            for asset in manifest['assets'].values():
                source=b/asset['relPath']
                if source.is_file():
                    target=root/asset['relPath'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assets.append(asset)
            shutil.copy2(b/'repaired.html',root/'accepted-b.html')
            files=json.loads((MEDIA/'media-manifest.json').read_text())['files'];photo=next(f for f in files if f['mimeType'].startswith('image/'))
            path=root/photo['relPath'];path.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(MEDIA/photo['file'],path)
            assets.append({'id':'native-photo','name':'系统海岸壁纸测试照片','type':'image','mimeType':photo['mimeType'],'source':'upload','relPath':photo['relPath'],'refCount':1})
            photo_html=f'<main class="p-4 col gap-4" data-nid="photo000"><h1 class="text-xl" data-nid="photo001">独立照片资源验收</h1><p data-nid="photo002">系统海岸壁纸，仅本机测试使用。</p><img data-nid="photo003" src="{photo["relPath"]}" alt="Big Sur海岸摄影照片" style="display:block;width:100%;height:auto"><button data-nid="photo004" class="btn btn-primary">保存照片</button></main>'
            (root/'photo-page.html').write_text(photo_html)
            (root/'input.json').write_text(json.dumps({'designSystem':context['designSystem'],'assets':assets,'probeMedia':[photo],
                'screens':[{'id':'accepted-b','name':'完善资料弹窗','inputFile':'accepted-b.html'},{'id':'photograph','name':'独立照片验收','inputFile':'photo-page.html'}]},ensure_ascii=False))
            for phase in ['save','reopen']:result['phases'].append(phase_run(root,phase,output,args.timeout))
            for path in sorted((root/'project/exports').iterdir()):
                shutil.copy2(path,output/path.name);item={'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size}
                if path.suffix=='.png':
                    data=path.read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n';item['width'],item['height']=struct.unpack('>II',data[16:24]);assert item['width']==390 and item['height']>500
                result['exports'].append(item)
            assert len([f for f in result['exports'] if f['file'].endswith('.png')])==4
            result['status']='passed'
    except BaseException as error:
        result['status']='failed';result['error']=str(error);raise
    finally:
        result['sourceInputsUnchanged']=inputs=={p:sha(ROOT/p) for p in source_paths};result['originalSourcesUnchanged']=before=={str(p):sha(p) for p in paths};result['originalSourceFileCount']=len(paths)
        if not result['sourceInputsUnchanged'] or not result['originalSourcesUnchanged']:result['status']='failed'
        (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    assert result['status']=='passed',result
    print(json.dumps({'status':'passed','nativePngFiles':4,'originalSourcesUnchanged':True}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path);parser.add_argument('--timeout',type=int,default=240);main(parser.parse_args())
