import type {AIEngineCore,StreamTextOptions,TokenUsage} from './engine/core/types';

export interface TaskBudgetLimits {
  maxRequests:number;maxRequestedOutputTokens:number;maxDurationMs:number;maxRequestDurationMs:number;
}
export interface TaskBudgetSnapshot {
  version:1;limits:TaskBudgetLimits;requests:number;requestedOutputTokens:number;reservedOutputTokens:number;
  reportedInputTokens:number;reportedOutputTokens:number;unreportedOutputCaps:number;cancelled:boolean;closed:boolean;exhausted:boolean;
}
export function isTaskBudgetSnapshot(value:unknown):value is TaskBudgetSnapshot {
  const v=value as TaskBudgetSnapshot|undefined;
  const number=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  return Boolean(v&&v.version===1&&v.limits&&(['maxRequests','maxRequestedOutputTokens','maxDurationMs','maxRequestDurationMs'] as const).every(k=>Number.isSafeInteger(v.limits[k])&&v.limits[k]>0)&&
    v.limits.maxRequestDurationMs<=v.limits.maxDurationMs&&Number.isInteger(v.requests)&&number(v.requests)&&v.requests<=v.limits.maxRequests&&
    number(v.requestedOutputTokens)&&v.requestedOutputTokens<=v.limits.maxRequestedOutputTokens&&number(v.reservedOutputTokens)&&v.reservedOutputTokens<=v.requestedOutputTokens&&
    number(v.reportedInputTokens)&&number(v.reportedOutputTokens)&&number(v.unreportedOutputCaps)&&v.unreportedOutputCaps<=v.requestedOutputTokens&&
    ['cancelled','closed','exhausted'].every(k=>typeof v[k as keyof TaskBudgetSnapshot]==='boolean'));
}
/** One in-memory parent ledger. Never construct a new ledger in a child/continuation. */
export class TaskBudget {
  private readonly controller=new AbortController();
  private readonly started:number;
  private requests=0;private requested=0;private reserved=0;private input=0;private output=0;private unreported=0;
  private closed=false;
  private denied=false;
  private readonly limits:TaskBudgetLimits;
  private readonly tasks=new Set<string>();
  private readonly continuations=new Map<string,string>();
  constructor(limits:TaskBudgetLimits,private readonly now=()=>performance.now()) {
    if(Object.keys(limits).length!==4||(['maxRequests','maxRequestedOutputTokens','maxDurationMs','maxRequestDurationMs'] as const).some(key=>!Number.isSafeInteger(limits[key])||limits[key]<1)||limits.maxRequestDurationMs>limits.maxDurationMs||limits.maxRequestDurationMs>2147483647)throw Error('父任务预算无效。');
    this.limits={...limits};this.started=now();
  }
  get signal(){return this.controller.signal;}
  /** A new ledger has no authority to resume another ledger's task. Memory only. */
  registerTask(taskId:string){if(!taskId||this.closed||this.signal.aborted)throw Error('父任务预算不可绑定。');this.tasks.add(taskId);}
  hasTask(taskId:string){return this.tasks.has(taskId);}
  sealContinuation(taskId:string,proof:string){if(!this.hasTask(taskId))throw Error('续写不属于当前父任务。');this.continuations.set(taskId,proof);}
  matchesContinuation(taskId:string,proof:string){return this.continuations.get(taskId)===proof;}
  consumeContinuation(taskId:string,proof:string){if(!this.matchesContinuation(taskId,proof))return false;this.continuations.delete(taskId);return true;}
  cancel(reason='父任务已取消'){if(!this.signal.aborted)this.controller.abort(new Error(reason));}
  close(){this.closed=true;this.continuations.clear();if(this.reserved)this.cancel('父任务已结束。');}
  remainingMs(){return Math.max(0,this.limits.maxDurationMs-(this.now()-this.started));}
  /** Read-only UI probe; it never reserves, resets a deadline or refunds earlier requests. */
  canReserve(tokens:number){return !this.closed&&!this.signal.aborted&&!this.denied&&this.remainingMs()>0&&Number.isSafeInteger(tokens)&&tokens>0&&
    this.requests<this.limits.maxRequests&&tokens<=this.limits.maxRequestedOutputTokens-this.requested;}
  snapshot():TaskBudgetSnapshot{return {version:1,limits:{...this.limits},requests:this.requests,requestedOutputTokens:this.requested,reservedOutputTokens:this.reserved,
    reportedInputTokens:this.input,reportedOutputTokens:this.output,unreportedOutputCaps:this.unreported,cancelled:this.signal.aborted,closed:this.closed,
    exhausted:this.denied||this.requests>=this.limits.maxRequests||this.requested>=this.limits.maxRequestedOutputTokens};}
  reserve(tokens:number) {
    if(this.closed)throw Error('父任务已结束，不能继续发送请求。');
    if(this.signal.aborted)throw this.signal.reason;
    if(!this.remainingMs()){this.cancel('父任务超过总时限。');throw this.signal.reason;}
    if(!Number.isSafeInteger(tokens)||tokens<1)throw Error('请求输出预算无效。');
    if(this.denied||this.requests>=this.limits.maxRequests||tokens>this.limits.maxRequestedOutputTokens-this.requested){this.denied=true;throw Error('父任务请求次数或累计申请输出预算已耗尽；未发送本次请求。');}
    this.requests++;this.requested+=tokens;this.reserved+=tokens;
    let settled=false;
    return {timeoutMs:Math.min(this.remainingMs(),this.limits.maxRequestDurationMs),settle:(usage?:TokenUsage)=>{
      if(settled)return;settled=true;this.reserved-=tokens;
      if(usage&&[usage.inputTokens,usage.outputTokens].every(n=>Number.isFinite(n)&&n>=0)) {this.input+=usage.inputTokens;this.output+=usage.outputTokens;}
      else this.unreported+=tokens;
      // Requested quotas remain charged after dispatch, even on failure/low actual usage.
    }};
  }
}

/** Preserve the existing transport/parser; enforce all child calls at the shared core boundary. */
export function withTaskBudget(core:AIEngineCore,budget:TaskBudget):AIEngineCore {
  const execute=<T>(options:StreamTextOptions,start:(request:StreamTextOptions)=>{value:T;done:Promise<unknown>;usage?:Promise<TokenUsage|undefined>;abort?:()=>void})=>{
    if(options.signal?.aborted){budget.cancel('生成已取消');throw budget.signal.reason;}
    const maxTokens=options.maxTokens??8192,reservation=budget.reserve(maxTokens),controller=new AbortController();
    let rejectAbort!:(e:unknown)=>void;let usage:TokenUsage|undefined;
    const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject;});void interrupted.catch(()=>{});
    let transportAbort:(()=>void)|undefined;
    const cancel=()=>{controller.abort(budget.signal.reason);rejectAbort(budget.signal.reason);try{transportAbort?.();}catch{/* interruption is authoritative */}};
    const external=()=>budget.cancel('生成已取消');
    budget.signal.addEventListener('abort',cancel,{once:true});options.signal?.addEventListener('abort',external,{once:true});
    const timer=setTimeout(()=>budget.cancel('父任务或当前请求超过时限。'),reservation.timeoutMs);
    const cleanup=()=>{clearTimeout(timer);budget.signal.removeEventListener('abort',cancel);options.signal?.removeEventListener('abort',external);reservation.settle(usage);};
    const race=<R>(p:Promise<R>)=>{const raced=Promise.race([p,interrupted]);void raced.catch(()=>{});return raced;};
    try {
      const running=start({...options,maxTokens,signal:controller.signal});transportAbort=running.abort;
      void running.usage?.then(u=>{if(!controller.signal.aborted)usage=u;}).catch(()=>{});
      const done=race(running.done).catch(error=>{controller.abort(error);try{transportAbort?.();}catch{/* failure cannot leave a live request */}throw error;}).finally(cleanup);void done.catch(()=>{});
      return {value:running.value,race,done,abort:external};
    } catch(error){cleanup();throw error;}
  };
  return {
    streamText(options){
      const run=execute(options,request=>{const stream=core.streamText(request);return {value:stream,usage:stream.usagePromise,abort:()=>stream.abort(),
        done:Promise.all([stream.textPromise,stream.reasoningPromise,stream.usagePromise,stream.finishReasonPromise,stream.recoveryPromise])};});
      const stream=run.value;
      return {...stream,abort:run.abort,textPromise:run.done.then(()=>stream.textPromise),
        reasoningPromise:run.race(stream.reasoningPromise),usagePromise:run.race(stream.usagePromise),
        finishReasonPromise:run.race(Promise.resolve(stream.finishReasonPromise)),recoveryPromise:run.race(Promise.resolve(stream.recoveryPromise))};
    },
    async generateObject<T>(schema:Record<string,unknown>,options:Omit<StreamTextOptions,'jsonSchema'>):Promise<T>{
      const run=execute({...options,jsonSchema:schema},request=>{const value=core.generateObject<T>(schema,request);return {value,done:value};});
      await run.done;return run.value;
    }
  };
}
