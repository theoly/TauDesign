#!/usr/bin/env python3
"""Apply the explicitly accepted local B HTML through real Tauri product gates.

Default: a full rehearsal copy. --original requires a root coordination signal.
Never writes project files itself: all adoption uses useProjectStore and native CAS.
"""
import argparse,datetime,hashlib,json,os,platform,shutil,signal,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
ORIGINAL=Path('/Users/theoly/workspace/aqmf/aqmf-app-pub-design')
SAMPLE=ROOT/'doc/draft-targeted-repair/evidence/real-samples/2026-11-13/b-padded'
EVIDENCE=ROOT/'doc/draft-targeted-repair/evidence/accepted-b-application'
TARGET='screens/84435b32-3edf-4779-b97e-7752ab2bc926.html'
BASELINE='e5424880af016fbac9d947e559936214028f449fad5fa11ecec08295038a78ce'
ACCEPTED='273470321a56eab7e8222579d726f099ee81a52f811017195fd8c96ff7b1a038'
SOURCE_INPUTS=['test/fixtures/apply-accepted-b-native.html','scripts/apply-accepted-b-native.py','src/stores/useProjectStore.ts','src/services/storage/projectRepository.ts','src/components/canvas/ScreenFrame.tsx','src/hooks/useScreenResources.ts','src/services/storage/mediaResourceSession.ts','src/services/storage/mediaDiagnostics.ts','src/utils/renderedQuality.ts','src/services/storage/projectAuthoring.ts','src/services/storage/projectPublicationRecord.ts','src/services/storage/deliveryRepository.ts']
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(folder):
    assert not any(p.is_symlink() for p in folder.rglob('*')),'Symlink requires separate review'
    return {str(p.relative_to(folder)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(folder.rglob('*')) if p.is_file()}
def verify_diff(before,folder,applied):
    after=inventory(folder);changed=[p for p in before if after.get(p)!=before[p]];added=[p for p in after if p not in before];removed=[p for p in before if p not in after]
    expected_changed={'history.json','project.json',TARGET}
    delivery=applied['delivery'];expected_added={f'deliveries/screen-3c5a1a8c/{delivery["id"]}.json',delivery['preview']['relPath']}
    assert set(changed)==expected_changed and set(added)==expected_added and not removed,{'changed':changed,'added':added,'removed':removed}
    previous=json.loads((Path(json.loads((EVIDENCE/'backup-manifest.json').read_text())['backup'])/'project.json').read_text());current=json.loads((folder/'project.json').read_text())
    semantic=[key for key in previous.keys()|current.keys() if previous.get(key)!=current.get(key)]
    assert set(semantic)=={'savedAt','publicationCommits'},f'Unexpected manifest semantics: {semantic}'
    assert sha(folder/TARGET)==ACCEPTED
    original_history=json.loads((Path(json.loads((EVIDENCE/'backup-manifest.json').read_text())['backup'])/'history.json').read_text());history=json.loads((folder/'history.json').read_text())
    assert history['past'][:-1]==original_history['past'] and history['future']==[] and history['checkpoints'][1:]==original_history['checkpoints'],'Original history entries changed'
    patch=history['past'][-1];assert [p['path'] for p in patch['patches']]==[['screens',TARGET.removeprefix('screens/').removesuffix('.html')]],'History patch affects other state'
    assert history['checkpoints'][0]['screenSnapshot']['screenId']==TARGET.removeprefix('screens/').removesuffix('.html')
    return {'changed':changed,'added':added,'removed':removed,'after':after,'manifestSemanticChanges':semantic,'originalHistoryEntriesUnchanged':True,'otherScreensAndAssetsUnchanged':True}
def run_phase(control,phase,out,timeout):
    url='http://127.0.0.1:5174/test/fixtures/apply-accepted-b-native.html?'+urlencode({'root':str(control),'phase':phase})
    config=control/f'tauri-{phase}.json';config.write_text(json.dumps({'productName':'TauDesign Accepted B Local Adoption','identifier':'com.taudesign.accepted-b-local-adoption','build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},'app':{'windows':[{'label':'main','title':'TauDesign · Accepted B local adoption','url':url,'width':1500,'height':1100}]},'bundle':{'active':False}}))
    report=control/f'report-{phase}.json'
    with (out/f'{phase}-process.log').open('w') as log:
        process=subprocess.Popen(['pnpm','exec','tauri','dev','--config',str(config),'--no-watch'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            deadline=time.monotonic()+timeout
            while not report.exists():
                if process.poll() is not None:raise RuntimeError(f'{phase}: Tauri exited before report')
                if time.monotonic()>deadline:raise TimeoutError(f'{phase}: no report within {timeout}s; control={control}')
                time.sleep(.5)
            value=json.loads(report.read_text());shutil.copy2(report,out/report.name)
            if value.get('status')!='passed':raise RuntimeError(f'{phase}: {value.get("error")}')
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
    assert platform.system()=='Darwin','Real macOS Tauri required'
    assert sha(SAMPLE/'repaired.html')==ACCEPTED
    backup=json.loads((EVIDENCE/'backup-manifest.json').read_text());before=inventory(ORIGINAL)
    assert before==backup['files'],'Original project changed after backup; refuse overwrite'
    assert sha(ORIGINAL/TARGET)==BASELINE
    assert not (ORIGINAL/'candidates/current.json').exists(),'Existing candidate must be reviewed before staging'
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    control=Path(tempfile.mkdtemp(prefix='taudesign-approved-b-run-',dir='/private/tmp'))
    if args.original:
        assert args.root_signal=='approved-after-rehearsal-and-audit','Explicit root coordination required'
        folder=ORIGINAL
    else:
        folder=control/'rehearsal-project';shutil.copytree(backup['backup'],folder);assert inventory(folder)==before
    source_before=inventory(folder);context=json.loads((SAMPLE/'context.json').read_text());manifest=json.loads((folder/'project.json').read_text())
    assert manifest['designSystem']==context['designSystem'] and manifest['settings']==context['settings']
    shutil.copy2(SAMPLE/'repaired.html',control/'accepted-b.html');shutil.copy2(folder/TARGET,control/'baseline.html')
    (control/'input.json').write_text(json.dumps({'folder':str(folder),'authorizedFolder':str(folder),'projectId':manifest['id'],'designSystem':manifest['designSystem'],'settings':manifest['settings'],'baselineSHA':BASELINE,'acceptedSHA':ACCEPTED,'authorizedRequest':context['request'],'visualRequest':'以用户认可的b-padded为准：21行52px行距，明确输入下划线，实名四项单一外框四侧12px padding；全部label/input统一对齐。保留全部业务值/只读与控件规则。'},ensure_ascii=False))
    source_inputs={p:sha(ROOT/p) for p in SOURCE_INPUTS if (ROOT/p).exists()}
    result={'status':'running','mode':'original' if args.original else 'rehearsal','control':str(control),'folder':str(folder),'backup':backup['backup'],'baselineSHA':BASELINE,'acceptedSHA':ACCEPTED,'phases':[],'sourceInputs':source_inputs}
    try:
        for phase in ['apply','reopen']:
            result['phases'].append(run_phase(control,phase,out,args.timeout));print(f'{phase}: passed',flush=True)
        result.update(verify_diff(source_before,folder,result['phases'][0]));result['status']='passed'
    except BaseException as error:
        result['status']='failed';result['error']=str(error);raise
    finally:
        after=inventory(folder);result['observedDiff']={'changed':[p for p in source_before if after.get(p)!=source_before[p]],'added':[p for p in after if p not in source_before],'removed':[p for p in source_before if p not in after]}
        result['originalUnchanged']=inventory(ORIGINAL)==before if not args.original else None
        result['sourceInputsAfter']={p:sha(ROOT/p) for p in source_inputs};result['sourceInputsUnchanged']=source_inputs==result['sourceInputsAfter']
        if not result['sourceInputsUnchanged']:result['status']='failed';result['error']='Fixture or production source changed during native verification; preserve this round and rerun after source freeze'
        (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'status':result['status'],'folder':str(folder),'changed':result['changed'],'added':result['added']},ensure_ascii=False),flush=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path);parser.add_argument('--timeout',default=240,type=int);parser.add_argument('--original',action='store_true');parser.add_argument('--root-signal');main(parser.parse_args())
