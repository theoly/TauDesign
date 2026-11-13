import {UserFacingNotice} from '../common/UserFacingNotice';
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
 const [thinking,setThinking]=useState<ModelCapabilityProfile['thinkingControl']>(current?stored?.thinkingControl:undefined);
 const [concurrency,setConcurrency]=useState<1|2>(current?stored?.maxConcurrency??1:1);
 const {bindings,setModelCapability,setRoleOutputLimit}=useAIConfigStore();
 const roles=(['code','chat','vision'] as ModelRole[]).filter(role=>bindings[role].providerId===provider.id&&bindings[role].modelId===model);
 const number=(value:string)=>value.trim()===''?undefined:Number(value);
 const save=()=>{try{const contextWindow=number(windowText),maxOutputTokens=number(outputText);setModelCapability(provider.id,model,contextWindow===undefined&&maxOutputTokens===undefined&&media===undefined&&concurrency===1&&thinking===undefined?undefined:{contextWindow,maxOutputTokens,mediaInput:media,maxConcurrency:concurrency,thinkingControl:thinking});setNotice('已保存。每次回复仍受本轮总额度和当前步骤限制。');}catch(error){setNotice(error instanceof Error?error.message:'容量保存失败。');}};
 return <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
  <summary className="cursor-pointer font-semibold text-slate-300">模型可处理的内容与回复长度</summary>
  <div className="mt-3 space-y-3">
   <p className="text-slate-400">这些设置仅用于当前 AI 服务和模型。留空表示未知；系统会把设计规则、资料、图片及预留回复空间一起估算，实际用量以服务报告为准。</p>
   {stored&&!current&&<p role="status" className="text-amber-300">旧设置与当前服务地址不匹配或无效；请重新核对保存。旧值不会用于发送。</p>}
   <p className="text-slate-500">用量单位（Token）由 AI 服务计量，不等于字符数或费用。</p>
   <div className="grid grid-cols-2 gap-3">
    <label className="space-y-1 block text-slate-400">一次可处理的总内容（用量单位）<input aria-label="模型上下文窗口" type="number" min={256} max={10000000} step={1} value={windowText} onChange={e=>setWindow(e.target.value)} placeholder={inferred?.contextWindow?`推荐: ${inferred.contextWindow}`:'未知'} className={field}/></label>
    <label className="space-y-1 block text-slate-400">单次回复最长可用量（用量单位）<input aria-label="模型最大输出" type="number" min={256} max={10000000} step={1} value={outputText} onChange={e=>setOutput(e.target.value)} placeholder={inferred?.maxOutputTokens?`推荐: ${inferred.maxOutputTokens}`:'未知'} className={field}/></label>
   </div>
   <label className="space-y-1 block text-slate-400">图片支持方式<select aria-label="模型图片输入能力" value={media??''} onChange={e=>setMedia(e.target.value?e.target.value as ModelCapabilityProfile['mediaInput']:undefined)} className={field}>
    <option value="">{inferred?.mediaInput ? `未手动配置（默认：${{'native-part':'直接接收图片','file-upload':'先上传图片',url:'接收图片链接',unsupported:'不支持图片'}[inferred.mediaInput]}）` : '未配置（沿用现有识图判定）'}</option><option value="native-part">支持直接发送图片</option><option value="url">仅接受图片链接</option><option value="unsupported">不支持图片</option>
   </select></label>
   <label className="space-y-1 block text-slate-400">回复前思考设置<select aria-label="模型思考控制协议" value={thinking??''} onChange={e=>setThinking(e.target.value?e.target.value as ModelCapabilityProfile['thinkingControl']:undefined)} className={field}>
    <option value="">自动（仅使用已验证的设置）</option><option value="deepseek">DeepSeek（已确认服务支持）</option><option value="qwen">Qwen（已确认服务支持）</option><option value="unsupported">不支持关闭思考</option>
   </select></label>
   <p className="text-slate-500">来源：{current?stored?.source==='user'?'用户配置':stored?.source:inferred?'系统推荐（留空时自动采用）':'未记录'}。填写更大的容量不会提高单次回复或本轮任务的额度。</p>
   <label className="space-y-1 block text-slate-400">允许同时处理的请求数<select aria-label="模型同级请求并发" value={concurrency} onChange={e=>setConcurrency(Number(e.target.value) as 1|2)} className={field}><option value={1}>1（默认）</option><option value={2}>2（已确认服务支持）</option></select></label>
   <button type="button" onClick={save} className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800">保存模型容量</button>
   {roles.map(role=><RoleLimit key={role+':'+model} role={role} value={bindings[role].maxOutputTokens} save={limit=>setRoleOutputLimit(role,limit)}/>)}
   {notice&&<div role="status" className="text-slate-300"><UserFacingNotice message={notice}/></div>}
  </div>
 </details>;
}
function RoleLimit({role,value,save}:{role:ModelRole;value?:number;save:(value?:number)=>void}) {
 const [text,setText]=useState(String(value??'')),[error,setError]=useState('');
 return <div className="space-y-1 border-t border-slate-800 pt-3"><label className="block text-slate-400">{{code:'页面设计',chat:'对话',vision:'参考图分析',image:'生成图片'}[role]}的回复长度上限（256–32768 个用量单位）
  <input aria-label={`${role}角色输出上限`} type="number" min={256} max={32768} value={text} placeholder="使用步骤默认值" onChange={e=>setText(e.target.value)} className={field}/></label>
  <button type="button" className="text-blue-300" onClick={()=>{try{save(text.trim()?Number(text):undefined);setError('已保存该用途的回复长度上限。');}catch(e){setError(e instanceof Error?e.message:'保存失败。');}}}>保存回复长度上限</button>{error&&<p role="status" className="text-slate-400">{error}</p>}
 </div>;
}
