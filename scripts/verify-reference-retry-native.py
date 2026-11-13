#!/usr/bin/env python3
"""Own an isolated Tauri window; computer use drives the real retry controls."""
import argparse,json,os,signal,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
def main(args):
 out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
 with tempfile.TemporaryDirectory(prefix='td-ref-native-',dir='/private/tmp') as tmp:
  root=Path(tmp);config=root/'tauri.json'
  config.write_text(json.dumps({'productName':'TauDesign Reference Verification','identifier':'com.taudesign.referenceverification','build':{'devUrl':'http://127.0.0.1:5174','beforeDevCommand':''},'app':{'windows':[{'label':'main','title':'TauDesign · Reference Retry Verification','url':'http://127.0.0.1:5174/test/fixtures/retry-reference.html?'+urlencode({'root':str(root)}),'width':1100,'height':1000}]},'bundle':{'active':False}}))
  runner=root/'runner.py'
  runner.write_text('''#!/usr/bin/env python3
import plistlib,shutil,subprocess,sys
from pathlib import Path
root=Path(__file__).parent
args=sys.argv[1:];assert args and args[0]=='run',args
build=args[:args.index('--')] if '--' in args else args
build[0]='build';subprocess.run(['cargo',*build],check=True)
bundle=root/'ReferenceVerification.app';mac=bundle/'Contents/MacOS';mac.mkdir(parents=True)
shutil.copy2(Path.cwd()/'target/debug/app',mac/'app')
with (bundle/'Contents/Info.plist').open('wb') as stream:plistlib.dump({'CFBundleExecutable':'app','CFBundleIdentifier':'com.taudesign.referenceverification','CFBundleName':'TauDesign Reference Verification','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'0.0.0','NSHighResolutionCapable':True},stream)
print('Owned UI bundle: '+str(bundle),flush=True)
app=subprocess.Popen([str(mac/'app')]);raise SystemExit(app.wait())
''');runner.chmod(0o755)
  with (out/'process.log').open('x') as log:
   p=subprocess.Popen(['pnpm','exec','tauri','dev','--config',str(config),'--no-watch','--runner',str(runner)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   print(json.dumps({'status':'waiting-for-computer-use','pid':p.pid,'root':str(root),'window':'TauDesign · Reference Retry Verification'}),flush=True)
   try:
    end=time.monotonic()+args.timeout;report=root/'result.json'
    while not report.exists():
     if p.poll() is not None:raise RuntimeError('Native process exited before retry proof')
     if time.monotonic()>end:raise TimeoutError('No observed native retry proof')
     time.sleep(.5)
    result=json.loads(report.read_text());(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    assert result['status']=='passed' and result['sourceUnchanged'] and result['historyUnchanged'] and result['codeNoImages'],result
    assert len(result['files'])>=2,result
    print(json.dumps(result,ensure_ascii=False),flush=True)
    while not (out/'ui-observed').exists() and time.monotonic()<end:time.sleep(.5)
   finally:
    if p.poll() is None:
     os.killpg(p.pid,signal.SIGTERM)
     try:p.wait(timeout=10)
     except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--timeout',type=int,default=600);main(p.parse_args())
