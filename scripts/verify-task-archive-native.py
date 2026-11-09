#!/usr/bin/env python3
"""Verify synthetic task bundle migration using real Tauri IPC and a process restart.

Only a newly allocated /private/tmp directory is writable; no Provider or user project.
"""
import argparse
import hashlib
import importlib.util
import json
import platform
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_driver',ROOT/'scripts/verify-design-native.py')
driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)


def source_inputs():
    inputs=driver.source_inputs()
    fixture='test/fixtures/task-archive-native.html'
    inputs[fixture]=hashlib.sha256((ROOT/fixture).read_bytes()).hexdigest()
    return inputs


def run_phase(root,phase,output,timeout,fixture='task-archive-native'):
    if fixture not in ['task-archive-native','project-snapshot-native','project-authoring-native']:raise ValueError('Unknown isolated native fixture')
    report=root/f'native-{phase}-report.json'
    config=root/f'tauri-{phase}.json'
    url=f'http://127.0.0.1:5174/test/fixtures/{fixture}.html?'+urlencode({'root':str(root),'phase':phase})
    config.write_text(json.dumps({'productName':'TauDesign Task Migration Acceptance','identifier':'com.taudesign.task-migration-acceptance','build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},'app':{'windows':[{'label':'main','title':'TauDesign · Isolated Task Migration','url':url,'width':1100,'height':800}]},'bundle':{'active':False}}))
    with (output/f'{phase}-process.log').open('x') as log:
        process=subprocess.Popen(['bunx','tauri','dev','--config',str(config),'--no-watch'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            deadline=time.monotonic()+timeout
            while not report.exists():
                if process.poll() is not None:raise RuntimeError(f'{phase} exited before reporting')
                if time.monotonic()>deadline:raise TimeoutError(f'{phase} did not report')
                time.sleep(.5)
            result=json.loads(report.read_text());shutil.copy2(report,output/report.name)
            if result['status']!='passed' or result.get('runtime')!='real-tauri':raise RuntimeError(f'{phase} failed; see saved report')
            return result
        finally:driver.stop_owned_process(process)


def main(args):
    if platform.system()!='Darwin':raise ValueError('This verifier covers macOS; other platforms remain separate gaps')
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    inputs=source_inputs();summary={'status':'running','scope':'synthetic task migration, real Tauri IPC, save and fresh process reopen; no application picker or user project','sourceInputs':inputs,'phases':[]}
    try:
        with tempfile.TemporaryDirectory(prefix='taudesign-task-migration-',dir='/private/tmp') as tmp:
            root=Path(tmp);(root/'target').mkdir()
            summary['phases'].append(run_phase(root,'save',output,args.timeout))
            summary['phases'].append(run_phase(root,'reopen',output,args.timeout))
        summary['status']='passed'
    except BaseException as error:
        summary['status']='failed';summary['error']=type(error).__name__
        raise
    finally:
        summary['inputsUnchanged']=source_inputs()==inputs
        if not summary['inputsUnchanged']:summary['status']='failed'
        (output/'result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    if summary['status']!='passed':raise RuntimeError('Native task archive acceptance failed')
    print(json.dumps({'status':'passed','phases':len(summary['phases']),'inputsUnchanged':True}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--timeout',type=int,default=900)
    main(parser.parse_args())
