import {spawn} from 'node:child_process';
import {test,expect} from 'bun:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureDesignInputs,sha256} from '../scripts/lib/designEvidenceInputs';
async function command(args:string[],stdin?:string,file='scripts/design-experiment.ts'){
 const proc=spawn(process.execPath,[file,...args],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});
 const text=async(stream:NodeJS.ReadableStream)=>{let value='';for await(const chunk of stream)value+=String(chunk);return value;};
 const exit=new Promise<number>((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>resolve(code??1));});
 proc.stdin.end(stdin);
 const [code,stdout,stderr]=await Promise.all([exit,text(proc.stdout),text(proc.stderr)]);return {exit:code,stdout,stderr};
}
test('CLI reserves immutable first plan, creates a genuinely blind incomplete review bundle and refuses acceptance',async()=>{
 const out=await mkdtemp(join(tmpdir(),'taudesign-experiment-cli-'));
 try{
  const inputs=await captureDesignInputs(process.cwd()),identity={providerId:'synthetic-cli-test',model:'no-network',providerFingerprint:'synthetic',sourceFingerprint:sha256(JSON.stringify(inputs)),themeFingerprint:'synthetic',checkerFingerprint:'synthetic',budgetFingerprint:'synthetic'};
  const result=await command(['prepare','--output',out,'--seed','42'],JSON.stringify(identity));expect(result.exit).toBe(0);expect(result.stderr).toBe('');
  const manifest=await readFile(join(out,'input-manifest.json'),'utf8'),plan=JSON.parse(await readFile(join(out,'plan.json'),'utf8'));expect(plan.runs).toHaveLength(48);expect(plan.pairs).toHaveLength(24);
  const duplicate=await command(['prepare','--output',out,'--seed','43'],JSON.stringify(identity));expect(duplicate.exit).toBe(1);expect(await readFile(join(out,'input-manifest.json'),'utf8')).toBe(manifest);
  const bundle=await command(['bundle','--output',out]);expect(bundle.exit).toBe(0);
  const index=JSON.parse(await readFile(join(out,'review','index.json'),'utf8')),html=await readFile(join(out,'review','review.html'),'utf8');
  expect(index.pairs).toHaveLength(24);expect(index.pairs.every((p:any)=>p.leftAvailable===false&&p.rightAvailable===false&&p.left.endsWith('.svg'))).toBe(true);
  expect(JSON.stringify(index)).not.toContain('contextual');expect(JSON.stringify(index)).not.toContain('baseline');expect(html).toContain('尚无可评阅页面预览');
  const summary=await command(['summarize','--output',out]);expect(summary.exit).toBe(1);const observed=JSON.parse(summary.stdout);expect(observed.gates.allRunsRecorded).toBe(false);expect(observed.gates.independentReviewComplete).toBe(false);expect(observed.groups.baseline.missing).toBe(24);
  const readiness=await command(['--experiment',out,'--offline',join(out,'absent-offline'),'--acceptance',join(out,'absent-acceptance')],undefined,'scripts/check-design-rollout.ts');
  expect(readiness.exit).toBe(1);expect(readiness.stderr).toBe('');const decision=JSON.parse(readiness.stdout);expect(decision.defaultEnabled).toBe(false);expect(decision.mode).toBe('optional');expect(decision.blockers).toContain('traceAccountingVerified');expect(decision.blockers).toContain('nativePassed');expect(decision.blockers).toContain('independentReviewComplete');expect(decision.blockers).toContain('offlineCurrent');
 }finally{await rm(out,{recursive:true,force:true});}
},20000);
