import {expect,test} from 'bun:test';
import {createRestylePatchPlan,executeRestylePatches} from '../src/services/ai/restylePatches';
import {neutralModernTheme} from '../src/utils/themePresets';
const css=':root{--brand:#ff6600;--page:#fff7ef}.card{color:var(--brand)}/*'+'keep '.repeat(5000)+'*/';
const html=`<!DOCTYPE html><html><head><style>${css}</style></head><body data-nid="root0001"><button data-nid="button01" style="padding:12px">保存资料</button><img data-nid="image001" src="assets/images/a.png"></body></html>`;
const target={id:'large',kind:'screen' as const,name:'大页',html,imported:true};
const request={provider:{id:'test',name:'Test',protocol:'openai_compatible',baseUrl:'https://example.test/v1',apiKey:'test'},model:'test',messages:[]} as any;
const response=(text:string,finish='stop')=>({textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve(finish),abort(){}});
test('large imported page returns tiny variable bindings; source stylesheet, text and assets stay',async()=>{
 const plan=createRestylePatchPlan(target,'pc');expect(plan.kind).toBe('variables');let sent='';
 const core={streamText:(r:any)=>{sent=JSON.stringify(r.messages);const payload=JSON.parse(r.messages[1].content);return response(JSON.stringify({bindings:payload.items.map((i:any)=>({id:i.id,role:i.property==='--brand'?'primary':'background'}))}));}} as any;
 const result=await executeRestylePatches(core,{target,request,designSystem:neutralModernTheme,deviceProfile:'pc'});
 expect(sent.length).toBeLessThan(16000);expect(sent).not.toContain('keep keep');expect(result.html).toContain('--brand:var(--td-import-color-primary)');expect(result.html).toContain('keep keep');expect(result.html).toContain('保存资料');expect(result.html).toContain('assets/images/a.png');expect(target.html).toBe(html);
});
test('native large page batches NID classes and excludes protected nodes and original CSS',async()=>{
 const native={...target,imported:false,protectedNids:['button01']},plan=createRestylePatchPlan(native,'pc');expect(plan.kind).toBe('classes');expect(plan.groups.flat().some(i=>i.nid==='button01')).toBe(false);
 const core={streamText:(r:any)=>{const p=JSON.parse(r.messages[1].content);return response(JSON.stringify({operations:[{nid:p.items[0].nid,add:['p-6'],remove:[]}]}));}} as any;
 const result=await executeRestylePatches(core,{target:native,request,designSystem:neutralModernTheme,deviceProfile:'pc'});expect(result.html).toContain('p-6');expect(new DOMParser().parseFromString(result.html,'text/html').querySelector('style')?.textContent).toBe(css);
});
test('out-of-scope binding or truncated valid JSON never yields partial HTML',async()=>{
 const options={target,request,designSystem:neutralModernTheme,deviceProfile:'pc' as const};
 await expect(executeRestylePatches({streamText:()=>response('{"bindings":[{"id":"missing","role":"primary"}]}')} as any,options)).rejects.toThrow();
 await expect(executeRestylePatches({streamText:()=>response('{"bindings":[]}','length')} as any,options)).rejects.toThrow('上限');
});
test('safe imported CSS variable changes are not counted as visible copy drift',async()=>{
 const {compareStructure}=await import('../src/utils/structureGuard');expect(compareStructure(html,html.replace('--brand:#ff6600','--brand:var(--td-import-color-primary)')).textChanged).toBe(0);
});

test('later invalid group rejects every earlier binding; cancellation never exposes partial output',async()=>{
 const many={...target,html:html.replace('--brand:#ff6600;',Array.from({length:13},(_,i)=>`--c${i}:#ff6600;`).join(''))};
 let calls=0;
 const core={streamText:(r:any)=>{calls++;const p=JSON.parse(r.messages[1].content);return response(JSON.stringify({bindings:[{id:calls===1?p.items[0].id:'wrong-group',role:'primary'}]}));}} as any;
 await expect(executeRestylePatches(core,{target:many,request,designSystem:neutralModernTheme,deviceProfile:'pc'})).rejects.toThrow('越界');
 expect(calls).toBe(2);expect(many.html).not.toContain('--td-import-color');
 const controller=new AbortController();let released=false;
 const cancelling={streamText:()=>{controller.abort();released=true;return response('{"bindings":[]}');}} as any;
 await expect(executeRestylePatches(cancelling,{target:many,request:{...request,signal:controller.signal},designSystem:neutralModernTheme,deviceProfile:'pc'})).rejects.toThrow('取消');expect(released).toBe(true);
});

test('finite plan rejects unsupported source and too many groups before AI; protected or unknown class cannot be patched',async()=>{
 expect(()=>createRestylePatchPlan({...target,html:'<style>body{color:red}</style><main>无变量</main>'},'pc')).toThrow('没有可安全映射');
 expect(()=>createRestylePatchPlan({...target,imported:false,html:Array.from({length:385},(_,i)=>`<p data-nid="n${i}">内容</p>`).join('')},'pc')).toThrow('超过16组');
 for(const op of [{nid:'button01',add:['p-6'],remove:[]},{nid:'root0001',add:['invented'],remove:[]}]){
  await expect(executeRestylePatches({streamText:()=>response(JSON.stringify({operations:[op]}))} as any,{target:{...target,imported:false,protectedNids:['button01']},request,designSystem:neutralModernTheme,deviceProfile:'pc'})).rejects.toThrow();
 }
});

test('executor routes large imported page through patches, reports groups separately and keeps unchanged distinct',async()=>{
 const {executeRestyleTarget}=await import('../src/services/ai/restyleExecutor');
 const {buildRestyleContract}=await import('../src/services/ai/designWorkflow');
 const contract=buildRestyleContract({scope:'batch',target,deviceProfile:'pc',frameWidth:1440,designSystem:neutralModernTheme});
 const events:any[]=[];
 const run=(empty:boolean)=>executeRestyleTarget({streamText:(r:any)=>{
  const p=JSON.parse(r.messages[1].content);expect(r.maxTokens).toBe(2048);expect(JSON.stringify(r.messages)).not.toContain('keep keep');
  return response(JSON.stringify({bindings:empty?[]:[{id:p.items[0].id,role:'primary'}]}));
 }} as any,{target,request,contract,quality:{designSystem:neutralModernTheme,deviceProfile:'pc'},onProgress:p=>events.push(p)});
 const changed=await run(false);expect(changed.status).toBe('applied');expect(changed.diff?.textChanged).toBe(0);expect(changed.executionRecord?.completeHtml).toContain('保存资料');
 expect(events.at(-1)).toMatchObject({phase:'complete',patchGroup:1,patchGroups:1,requestCount:1,continuationCount:0});
 const unchanged=await run(true);expect(unchanged.status).toBe('skipped_unchanged');expect(unchanged.html).toBeUndefined();expect(unchanged.executionRecord?.completeHtml).toBeUndefined();
});
