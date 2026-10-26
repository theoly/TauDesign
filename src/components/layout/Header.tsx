import React from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { BrandMark } from '../common/BrandMark';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { TokenLintEngine, getTokenLintContext } from '../../utils/tokenLint';
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

  return (
    <header className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 select-none text-xs">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <BrandMark size={28} className="shadow rounded-lg" />
          <span className="font-bold text-slate-100 hidden sm:inline">TauDesign</span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-transparent hover:bg-slate-800 focus:bg-slate-950 px-2 py-1 rounded text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 transition"
        />

        {/* 设备档位：只读展示。档位在新建工程时确定且不可更改 (D8)，
            放一个不可用的切换控件只会误导用户以为可以切 */}
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-400 cursor-default"
          title={`设备档位：${settings.deviceProfile === 'pc' ? 'PC 桌面' : '移动端'}（画框宽度 ${settings.frameWidth}px）。档位在新建工程时确定，不可更改。`}
        >
          {settings.deviceProfile === 'pc' ? (
            <Laptop className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="font-medium">{settings.frameWidth}</span>
        </span>
      </div>

      {/* Middle: 视图开关 / 撤销重做 / 缩放 */}
      <div className="flex items-center gap-3">

        {/* Viewport Guide Switch (PRD D13) */}
        <button
          onClick={() => setShowViewportGuide(!settings.showViewportGuide)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition ${
            settings.showViewportGuide
              ? 'border-blue-500/50 bg-blue-950/40 text-blue-300'
              : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
          }`}
          title="首屏设备视口辅助线"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>首屏线</span>
        </button>

        {/* Light/Dark Color Mode Switch (PRD §3.5.2) */}
        <button
          onClick={toggleColorMode}
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-300 transition"
          title={`当前为 ${settings.colorMode === 'light' ? '浅色模式' : '深色模式'}，点击切换`}
        >
          {settings.colorMode === 'light' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>浅色</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>深色</span>
            </>
          )}
        </button>


        {/* Token Lint Health Indicator (PRD §3.5.4) */}
        {lint && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px]"
            title={`Token 合规率: ${lint.complianceRate}% (${lint.issues.length} 处差异)${curScreen?.metadata?.importedHtml ? '；导入页包含自带样式，此分数不代表视觉还原度' : ''}`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${lint.complianceRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-400">合规率:</span>
            <span className={`font-mono font-bold ${lint.complianceRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {lint.complianceRate}%
            </span>
          </div>
        )}

        <div className="h-4 w-px bg-slate-800" />

        {/* Undo / Redo Controls (T-27 / C-5) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo()}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="撤销 (Cmd/Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo()}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="重做 (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 text-slate-400">
          <button onClick={() => handleZoom(0.85)} className="p-1 hover:text-slate-200" title="缩小">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleResetZoom} className="px-1.5 py-0.5 font-mono hover:text-slate-200" title="复位 100%">
            {zoomPercent}%
          </button>
          <button onClick={() => handleZoom(1.15)} className="p-1 hover:text-slate-200" title="放大">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFitAll} className="p-1 hover:text-slate-200 ml-1" title="适应全部">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={arrangeScreens} className="p-1 hover:text-slate-200" title="整理排列画板 (PRD §3.3.2)">
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>交付导出</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          title="设置"
          aria-label="设置"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800" />

        <button
          onClick={backToManager}
          className="flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          title="保存并返回工程管理"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>工程</span>
        </button>
      </div>
    </header>
  );
};
