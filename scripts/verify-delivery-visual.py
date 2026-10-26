#!/usr/bin/env python3
"""Render an exported TauDesign delivery task offline and emit a portable visual evidence bundle."""
import argparse,asyncio,hashlib,importlib.util,json,platform,shutil,time
from pathlib import Path
from playwright.async_api import async_playwright

def sha(data):return hashlib.sha256(data).hexdigest()
def task_identity(task):
 return sha(json.dumps([1,task['owner']['projectId'],task['owner']['kind'],task['owner']['eventId'],task['owner']['screenId'],task['documentHash'],task['width'],task['height'],'first-screen'],ensure_ascii=False,separators=(',',':')).encode())

async def main(args):
 task=json.loads(args.job.read_text())
 if task.get('schemaVersion')!=1 or task.get('scope')!='first-screen' or task['owner']['kind'] not in ('single','restyle') or any(not isinstance(task.get(key),int) or task[key]<1 for key in ['width','height']) or task['width']*task['height']>6000000:raise ValueError('Unsupported task/viewport')
 if sha(task['document'].encode())!=task['documentHash'] or task_identity(task)!=task['fingerprint']:raise ValueError('Task fingerprint mismatch')
 output=args.output.resolve();reference=args.reference.resolve();args.job=args.job.resolve()
 actual=output/'actual.png';copied=output/'reference.png';diff=output/'diff.png'
 if len(set([reference,args.job,actual,copied,diff,output/'result.json']))!=6:raise ValueError('Input and output paths must be distinct')
 output.mkdir(parents=True,exist_ok=True)
 (output/'result.json').unlink(missing_ok=True)
 metadata=reference.with_suffix(reference.suffix+'.metadata.json')
 failures=[]
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  context=await browser.new_context(viewport={'width':task['width'],'height':task['height']},locale='zh-CN',device_scale_factor=1,java_script_enabled=False)
  await context.route('**/*',lambda route:route.abort())
  page=await context.new_page();page.on('requestfailed',lambda request:failures.append(request.url));page.on('pageerror',lambda error:failures.append(str(error)))
  try:
   await page.set_content(task['document'],wait_until='load');await page.evaluate('document.fonts.ready');await page.locator('img').evaluate_all('async images=>Promise.all(images.map(image=>image.decode()))')
   fonts=await page.evaluate('''()=>{const c=document.createElement('canvas').getContext('2d');return ['Arial','PingFang SC','system-ui'].map(font=>{c.font=`16px "${font}"`;return {font,width:c.measureText('TauDesign 会员资料 012345').width};});}''')
   env={'browser':args.browser,'version':browser.version,'platform':platform.system()+' '+platform.release(),'machine':platform.machine(),'fontHash':sha(json.dumps(fonts,ensure_ascii=False,separators=(',',':')).encode())}
   identity={'owner':task['owner'],'width':task['width'],'height':task['height'],'environment':env}
   if failures:raise ValueError('Resources incomplete or blocked by offline policy: '+str(failures))
   await page.screenshot(path=str(actual),animations='disabled',caret='hide')
   if args.update_reference:
    reference.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(actual,reference)
    metadata.write_text(json.dumps({'schemaVersion':1,'identity':identity,'sha256':sha(reference.read_bytes()),'taskFingerprint':task['fingerprint']},ensure_ascii=False,indent=2))
   else:
    if not reference.is_file() or not metadata.is_file():raise ValueError('Baseline or metadata missing; review and explicitly initialize first')
    baseline=json.loads(metadata.read_text())
    if baseline.get('schemaVersion')!=1 or baseline.get('identity')!=identity or baseline.get('sha256')!=sha(reference.read_bytes()):raise ValueError('Baseline environment/owner/viewport/hash mismatch')
   shutil.copyfile(reference,copied)
   spec=importlib.util.spec_from_file_location('compare_visual',Path(__file__).with_name('compare-visual.py'));compare=importlib.util.module_from_spec(spec);spec.loader.exec_module(compare)
   values=compare.compare(reference,actual,diff,12);total=max(values['reference_size'][0],values['actual_size'][0])*max(values['reference_size'][1],values['actual_size'][1])
   metrics={'sizeMatches':values['size_matches'],'changedPixels':values['changed_pixels'],'totalPixels':total,'ratio':values['changed_pixels']/total}
   status='initialized' if args.update_reference else 'passed' if metrics['sizeMatches'] and metrics['ratio']<=.005 else 'failed'
   report={'schemaVersion':1,'taskFingerprint':task['fingerprint'],'documentHash':task['documentHash'],'environment':env,'capturedAt':int(time.time()*1000),'status':status,'threshold':.005,'channelThreshold':12,'metrics':metrics,'images':{role:{'file':role+'.png','sha256':sha((output/(role+'.png')).read_bytes())} for role in ['reference','actual','diff']}}
   (output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps({'status':status,'ratio':metrics['ratio'],'output':str(output)},ensure_ascii=False));return 1 if status=='failed' else 0
  finally:await browser.close()

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--job',type=Path,required=True);parser.add_argument('--browser',choices=['chromium','webkit','firefox'],default='chromium');parser.add_argument('--reference',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--update-reference',action='store_true');raise SystemExit(asyncio.run(main(parser.parse_args())))
