import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { getCachedStagedCandidateQuality, useProjectStore } from '../../stores/useProjectStore';
import { handleHistoryShortcut } from '../../utils/historyShortcuts';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import { RenderedQualityCard } from '../chat/RenderedQualityCard';
import { ScreenFrame } from './ScreenFrame';
import { CanvasMinimap } from './CanvasMinimap';
import { CandidateAdoptionPanel } from './CandidateAdoptionPanel';
import { TextLayoutRepairDialog } from './TextLayoutRepairDialog';
import { repairCompressedBodyCards } from '../../utils/textLayoutRepair';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { canConfirmCandidateOverride, canConfirmCandidateStructure } from '../../services/ai/candidateValidation';
import { Plus, Sparkles } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';

interface InfiniteCanvasProps {
  /** T-AE-26: 单画框质感润色入口，由 App 层承接以复用 RestylePanel */
  onPolish?: (screenId: string) => void;
}

/** Only re-render canvas when scale crosses LOD thresholds — not on every pan/zoom tick. */
function viewportLodBucket(scale: number): 0 | 1 | 2 {
  if (scale < 0.25) return 0;
  if (scale < 0.55) return 1;
  return 2;
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ onPolish }) => {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const worldLayerRef = useRef<HTMLDivElement>(null);
  const frozenWorldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(useProjectStore.getState().viewportTransform);
  const frozenViewportRef = useRef<{ x: number; y: number; scale: number } | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [confirmedStructureKey, setConfirmedStructureKey] = useState<string | null>(null);
  const [layoutRepair,setLayoutRepair]=useState<{screenId:string;textNids:string[]}|null>(null);

  const projectId = useProjectStore(s => s.id);
  const screens = useProjectStore(s => s.screens);
  const screenOrder = useProjectStore(s => s.screenOrder);
  const activeScreenId = useProjectStore(s => s.activeScreenId);
  const settings = useProjectStore(s => s.settings);
  const designSystem = useProjectStore(s => s.designSystem);
  const overrides = useProjectStore(s => s.overrides);
  const setViewportTransform = useProjectStore(s => s.setViewportTransform);
  const stagedScreen = useProjectStore(s => s.stagedScreen);
  const stagedCandidateSaveStatus = useProjectStore(s => s.stagedCandidateSaveStatus);
  const stagedAdoptionStatus = useProjectStore(s => s.stagedAdoptionStatus);
  const stagedAdoptionError = useProjectStore(s => s.stagedAdoptionError);
  const stagedValidationEvidence = useProjectStore(s => s.stagedValidationEvidence);
  const stagedRenderQuality = useProjectStore(s => s.stagedRenderQuality);
  const recheckStagedAssetFiles = useProjectStore(s => s.recheckStagedAssetFiles);
  const discardStagedChange = useProjectStore(s => s.discardStagedChange);
  const activeSnapGuides = useProjectStore(s => s.activeSnapGuides);
  const lodBucket = useProjectStore(s => viewportLodBucket(s.viewportTransform.scale));

  const paintLayer = (el: HTMLDivElement | null, t: { x: number; y: number; scale: number }) => {
    if (el) el.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`;
  };
  const paintGrid = (t: { x: number; y: number; scale: number }) => {
    if (!gridRef.current) return;
    gridRef.current.style.backgroundSize = `${32 * t.scale}px ${32 * t.scale}px`;
    gridRef.current.style.backgroundPosition = `${t.x}px ${t.y}px`;
  };
  /** Apply pan/zoom on the GPU layer without re-rendering iframe ScreenFrames every wheel tick. */
  const applyViewportDom = useCallback((t: { x: number; y: number; scale: number }) => {
    viewportRef.current = t;
    paintLayer(worldLayerRef.current, t);
    const frozen = frozenViewportRef.current;
    if (frozen) {
      // Compare mode: live pan/zoom only moves the compare pair; backdrop world + grid stay put.
      paintLayer(frozenWorldRef.current, frozen);
      paintGrid(frozen);
    } else {
      paintGrid(t);
    }
  }, []);

  const commitViewport = useCallback((t: { x: number; y: number; scale: number }) => {
    applyViewportDom(t);
    const cur = useProjectStore.getState().viewportTransform;
    if (cur.x === t.x && cur.y === t.y && cur.scale === t.scale) return;
    setViewportTransform(t);
  }, [applyViewportDom, setViewportTransform]);

  const scheduleViewportCommit = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      commitViewport(viewportRef.current);
    }, 100);
  }, [commitViewport]);

  // Own transform via DOM + store subscribe — do not React-subscribe to viewportTransform.
  useEffect(() => {
    applyViewportDom(useProjectStore.getState().viewportTransform);
    return useProjectStore.subscribe((state, prev) => {
      if (state.viewportTransform !== prev.viewportTransform) applyViewportDom(state.viewportTransform);
    });
  }, [applyViewportDom]);

  useEffect(() => () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); }, []);

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
        commitViewport({ x: 100, y: 100, scale: 1.0 });
      }

      // Cmd+= / Cmd++: Zoom In
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const cur = viewportRef.current;
        commitViewport({ x: cur.x, y: cur.y, scale: Math.min(cur.scale * 1.15, 4.0) });
      }

      // Cmd+-: Zoom Out
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        const cur = viewportRef.current;
        commitViewport({ x: cur.x, y: cur.y, scale: Math.max(cur.scale * 0.85, 0.1) });
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
  }, [commitViewport]);

  // Mouse wheel zoom — DOM-only during the gesture; store commits after idle.
  const handleWheel = (e: React.WheelEvent) => {
    const cur = viewportRef.current;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = 1 - e.deltaY * 0.002;
      const newScale = Math.min(Math.max(cur.scale * zoomFactor, 0.1), 4.0);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        applyViewportDom({
          x: mouseX - (mouseX - cur.x) * (newScale / cur.scale),
          y: mouseY - (mouseY - cur.y) * (newScale / cur.scale),
          scale: newScale
        });
        scheduleViewportCommit();
      }
    } else {
      applyViewportDom({ x: cur.x - e.deltaX, y: cur.y - e.deltaY, scale: cur.scale });
      scheduleViewportCommit();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) { // Space or middle mouse
      const cur = viewportRef.current;
      setIsPanning(true);
      setStartPan({ x: e.clientX - cur.x, y: e.clientY - cur.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      applyViewportDom({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
        scale: viewportRef.current.scale
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) commitViewport(viewportRef.current);
    setIsPanning(false);
  };

  // Find target screen position for staged screen
  const targetScreen = stagedScreen ? screens[stagedScreen.targetScreenId] : null;
  const [renderReports, setRenderReports] = useState<Record<string, { key: string; report: RenderedQualityReport }>>({});
  const [qualityFocus, setQualityFocus] = useState<{ screenId: string; nid: string } | null>(null);
  const activeRenderKey = useMemo(() => {
    if (stagedScreen) return '';
    return JSON.stringify([projectId, settings.deviceProfile, settings.useCustomNavigation, settings.colorMode, designSystem.tokens, overrides,
      activeScreenId, screens[activeScreenId || '']?.htmlContent, screens[activeScreenId || '']?.scopedCss]);
  }, [stagedScreen, projectId, settings.deviceProfile, settings.useCustomNavigation, settings.colorMode, designSystem.tokens, overrides, activeScreenId, screens]);
  const renderKey = useMemo(() => stagedScreen ? useProjectStore.getState().getStagedRenderContextKey() : activeRenderKey,
    [stagedScreen, activeRenderKey, stagedRenderQuality, stagedValidationEvidence, settings, designSystem, overrides, targetScreen?.htmlContent, targetScreen?.scopedCss, targetScreen?.metadata]);
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
  const deliverySnapshot = useMemo(() => {
    if (!stagedScreen) return null;
    const state = useProjectStore.getState();
    return {
      deliveryReport: state.getStagedDeliveryReport(),
      candidateQuality: getCachedStagedCandidateQuality(state),
      taskCurrent: state.isStagedTaskCurrent(),
      stagedAssetIssues: state.getStagedAssetIssues(),
      renderKey: state.getStagedRenderContextKey(),
    };
    // Omit screens/viewport/save-status — measure, pan, and candidate archive must not reopen the gate.
  }, [stagedScreen, stagedRenderQuality, stagedValidationEvidence, settings, designSystem, overrides, targetScreen?.htmlContent, targetScreen?.scopedCss, targetScreen?.metadata]);
  const deliveryReport = deliverySnapshot?.deliveryReport ?? null;
  const candidateQuality = useMemo(() => {
    if (!stagedScreen || !targetScreen) return null;
    const evidence = stagedValidationEvidence;
    if (evidence
      && evidence.candidateFingerprint === contentFingerprint(stagedScreen.newHtml)
      && evidence.baselineFingerprint === contentFingerprint(targetScreen.htmlContent)
      && (!stagedScreen.projectFingerprint || evidence.projectFingerprint === stagedScreen.projectFingerprint)) {
      return evidence.quality;
    }
    return deliverySnapshot?.candidateQuality ?? null;
  }, [stagedScreen, targetScreen, stagedValidationEvidence, deliverySnapshot]);
  const taskCurrent = deliverySnapshot?.taskCurrent ?? true;
  const stagedAssetIssues = deliverySnapshot?.stagedAssetIssues ?? [];
  const blockers = deliveryReport?.checks.filter(c => c.status !== 'passed') ?? [];
  const canConfirmStructure = canConfirmCandidateStructure(deliveryReport);
  const canConfirmOverride = canConfirmCandidateOverride(deliveryReport);
  const canConfirmDelivery = canConfirmStructure || canConfirmOverride;
  const structureOnlyConfirm = canConfirmStructure && !deliveryReport?.checks.some(c => c.id === 'quality' && c.status === 'blocked');
  const structureConfirmed = canConfirmDelivery && confirmedStructureKey === renderKey;
  const adoptionBlocked = deliveryReport?.status !== 'ready' && !structureConfirmed;
  const blockedDescription = blockers.map(c => c.message).join('；');
  const evidenceStale = Boolean(stagedValidationEvidence && stagedScreen && (
    stagedValidationEvidence.contextFingerprint !== contentFingerprint(renderKey)
    || (stagedScreen.projectFingerprint
      ? stagedValidationEvidence.projectFingerprint !== stagedScreen.projectFingerprint
      : false)
  ));
  const locateRenderIssue = (nid: string) => {
    if (!reportId) return;
    setQualityFocus({ screenId: reportId, nid });
    if (!stagedScreen) useProjectStore.getState().panToScreen(reportId);
  };

  // Entering compare: freeze the current world under a full-window mask; fit only the compare pair.
  useEffect(() => {
    if (!stagedScreen || !targetScreen) {
      frozenViewportRef.current = null;
      applyViewportDom(viewportRef.current);
      return;
    }
    if (!frozenViewportRef.current) {
      frozenViewportRef.current = { ...viewportRef.current };
      paintLayer(frozenWorldRef.current, frozenViewportRef.current);
      paintGrid(frozenViewportRef.current);
    }
    const width = containerRef.current?.getBoundingClientRect().width || 0;
    if (!width) return;
    const pairWidth = (settings.frameWidth || 390) * 2 + (settings.deviceProfile === 'mobile' ? 40 : 60);
    const compareScale = Math.max(0.1, Math.min(1, (width - 64) / pairWidth));
    commitViewport({
      x: (width - pairWidth * compareScale) / 2 - targetScreen.position.x * compareScale,
      y: 120 - targetScreen.position.y * compareScale,
      scale: compareScale
    });
  }, [stagedScreen, targetScreen?.id, settings.frameWidth, settings.deviceProfile, commitViewport, applyViewportDom]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-host-canvas ${
        isSpacePressed ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Background Grid Dots — frozen under compare mask; live otherwise */}
      <div
        ref={gridRef}
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{ backgroundImage: 'radial-gradient(#524D45 1px, transparent 1px)' }}
      />

      {(() => {
        const comparing = Boolean(stagedScreen && targetScreen);
        const renderScreen = (id: string, mode: 'normal' | 'compare-target' | 'compare-background') => {
          const screen = screens[id];
          if (!screen) return null;
          const isActive = id === activeScreenId;
          let lodLevel: 0 | 1 | 2 = 1;
          if (mode === 'compare-background') lodLevel = 0;
          else if (mode === 'compare-target') lodLevel = isActive && lodBucket === 2 ? 2 : 1;
          else if (lodBucket === 0 && screen.thumbnail) lodLevel = 0;
          else if (isActive) lodLevel = 2;
          return <ScreenFrame key={id} screen={screen} lodLevel={lodLevel} onPolish={onPolish}
            renderQualityKey={renderKey} onRenderQuality={receiveRenderReport}
            qualityFocusNid={qualityFocus?.screenId === id ? qualityFocus.nid : undefined}
            isComparisonTarget={mode === 'compare-target'}
            isComparisonBackground={mode === 'compare-background'} />;
        };
        const snapGuides = activeSnapGuides && activeSnapGuides.active && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {activeSnapGuides.horizontalY !== undefined && (
              <div data-testid="snap-guide-horizontal"
                className="absolute left-[-10000px] border-t-2 border-dashed border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] flex items-center"
                style={{ top: `${activeSnapGuides.horizontalY}px`, width: '40000px' }}>
                <div className="ml-[10080px] -mt-6 bg-sky-600/90 text-sky-100 text-[11px] font-mono px-2 py-0.5 rounded shadow backdrop-blur-sm border border-sky-400/40">
                  同行顶部对齐 Y: {activeSnapGuides.horizontalY}px
                </div>
              </div>
            )}
            {activeSnapGuides.verticalX !== undefined && (
              <div data-testid="snap-guide-vertical"
                className="absolute top-[-10000px] border-l-2 border-dashed border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] flex flex-col"
                style={{ left: `${activeSnapGuides.verticalX}px`, height: '40000px' }}>
                <div className="mt-[10080px] ml-2 bg-sky-600/90 text-sky-100 text-[11px] font-mono px-2 py-0.5 rounded shadow backdrop-blur-sm border border-sky-400/40 whitespace-nowrap">
                  同列对齐 X: {activeSnapGuides.verticalX}px
                </div>
              </div>
            )}
          </div>
        );

        if (!comparing) {
          return <div ref={worldLayerRef} className="absolute top-0 left-0 will-change-transform origin-top-left">
            {screenOrder.map(id => renderScreen(id, 'normal'))}
            {snapGuides}
          </div>;
        }

        const currentFrameWidth = settings.frameWidth || (settings.deviceProfile === 'mobile' ? 390 : 1440);
        const gapX = settings.deviceProfile === 'mobile' ? 40 : 60;
        const stagedLod: 0 | 1 | 2 = lodBucket === 2 ? 2 : 1;
        return <>
          {/* Frozen under-mask world: other screens stay put while the pair pans/zooms. */}
          <div ref={frozenWorldRef} data-testid="comparison-frozen-world"
            className="absolute top-0 left-0 will-change-transform origin-top-left z-10">
            {screenOrder.filter(id => id !== targetScreen!.id).map(id => renderScreen(id, 'compare-background'))}
          </div>
          {/* Full-window mask — viewport-fixed, not part of the live transform. */}
          <div data-testid="comparison-backdrop" aria-hidden="true"
            className="absolute inset-0 z-20 pointer-events-none bg-host-canvas/75" />
          {/* Live compare pair only */}
          <div ref={worldLayerRef} data-testid="comparison-live-world"
            className="absolute top-0 left-0 will-change-transform origin-top-left z-30">
            {renderScreen(targetScreen!.id, 'compare-target')}
            <ScreenFrame
              key="staged-screen"
              contentTask={stagedScreen!.workflowContract??(stagedScreen!.modificationRequest?{request:stagedScreen!.modificationRequest}:undefined)}
              screen={{
                id: 'staged-screen-preview',
                name: stagedScreen!.screenName,
                position: {
                  x: targetScreen!.position.x + currentFrameWidth + gapX,
                  y: targetScreen!.position.y
                },
                htmlContent: stagedScreen!.newHtml,
                scopedCss: targetScreen!.scopedCss,
                metadata: { ...targetScreen!.metadata, ...(stagedScreen!.navigationTitle ? { navigationTitle: stagedScreen!.navigationTitle } : {}) },
                measuredHeight: targetScreen!.measuredHeight
              }}
              lodLevel={stagedLod}
              isStaged={true}
              renderQualityKey={renderKey} onRenderQuality={receiveRenderReport}
              qualityFocusNid={qualityFocus?.screenId === 'staged-screen-preview' ? qualityFocus.nid : undefined}
              overrideSourceScreenId={targetScreen!.id}
            />
          </div>
        </>;
      })()}

      {/* Side-by-Side Floating Adoption Panel (D17 / §3.2.9) */}
      {stagedScreen && (
        <CandidateAdoptionPanel
          deliveryReport={deliveryReport}
          blockers={blockers}
          blockedDescription={blockedDescription}
          adoptionBlocked={adoptionBlocked}
          structureConfirmed={structureConfirmed}
          canConfirmDelivery={canConfirmDelivery}
          structureOnlyConfirm={structureOnlyConfirm}
          renderKey={renderKey}
          stagedCandidateSaveStatus={stagedCandidateSaveStatus}
          stagedAdoptionStatus={stagedAdoptionStatus}
          stagedAdoptionError={stagedAdoptionError}
          renderPending={renderPending}
          renderIncomplete={renderIncomplete}
          taskCurrent={taskCurrent}
          stagedAssetIssues={stagedAssetIssues}
          candidateQuality={candidateQuality}
          renderedReport={renderedReport}
          stagedValidationEvidence={stagedValidationEvidence}
          evidenceStale={evidenceStale}
          historicalEvidence={stagedScreen.restoredFromDisk ? stagedScreen.validationEvidence : undefined}
          onConfirmStructure={(checked) => setConfirmedStructureKey(checked ? renderKey : null)}
          onRecheckAssets={recheckStagedAssetFiles}
          onDiscard={discardStagedChange}
          onLocate={locateRenderIssue}
        />
      )}

      {!stagedScreen && activeScreenId && renderedReport && <div className="absolute right-4 top-4 z-40 max-w-sm">
        <RenderedQualityCard report={renderedReport} onLocate={locateRenderIssue} onRepairLayout={repairableTextNids.length?()=>setLayoutRepair({screenId:activeScreenId,textNids:repairableTextNids}):undefined} />
      </div>}
      {layoutRepair&&<TextLayoutRepairDialog key={layoutRepair.screenId} {...layoutRepair} onClose={()=>setLayoutRepair(null)}/>}
      <CanvasMinimap canvasRef={containerRef} />

      {/* 纯净工作区空画布引导 (OpenDesign / PRD 体验升级) */}
      {screenOrder.length === 0 && !stagedScreen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none p-4">
          <div className="max-w-md w-full p-6 rounded-2xl bg-host-elevated/90 border border-host-border-strong backdrop-blur-md text-center shadow-2xl pointer-events-auto">
            <div className="w-12 h-12 mx-auto rounded-xl bg-host-accent-subtle border border-host-accent/30 flex items-center justify-center text-host-brand mb-3.5 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-host-primary">{useProjectStore.getState().projectSaveStatus==='readonly'?'工程需要恢复页面文件':'纯净工作区 · 准备就绪'}</h3>
            <p className="text-xs text-host-secondary mt-1.5 leading-relaxed">
              {useProjectStore.getState().projectSaveStatus==='readonly'?'工程记录仍在，但页面文件未能完整读取。对话历史不代表页面已保存；请查看顶部“只读恢复”的具体原因，恢复文件后重新打开工程。':'在左侧对话框输入界面描述（如：“生成一个现代科技风的控制台仪表盘”），AI 将直接生成设计画框；或手动添加空白画框开始。'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <button
                disabled={useProjectStore.getState().projectSaveStatus==='readonly'}
                onClick={() => useProjectStore.getState().addBlankScreen()}
                className="px-4 py-2 rounded-lg bg-host-accent hover:bg-host-accent-hover text-host-on-accent text-xs font-medium transition shadow flex items-center gap-1.5"
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
