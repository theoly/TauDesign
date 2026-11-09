#!/usr/bin/env python3
"""Real Tauri managed-file transaction APIs and process restart on isolated synthetic files.

This does not claim candidate/History integration or a user-project acceptance.
"""
import argparse
import hashlib
import importlib.util
import json
import platform
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_helper',ROOT/'scripts/verify-task-archive-native.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)


def source_inputs(fixture_name):
    values=helper.source_inputs();fixture=f'test/fixtures/{fixture_name}.html'
    values[fixture]=hashlib.sha256((ROOT/fixture).read_bytes()).hexdigest()
    if fixture_name=='project-authoring-native':
        for helper_path in ['test/helpers/projectPublicationAck.ts','test/helpers/nativeFinalPublication.ts','test/helpers/nativeResourcePublication.ts','test/helpers/resourcePng.ts']:
            values[helper_path]=hashlib.sha256((ROOT/helper_path).read_bytes()).hexdigest()
    return values


def main(args):
    if platform.system()!='Darwin':raise ValueError('macOS required; other native platforms remain gaps')
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False);inputs=source_inputs(args.fixture)
    result={'status':'running','scope':__doc__.strip(),'sourceInputs':inputs,'phases':[]}
    try:
        with tempfile.TemporaryDirectory(prefix='taudesign-project-publication-',dir='/private/tmp') as tmp:
            root=Path(tmp);(root/'target').mkdir()
            for phase in ['save','reopen']:result['phases'].append(helper.run_phase(root,phase,output,args.timeout,args.fixture))
        result['status']='passed'
    except BaseException as error:
        result['status']='failed';result['error']=type(error).__name__
        raise
    finally:
        result['inputsUnchanged']=source_inputs(args.fixture)==inputs
        if not result['inputsUnchanged']:result['status']='failed'
        (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']!='passed':raise RuntimeError('Native managed-file transaction acceptance failed')
    print(json.dumps({'status':'passed','phases':len(result['phases']),'inputsUnchanged':True}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path);parser.add_argument('--timeout',type=int,default=900);parser.add_argument('--fixture',choices=['project-snapshot-native','project-authoring-native'],default='project-snapshot-native');main(parser.parse_args())
