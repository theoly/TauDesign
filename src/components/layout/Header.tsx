import React from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { BrandMark } from '../common/BrandMark';
import { LanguageMenu } from '../common/LanguageMenu';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { TokenLintEngine, getTokenLintContext } from '../../utils/tokenLint';
import { useT } from '../../stores/useLocaleStore';
import {
  ArrowLeft,
  Download,
  Eye,
  Laptop,
  LayoutGrid,
  Maximize2,
  Moon,
  Redo2,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface HeaderProps {
  onOpenExport: () => void;
  onOpenSettings: () => void;
}

/** 资源库与设计系统入口已移入右侧栏 (D22)，顶栏不再重复提供 */
export const Header: React.FC<HeaderProps> = ({ onOpenExport, onOpenSettings }) => {
  const t = useT();
  const {
    name,
    setName,
    settings,
    setShowViewportGuide,
    toggleColorMode,
    viewportTransform,
    setViewportTransform,
    screens,
    activeScreenId,
    designSystem,
    arrangeScreens
  } = useProjectStore();
  const saveStatus=useProjectStore(state=>state.projectSaveStatus),saveError=useProjectStore(state=>state.projectSaveError);

  const { canUndo, canRedo, undo, redo } = useHistoryStore();
  const { backToManager } = useWorkspaceStore();

  const zoomPercent = Math.round(viewportTransform.scale * 100);

  // Compute active screen lint
  const curScreen = activeScreenId ? screens[activeScreenId] : null;
  const lint = curScreen ? TokenLintEngine.scan(curScreen.htmlContent, designSystem, settings.deviceProfile, getTokenLintContext(curScreen)) : null;

  const handleZoom = (factor: number) => {
    const newScale = Math.min(Math.max(viewportTransform.scale * factor, 0.1), 4.0);
    setViewportTransform({ ...viewportTransform, scale: newScale });
  };

  const handleResetZoom = () => {
    setViewportTransform({ ...viewportTransform, scale: 1.0 });
  };

  const handleFitAll = () => {
    setViewportTransform({ x: 60, y: 60, scale: 0.6 });
  };

  const deviceLabel = settings.deviceProfile === 'pc' ? t('header.devicePc') : t('header.deviceMobile');
  const colorModeLabel = settings.colorMode === 'light' ? t('header.lightMode') : t('header.darkMode');
  const lintTitle = lint
    ? `${t('header.lintTitle', { rate: lint.complianceRate, count: lint.issues.length })}${
        curScreen?.metadata?.importedHtml ? t('header.lintImportedSuffix') : ''
      }`
    : undefined;

  return (
    <header className="h-12 bg-host-chrome border-b border-host-border px-4 flex items-center justify-between z-30 select-none text-xs">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <BrandMark size={28} className="shadow rounded-lg" />
          <span className="font-bold text-host-primary hidden sm:inline">{t('app.name')}</span>
        </div>

        <div className="h-4 w-px bg-host-border" />

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-host-sunken hover:border-host-border-strong focus:border-host-accent border border-host-border px-2 py-1 rounded text-host-primary font-medium focus:outline-none focus:ring-1 focus:ring-host-accent w-36 transition"
        />

        {/* 设备档位：只读展示。档位在新建工程时确定且不可更改 (D8)，
            放一个不可用的切换控件只会误导用户以为可以切 */}
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-host-sunken border border-host-border text-host-secondary cursor-default"
          title={t('header.deviceBadgeTitle', { device: deviceLabel, width: settings.frameWidth })}
        >
          {settings.deviceProfile === 'pc' ? (
            <Laptop className="w-3.5 h-3.5 text-host-brand" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 text-host-brand" />
          )}
          <span className="font-medium">{settings.frameWidth}</span>
        </span>
        {(saveStatus==='failed'||saveStatus==='readonly')&&<details className="relative text-host-warning">
          <summary className="cursor-pointer rounded border border-host-warning/40 bg-host-sunken px-2 py-1" aria-label={t('header.saveIssuesAria')}>{saveStatus==='readonly'?t('header.saveReadonly'):t('header.saveUnconfirmed')}</summary>
          <div role="alert" className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-host-border-strong bg-host-elevated p-3 text-xs leading-relaxed text-host-primary shadow-xl">
            <p>{saveError}</p><p className="mt-2 text-host-secondary">{t('header.saveKeepHint')}</p>
          </div>
        </details>}
        {saveStatus==='saving'&&<span role="status" className="text-host-tertiary">{t('header.saving')}</span>}
      </div>

      {/* Middle: 视图开关 / 撤销重做 / 缩放 */}
      <div className="flex items-center gap-3">

        {/* Viewport Guide Switch (PRD D13) */}
        <button
          onClick={() => setShowViewportGuide(!settings.showViewportGuide)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition ${
            settings.showViewportGuide
              ? 'border-host-accent/40 bg-host-accent-subtle text-host-brand'
              : 'border-host-border bg-host-sunken text-host-secondary hover:text-host-primary'
          }`}
          title={t('header.viewportGuideTitle')}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{t('header.viewportGuide')}</span>
        </button>

        {/* Light/Dark Color Mode Switch (PRD §3.5.2) */}
        <button
          onClick={toggleColorMode}
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-host-border bg-host-sunken hover:bg-host-elevated text-host-secondary hover:text-host-primary transition"
          title={t('header.colorModeTitle', { mode: colorModeLabel })}
        >
          {settings.colorMode === 'light' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-host-warning" />
              <span>{t('header.light')}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-host-brand" />
              <span>{t('header.dark')}</span>
            </>
          )}
        </button>


        {/* Token Lint Health Indicator (PRD §3.5.4) */}
        {lint && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 bg-host-sunken border border-host-border rounded-lg text-[11px]"
            title={lintTitle}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${lint.complianceRate >= 95 ? 'text-host-success' : 'text-host-warning'}`} />
            <span className="text-host-secondary">{t('header.complianceRate')}</span>
            <span className={`font-mono font-bold ${lint.complianceRate >= 95 ? 'text-host-success' : 'text-host-warning'}`}>
              {lint.complianceRate}%
            </span>
          </div>
        )}

        <div className="h-4 w-px bg-host-border" />

        {/* Undo / Redo Controls (T-27 / C-5) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo()}
            className="p-1.5 rounded-lg text-host-secondary hover:text-host-primary hover:bg-host-elevated disabled:opacity-30 disabled:hover:bg-transparent transition"
            title={t('header.undoTitle')}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo()}
            className="p-1.5 rounded-lg text-host-secondary hover:text-host-primary hover:bg-host-elevated disabled:opacity-30 disabled:hover:bg-transparent transition"
            title={t('header.redoTitle')}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="h-4 w-px bg-host-border" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 text-host-secondary">
          <button onClick={() => handleZoom(0.85)} className="p-1 hover:text-host-primary" title={t('header.zoomOut')}>
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleResetZoom} className="px-1.5 py-0.5 font-mono hover:text-host-primary" title={t('header.zoomReset')}>
            {zoomPercent}%
          </button>
          <button onClick={() => handleZoom(1.15)} className="p-1 hover:text-host-primary" title={t('header.zoomIn')}>
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFitAll} className="p-1 hover:text-host-primary ml-1" title={t('header.fitAll')}>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={arrangeScreens} className="p-1 hover:text-host-primary" title={t('header.arrange')}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-lg shadow transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t('header.exportDelivery')}</span>
        </button>

        <LanguageMenu />

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-host-secondary hover:text-host-primary hover:bg-host-elevated rounded-lg transition"
          title={t('header.settings')}
          aria-label={t('header.settings')}
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-host-border" />

        <button
          onClick={backToManager}
          className="flex items-center gap-1 px-2 py-1.5 text-host-secondary hover:text-host-primary hover:bg-host-elevated rounded-lg transition"
          title={t('header.backToProjectsTitle')}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('header.projects')}</span>
        </button>
      </div>
    </header>
  );
};
