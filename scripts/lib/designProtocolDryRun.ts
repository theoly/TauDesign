import {DefaultAIEngineCore} from '../../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../../src/services/ai/engine/transport/mockTransport';
import {PipelineExecutor} from '../../src/services/ai/engine/pipeline/executor';
import {executeStructuredEdit,type StructuredEditOptions} from '../../src/services/ai/structuredEditExecutor';
import {executeRestyleTarget} from '../../src/services/ai/restyleExecutor';
import {buildDesignTaskContract,buildRestyleContract} from '../../src/services/ai/designWorkflow';
import {buildPolishPrompt} from '../../src/services/ai/polishPrompt';
import {techBlueTheme} from '../../src/utils/themePresets';
import {createChatTaskBudget,createRestyleBudget} from '../../src/services/ai/taskBudgetPolicy';
import {guidancePacketIssue} from '../../src/services/ai/designKnowledge/receipt';
import {chatPageTaskPlan} from '../../test/fixtures/pageTaskPlan';
import {createHash} from 'node:crypto';
import type {DesignTaskContract} from '../../src/services/ai/designWorkflow';
import type {RuleFeature} from '../../src/services/ai/designKnowledge/types';

type Wire={body:any};
const provider={id:'local-protocol-fixture',name:'Local fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'SYNTHETIC_NOT_A_CREDENTIAL',isEnabled:true};
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)??'undefined').digest('hex');
const region='<section data-nid="region01"><h2 data-nid="title001">资料</h2><p data-nid="copy0001">长正文需要独立空间</p><button data-nid="save0001" class="btn btn-primary">查看详情</button></section>';
const outside='<aside>'+Array.from({length:24},(_,i)=>`<p data-nid="keep${i}">保留内容${i}</p>`).join('')+'</aside>';
const source=(device:'pc'|'mobile')=>`<main${device==='pc'?' class="container-max"':''}>${region}${outside}</main>`;
const changed=(html:string)=>html.replace('data-nid="region01"','data-nid="region01" class="col gap-4"');
const requireThat=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
function capture(respond:(request:Wire,transport:MockTransport)=>void){
 const requests:Wire[]=[],transport=new MockTransport();
 const core=new DefaultAIEngineCore({id:'local-protocol-dry-run',stream:(request,event)=>{if(!request.body)throw Error('实际请求缺少body');const wire={body:request.body};requests.push(wire);respond(wire,transport);return transport.stream(request,event);}});
 return {requests,core};
}
export interface ProtocolDryRunRow {
 id:string;device:'pc'|'mobile';protocol:string;status:'passed'|'failed';message?:string;
 baseline?:{inputChars:number;requests:number;requestedOutputTokens:number};
 contextual?:{inputChars:number;requests:number;requestedOutputTokens:number};
 receipts?:number;rules?:string[];messageSha256?:string[];schemaSha256?:string[];
}
function verify(id:string,device:'pc'|'mobile',protocol:string,a:Wire[],b:Wire[],contract:DesignTaskContract,budgetA:number,budgetB:number):ProtocolDryRunRow {
 requireThat(a.length===b.length,'规则不得增加模型轮次');requireThat(budgetA===budgetB,'规则不得扩大累计申请输出');
 for(let i=0;i<a.length;i++){
  requireThat(a[i].body.max_tokens===b[i].body.max_tokens,'单次输出预算变化');
  requireThat(sha(a[i].body.response_format)===sha(b[i].body.response_format),'实际输出Schema变化');
 }
 const inputChars=(requests:Wire[])=>requests.reduce((n,r)=>n+JSON.stringify(r.body.messages).length,0);
 requireThat(inputChars(b)<=inputChars(a),'最终请求字符预算增长');
 requireThat(!guidancePacketIssue(contract),'规则快照或真实派发回执无效');
 const packet=contract.designGuidance!;requireThat(packet.selection.selected.length>0,'固定正例未注入任何规则');
 requireThat(packet.requests.every(r=>r.status==='completed'&&packet.selection.selected.every(s=>r.injectedRuleIds.includes(s.rule.id))),'子请求没有继承同一规则');
 return {id,device,protocol,status:'passed',baseline:{inputChars:inputChars(a),requests:a.length,requestedOutputTokens:budgetA},contextual:{inputChars:inputChars(b),requests:b.length,requestedOutputTokens:budgetB},
 receipts:packet.requests.length,rules:packet.selection.selected.map(s=>s.rule.id),messageSha256:b.map(r=>sha(r.body.messages)),schemaSha256:b.map(r=>sha(r.body.response_format))};
}
async function html(device:'pc'|'mobile',continuation:boolean):Promise<ProtocolDryRunRow>{
 const runs=[];
 for(const enabled of [false,true]){
  const f=capture((r,t)=>{
   if(r.body.response_format)t.queueResponse(JSON.stringify(chatPageTaskPlan));
   else if(continuation){
    const marker=JSON.stringify(r.body.messages).match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
    if(marker)t.queueResponse(marker+'\n</main></artifact>');
    else t.enqueueScenario({events:[{type:'Delta',text:'<artifact title="资料"><main class="'+(device==='pc'?'container-max':'p-4')+'"><h1>资料</h1><p>长正文需要独立空间</p><button class="btn btn-primary">查看详情</button>'},{type:'Done',finish_reason:'length'}]});
   }else t.queueResponse('<artifact title="资料"><main class="'+(device==='pc'?'container-max':'p-4')+'"><h1>资料</h1><p>长正文需要独立空间</p><button class="btn btn-primary">查看详情</button></main></artifact>');
  });
  const budget=createChatTaskBudget();
  try{const result=await PipelineExecutor.execute({input:{rawPrompt:'新建长正文资料页，保留查看详情操作',activeScreenId:null},screens:{},provider,model:'fixture',engineCore:f.core,deviceProfile:device,frameWidth:device==='pc'?1440:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline',pageTaskPlanning:{},taskBudget:budget,...(enabled?{contextualGuidance:{features:['long-copy' as const]}}:{})});
   requireThat(result.status==='applied',result.errorMessage??'完整HTML未通过');if(continuation)requireThat(result.executionRecord?.continuationCount===1,'未执行实际续写');
   runs.push({result,requests:f.requests,budget:budget.snapshot()});
  }finally{budget.close();}
 }
 const [a,b]=runs;return verify(`${device}-${continuation?'continuation':'html'}`,device,continuation?'continuation':'html',a.requests,b.requests,b.result.workflowContract!,a.budget.requestedOutputTokens,b.budget.requestedOutputTokens);
}
async function structured(device:'pc'|'mobile',kind:'finite-json'|'fragment-json'|'supplement-json'):Promise<ProtocolDryRunRow>{
 const runs=[];
 for(const enabled of [false,true]){
  const raw=source(device),request=kind==='finite-json'?'主按钮文字保留完整，字体加粗':'长正文保持完整，调整文字层级';
  const nid=kind==='finite-json'?'save0001':kind==='fragment-json'?'region01':'title001';
  const options:StructuredEditOptions={mode:kind==='finite-json'?'element':kind==='fragment-json'?'region':'local',screen:{id:'page',name:'资料页',htmlContent:raw},request,
   contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料页',htmlContent:raw},allowedChanges:[`element:${nid}`],...(kind==='finite-json'?{elementNid:nid}:{}),deviceProfile:device,frameWidth:device==='pc'?1440:390}),
   settings:{deviceProfile:device,frameWidth:device==='pc'?1440:390},designSystem:techBlueTheme,colorMode:'light',binding:{provider,model:'fixture'},isCurrent:()=>true,
   ...(kind==='finite-json'?{elementNid:nid}:kind==='fragment-json'?{regionNids:[nid]}:{local:{allowedNids:[nid],operations:[],supplement:true}}),
   ...(enabled?{contextualGuidance:{features:[kind==='finite-json'?'button':'long-copy'] as RuleFeature[]}}:{})};
  const f=capture((_,t)=>t.queueResponse(JSON.stringify(kind==='fragment-json'?{nid,html:changed(region)}:{requiresPageRewrite:false,reason:'',operations:[{nid,type:'add_classes',value:'font-semibold'}]})));
  const result=await executeStructuredEdit(f.core,options);requireThat(result.status==='ready','结构化候选未通过');requireThat(options.screen.htmlContent===raw,'原页被改动');runs.push({result,requests:f.requests});
 }
 const [a,b]=runs;return verify(`${device}-${kind}`,device,kind,a.requests,b.requests,b.result.contract,a.result.taskBudget!.requestedOutputTokens,b.result.taskBudget!.requestedOutputTokens);
}
async function restyle(device:'pc'|'mobile',kind:'restyle-html'|'native-patch'|'imported-patch'):Promise<ProtocolDryRunRow>{
 const runs=[];
 for(const enabled of [false,true]){
  const padding='/*'+'unchanged-source '.repeat(1800)+'*/';
  const raw=kind==='imported-patch'?`<html><head><style>:root{--brand:#ff6600;--page:#fff7ef}${padding}</style></head><body data-nid="root0001"><button data-nid="save0001" class="btn btn-primary">查看详情</button></body></html>`:
   source(device)+(kind==='native-patch'?`<!--${padding}-->`:'');
  const target={id:'page',name:'资料页',kind:'screen' as const,html:raw,imported:kind==='imported-patch'};
  const f=capture((r,t)=>{
   if(kind==='restyle-html')t.queueResponse('```html\n'+changed(raw)+'\n```');
   else{const p=JSON.parse(r.body.messages[1].content);t.queueResponse(JSON.stringify(kind==='imported-patch'?{bindings:p.items.map((item:any)=>({id:item.id,role:'primary'}))}:{operations:[{nid:p.items[0].nid,add:['p-4'],remove:[]}]}));}
  });
  const budget=createRestyleBudget([target]);
  try{const result=await executeRestyleTarget(f.core,{target,contract:buildRestyleContract({scope:'batch',target,confirmedScope:'长正文独立空间',deviceProfile:device,frameWidth:device==='pc'?1440:390,designSystem:techBlueTheme}),quality:{deviceProfile:device,designSystem:techBlueTheme},taskBudget:budget,
   request:{provider,model:'fixture',maxTokens:16384,messages:[{role:'system',content:buildPolishPrompt({designSystem:techBlueTheme,deviceProfile:device,frameWidth:device==='pc'?1440:390})},{role:'user',content:raw}]},...(enabled?{contextualGuidance:{features:['long-copy' as const]}}:{})});
   requireThat(result.status==='applied',result.message??'重塑未通过');requireThat(result.diff?.textChanged===0,'润色改变了文案');requireThat(target.html===raw,'重塑更改原目标');runs.push({result,requests:f.requests,budget:budget.snapshot()});
  }finally{budget.close();}
 }
 const [a,b]=runs;return verify(`${device}-${kind}`,device,kind,a.requests,b.requests,b.result.workflowContract!,a.budget.requestedOutputTokens,b.budget.requestedOutputTokens);
}
/** Only synthetic fixtures and MockTransport. Every row starts both arms; no external Provider or private project. */
export async function runDesignProtocolDryRun(){
 const rows:ProtocolDryRunRow[]=[];
 for(const device of ['mobile','pc'] as const){
  const cases:Array<[string,()=>Promise<ProtocolDryRunRow>]>=[['html',()=>html(device,false)],['continuation',()=>html(device,true)],
   ...(['finite-json','fragment-json','supplement-json'] as const).map(kind=>[kind,()=>structured(device,kind)] as [string,()=>Promise<ProtocolDryRunRow>]),
   ...(['restyle-html','native-patch','imported-patch'] as const).map(kind=>[kind,()=>restyle(device,kind)] as [string,()=>Promise<ProtocolDryRunRow>])];
  for(const [protocol,run] of cases){try{rows.push(await run());}catch(error){rows.push({id:`${device}-${protocol}`,device,protocol,status:'failed',message:error instanceof Error?error.message:String(error)});}}
 }
 return {version:1,kind:'controlled-protocol-dry-run',passed:rows.every(r=>r.status==='passed'),rows,
  boundaries:['全部使用合成公开夹具与MockTransport，无真实模型质量结论。','记录字符预算及申请输出额度，字符数量不等于真实输入Token计费。','JSON业务规划仍先于视觉，规划请求不伪造规则派发回执。','不读取正式留出集，不作为M5生成对照或盲评。']};
}
