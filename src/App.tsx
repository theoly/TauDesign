import {LibraryEditingBanner} from './components/workspace/LibraryEditingBanner';
import { bindHtmlImportMenu } from './services/desktop/htmlImportMenu';
import { HtmlImportDialog } from './components/canvas/HtmlImportDialog';
import React, { useEffect, useState } from 'react';
import { Header } from './components/layout/Header';
import { SideBar } from './components/layout/SideBar';
import { InfiniteCanvas } from './components/canvas/InfiniteCanvas';
import { ChatDrawer } from './components/chat/ChatDrawer';
import { ThemeEditor } from './components/theme/ThemeEditor';
import { ExportModal } from './components/export/ExportModal';
import { AIProviderModal } from './components/settings/AIProviderModal';
import { AssetModal } from './components/assets/AssetModal';
import { ProjectManager } from './components/workspace/ProjectManager';
import { RestylePanel } from './components/theme/RestylePanel';
import { useWorkspaceStore } from './stores/useWorkspaceStore';
import { useProjectStore } from './stores/useProjectStore';
import { flushHistorySave } from './services/storage/historyPersistence';
import { ErrorBoundary } from './components/common/ErrorBoundary';

interface RecoveryBannerProps {
  uncleanShutdownAt: number;
  onDismiss: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({ uncleanShutdownAt, onDismiss }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    setCountdown(10);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [uncleanShutdownAt, onDismiss]);

  return (
    <div
      data-testid="recovery-banner"
      className="px-4 py-2 bg-amber-950/60 border-b border-amber-800/50 text-[11px] text-amber-200 flex items-center justify-between gap-3"
    >
      <span>
        检测到上次未正常关闭（{new Date(uncleanShutdownAt).toLocaleString('zh-CN')}）。
        已恢复至最后一次自动保存；会话记录为追加写入，最多丢失最后一轮。
      </span>
      <button
        onClick={onDismiss}
        className="text-amber-400 hover:text-amber-200 shrink-0 font-medium px-2 py-0.5 rounded hover:bg-amber-900/40 transition cursor-pointer"
        title="点击提前关闭提示"
      >
        知道了 ({countdown}s)
      </button>
    </div>
  );
};

const Workspace: React.FC = () => {
  // T-AE-44 / PRD §3.8.5：上次异常退出时提示恢复
  const { uncleanShutdownAt, dismissRecovery } = useWorkspaceStore();
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'provider' | 'quick_prompts'>('provider');
  const [showAssetModal, setShowAssetModal] = useState(false);
  // T-AE-26/27: Polish 与 Restyle 共用同一面板——Polish 即队列只含一项的重塑
  const [restyleScope, setRestyleScope] = useState<'all' | string | null>(null);

  // 关闭应用/刷新前把撤销栈同步落盘，下次打开工程可继续 undo/redo (BR-HIS-06)
  useEffect(() => {
    const onBeforeUnload = () => {
      const { id, folderPath } = useProjectStore.getState();
      flushHistorySave(id, folderPath);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const handleOpenSettings = (tab?: 'provider' | 'quick_prompts') => {
    setSettingsTab(tab || 'provider');
    setShowSettingsModal(true);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 overflow-hidden font-sans">
      <Header
        onOpenExport={() => setShowExportModal(true)}
        onOpenSettings={() => handleOpenSettings('provider')}
      />

      <LibraryEditingBanner/>
      {uncleanShutdownAt !== null && (
        <RecoveryBanner
          uncleanShutdownAt={uncleanShutdownAt}
          onDismiss={dismissRecovery}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <ChatDrawer onOpenSettings={handleOpenSettings} />

        <div className="flex-1 min-w-0 h-full relative overflow-hidden">
          <InfiniteCanvas onPolish={(sid) => setRestyleScope(sid)} />
        </div>

        <SideBar
          onOpenRestyle={() => setRestyleScope('all')}
          onOpenAssetCenter={() => setShowAssetModal(true)}
          onOpenThemeEditor={() => setShowThemeModal(true)}
        />
      </div>

      {showThemeModal && <ThemeEditor onClose={() => setShowThemeModal(false)} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showSettingsModal && (
        <AIProviderModal
          initialTab={settingsTab}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
      {showAssetModal && <AssetModal onClose={() => setShowAssetModal(false)} />}
      {restyleScope !== null && (
        <RestylePanel scope={restyleScope} onClose={() => setRestyleScope(null)} />
      )}
    </div>
  );
};

/**
 * 应用入口 (PRD §3.0 / D21)
 *
 * 启动后先进工程管理页。没有工程上下文时，画板、检查器、资源库、主题面板
 * 全部无意义，直接进工作空间只会得到一屏空壳。
 */
export const App: React.FC = () => {
  const { view, refresh, activeProjectId } = useWorkspaceStore();
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  useEffect(() => bindHtmlImportMenu(() => setShowHtmlImport(true)), []);
  useEffect(() => setShowHtmlImport(false), [view, activeProjectId]);

  useEffect(() => {
    refresh();
  }, []);

  return (
    <ErrorBoundary
      fallbackTitle="TauDesign 遇到非预期异常"
      fallbackMessage="已拦截错误以保护工程数据安全，应用未崩溃。您可以尝试重置状态或刷新。"
      onReset={() => {
        useProjectStore.getState().selectNode(null);
        refresh();
      }}
    >
      {view === 'workspace' ? <Workspace key={activeProjectId}/> : <ProjectManager />}
      {view === 'workspace' && showHtmlImport && <HtmlImportDialog key={activeProjectId} onClose={() => setShowHtmlImport(false)} />}
    </ErrorBoundary>
  );
};

export default App;
