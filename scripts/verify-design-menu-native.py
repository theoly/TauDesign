#!/usr/bin/env python3
"""Observe an actual desktop File click on an isolated native App; CUA supplies only the UI click."""
import argparse,json,os,signal,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
def main(args):
 out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
 with tempfile.TemporaryDirectory(prefix='taudesign-menu-',dir='/private/tmp') as tmp:
  root=Path(tmp);(root/'project.aidesign').mkdir()
  config=root/'tauri.json';config.write_text(json.dumps({'productName':'TauDesign Menu Verification','identifier':'com.taudesign.menuverification','build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},'app':{'windows':[{'label':'main','title':'TauDesign · Native Menu Verification','url':'http://127.0.0.1:5174/test/fixtures/design-menu-native.html?'+urlencode({'root':str(root),**({'autoPrepare':'1'} if args.auto_prepare else {})}),'width':1280,'height':900}]},'bundle':{'active':False}}))
  runner=root/'runner.py'
  runner.write_text('''#!/usr/bin/env python3
import os,plistlib,shutil,subprocess,sys
from pathlib import Path
root=Path(__file__).parent
args=sys.argv[1:];assert args and args[0]=='run',args
build=args[:args.index('--')] if '--' in args else args
build[0]='build';subprocess.run(['cargo',*build],check=True)
bundle=root/'NativeMenuVerification.app';mac=bundle/'Contents/MacOS';mac.mkdir(parents=True)
shutil.copy2(Path.cwd()/'target/debug/app',mac/'app')
with (bundle/'Contents/Info.plist').open('wb') as stream:plistlib.dump({'CFBundleExecutable':'app','CFBundleIdentifier':'com.taudesign.menuverification','CFBundleName':'TauDesign Menu Verification','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'0.0.0','NSHighResolutionCapable':True},stream)
print('Owned UI bundle: '+str(bundle),flush=True)
app=subprocess.Popen([str(mac/'app')]);raise SystemExit(app.wait())
''');runner.chmod(0o755)
  with (out/'process.log').open('x') as log:
   p=subprocess.Popen(['bunx','tauri','dev','--config',str(config),'--no-watch','--runner',str(runner)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   print(json.dumps({'status':'waiting-for-real-menu-click','pid':p.pid,'root':str(root),'window':'TauDesign · Native Menu Verification'}),flush=True)
   try:
    end=time.monotonic()+args.timeout
    report=root/'menu-report.json'
    while not report.exists():
     if p.poll() is not None:raise RuntimeError('Native process exited before its menu result')
     if time.monotonic()>end:raise TimeoutError('No observed native File menu click; no success fabricated')
     time.sleep(.5)
    result=json.loads(report.read_text());(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']!='passed':raise RuntimeError('Native menu failed')
    print(json.dumps(result,ensure_ascii=False),flush=True)
    # Give the UI observer time to capture its observed outcome before ending only this process.
    while not (out/'ui-observed').exists() and time.monotonic()<end:time.sleep(.5)
   finally:
    if p.poll() is None:
     os.killpg(p.pid,signal.SIGTERM)
     try:p.wait(timeout=10)
     except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--timeout',type=int,default=300);p.add_argument('--auto-prepare',action='store_true');main(p.parse_args())
