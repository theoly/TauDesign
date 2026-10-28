import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { handleHistoryShortcut } from '../../utils/historyShortcuts';
import { checkGenerationQuality } from '../../services/ai/generationQuality';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import { RenderedQualityCard } from '../chat/RenderedQualityCard';
import { QualityReportCard } from '../chat/QualityReportCard';
import { ScreenFrame } from './ScreenFrame';
import { CanvasMinimap } from './CanvasMinimap';
import { CandidateEvidencePanel } from './CandidateEvidencePanel';
import { TextLayoutRepairDialog } from './TextLayoutRepairDialog';
import { repairCompressedBodyCards } from '../../utils/textLayoutRepair';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { knowledgeFingerprint } from '../../services/ai/projectKnowledge';
import { canConfirmCandidateStructure } from '../../services/ai/candidateValidation';
import { Check, Copy, Plus, Sparkles, X } from 'lucide-react';

interface InfiniteCanvasProps {
  /** T-AE-26: 单画框质感润色入口，由 App 层承接以复用 RestylePanel */
  onPolish?: (screenId: string) => void;
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ onPolish }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [confirmedStructureKey, setConfirmedStructureKey] = useState<string | null>(null);
  const [layoutRepair,setLayoutRepair]=useState<{screenId:string;textNids:string[]}|null>(null);

  const {
    id: projectId,
    screens,
    screenOrder,
    activeScreenId,
    settings,
    designSystem,
    overrides,
    viewportTransform,
    setViewportTransform,
    stagedScreen,
    stagedCandidateSaveStatus,
    stagedAdoptionStatus,
    stagedAdoptionError,
    stagedValidationEvidence,
    stagedRenderQuality,
    recheckStagedAssetFiles,
    discardStagedChange,
    activeSnapGuides
  } = useProjectStore();

  const { x, y, scale } = viewportTransform;

  // Global Keyboard Shortcuts (PRD §3.3.1 / §3.8.1)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Spacebar panning
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }

      // Cmd+Z / Cmd+Shift+Z (Undo / Redo)
      handleHistoryShortcut(e);

      // Cmd+0: Reset zoom to 100%
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        setViewportTransform({ x: 100, y: 100, scale: 1.0 });
      }

      // Cmd+= / Cmd++: Zoom In
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setViewportTransform({ x, y, scale: Math.min(scale * 1.15, 4.0) });
      }

      // Cmd+-: Zoom Out
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        setViewportTransform({ x, y, scale: Math.max(scale * 0.85, 0.1) });
      }

      // Delete / Backspace: 快捷删除选中节点及其全部子树 (ISSUE-021 / T-DNC-04)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        const activeEl = document.activeElement;
        const isEditingInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable);
        if (!isEditingInput) {
          const { activeScreenId, selectedNid, deleteNode } = useProjectStore.getState();
          if (activeScreenId && selectedNid) {
            e.preventDefault();
            deleteNode(activeScreenId, selectedNid);
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [scale, x, y, setViewportTransform]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = 1 - e.deltaY * 0.002;
      const newScale = Math.min(Math.max(scale * zoomFactor, 0.1), 4.0);

      // Zoom centered at cursor
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newX = mouseX - (mouseX - x) * (newScale / scale);
        const newY = mouseY - (mouseY - y) * (newScale / scale);
        setViewportTransform({ x: newX, y: newY, scale: newScale });
      }
    } else {
      // Normal 2-finger scroll panning
      setViewportTransform({
        x: x - e.deltaX,
        y: y - e.deltaY,
        scale
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) { // Space or middle mouse
      setIsPanning(true);
      setStartPan({ x: e.clientX - x, y: e.clientY - y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setViewportTransform({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
        scale
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Find target screen position for staged screen
  const targetScreen = stagedScreen ? screens[stagedScreen.targetScreenId] : null;
  const candidateQuality = useMemo(() => stagedScreen ? checkGenerationQuality(stagedScreen.newHtml, {
    deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation, designSystem, baselineHtml: targetScreen?.htmlContent,
    modificationRequest: stagedScreen.modificationRequest,
    protectedNids: useProjectStore.getState().getProtectedNids(stagedScreen.targetScreenId)
  }) : null, [stagedScreen, targetScreen?.htmlContent, settings.deviceProfile, settings.useCustomNavigation, designSystem, overrides]);

  const [renderReports, setRenderReports] = useState<Record<string, { key: string; report: RenderedQualityReport }>>({});
  const [qualityFocus, setQualityFocus] = useState<{ screenId: string; nid: string } | null>(null);
  const activeRenderKey = useMemo(() => JSON.stringify([projectId, settings.deviceProfile, settings.useCustomNavigation, settings.colorMode, designSystem.tokens, overrides,
    activeScreenId, screens[activeScreenId || '']?.htmlContent, screens[activeScreenId || '']?.scopedCss,
    stagedScreen?.targetScreenId, stagedScreen?.newHtml, targetScreen?.scopedCss]),
    [projectId, settings.deviceProfile, settings.useCustomNavigation, settings.colorMode, designSystem.tokens, overrides, activeScreenId, screens, stagedScreen, targetScreen?.scopedCss]);
  const renderKey = stagedScreen ? useProjectStore.getState().getStagedRenderContextKey() : activeRenderKey;
  const currentRenderKey = useRef(renderKey);
  currentRenderKey.current = renderKey;
  const receiveRenderReport = useCallback((id: string, key: string, report: RenderedQualityReport) => {
    if (key !== currentRenderKey.current) return;
    if (id === 'staged-screen-preview') useProjectStore.getState().setStagedRenderQuality(key, report);
    setRenderReports(prev => ({ ...Object.fromEntries(Object.entries(prev).filter(([, value]) => value.key === key)), [id]: { key, report } }));
  }, []);
  const reportId = stagedScreen ? 'staged-screen-preview' : activeScreenId;
  const renderedReport = stagedScreen
    ? (stagedRenderQuality?.key === renderKey ? stagedRenderQuality.report : undefined)
    : (reportId && renderReports[reportId]?.key === renderKey ? renderReports[reportId].report : undefined);
  const renderPending = Boolean(stagedScreen && (!renderedReport || renderedReport.status === 'pending'));
  const repairableTextNids=useMemo(()=>{
    const screen=screens[activeScreenId||''];
    if(stagedScreen||!screen||screen.metadata?.importedHtml||renderedReport?.status!=='complete')return [];
    return [...new Set(renderedReport.findings.filter(f=>f.code==='render_compressed_body'&&f.nid).map(f=>f.nid!))].filter(nid=>{
      try{repairCompressedBodyCards(screen.htmlContent,[nid],useProjectStore.getState().getProtectedNids(screen.id));return true;}catch{return false;}
    });
  },[renderedReport,stagedScreen,activeScreenId,screens,overrides]);
  const renderIncomplete = Boolean(stagedScreen && renderedReport && !['complete', 'pending'].includes(renderedReport.status));
  const taskCurrent = !stagedScreen || useProjectStore.getState().isStagedTaskCurrent();
  const stagedAssetIssues = stagedScreen ? useProjectStore.getState().getStagedAssetIssues() : [];
  const deliveryReport = stagedScreen ? useProjectStore.getState().getStagedDeliveryReport() : null;
  const blockers = deliveryReport?.checks.filter(c => c.status !== 'passed') ?? [];
  const canConfirmStructure = canConfirmCandidateStructure(deliveryReport);
  const structureConfirmed = canConfirmStructure && confirmedStructureKey === renderKey;
  const adoptionBlocked = deliveryReport?.status !== 'ready' && !structureConfirmed;
  const blockedDescription = blockers.map(c => c.message).join('；');
  const locateRenderIssue = (nid: string) => {
    if (!reportId) return;
    setQualityFocus({ screenId: reportId, nid });
    if (!stagedScreen) useProjectStore.getState().panToScreen(reportId);
  };

  // 新候选出现时让两版同时进入视口；后续平移/缩放仍由用户控制。
  useEffect(() => {
    if (!stagedScreen || !targetScreen) return;
    const width = containerRef.current?.getBoundingClientRect().width || 0;
    if (!width) return;
    const pairWidth = (settings.frameWidth || 390) * 2 + (settings.deviceProfile === 'mobile' ? 40 : 60);
    const compareScale = Math.max(0.1, Math.min(1, (width - 64) / pairWidth));
    setViewportTransform({
      x: (width - pairWidth * compareScale) / 2 - targetScreen.position.x * compareScale,
      y: 120 - targetScreen.position.y * compareScale,
      scale: compareScale
    });
  }, [stagedScreen, targetScreen?.id, settings.frameWidth, settings.deviceProfile, setViewportTransform]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-950 ${
        isSpacePressed ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Background Grid Dots */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
          backgroundSize: `${32 * scale}px ${32 * scale}px`,
          backgroundPosition: `${x}px ${y}px`
        }}
      />

      {/* World Transform Layer */}
      <div
        className="absolute top-0 left-0 will-change-transform origin-top-left"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`
        }}
      >
        {stagedScreen && targetScreen && <div data-testid="comparison-backdrop" aria-hidden="true"
          className="absolute bg-slate-950/75 z-20"
          style={{ left: `${-x / scale}px`, top: `${-y / scale}px`, width: `calc(100vw / ${scale})`, height: `calc(100vh / ${scale})` }}
          onClick={event => event.stopPropagation()} />}
        {screenOrder.map((id) => {
          const screen = screens[id];
          if (!screen) return null;
          const isActive = id === activeScreenId;

          // LOD 调度策略：
          // isActive -> L2 (可交互 iframe: 点选、行内编辑)
          // else -> L1 (冻结 iframe: pointer-events: none，GPU 硬件加速高质量缩放，确保缩小时页面内容高保真可见)
          // 仅在存在预先生成的位图缩略图且超小比例时降级为 L0
          let lodLevel: 0 | 1 | 2 = 1;
          if (screen.thumbnail && scale < 0.25) lodLevel = 0;
          else if (isActive) lodLevel = 2;

          return <ScreenFrame key={id} screen={screen} lodLevel={lodLevel} onPolish={onPolish}
            renderQualityKey={renderKey} onRenderQuality={receiveRenderReport}
            qualityFocusNid={qualityFocus?.screenId === id ? qualityFocus.nid : undefined}
            isComparisonTarget={Boolean(stagedScreen && targetScreen?.id === id)}
            isComparisonBackground={Boolean(stagedScreen && targetScreen && targetScreen.id !== id)} />;
        })}

        {/* Staged Screen (Side-by-side D17 preview) */}
        {stagedScreen && targetScreen && (() => {
          const currentFrameWidth = settings.frameWidth || (settings.deviceProfile === 'mobile' ? 390 : 1440);
          const gapX = settings.deviceProfile === 'mobile' ? 40 : 60;
          return (
            <ScreenFrame
              key="staged-screen"
              screen={{
                id: 'staged-screen-preview',
                name: stagedScreen.screenName,
                position: {
                  x: targetScreen.position.x + currentFrameWidth + gapX,
                  y: targetScreen.position.y
                },
                htmlContent: stagedScreen.newHtml,
                scopedCss: targetScreen.scopedCss,
                metadata: { ...targetScreen.metadata, ...(stagedScreen.navigationTitle ? { navigationTitle: stagedScreen.navigationTitle } : {}) },
                measuredHeight: targetScreen.measuredHeight
              }}
              lodLevel={2}
              isStaged={true}
              renderQualityKey={renderKey} onRenderQuality={receiveRenderReport}
              qualityFocusNid={qualityFocus?.screenId === 'staged-screen-preview' ? qualityFocus.nid : undefined}
              overrideSourceScreenId={targetScreen.id}
            />
          );
        })()}

        {/* 对齐吸附网格参考线 (BR-ALIGN-01 ~ BR-ALIGN-03) */}
        {activeSnapGuides && activeSnapGuides.active && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {activeSnapGuides.horizontalY !== undefined && (
              <div
                data-testid="snap-guide-horizontal"
                className="absolute left-[-10000px] border-t-2 border-dashed border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] flex items-center"
                style={{
                  top: `${activeSnapGuides.horizontalY}px`,
                  width: '40000px'
                }}
              >
                <div className="ml-[10080px] -mt-6 bg-sky-600/90 text-sky-100 text-[11px] font-mono px-2 py-0.5 rounded shadow backdrop-blur-sm border border-sky-400/40">
                  同行顶部对齐 Y: {activeSnapGuides.horizontalY}px
                </div>
              </div>
            )}
            {activeSnapGuides.verticalX !== undefined && (
              <div
                data-testid="snap-guide-vertical"
                className="absolute top-[-10000px] border-l-2 border-dashed border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] flex flex-col"
                style={{
                  left: `${activeSnapGuides.verticalX}px`,
                  height: '40000px'
                }}
              >
                <div className="mt-[10080px] ml-2 bg-sky-600/90 text-sky-100 text-[11px] font-mono px-2 py-0.5 rounded shadow backdrop-blur-sm border border-sky-400/40 whitespace-nowrap">
                  同列对齐 X: {activeSnapGuides.verticalX}px
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Floating Adoption Toolbar (D17 / §3.2.9) */}
      {stagedScreen && (
        <div data-testid="candidate-actions-toolbar" onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{if(e.code==='Space')e.stopPropagation();}} className="absolute top-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[calc(100%_-_2rem)] bg-slate-900/90 backdrop-blur-md border border-purple-500/50 shadow-2xl rounded-2xl px-4 py-3 flex flex-wrap justify-center items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
            <span className="font-semibold text-purple-200">AI 新方案已在右侧画框并排就绪</span>
          </div>
          {stagedCandidateSaveStatus && <span role={stagedCandidateSaveStatus === 'failed' ? 'alert' : 'status'}
            className={stagedCandidateSaveStatus === 'failed' ? 'text-amber-300' : 'text-slate-400'}>
            {stagedCandidateSaveStatus === 'pending' ? '正在保存候选…' : stagedCandidateSaveStatus === 'saved' ? '候选已存档' : '候选存档失败；关闭工程后将无法恢复'}
          </span>}
          {stagedAdoptionStatus === 'saving' && <span role="status" className="text-slate-300">正在保存交付档案…</span>}
          {stagedAdoptionError && <span role="alert" className="text-amber-300">{stagedAdoptionError}</span>}
          <CandidateEvidencePanel current={stagedValidationEvidence}
            historical={stagedScreen.restoredFromDisk ? stagedScreen.validationEvidence : undefined}
            currentIsStale={Boolean(stagedValidationEvidence && (stagedValidationEvidence.contextFingerprint !== contentFingerprint(renderKey) ||
              stagedValidationEvidence.projectFingerprint !== knowledgeFingerprint(useProjectStore.getState())))} />
          {candidateQuality && candidateQuality.findings.length > 0 && <QualityReportCard report={candidateQuality} />}
          {renderPending && <span role="status" className="text-slate-300">正在检查当前方案渲染…</span>}
          {renderIncomplete && <span role="alert" className="text-amber-300">渲染检查未完成，暂不能采纳；请重新加载候选画框后再试。</span>}
          {!taskCurrent && <span role="alert" className="text-amber-300">原页面或项目资料已变化，候选已过期，请重新生成。</span>}
          {stagedAssetIssues.length > 0 && <span role="alert" className="text-amber-300">候选资源引用未通过：{stagedAssetIssues[0].message}{stagedAssetIssues.length > 1 ? `；另有 ${stagedAssetIssues.length - 1} 项` : ''}</span>}
          {deliveryReport?.checks.find(check=>check.id==='entities')?.status==='blocked'&&<span role="alert" className="max-w-md break-words text-amber-300">设计实体引用未通过：{deliveryReport.checks.find(check=>check.id==='entities')!.message}</span>}
          {deliveryReport?.checks.find(check => check.id === 'asset_files')?.status !== 'passed' && <span role="alert" className="text-amber-300 flex items-center gap-1">
            {deliveryReport?.checks.find(check => check.id === 'asset_files')?.message}
            <button type="button" onClick={recheckStagedAssetFiles} className="underline text-blue-300 hover:text-blue-200">重新核对</button>
          </span>}
          {deliveryReport && <span role="status" className={deliveryReport.status === 'ready' ? 'text-emerald-300' : 'text-slate-300'}
            title={deliveryReport.checks.map(check => `${check.id}: ${check.message}`).join('\n')}>
            交付检查 {deliveryReport.checks.filter(check => check.status === 'passed').length}/{deliveryReport.checks.length}
          </span>}
          {blockers.length > 0 && <div id="candidate-delivery-blockers" data-testid="candidate-delivery-blockers" role={deliveryReport?.status === 'blocked' ? 'alert' : 'status'} className="order-last basis-full max-w-full rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-200 break-words">
            <span className="font-medium">{structureConfirmed ? '已确认结构变更：' : '暂不能采纳：'}</span>{blockedDescription}
            {canConfirmStructure && <label className="mt-2 flex items-start gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" aria-label="我已检查并接受这次结构变化" checked={structureConfirmed} disabled={stagedAdoptionStatus === 'saving'}
                onChange={e=>setConfirmedStructureKey(e.target.checked ? renderKey : null)} className="mt-0.5" />
              <span>我已检查并接受这次结构变化；确认后可替换原版或保留两版，其它交付检查仍须通过。</span>
            </label>}
          </div>}
          {renderedReport?.findings.some(f => f.severity === 'error') && <span role="alert" className="text-red-300">存在严重渲染问题，请修复后采纳。</span>}
          {renderedReport && <RenderedQualityCard report={renderedReport} onLocate={locateRenderIssue} />}
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex flex-wrap justify-center items-center gap-2">
            <button
              disabled={adoptionBlocked || stagedAdoptionStatus === 'saving'}
              onClick={()=>void useProjectStore.getState().commitStagedDelivery(structureConfirmed ? 'confirm-structure-replace' : 'replace', renderKey)}
              aria-describedby={blockers.length ? 'candidate-delivery-blockers' : undefined}
              title={adoptionBlocked ? blockedDescription : structureConfirmed ? '已确认当前结构变化，替换原版前仍会完整复验' : '采纳当前方案'}
              className="flex shrink-0 whitespace-nowrap items-center gap-1.5 bg-blue-600 enabled:hover:bg-blue-500 text-white font-medium px-4 py-1.5 rounded-lg shadow transition disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Check className="w-4 h-4" />
              <span>采纳新版 (替换原版)</span>
            </button>
            <button
              disabled={adoptionBlocked || stagedAdoptionStatus === 'saving'}
              onClick={()=>void useProjectStore.getState().commitStagedDelivery(structureConfirmed ? 'confirm-structure-keep-both' : 'keep-both', renderKey)}
              aria-describedby={blockers.length ? 'candidate-delivery-blockers' : undefined}
              title={adoptionBlocked ? blockedDescription : '保留原版并新增当前方案'}
              className="flex shrink-0 whitespace-nowrap items-center gap-1.5 bg-slate-800 enabled:hover:bg-slate-700 text-slate-200 font-medium px-4 py-1.5 rounded-lg border border-slate-700 transition disabled:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="w-4 h-4" />
              <span>两版都留</span>
            </button>
            <button
              onClick={discardStagedChange}
              className="flex shrink-0 whitespace-nowrap items-center gap-1 text-slate-400 hover:text-red-400 font-medium px-3 py-1.5 rounded-lg transition"
            >
              <X className="w-4 h-4" />
              <span>保留原版</span>
            </button>
          </div>
        </div>
      )}

      {!stagedScreen && activeScreenId && renderedReport && <div className="absolute right-4 top-4 z-40 max-w-sm">
        <RenderedQualityCard report={renderedReport} onLocate={locateRenderIssue} onRepairLayout={repairableTextNids.length?()=>setLayoutRepair({screenId:activeScreenId,textNids:repairableTextNids}):undefined} />
      </div>}
      {layoutRepair&&<TextLayoutRepairDialog key={layoutRepair.screenId} {...layoutRepair} onClose={()=>setLayoutRepair(null)}/>}
      <CanvasMinimap canvasRef={containerRef} />

      {/* 纯净工作区空画布引导 (OpenDesign / PRD 体验升级) */}
      {screenOrder.length === 0 && !stagedScreen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none p-4">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md text-center shadow-2xl pointer-events-auto">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-tr from-blue-600/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3.5 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">纯净工作区 · 准备就绪</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              在左侧对话框输入界面描述（如：“生成一个现代科技风的控制台仪表盘”），AI 将直接生成设计画框；或手动添加空白画框开始。
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <button
                onClick={() => useProjectStore.getState().addBlankScreen()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建空白画框</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
