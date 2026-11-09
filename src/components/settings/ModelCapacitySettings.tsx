import React,{useState} from 'react';
import type {AIProviderConfig,ModelRole} from '../../types/provider';
import {useAIConfigStore} from '../../stores/useAIConfigStore';
import {endpointIdentity,validModelCapability,inferKnownModelCapability,type ModelCapabilityProfile} from '../../services/ai/modelCapabilities';

const field='w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200';
export function ModelCapacitySettings({provider,model}:{provider:AIProviderConfig;model:string}) {
 const stored=provider.modelCapabilities?.[model];
 let current=false;try{current=validModelCapability(stored)&&stored.endpointIdentity===endpointIdentity(provider);}catch{/* Invalid endpoint is handled at save/send. */}
 const inferred=!current?inferKnownModelCapability(provider,model):undefined;
 const [windowText,setWindow]=useState(current?String(stored?.contextWindow??''):''),[outputText,setOutput]=useState(current?String(stored?.maxOutputTokens??''):'');
 const [media,setMedia]=useState<ModelCapabilityProfile['mediaInput']>(current?stored?.mediaInput:undefined),[notice,setNotice]=useState('');
 const [concurrency,setConcurrency]=useState<1|2>(current?stored?.maxConcurrency??1:1);
 const {bindings,setModelCapability,setRoleOutputLimit}=useAIConfigStore();
 const roles=(['code','chat','vision'] as ModelRole[]).filter(role=>bindings[role].providerId===provider.id&&bindings[role].modelId===model);
 const number=(value:string)=>value.trim()===''?undefined:Number(value);
 const save=()=>{try{const contextWindow=number(windowText),maxOutputTokens=number(outputText);setModelCapability(provider.id,model,contextWindow===undefined&&maxOutputTokens===undefined&&media===undefined&&concurrency===1?undefined:{contextWindow,maxOutputTokens,mediaInput:media,maxConcurrency:concurrency});setNotice('已保存。每次调用仍受任务总预算和各步骤上限约束。');}catch(error){setNotice(error instanceof Error?error.message:'容量保存失败。');}};
 return <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
  <summary className="cursor-pointer font-semibold text-slate-300">模型容量与输出上限</summary>
  <div className="mt-3 space-y-3">
   <p className="text-slate-400">按当前网关与模型保存。留空表示未知；输入估算包含系统规则、资料、Schema、图片及输出余量，无法代替厂商精确计数。</p>
   {stored&&!current&&<p role="status" className="text-amber-300">原容量配置与当前端点不匹配或无效；请重新核对保存。旧值不会用于发送。</p>}
   <div className="grid grid-cols-2 gap-3">
    <label className="space-y-1 block text-slate-400">上下文窗口（tokens）<input aria-label="模型上下文窗口" type="number" min={256} max={10000000} step={1} value={windowText} onChange={e=>setWindow(e.target.value)} placeholder={inferred?.contextWindow?`推荐: ${inferred.contextWindow}`:'未知'} className={field}/></label>
    <label className="space-y-1 block text-slate-400">模型最大输出（tokens）<input aria-label="模型最大输出" type="number" min={256} max={10000000} step={1} value={outputText} onChange={e=>setOutput(e.target.value)} placeholder={inferred?.maxOutputTokens?`推荐: ${inferred.maxOutputTokens}`:'未知'} className={field}/></label>
   </div>
   <label className="space-y-1 block text-slate-400">图片输入能力<select aria-label="模型图片输入能力" value={media??''} onChange={e=>setMedia(e.target.value?e.target.value as ModelCapabilityProfile['mediaInput']:undefined)} className={field}>
    <option value="">{inferred?.mediaInput ? `未手动配置（默认推断：${inferred.mediaInput}）` : '未配置（沿用现有识图判定）'}</option><option value="native-part">支持专用图片字段</option><option value="url">仅接受图片URL</option><option value="unsupported">不支持图片</option>
   </select></label>
   <p className="text-slate-500">来源：{current?stored?.source==='user'?'用户配置':stored?.source:inferred?'内置元数据推荐（未填写时自动采用）':'未记录'}。填写更大窗口不会提高单次生成或父任务的输出额度。</p>
   <label className="space-y-1 block text-slate-400">端点支持的同级请求并发<select aria-label="模型同级请求并发" value={concurrency} onChange={e=>setConcurrency(Number(e.target.value) as 1|2)} className={field}><option value={1}>1（默认；未知端点）</option><option value={2}>2（我已确认此端点支持）</option></select></label>
   <button type="button" onClick={save} className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800">保存模型容量</button>
   {roles.map(role=><RoleLimit key={role+':'+model} role={role} value={bindings[role].maxOutputTokens} save={limit=>setRoleOutputLimit(role,limit)}/>)}
   {notice&&<p role="status" className="text-slate-300">{notice}</p>}
  </div>
 </details>;
}
function RoleLimit({role,value,save}:{role:ModelRole;value?:number;save:(value?:number)=>void}) {
 const [text,setText]=useState(String(value??'')),[error,setError]=useState('');
 return <div className="space-y-1 border-t border-slate-800 pt-3"><label className="block text-slate-400">{role} 角色输出上限（256–32768 tokens）
  <input aria-label={`${role}角色输出上限`} type="number" min={256} max={32768} value={text} placeholder="使用步骤默认值" onChange={e=>setText(e.target.value)} className={field}/></label>
  <button type="button" className="text-blue-300" onClick={()=>{try{save(text.trim()?Number(text):undefined);setError('已保存角色上限。');}catch(e){setError(e instanceof Error?e.message:'保存失败。');}}}>保存角色上限</button>{error&&<p role="status" className="text-slate-400">{error}</p>}
 </div>;
}
