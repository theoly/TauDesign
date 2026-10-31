import type {AIEngineCore,StreamTextOptions} from './engine/core/types';

export interface RequestActivity {
  startedAt:number;lastActivityAt?:number;requests:number;active:number;textChars:number;reasoningChars:number;jsonChars:number;
  status:'idle'|'waiting'|'receiving'|'returned'|'failed'|'cancelled';providerId?:string;model?:string;
}
export const initialRequestActivity=():RequestActivity=>({startedAt:Date.now(),requests:0,active:0,textChars:0,reasoningChars:0,jsonChars:0,status:'idle'});
/** Application core observations, not HTTP counts or Provider acknowledgements. Never consumes a second stream. */
export function observeRequestActivity(core:AIEngineCore,onActivity:(snapshot:RequestActivity)=>void,isCurrent=()=>true,initial?:Readonly<RequestActivity>){
  let closed=false,lastPublished=0;
  const cleanups=new Set<()=>void>();
  if(initial?.active)throw Error('只能接续已经结算的应用调用观察。');
  const state=initial?{...initial}:initialRequestActivity();
  const publish=(force=false)=>{
    if(closed||(!force&&Date.now()-lastPublished<150)||!isCurrent())return;
    lastPublished=Date.now();try{onActivity({...state});}catch{console.warn('[ai-activity] 进度显示回调失败');}
  };
  const begin=(options:StreamTextOptions)=>{
    if(options.signal?.aborted)throw new DOMException('生成已取消','AbortError');
    state.requests++;state.active++;state.status='waiting';state.providerId=options.provider.id;state.model=options.model;
    state.lastActivityAt=Date.now();publish(true);
    let done=false,textObserved=0,reasoningObserved=0,textAccounted=0,reasoningAccounted=0;
    const count=(text:number,reasoning:number,force=false)=>{
      if(done||closed)return;
      state.textChars+=Math.max(0,text-textAccounted);textAccounted=Math.max(textAccounted,text);
      state.reasoningChars+=Math.max(0,reasoning-reasoningAccounted);reasoningAccounted=Math.max(reasoningAccounted,reasoning);
      state.lastActivityAt=Date.now();state.status='receiving';publish(force);
    };
    const finish=(status:'returned'|'failed'|'cancelled')=>{
      if(done)return;done=true;cleanup();cleanups.delete(cleanup);
      state.active--;state.status=status;state.lastActivityAt=Date.now();publish(true);
    };
    const abort=()=>finish('cancelled'),cleanup=()=>options.signal?.removeEventListener('abort',abort);
    cleanups.add(cleanup);options.signal?.addEventListener('abort',abort,{once:true});
    return {finish,chunk(text:string,reasoning:boolean){
      if(reasoning)reasoningObserved+=text.length;else textObserved+=text.length;
      count(textObserved,reasoningObserved);
    },result(text:string,reasoning?:string){count(Math.max(textObserved,text.length),Math.max(reasoningObserved,reasoning?.length??0));},
    json(value:unknown){if(done||closed||!isCurrent())return;try{state.jsonChars+=JSON.stringify(value)?.length??0;}catch{/* A non-JSON test result has no measurable JSON representation. */}}};
  };
  publish(true);
  const monitored:AIEngineCore={
    async generateObject<T>(schema:Record<string,unknown>,options:Omit<StreamTextOptions,'jsonSchema'>){
      const request=begin(options);
      try{const result=await core.generateObject<T>(schema,options);request.json(result);request.finish(options.signal?.aborted?'cancelled':'returned');return result;}
      catch(error){request.finish(options.signal?.aborted?'cancelled':'failed');throw error;}
    },
    streamText(options){
      const request=begin(options);
      try{
        const stream=core.streamText(options);
        const observe=async function*(source:AsyncIterable<string>,reasoning:boolean){for await(const chunk of source){request.chunk(chunk,reasoning);yield chunk;}};
        const completed=Promise.all([stream.textPromise,stream.reasoningPromise,stream.usagePromise,stream.recoveryPromise,stream.finishReasonPromise]);
        return {...stream,textStream:observe(stream.textStream,false),reasoningStream:observe(stream.reasoningStream,true),
          textPromise:completed.then(([text,reasoning])=>{request.result(text,reasoning);request.finish(options.signal?.aborted?'cancelled':'returned');return text;},error=>{request.finish(options.signal?.aborted?'cancelled':'failed');throw error;}),
          abort:()=>{request.finish('cancelled');stream.abort();}};
      }catch(error){request.finish(options.signal?.aborted?'cancelled':'failed');throw error;}
    }
  };
  return {core:monitored,stop(){closed=true;cleanups.forEach(cleanup=>cleanup());cleanups.clear();},snapshot:()=>({...state})};
}

export type PipelinePhase='analyzing'|'review-ready'|'page-planning'|'page-plan-ready'|'preparing'|'planning'|'assembling'|'generating'|'local-repair'|'validating'|'rendering'|'candidate'|'created'|'answered';
export interface ExecutionPhaseEvent {phase:PipelinePhase;at:number}
export const executionPhaseLabels:Record<PipelinePhase,string>={analyzing:'分析已有页面并整理可选建议','review-ready':'修改建议已返回，等待选择','page-planning':'规划页面清单与关联','page-plan-ready':'页面计划已返回，等待确认',preparing:'核对请求与任务范围',planning:'梳理功能、信息与交互',assembling:'组装页面、主题与工程上下文',
  generating:'调用模型生成结果','local-repair':'定点修复已确认文案',validating:'检查返回内容与源码',rendering:'检查实际渲染与交付条件',candidate:'候选方案已暂存，等待检查与采纳',created:'页面已加入画布',answered:'答复已返回'};
