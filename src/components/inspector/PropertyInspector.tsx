import {createAIEngineCore} from '../../services/ai/engine/core';
import {executeStructuredEdit} from '../../services/ai/structuredEditExecutor';
import {buildDesignTaskContract} from '../../services/ai/designWorkflow';
import {continuationBindingKey} from '../../services/ai/generationContinuation';
import {captureModificationSnapshot,isModificationSnapshotCurrent} from '../../services/ai/modificationReview';
import {type RequestActivity} from '../../services/ai/requestActivity';
import {RequestActivityCard} from '../chat/RequestActivityCard';
import { DesignSections, TypographySection } from './DesignSections';
import { AppearanceSections } from './AppearanceSections';
import { ImageSection } from './ImageSection';
import { Section, type PropertyPatch } from './PropertyFields';
import {PageCreationEvidencePanel} from './PageCreationEvidencePanel';
import { ScreenDesignRoleEditor } from './ScreenDesignRoleEditor';
import { ProjectAssetAuditPanel } from './ProjectAssetAuditPanel';
import { DeliveryHistoryPanel } from './DeliveryHistoryPanel';
import { clearInspectorPreview, findScreenElement, isEscapedInspectorValue, setInspectorPreview } from '../../utils/inspectorStyle';
import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { useT } from '../../stores/useLocaleStore';
import { TokenLintEngine, computeScreenAuditReport, getTokenLintContext } from '../../utils/tokenLint';
import { setTextByNid, uneditableHint } from '../../utils/textNode';
import { duplicateElementByNid, wrapElementByNid } from '../../utils/domPatcher';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Copy,
  Layers,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Wand2
} from 'lucide-react';

const formatBreadcrumbClass = (rawCls: unknown): string => {
  if (typeof rawCls === 'string') {
    const trimmed = rawCls.trim();
    if (!trimmed) return '';
    return '.' + trimmed.split(/\s+/).slice(0, 2).join('.');
  }
  if (rawCls && typeof rawCls === 'object' && 'baseVal' in rawCls) {
    const base = String((rawCls as any).baseVal || '').trim();
    if (!base) return '';
    return '.' + base.split(/\s+/).slice(0, 2).join('.');
  }
  return '';
};

export const PropertyInspector: React.FC = () => {
  const {
    activeScreenId,
    selectedNid,
    selectedNode,
    screens,
    assets,
    id: projectId,
    folderPath,
    deliveryArchiveRevision,
    deliveryArchiveNotice,
    settings,
    overrides,
    designSystem,
    components,
    setOverride,
    clearNodeOverrides,
    selectNode,
    updateScreenHtml,
    deleteNode,
    extractComponentFromNode,
    detachComponentInstance,
    syncComponentInstances,
    selectNodeByNid,
    setScreenLinkTarget,
    setScreenDesignRole,
    postAuditReport
  } = useProjectStore();
  const t = useT();

  const { getActiveProviderForRole } = useAIConfigStore();

  // Point-and-Edit AI state
  const [pointPrompt, setPointPrompt] = useState('');
  const [isPointGenerating, setIsPointGenerating] = useState(false);
  const [pointNotice,setPointNotice]=useState('');
  const pointJob=useRef<AbortController|null>(null);
  const [pointActivity,setPointActivity]=useState<RequestActivity>(),pointMounted=useRef(true);
  const pointBinding=getActiveProviderForRole('code'),pointBindingKey=pointBinding?continuationBindingKey({provider:pointBinding.provider,model:pointBinding.modelId}):null;
  const pointContextKey=JSON.stringify([projectId,useProjectStore.getState().folderPath,activeScreenId,selectedNid]),pointContext=useRef({key:pointContextKey,model:pointBindingKey});
  useEffect(()=>{pointMounted.current=true;return()=>{pointMounted.current=false;const job=pointJob.current;pointJob.current=null;job?.abort();};},[]);
  useEffect(()=>{
    const previous=pointContext.current;pointContext.current={key:pointContextKey,model:pointBindingKey};
    if(previous.key===pointContextKey&&previous.model===pointBindingKey)return;
    const job=pointJob.current;pointJob.current=null;job?.abort();setIsPointGenerating(false);setPointActivity(undefined);
    setPointNotice(job?(previous.model!==pointBindingKey?'模型已变化，旧局部修改已取消。':'选中目标或工程已变化，旧局部修改已取消。'):'');
  },[pointContextKey,pointBindingKey]);
  const stopPoint=()=>{const job=pointJob.current;pointJob.current=null;job?.abort();setIsPointGenerating(false);setPointNotice('局部修改已取消，原页未改变。');setPointActivity(value=>value?{...value,active:0,status:'cancelled',lastActivityAt:Date.now()}:value);};

  // Component states
  const [compNameInput, setCompNameInput] = useState('');
  const [showExtractInput, setShowExtractInput] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // 文本字段：受控输入。此前用 defaultValue 且 <input> 无 key，React 复用同一
  // DOM 节点，切换选中元素时字段仍显示上一个元素的文本 (doc/issues.md ISSUE-001)
  const [textDraft, setTextDraft] = useState('');
  useEffect(() => {
    setTextDraft(selectedNode?.textContent ?? '');
  }, [selectedNid, selectedNode?.textContent]);


  useEffect(() => {
    const el = activeScreenId && selectedNid ? findScreenElement(activeScreenId, selectedNid) : null;
    return () => { if (el) clearInspectorPreview(el.ownerDocument); };
  }, [activeScreenId, selectedNid]);

  if (!activeScreenId || !selectedNid || !selectedNode) {
    const curScreen = activeScreenId ? screens[activeScreenId] : null;
    const lint = curScreen ? TokenLintEngine.scan(curScreen.htmlContent, designSystem, settings.deviceProfile, getTokenLintContext(curScreen)) : null;

    return (
      <div className="w-full min-w-0 h-full bg-host-chrome text-host-primary p-5 flex flex-col gap-3 overflow-y-auto text-xs select-none">
        <div className="min-h-28 flex-1 flex flex-col items-center justify-center text-center text-host-tertiary">
          <Sliders className="w-8 h-8 text-host-tertiary mb-3" />
          <span className="font-medium text-host-secondary">{t('inspector.emptyTitle')}</span>
          <p className="mt-1 text-[11px] leading-relaxed">
            {t('inspector.emptyHint')}
          </p>
        </div>

        {curScreen && curScreen.metadata?.kind !== 'specimen' && <ScreenDesignRoleEditor screen={curScreen} onCommit={patch => setScreenDesignRole(curScreen.id, patch)} />}
        {curScreen && curScreen.metadata?.kind !== 'specimen' && <PageCreationEvidencePanel screen={curScreen} />}
        {curScreen && curScreen.metadata?.kind !== 'specimen' && <DeliveryHistoryPanel key={`${projectId}:${folderPath}:${curScreen.id}`} projectId={projectId} folderPath={folderPath}
          screen={curScreen} revision={deliveryArchiveRevision} notice={deliveryArchiveNotice} />}
        <ProjectAssetAuditPanel projectId={projectId} folderPath={folderPath} screens={screens} assets={assets} />

        {/* Screen Health & Token Lint Widget (PRD §3.5.4) */}
        {lint && curScreen && (
          <div className="p-3 bg-host-sunken border border-host-border rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-host-primary">{t('inspector.tokenCompliance')}</span>
              <span className={`font-mono font-bold ${lint.complianceRate >= 95 ? 'text-host-success' : 'text-host-warning'}`}>
                {lint.complianceRate}%
              </span>
            </div>
            <div className="w-full bg-host-elevated h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  lint.complianceRate >= 95 ? 'bg-host-accent' : 'bg-amber-500'
                }`}
                style={{ width: `${lint.complianceRate}%` }}
              />
            </div>
            <div className="space-y-1.5 pt-1">
              {curScreen.metadata?.importedHtml && <p className="text-[11px] leading-relaxed text-host-secondary">导入页包含自带样式；Token 合规度仅衡量与项目基座的差异，不代表视觉还原度。保留原貌时无需自动统一这些差异。</p>}
              <span className="text-[10px] text-host-secondary block">
                {lint.issues.length > 0 ? t('inspector.lintIssues', { count: lint.issues.length }) : t('inspector.lintClean')}
              </span>
              <button
                type="button"
                onClick={() => {
                  const report = computeScreenAuditReport(curScreen, designSystem, settings.deviceProfile);
                  postAuditReport(report);
                }}
                className="w-full py-1.5 px-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99]"
                title={t('inspector.auditTitle')}
              >
                <Sparkles className="w-3.5 h-3.5 text-host-on-accent" />
                <span>{t('inspector.auditOnce')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentScreen = screens[activeScreenId];
  const overrideKey = `${activeScreenId}:${selectedNid}`;
  const currentOverride = overrides[overrideKey] || { nid: selectedNid, declarations: {} };
  const decs = currentOverride.declarations;

  const handlePreview = (patch: PropertyPatch | null) => {
    const el = findScreenElement(activeScreenId, selectedNid);
    if (!el) return;
    if (patch) setInspectorPreview(el.ownerDocument, selectedNid, patch);
    else clearInspectorPreview(el.ownerDocument);
  };
  const handleBatchChange = (patch: PropertyPatch) => {
    handlePreview(null);
    setOverride(activeScreenId, selectedNid, patch,
      Object.entries(patch).some(([prop, value]) => isEscapedInspectorValue(prop, value)),
      `调整${selectedNode.tagName}属性: ${Object.keys(patch).filter(p => patch[p]).slice(0, 3).join('、') || '还原'}`);
  };
  const snapshot = selectedNode.inspector;
  const computed: PropertyPatch = snapshot?.styles ?? Object.fromEntries(Object.entries(selectedNode.computedLayout ?? {}).map(([key, value]) => [key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), String(value ?? '')]));
  const sectionProps = { declarations: decs, computed, authored:snapshot?.authored, onChange: handleBatchChange, onPreview: handlePreview, tokens: snapshot?.tokens, pageColors: snapshot?.pageColors };
  const isTextNode = selectedNode.textEditable !== false && selectedNode.tagName !== 'img' && selectedNode.tagName !== 'svg';
  const selectedLinkTarget = findScreenElement(activeScreenId, selectedNid)?.getAttribute('data-target-screen-id') || '';
  const availableTargets = Object.values(screens).filter(screen => screen.metadata?.kind !== 'specimen');

  const handleTextChange = (newText: string) => {
    if (selectedNode.textEditable === false) return;
    const trimmed = newText.trim();
    // 正则匹配 HTML 会在嵌套元素处截断产出非法结构、对空元素静默失效，
    // 统一走 DOMParser (doc/issues.md ISSUE-004)
    const updatedHtml = setTextByNid(currentScreen.htmlContent, selectedNid, trimmed);
    if (updatedHtml) {
      updateScreenHtml(activeScreenId, updatedHtml, `修改文案: ${trimmed.slice(0, 10)}`);
      selectNode({ ...selectedNode, textContent: trimmed });
    }
  };

  // --- Point-and-Edit: 局部 AI 微调 (T-P2-01 / PRD §3.6.2) ---
  const handlePointAndEdit = async () => {
    if (!pointPrompt.trim() || pointJob.current) return;
    const binding=getActiveProviderForRole('code');
    if(!binding?.provider||(!binding.provider.apiKey&&binding.provider.protocol!=='ollama_native')) {setPointNotice('请先配置可用的代码模型。');return;}
    const state=useProjectStore.getState(),screen=state.screens[activeScreenId];
    if(!screen)return;
    const snapshot=captureModificationSnapshot(state,activeScreenId),job=new AbortController(),request=pointPrompt.trim();
    pointJob.current=job;setIsPointGenerating(true);setPointNotice('');
    const current=()=>{const latest=useAIConfigStore.getState().getActiveProviderForRole('code');return pointMounted.current&&pointJob.current===job&&!job.signal.aborted&&useProjectStore.getState().activeScreenId===activeScreenId&&useProjectStore.getState().selectedNid===selectedNid&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot)&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:binding.provider,model:binding.modelId}));};
    try {
      const contract=buildDesignTaskContract({intent:'modify_screen',request,target:screen,elementNid:selectedNid,
        deviceProfile:state.settings.deviceProfile,frameWidth:state.settings.frameWidth,referenceDeviceName:state.settings.referenceDevice?.name,
        designSystem:state.designSystem,designSystemOrigin:state.designSystemOrigin,protectedNids:state.getProtectedNids(activeScreenId)});
      const candidate=await executeStructuredEdit(createAIEngineCore(),{mode:'element',binding:{provider:binding.provider,model:binding.modelId},
        contextualGuidance:useAIConfigStore.getState().autoReferenceDesignRules?{}:undefined,
        signal:job.signal,screen,styleOverrides:state.overrides,elementNid:selectedNid,request,settings:state.settings,contract,designSystem:state.designSystem,colorMode:state.settings.colorMode,
        protectedNids:state.getProtectedNids(activeScreenId),isCurrent:current,
        onActivity:activity=>{if(current())setPointActivity(activity);},
        onPhase:phase=>{if(current())setPointNotice(phase==='planning'?'正在梳理所选元素内的功能与交互…':'正在生成所选元素的副本修改…');}});
      if(!current()){
        if(pointMounted.current&&pointJob.current===job&&!job.signal.aborted)setPointNotice('原页或工程已变化，本次局部修改未应用。');
        return;
      }
      if(candidate.status!=='ready')throw Error(candidate.message);
      useProjectStore.getState().stageScreenChange(activeScreenId,candidate.html,`${screen.name}（局部微调候选）`,request,candidate.contract,candidate.executionRecord);
      setPointPrompt('');setPointNotice('已创建局部修改候选，请比较后采纳。');
    }catch(error){if(current())setPointNotice(error instanceof Error?error.message:'局部修改失败，原页未改变。');else if(pointMounted.current&&pointJob.current===job&&!job.signal.aborted)setPointNotice('原页或工程已变化，本次局部修改未应用。');}
    finally{if(pointJob.current===job){pointJob.current=null;if(pointMounted.current){setIsPointGenerating(false);setPointActivity(value=>value?.active?{...value,active:0,status:'cancelled',lastActivityAt:Date.now()}:value);}}}
  };

  // --- Structural Operations (T-P2-07 / PRD §3.6.3 / ISSUE-021) ---
  const handleDuplicateNode = () => {
    const res = duplicateElementByNid(currentScreen.htmlContent, selectedNid);
    if (!res.success) return;
    updateScreenHtml(activeScreenId, res.html, `复制元素: #${selectedNid}`);
    if (res.newNid) {
      selectNodeByNid(activeScreenId, res.newNid);
    }
  };

  const handleDeleteNode = () => {
    deleteNode(activeScreenId, selectedNid);
  };

  const handleWrapInContainer = (containerType: 'row' | 'col' | 'card') => {
    const res = wrapElementByNid(currentScreen.htmlContent, selectedNid, containerType);
    if (!res.success) return;
    updateScreenHtml(activeScreenId, res.html, `包裹为 ${containerType}: #${selectedNid}`);
    if (res.containerNid) {
      selectNodeByNid(activeScreenId, res.containerNid);
    }
  };

  const handleExtractComponent = () => {
    if (!compNameInput.trim()) return;
    const compId = extractComponentFromNode(activeScreenId, selectedNid, compNameInput.trim());
    if (compId) {
      setShowExtractInput(false);
      setCompNameInput('');
      setSyncStatusMsg(`成功提取为组件「${compNameInput.trim()}」`);
      setTimeout(() => setSyncStatusMsg(null), 3000);
    }
  };

  const handleSyncComponent = () => {
    if (!selectedNode.componentId) return;
    const res = syncComponentInstances(selectedNode.componentId);
    if (res.skippedConflictCount > 0) {
      setSyncStatusMsg(`已同步 ${res.syncedCount} 处；跳过 ${res.skippedConflictCount} 处实例。${res.details[0]??'无法安全保留用户内容。'}`);
    } else {
      setSyncStatusMsg(`成功同步全部 ${res.syncedCount} 处实例`);
    }
    setTimeout(() => setSyncStatusMsg(null), 3500);
  };

  return (
    <div className="w-full min-w-0 h-full bg-host-chrome text-host-primary flex flex-col z-20 text-xs select-none">
      {/* Header & Breadcrumb (PRD §3.6.1) */}
      <div className="p-3 border-b border-host-border bg-host-chrome">
        <div className="flex items-center gap-1 text-host-secondary text-[11px] mb-2 font-mono overflow-x-auto whitespace-nowrap pb-1">
          <Layers className="w-3.5 h-3.5 text-host-brand shrink-0" />
          <span className="truncate max-w-[70px] text-host-tertiary" title={currentScreen?.name}>{currentScreen?.name}</span>
          {selectedNode.parentChain && selectedNode.parentChain.map((p) => (
            <React.Fragment key={p.nid}>
              <ChevronRight className="w-3 h-3 text-host-tertiary shrink-0" />
              <button
                onClick={() => selectNodeByNid(activeScreenId, p.nid)}
                className="hover:text-host-brand hover:underline transition truncate max-w-[60px]"
                title={`${p.tagName}${formatBreadcrumbClass(p.className)}`}
              >
                {p.tagName}
              </button>
            </React.Fragment>
          ))}
          <ChevronRight className="w-3 h-3 text-host-tertiary shrink-0" />
          <span className="text-host-brand font-semibold">{selectedNode.tagName}</span>
          <span className="text-host-tertiary font-mono text-[10px]">#{selectedNid}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-host-secondary">
          <span>{t('inspector.sizeLabel', { width: selectedNode.computedBox?.width ?? 0, height: selectedNode.computedBox?.height ?? 0 })}</span>
          {currentOverride.escaped && (
            <span className="flex items-center gap-1 text-host-warning bg-amber-950/50 border border-amber-800/40 px-1.5 py-0.5 rounded text-[10px]">
              <AlertTriangle className="w-3 h-3" />
              <span>{t('inspector.tokenEscape')}</span>
            </span>
          )}
        </div>
      </div>

      {/* 常驻：局部定向 AI 微调。它是跨场景高频入口，不该藏进任一 Tab (BR-INS-01) */}
      <div className="px-3 pt-3">
        {/* Point-and-Edit: 局部定向 AI 微调 (PRD §3.6.2) */}
        <div className="p-3 bg-host-elevated border border-host-accent/30 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5 text-host-brand font-semibold text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-host-brand" />
            <span>{t('inspector.pointEditTitle')}</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={pointPrompt}
              onChange={(e) => setPointPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePointAndEdit();
              }}
              placeholder={t('inspector.pointEditPlaceholder')}
              className="w-full bg-host-sunken border border-host-border rounded-lg px-2.5 py-1.5 text-host-primary placeholder:text-host-tertiary text-xs focus:outline-none focus:border-host-accent pr-8"
            />
            <button
              onClick={handlePointAndEdit}
              aria-label={t('inspector.pointEditAria')}
              disabled={isPointGenerating || !pointPrompt.trim()}
              className="absolute right-1.5 top-1.5 p-1 bg-host-accent hover:bg-host-accent-hover disabled:opacity-40 text-host-on-accent rounded transition"
            >
              <Wand2 className="w-3 h-3" />
            </button>
          </div>
          {pointNotice&&<p role="status" className="text-[11px] leading-relaxed text-host-secondary">{pointNotice}</p>}
          {isPointGenerating&&<button type="button" aria-label={t('inspector.pointEditStop')} onClick={stopPoint} className="text-[11px] text-host-warning">{t('inspector.pointEditStop')}</button>}
          <RequestActivityCard activity={pointActivity} running={isPointGenerating}/>
        </div>
      </div>

      {/* 常驻：文本内容。ISSUE-002 的教训——字段时有时无会让用户以为功能损坏，
          因此它不进任何 Tab，始终可见 (BR-INS-01) */}
      <div className="px-3 pt-3">
        {/* Text Content —— 常驻渲染：字段时有时无会让用户以为功能损坏 (ISSUE-002) */}
        {(() => {
          const editable = selectedNode.textEditable !== false;
          const hint = selectedNode.textReason ? uneditableHint(selectedNode.textReason) : null;
          return (
            <div className="space-y-1.5 pt-2 border-t border-host-border">
              <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider flex items-center gap-1">
                <Type className="w-3.5 h-3.5 text-host-secondary" />
                <span>{t('inspector.textContent')}</span>
              </label>
              <input
                type="text"
                value={textDraft}
                disabled={!editable}
                placeholder={editable ? t('inspector.textEmpty') : ''}
                onChange={(e) => setTextDraft(e.target.value)}
                onBlur={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className={`w-full bg-host-sunken border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                  editable
                    ? 'border-host-border text-host-primary focus:border-host-accent'
                    : 'border-host-border/60 text-host-tertiary cursor-not-allowed'
                }`}
              />
              {hint && <p className="text-[10px] text-host-tertiary leading-tight">{hint}</p>}
            </div>
          );
        })()}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4" data-testid="property-sections">
        <div key={`${activeScreenId}:${selectedNid}`}>
          <DesignSections {...sectionProps} tagName={selectedNode.tagName}
            width={selectedNode.computedBox?.width ?? 0} height={selectedNode.computedBox?.height ?? 0}
            parentDisplay={snapshot?.parentDisplay} parentDirection={snapshot?.parentDirection} geometry={snapshot?.geometry} />
          {isTextNode && <TypographySection {...sectionProps} />}
          <ImageSection screenId={activeScreenId} nid={selectedNid} tagName={selectedNode.tagName} {...sectionProps} />
          <AppearanceSections {...sectionProps} />
        </div>
        <Section title={t('inspector.sectionNav')}>
          <label className="block text-[10px] text-host-secondary" htmlFor="screen-link-target">{t('inspector.sectionNavHint')}</label>
          <select
            id="screen-link-target"
            aria-label={t('inspector.sectionNav')}
            value={selectedLinkTarget}
            onChange={event => setScreenLinkTarget(activeScreenId, selectedNid, event.target.value || undefined)}
            className="w-full bg-host-sunken border border-host-border rounded-lg px-2 py-1.5 text-xs text-host-primary focus:outline-none focus:border-host-accent"
          >
            <option value="">{t('inspector.sectionNavNone')}</option>
            {selectedLinkTarget && !availableTargets.some(screen => screen.id === selectedLinkTarget) && (
              <option value={selectedLinkTarget}>{t('inspector.sectionNavStaleTarget', { id: selectedLinkTarget })}</option>
            )}
            {availableTargets.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
          </select>
        </Section>
        <Section title={t('inspector.sectionStructure')}>
        {/* Component Instance or Extract Banner (PRD §3.7 / D6) */}
        {selectedNode.componentId ? (
          <div className="p-3 bg-host-accent-subtle border border-host-accent/40 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-host-brand font-semibold text-[11px]">
                <Boxes className="w-3.5 h-3.5 text-host-brand" />
                <span>组件实例: {components[selectedNode.componentId]?.name || '已封装组件'}</span>
              </div>
              <span className="text-[10px] text-host-secondary font-mono">#{selectedNode.componentInstanceId?.slice(0, 8)}</span>
            </div>
            <p className="text-[10px] text-host-secondary leading-tight">
              {components[selectedNode.componentId]?.templateContract?'固定模板与插槽校验已启用；同步按槽名保留内容，固定区域使用最新模板。':'该组件使用兼容同步，按原有内容顺序匹配。可在资源中心配置模板与插槽约束。'}
            </p>
            {syncStatusMsg && (
              <div className="p-1.5 bg-host-elevated text-host-primary border border-host-border rounded text-[10px] leading-tight">
                {syncStatusMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={handleSyncComponent}
                className="py-1 px-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent rounded text-[11px] font-medium transition"
              >
                批量同步全画板
              </button>
              <button
                onClick={() => detachComponentInstance(activeScreenId, selectedNid)}
                className="py-1 px-2 bg-host-elevated hover:bg-host-dialog text-host-secondary border border-host-border rounded text-[11px] transition"
              >
                从组件分离
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-host-sunken border border-host-border rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-host-primary font-semibold text-[11px]">
                <Boxes className="w-3.5 h-3.5 text-host-brand" />
                <span>组件化复用 (Component)</span>
              </div>
              <button
                onClick={() => setShowExtractInput(!showExtractInput)}
                className="text-[10px] text-host-brand hover:text-host-accent-hover transition"
              >
                {showExtractInput ? t('inspector.extractCollapse') : t('inspector.extractComponent')}
              </button>
            </div>
            {showExtractInput && (
              <div className="space-y-1.5 pt-1">
                <input
                  type="text"
                  value={compNameInput}
                  onChange={(e) => setCompNameInput(e.target.value)}
                  placeholder="组件名称，如：概览指标卡..."
                  className="w-full bg-host-elevated border border-host-border rounded-lg px-2.5 py-1 text-host-primary text-xs focus:outline-none focus:border-host-accent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleExtractComponent();
                  }}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setShowExtractInput(false)}
                    className="px-2 py-0.5 bg-host-elevated text-host-secondary hover:text-host-primary rounded text-[10px]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleExtractComponent}
                    disabled={!compNameInput.trim()}
                    className="px-2.5 py-0.5 bg-host-accent hover:bg-host-accent-hover disabled:opacity-40 text-host-on-accent rounded text-[10px] font-medium transition"
                  >
                    确认封装
                  </button>
                </div>
              </div>
            )}
            {syncStatusMsg && (
              <div className="p-1.5 bg-host-accent-subtle text-host-brand rounded text-[10px]">
                {syncStatusMsg}
              </div>
            )}
          </div>
        )}

        {/* Structural Operations (PRD §3.6.3) */}
        <div className="space-y-2 pt-1 border-t border-host-border">
          <span className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider block">结构与容器操作</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleDuplicateNode}
              className="flex items-center justify-center gap-1.5 py-1 px-2 bg-host-elevated hover:bg-host-dialog text-host-secondary hover:text-host-primary rounded-lg border border-host-border transition text-[11px]"
            >
              <Copy className="w-3 h-3" />
              <span>复制此节点</span>
            </button>
            <button
              onClick={handleDeleteNode}
              className="flex items-center justify-center gap-1.5 py-1 px-2 bg-host-elevated hover:bg-red-950/60 text-host-danger rounded-lg border border-host-border hover:border-red-800/60 transition text-[11px]"
            >
              <Trash2 className="w-3 h-3" />
              <span>删除此节点</span>
            </button>
          </div>
          <div className="flex items-center gap-1 pt-1">
            <span className="text-[10px] text-host-tertiary">包裹为容器:</span>
            {(['row', 'col', 'card'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleWrapInContainer(t)}
                className="px-2 py-0.5 bg-host-sunken hover:bg-host-elevated border border-host-border rounded text-[10px] text-host-secondary hover:text-host-primary transition"
              >
                .{t}
              </button>
            ))}
          </div>
        </div>

        {/* Reset L4 */}
        {Object.keys(decs).length > 0 && (
          <div className="pt-2 border-t border-host-border">
            <button
              onClick={() => {
                clearNodeOverrides(activeScreenId, selectedNid);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-host-elevated hover:bg-host-dialog border border-host-border text-host-secondary hover:text-host-primary rounded-lg text-xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>还原为 AI 基线样式</span>
            </button>
          </div>
        )}
        </Section>
      </div>
    </div>
  );
};
