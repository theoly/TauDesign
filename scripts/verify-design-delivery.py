#!/usr/bin/env python3
"""Final acceptance only: complete tests/types/build, browser and native project copies."""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def inputs(include_tests=False):
    code="import{captureDesignInputs}from'./scripts/lib/designEvidenceInputs';process.stdout.write(JSON.stringify(await captureDesignInputs(process.cwd(),"+str(include_tests).lower()+")));"
    return json.loads(subprocess.run(['bun','-e',code],cwd=ROOT,capture_output=True,text=True,check=True).stdout)


def main(args):
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    before=inputs();tests=inputs(True);report={'version':1,'scope':'final-source-acceptance','sourceInputs':before,'testInputs':tests,'inputsUnchanged':False,'commands':[],'status':'running'}
    commands=[('unit',['bun','test']),('types',['bun','run','type-check']),('build',['bun','run','build']),
      ('browser',['python3','scripts/verify-design-evidence.py','--output',str(output/'browser')]),
      ('native',['python3','scripts/verify-design-native.py','--project',str(args.mobile.resolve()),'--project',str(args.pc.resolve()),'--output',str(output/'native')])]
    try:
        for name,command in commands:
            log=output/(name+'.log');start=time.monotonic()
            print(json.dumps({'phase':name,'status':'started'}),flush=True)
            with log.open('x') as stream:
                result=subprocess.run(command,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT)
            report['commands'].append({'name':name,'command':command,'exitCode':result.returncode,'durationMs':(time.monotonic()-start)*1000,'log':log.name,'sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
            (output/'progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            if result.returncode:raise RuntimeError('Final acceptance failed at '+name)
        report['status']='passed'
    except BaseException as error:
        report['status']='failed';report['error']=type(error).__name__
        raise
    finally:
        report['inputsUnchanged']=before==inputs() and tests==inputs(True)
        if not report['inputsUnchanged']:report['status']='failed'
        (output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if report['status']!='passed':raise RuntimeError('Source changed during final acceptance')
    print(json.dumps({'status':'passed','commands':len(commands),'inputsUnchanged':True}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--mobile',required=True,type=Path)
    parser.add_argument('--pc',required=True,type=Path)
    main(parser.parse_args())
