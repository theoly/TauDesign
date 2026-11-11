#!/usr/bin/env python3
"""Actual macOS Tauri acceptance on copies of supplied projects, with process restart.

No Provider calls and no source-project writes. Requires the authorized Vite server.
Unlike browser IO fixtures, all project writes/reads and PNG use real Rust IPC.
"""
import argparse
import hashlib
import json
import os
import platform
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def source_inputs():
    code="import{captureDesignInputs}from'./scripts/lib/designEvidenceInputs';process.stdout.write(JSON.stringify(await captureDesignInputs(process.cwd(),true)));"
    return json.loads(subprocess.run(['pnpm','exec','tsx','-e',code],cwd=ROOT,capture_output=True,text=True,check=True).stdout)


def snapshot(folder):
    result = {}
    for path in sorted(folder.rglob('*')):
        if path.is_symlink():
            raise ValueError('Symlinked projects require an explicitly materialized copy')
        if path.is_file():
            result[str(path.relative_to(folder))] = hashlib.sha256(path.read_bytes()).hexdigest()
    if 'project.json' not in result:
        raise ValueError('A project folder containing project.json is required')
    return result


def validate_output_paths(sources, output):
    for source in sources:
        if source == output or source in output.parents or output in source.parents:
            raise ValueError('Evidence must be separate from each source project')


def stop_owned_process(process):
    # Only this isolated process group, never an existing TauDesign instance.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    if process.poll() is None:
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=10)


def native_phase(root, phase, artifacts, timeout):
    report = root/f'native-{phase}-report.json'
    config = root/f'tauri-{phase}.json'
    url = 'http://127.0.0.1:5174/test/fixtures/design-native-acceptance.html?'+urlencode({'root':str(root),'phase':phase})
    config.write_text(json.dumps({'productName':'TauDesign Acceptance','identifier':'com.taudesign.acceptance',
        'build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},
        'app':{'windows':[{'label':'main','title':'TauDesign · Isolated Acceptance','url':url,'width':1200,'height':900}]},'bundle':{'active':False}}))
    with (artifacts/f'{phase}-process.log').open('x') as log:
        process = subprocess.Popen(['bunx','tauri','dev','--config',str(config),'--no-watch'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            deadline = time.monotonic()+timeout
            while not report.exists():
                if process.poll() is not None:
                    raise RuntimeError(f'Native {phase} exited before reporting')
                if time.monotonic()>deadline:
                    raise TimeoutError(f'Native {phase} did not report; no restart or fabricated success')
                time.sleep(.5)
            data = json.loads(report.read_text())
            shutil.copy2(report,artifacts/report.name)
            if data['status']!='passed' or data.get('runtime')!='real-tauri':
                raise RuntimeError(f'Native {phase} failed; see saved report')
            return data
        finally:
            stop_owned_process(process)


def main(args):
    if platform.system()!='Darwin':
        raise ValueError('This command verifies macOS; Windows/Linux remain explicit separate gaps')
    sources=[path.resolve() for path in args.project]
    output=args.output.resolve();validate_output_paths(sources,output)
    output.mkdir(parents=True,exist_ok=False)
    before=[snapshot(source) for source in sources];inputs=source_inputs()
    summary={'status':'running','scope':'real macOS Tauri project copies; save, process exit/restart, candidate gates and HTML/native PNG','sourceInputs':inputs,'inputsUnchanged':False,'originalsUnchanged':False,'sourceSnapshots':[{'path':str(source),'files':files} for source,files in zip(sources,before)],'platformGaps':['Windows native acceptance unavailable','Linux native acceptance unavailable'],'phases':[]}
    try:
        with tempfile.TemporaryDirectory(prefix='taudesign-m5-native-',dir='/private/tmp') as tmp:
            root=Path(tmp);projects=[]
            for i,source in enumerate(sources):
                copy=root/f'project-{i}';shutil.copytree(source,copy)
                data=json.loads((copy/'project.json').read_text())
                projects.append({'copyName':copy.name,'projectId':data['id'],'device':data['settings']['deviceProfile']})
            (root/'native-input.json').write_text(json.dumps({'projects':projects}))
            summary['phases'].append(native_phase(root,'save',output,args.timeout))
            # native_phase terminates and waits for its owned process group before reopening.
            summary['phases'].append(native_phase(root,'reopen',output,args.timeout))
            images=[]
            for item in projects:
                exports=root/item['copyName']/'exports';target=output/item['copyName'];target.mkdir()
                for path in exports.glob('m5-*'):
                    shutil.copy2(path,target/path.name)
                    if path.suffix=='.png':
                        with Image.open(path) as image:
                            image.load();colors=image.convert('RGB').resize((96,96)).getcolors(96*96)
                            dominant=max(count for count,_ in colors)/(96*96)
                            if dominant>.995:raise ValueError('Native PNG is effectively blank')
                            images.append({'project':item['copyName'],'file':path.name,'width':image.width,'height':image.height,'dominantColorRatio':dominant})
            if len(images)!=len(projects)*2:raise ValueError('Missing required marker/existing-page PNG')
            summary['images']=images;summary['status']='passed'
    except BaseException as error:
        summary['status']='failed';summary['error']=type(error).__name__
        raise
    finally:
        summary['originalsUnchanged']=[snapshot(source) for source in sources]==before
        summary['inputsUnchanged']=source_inputs()==inputs
        if not summary['originalsUnchanged'] or not summary['inputsUnchanged']:summary['status']='failed'
        (output/'result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    if summary['status']!='passed':raise RuntimeError('Native acceptance failed')
    print(json.dumps({'status':summary['status'],'projects':len(sources),'images':len(summary['images']),'originalsUnchanged':True}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project',required=True,type=Path,action='append')
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--timeout',type=int,default=900)
    main(parser.parse_args())
