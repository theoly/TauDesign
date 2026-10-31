import React from 'react';
import type { DesignBrief } from '../../services/ai/designBrief';
const pageKinds={form:'表单',detail:'详情/档案',list:'列表',dashboard:'工作台/看板',pricing:'套餐/充值',conversation:'对话/建议',unknown:'未确定'};

export function DesignBriefCard({ brief }: { brief: DesignBrief }) {
  return <details className="my-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300" data-testid="design-brief">
    <summary className="cursor-pointer">本次设计方向 · {brief.direction} · {brief.density}</summary>
    <dl className="mt-2 space-y-2 break-words">
      {brief.requirementsPolicy && <div><dt className="text-slate-400">需求依据</dt><dd>{brief.requirementsPolicy}</dd></div>}
      <div><dt className="text-slate-400">目标</dt><dd>{brief.goal}</dd></div>
      {brief.scene&&typeof brief.scene.pageKind==='string'&&<div><dt className="text-slate-400">页面类型</dt><dd>{pageKinds[brief.scene.pageKind]??'未确定'} · {brief.scene.source==='provided'?'任务提供':'系统推断，非已确认业务事实'}</dd></div>}
      <div><dt className="text-slate-400">布局</dt><dd>{brief.layout}</dd></div>
      <div><dt className="text-slate-400">视觉</dt><dd><span style={{ backgroundColor: brief.primaryColor }} className="mr-1 inline-block h-2 w-2 rounded-full" />沿用工程主色、字体与间距</dd></div>
      <div><dt className="text-slate-400">操作</dt><dd>{brief.actionPolicy}</dd></div>
      <div><dt className="text-slate-400">内容</dt><dd>{brief.contentPolicy}</dd></div>
      {Array.isArray(brief.contentObligations)&&brief.contentObligations.length>0&&<div><dt className="text-slate-400">内容要求</dt><dd>{brief.contentObligations.filter(o=>o&&typeof o.text==='string').slice(0,20).map((o,i)=><p key={i}>{o.kind==='exact'?'保留原文':'保留语义'}：{o.text}</p>)}</dd></div>}
    </dl>
    <p className="mt-2 text-slate-500">自动沿用当前工程规范；可在后续对话中补充或调整方向。</p>
  </details>;
}
