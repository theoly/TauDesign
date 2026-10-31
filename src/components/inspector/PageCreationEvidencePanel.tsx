import {isMultiPageDelivery} from '../../services/ai/multiPageContract';
import React from 'react';
import {DesignGuidanceCard,RepairGuidanceSource} from '../chat/DesignGuidanceCard';
import {HistoricalDraftSource} from '../chat/HistoricalDraftSource';
import type {Screen} from '../../types/project';
import {createdPageFingerprint,isPageCreationEvidence} from '../../services/ai/pageCreationValidation';
import {PageTaskPlanCard} from '../chat/PageTaskPlanCard';
import {PageTaskCoverageCard} from '../chat/PageTaskCoverageCard';

const stageNames={'design-entities':'设计实体引用','multi-page-scope':'多页面计划范围','page-plan-schema':'页面计划格式','reference-input':'参考图片输入','library-binding':'设计库绑定与组件','source-safety':'源码安全',quality:'静态质量','asset-references':'资源登记','asset-files':'资源文件',render:'实际渲染',structure:'结构授权','analysis-schema':'分析格式','import-preview':'导入预览'};

export function PageCreationEvidencePanel({screen}:{screen:Screen}) {
  const raw=screen.metadata?.creationEvidence;
  if(raw===undefined)return null;
  if(!isPageCreationEvidence(raw))return <p className="rounded-lg border border-slate-800 p-3 text-xs text-amber-300">创建验收记录已损坏；当前页面仍可编辑，历史记录不能作为通过依据。</p>;
  const changed=createdPageFingerprint(screen)!==raw.pageFingerprint;
  const scope=raw.contract.multiPage,candidate=screen.metadata?.multiPageDelivery;
  const delivery=isMultiPageDelivery(candidate)&&scope?.planId===candidate.planId&&scope.planFingerprint===candidate.planFingerprint&&scope.kind===candidate.kind&&candidate.pages.some(p=>p.screenId===scope.screenId)?candidate:undefined;
  const variants=delivery?.kind==='variants',unit=variants?'个方案':'页';
  const historicalPage=delivery?.pages.find(p=>p.screenId===scope?.screenId);
  return <details className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
    <summary className="cursor-pointer font-medium text-slate-300">页面创建验收记录</summary>
    <div className="mt-3 space-y-2 break-words text-slate-400">
      <DesignGuidanceCard contract={raw.contract} historical/>
      <HistoricalDraftSource execution={raw.execution}/>
      <p>仅记录创建时的检查，不代表当前页面已重新验收。{changed?' 页面内容已变化。':''}</p>
      <p>{new Date(raw.checkedAt).toLocaleString()} · {raw.contract.device?.profile} / {raw.contract.device?.frameWidth}px</p>
      <p>{delivery?.request??raw.contract.request}</p>
      <PageTaskPlanCard contract={raw.contract}/>
      {!changed&&<PageTaskCoverageCard contract={raw.contract} html={screen.htmlContent}/>}
      {delivery&&<><p>本页：{historicalPage!.name} · 第 {delivery.pages.findIndex(p=>p.screenId===scope?.screenId)+1} / {delivery.pages.length} {unit}</p>
        <details><summary className="cursor-pointer">本次生成请求（技术记录）</summary><p className="mt-2 whitespace-pre-wrap">{raw.contract.request}</p></details></>}
      {raw.contract.referenceImage&&<p>参考图片：{raw.contract.referenceImage.name} · {raw.contract.referenceImage.fingerprint}。仅记录输入身份，不代表已通过图片视觉相似度检查。</p>}
      {raw.contract.librarySource&&<p>设计库：{raw.contract.librarySource.sourceProjectId} · {raw.contract.librarySource.mode==='pinned_reference'?'固定版本只读参考':'项目副本'} · Token v{raw.contract.librarySource.sourceTokenVersion} · {raw.contract.librarySource.sourceFingerprint}</p>}
      <p className="break-all">{raw.workflow.plan.workflowId} · {raw.workflow.plan.fingerprint}</p>
      {raw.workflow.checks.map(check=><p key={check.id}>{stageNames[check.id]}：{check.status==='passed'?'通过':check.status==='pending'?'待检查':'未通过'} · {check.message}</p>)}
      {screen.metadata?.multiPageDelivery!==undefined&&(delivery?<details><summary className="cursor-pointer">{variants?'同页方案确认计划':'多页面确认计划'}</summary>
        <p>规划检查 {delivery.planning.attempts} 次 · 确认 {delivery.pages.length} {unit} · 原计划 {delivery.originalPageCount} {unit} · 全部验收后统一加入</p>
        <p>{delivery.request}</p>
        {delivery.pages.map(p=><p key={p.id} className="mt-1">{p.name}：{p.requirements}{p.links.length>0&&` · 关联：${p.links.map(id=>delivery.pages.find(target=>target.id===id)!.name).join('、')}`}</p>)}
      </details>:<p className="text-amber-300">多页面历史计划记录已损坏。</p>)}
      {raw.repair&&<details><summary className="cursor-pointer text-amber-300">受控样式修复 1 次（已完整复验）</summary>
        <p>仅调整报错控件自身样式；未修改文案、结构或页面关联。{raw.repair.providerId} / {raw.repair.model}</p>
        <p className="break-all">修复前 {raw.repair.beforeHtmlFingerprint} · 修复后 {raw.repair.afterHtmlFingerprint}</p>
        {raw.repair.initialRender.findings.filter(f=>f.severity==='error').map((f,i)=><p key={i}>{f.nid}：{f.message}</p>)}
        {raw.repair.operations.map((op,i)=><p key={i}>{op.nid} · {op.type} · {op.value}</p>)}
        {raw.repair.usage&&<p>{raw.repair.usageEstimated?'估算':'记录'}用量：输入 {raw.repair.usage.inputTokens} / 输出 {raw.repair.usage.outputTokens}</p>}
        <RepairGuidanceSource trace={raw.repair.guidance}/>
      </details>}
      <p>iframe 检查 {raw.render.inspected} 个节点 · 核对 {raw.files.length} 个本地文件</p>
      {!!raw.quality.findings.length&&<details><summary className="cursor-pointer">静态检查发现 {raw.quality.findings.length} 项</summary>
        {raw.quality.findings.slice(0,20).map((finding,index)=><p key={index} className="mt-1 text-amber-300">{finding.message}</p>)}
      </details>}
    </div>
  </details>;
}
