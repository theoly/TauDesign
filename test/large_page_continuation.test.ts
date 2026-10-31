import { expect, test } from 'bun:test';
import { streamWithContinuation } from '../src/services/ai/boundedContinuation';
import { isOutputLimit, readContinuationSuffix } from '../src/services/ai/generationContinuation';
import type { AIEngineCore, StreamTextOptions } from '../src/services/ai/engine/core/types';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import {TaskBudget} from '../src/services/ai/taskBudget';
const prefix='<artifact type="screen" title="会员"><main class="container-max"><h1>会员权益</h1>';
const provider={id:'portable',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://fixture.invalid/v1',apiKey:'fixture',isEnabled:true};
const options={provider,model:'qwen3.8-flash',messages:[{role:'user' as const,content:'创建一个会员页面'}],maxTokens:8192};
function fixture(answers:Array<[string,string]>) {
 const calls:StreamTextOptions[]=[];
 const core:AIEngineCore={streamText(o){
  calls.push(o);const answer=answers.shift();if(!answer)throw Error('unexpected request');
  const marker=o.messages.at(-1)?.content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  const text=answer[0].startsWith('INVALID:')?answer[0].slice(8):(marker?marker+'\n':'')+answer[0];
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve(answer[1]),abort(){}};
 },async generateObject(){throw Error('unused');}};
 return {core,calls};
}
for(const reason of ['length','max_tokens','MAX_TOKENS','max_output_tokens','max-completion-tokens'])test(`portable continuation accepts ${reason} without private partial fields`,async()=>{
 const f=fixture([[prefix,reason],['<button class="btn btn-primary">查看权益</button></main></artifact>','stop']]);const chunks:string[]=[],phases:number[]=[];
 const result=await streamWithContinuation(f.core,options,{onText:t=>chunks.push(t),onContinuation:n=>phases.push(n)});
 expect(result.errorMessage).toBeUndefined();expect(result.continuationCount).toBe(1);expect(result.rawResponse).toBe(prefix+'<button class="btn btn-primary">查看权益</button></main></artifact>');expect(chunks.join('')).toBe(result.rawResponse);
 expect(f.calls[1].messages.some(m=>m.partial)).toBe(false);expect(f.calls[1].messages.at(-2)?.content).toBe(prefix);expect(phases).toEqual([1]);expect(result.usage).toEqual({inputTokens:4,outputTokens:6});
});
for(const protocol of ['anthropic','gemini','ollama_native'] as const)test(`${protocol} uses ordinary assistant/user continuation`,async()=>{
 const f=fixture([[prefix,'max_tokens'],['</main></artifact>','stop']]);const result=await streamWithContinuation(f.core,{...options,provider:{...provider,protocol}});
 expect(result.continuationCount).toBe(1);expect(f.calls[1].messages.at(-1)?.role).toBe('user');expect(f.calls[1].messages.at(-2)).toEqual({role:'assistant',content:prefix});
});
test('auto budget exhaustion retains exact checkpoint; explicit next batch continues instead of restarting',async()=>{
 const f=fixture([[prefix,'length'],['<section>第一块</section>','length'],['<section>第二块</section>','length'],['<button class="btn btn-primary">完成</button></main></artifact>','stop']]);
 const first=await streamWithContinuation(f.core,options);expect(f.calls).toHaveLength(3);expect(first.checkpoint?.prefix).toBe(first.rawResponse);expect(first.continuationCount).toBe(2);
 const next=await streamWithContinuation(f.core,options,{resume:first.checkpoint});expect(f.calls).toHaveLength(4);expect(next.continuationCount).toBe(3);expect(next.rawResponse.startsWith(first.rawResponse)).toBe(true);expect(next.rawResponse.endsWith('</artifact>')).toBe(true);expect(next.checkpoint).toBeUndefined();
 expect(f.calls[3].messages.at(-2)?.content).toBe(first.rawResponse);
});
test('mismatched marker or repeated page preserves prefix and never guesses an overlap',async()=>{
 for(const suffix of ['INVALID:unmarked suffix','<artifact><main>restart</main></artifact>',prefix]){
  const f=fixture([[prefix,'length'],[suffix,'stop']]);const r=await streamWithContinuation(f.core,options);
  expect(r.errorMessage).toBeTruthy();expect(r.rawResponse).toBe(prefix);expect(r.checkpoint?.prefix).toBe(prefix);expect(f.calls).toHaveLength(2);
 }
 expect(readContinuationSuffix('marker\n  suffix\n','marker','prefix')).toBe('  suffix\n');
 expect(readContinuationSuffix('\n\nmarker\r\n  suffix\n','marker','prefix')).toBe('  suffix\n');
 expect(()=>readContinuationSuffix('<main>marker\nsuffix','marker','prefix')).toThrow('标记');
});
test('binding, context, prefix and saved prompt tampering reject recovery before any request',async()=>{
 const f=fixture([[prefix,'length'],[' a','length'],[' b','length']]);const first=await streamWithContinuation(f.core,options);const checkpoint=first.checkpoint!;
 for(const resume of [{...checkpoint,prefix:checkpoint.prefix+'changed'},{...checkpoint,contextKey:'changed'},{...checkpoint,bindingKey:'changed'},{...checkpoint,messages:[{role:'user' as const,content:'changed'}]}]){
  const r=await streamWithContinuation(f.core,options,{resume});expect(r.errorMessage).toContain('检查点');
 }
 expect(f.calls).toHaveLength(3);
});
test('portable cancellation between requests never starts another or exposes a checkpoint',async()=>{
 const f=fixture([[prefix,'length']]),controller=new AbortController();
 const result=await streamWithContinuation(f.core,{...options,signal:controller.signal},{onText(){controller.abort();}});
 expect(result.errorMessage).toContain('取消');expect(result.checkpoint).toBeUndefined();expect(f.calls).toHaveLength(1);
});
test('portable HTML still goes through actual source safety checks',async()=>{
 const f=fixture([[prefix,'length'],['<script>alert(1)</script></main></artifact>','stop']]);
 const output=await PipelineExecutor.execute({input:{rawPrompt:'新建一个页面',activeScreenId:null},provider,model:options.model,engineCore:f.core,screens:{},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'test'});
 expect(output.status).toBe('rejected_by_quality');expect(output.changeSet).toBeUndefined();expect(output.executionRecord?.continuationCount).toBe(1);
});
test('pipeline recovery tolerates new conversation history but blocks a changed authoring baseline',async()=>{
 const f=fixture([[prefix,'length'],['<section>一</section>','length'],['<section>二</section>','length'],['<button class="btn btn-primary">查看权益</button></main></artifact>','stop']]);
 const budget=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:32768,maxDurationMs:900000,maxRequestDurationMs:900000});
 const params={input:{rawPrompt:'新建一个页面',activeScreenId:null},provider,model:options.model,engineCore:f.core,screens:{},deviceProfile:'pc' as const,frameWidth:1440,baseSystemPrompt:'test',taskBudget:budget};
 const first=await PipelineExecutor.execute(params);expect(first.continuationCheckpoint).toBeDefined();
 const stale=await PipelineExecutor.execute({...params,frameWidth:1500,resume:first.continuationCheckpoint,resumeContract:first.workflowContract});expect(stale.status).toBe('error');expect(f.calls).toHaveLength(3);
 const next=await PipelineExecutor.execute({...params,resume:first.continuationCheckpoint,resumeContract:first.workflowContract,conversationHistory:[{role:'assistant',content:'达到上限'}]});expect(next.status).toBe('applied');expect(f.calls).toHaveLength(4);expect(next.taskBudget?.requests).toBe(4);budget.close();
});
test('natural stop, filtering, and absent HTML do not invent a suffix continuation',async()=>{
 for(const reason of ['stop','content_filter','SAFETY']){const f=fixture([[prefix,reason]]);await streamWithContinuation(f.core,options);expect(f.calls).toHaveLength(1);}
 expect(isOutputLimit('stop')).toBe(false);
});
test('context budget stops before another request and does not offer an unusable continuation',async()=>{
 const f=fixture([[prefix+'x'.repeat(118000),'length']]);
 const result=await streamWithContinuation(f.core,{...options,messages:[{role:'user',content:'x'.repeat(3000)}]});
 expect(f.calls).toHaveLength(1);expect(result.continuationCount).toBe(0);expect(result.checkpoint).toBeUndefined();expect(result.warnings.join(' ')).toContain('上下文已达到安全预算');
});
