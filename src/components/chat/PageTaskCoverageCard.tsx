import React,{useMemo} from 'react';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {inspectPageTaskCoverage} from '../../services/ai/pageTaskCoverage';
const labels={input:'输入信息',display:'展示信息',interaction:'操作入口',state:'状态场景'};
const statuses={'source-indication':'源码线索','not-located':'未定位，请核对','scenario-only':'场景待核对'};
export function PageTaskCoverageCard({contract,html}:{contract?:DesignTaskContract;html?:string}) {
 const report=useMemo(()=>html?inspectPageTaskCoverage(contract,html):undefined,[contract,html]);
 if(!report)return null;
 if(report.status==='unavailable')return <p role="status" className="my-2 text-xs text-amber-300">需求覆盖记录不可用：{report.message}</p>;
 return <details aria-label="需求覆盖线索" className="my-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
  <summary className="cursor-pointer">需求覆盖线索 · {report.unlocatedCount} 项未定位</summary>
  <p className="text-slate-400">以下由当前页面源码重新定位，全部语义未验证。名称匹配不能证明业务、可见效果或交互运行正确；未定位也可能是文案差异，请结合预览核对。</p>
  {report.items.map((item,i)=><p key={i} className={`break-words ${item.status==='not-located'?'text-amber-300':'text-slate-400'}`}>
    {item.featureTitle} · {labels[item.kind]}：{item.label} — {statuses[item.status]}
  </p>)}
  <p className="break-words text-slate-500">完成条件仍待核对：{report.completion.join('；')}。互斥状态无需全部同时展示。</p>
 </details>;
}
