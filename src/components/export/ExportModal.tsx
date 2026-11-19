import { resolveProjectViewport } from '../../utils/referenceDevice';
import { resolveThemeColors } from '../../utils/semanticColors';
import React, { useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { buildStandaloneHtml, buildArtifactManifest } from '../../utils/exportRenderer';
import { exportScreenPng, PngExportEngine } from '../../utils/pngExporter';
import { useScreenResources, useStyleResources } from '../../hooks/useScreenResources';
import {MediaDiagnosticsButton} from '../common/MediaDiagnosticsButton';
import {
  dataUrlToBytes,
  saveExportFile,
  SaveExportResult,
  textToBytes
} from '../../utils/exportSaver';
import { AlertCircle, Check, CheckCircle2, Copy, Download, FileCode, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const t = useT();
  const { screens, activeScreenId, designSystem, settings, overrides } = useProjectStore();
  // T-AE-14: 业务导出默认不选风格样张页——新建工程时它是唯一画框且处于激活态，
  // 若直接作默认值，用户点导出拿到的会是设计规范而非自己的页面。
  // 仍保留在列表中，以支持「单独导出 styleguide.html」。
  const isSpecimenScreen = (id: string) => screens[id]?.metadata?.kind === 'specimen';
  const defaultScreenId =
    (activeScreenId && !isSpecimenScreen(activeScreenId) ? activeScreenId : '') ||
    Object.keys(screens).find((id) => !isSpecimenScreen(id)) ||
    activeScreenId ||
    Object.keys(screens)[0] ||
    '';
  const [selectedScreenId, setSelectedScreenId] = useState<string>(defaultScreenId);
  const [exportType, setExportType] = useState<'html' | 'png'>('html');
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [clipFirstScreen, setClipFirstScreen] = useState(false);
  const [includeManifest, setIncludeManifest] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<(SaveExportResult & { label: string }) | null>(null);
  const [isSavingHtml, setIsSavingHtml] = useState(false);
  const [lastEngine, setLastEngine] = useState<PngExportEngine | null>(null);
  const [copied, setCopied] = useState(false);
  const referenceViewport = resolveProjectViewport(settings);

  const pageResources = useScreenResources(screens[selectedScreenId],0,'export');
  const {screen}=pageResources;

  // 1. Inlined Tokens (Current mode only, PRD D14)
  const tokensCss = compileTokensToCss(designSystem.tokens, settings.colorMode);

  // 2. Base CSS —— 引用唯一权威源 (T-AE-02)
  const baseCss = getBaseCss(settings.deviceProfile);

  // 3. Compile Overrides
  const authoredOverrides = Object.entries(overrides)
    .filter(([key]) => key.startsWith(`${selectedScreenId}:`))
    .map(([key, ov]) => {
      const decs = Object.entries(ov.declarations).map(([p, v]) => `${p}: ${v};`).join(' ');
      return `/* Override for ${ov.nid} */ [data-nid="${ov.nid}"] { ${decs} }`;
    })
    .join('\n');

  // Export owns an in-memory copy: temporary preview URLs never enter offline deliverables.
  const styleResources=useStyleResources(authoredOverrides,0,'export',selectedScreenId);
  const screenOverrides=styleResources.css;
  const loadingResources=pageResources.loading||styleResources.loading;
  const resourceError=pageResources.error||styleResources.error;

  const standaloneHtml = screen
    ? buildStandaloneHtml(screen, { tokensCss, baseCss, screenOverrides, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation })
    : '';

  const handleDownloadHtml = async () => {
    setExportError(null);
    setSaveResult(null);
    if (!screen || isSavingHtml || loadingResources || resourceError) return;
    setIsSavingHtml(true);

    try {
      // 1. 独立 HTML 文件：由用户在系统保存对话框中选定落点 (BR-SAVE-01)
      const htmlRes = await saveExportFile({
        fileName: `${screen.name || 'design'}.html`,
        bytes: textToBytes(standaloneHtml),
        mimeType: 'text/html;charset=utf-8',
        filterName: t('export.filterHtml'),
        extensions: ['html']
      });

      if (htmlRes.status === 'canceled') {
        setSaveResult({ ...htmlRes, label: 'HTML' });
        return;
      }

      // 2. 侧车清单：紧随其后单独保存，用户可再次选定位置或取消 (BR-SAVE-04)
      if (includeManifest) {
        const manifest = buildArtifactManifest(screen, settings);
        await saveExportFile({
          fileName: `${screen.name || 'design'}.manifest.json`,
          bytes: textToBytes(JSON.stringify(manifest, null, 2)),
          mimeType: 'application/json',
          filterName: t('export.filterManifest'),
          extensions: ['json']
        });
      }

      setSaveResult({ ...htmlRes, label: 'HTML' });
    } catch (err: any) {
      setExportError(err?.message || t('export.htmlSaveFailed'));
    } finally {
      setIsSavingHtml(false);
    }
  };

  const handleCopy = () => {
    if (loadingResources || resourceError) return;
    navigator.clipboard.writeText(standaloneHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- PNG 导出：原生渲染器优先，失败回退 foreignObject (doc/feature/high-fidelity-png-export) ---
  const handleExportPng = async () => {
    if (!screen || loadingResources || resourceError) return;
    setIsExportingPng(true);
    setExportError(null);
    setExportNotice(null);
    setSaveResult(null);

    try {
      const bgColor = resolveThemeColors(designSystem.tokens, settings.colorMode).values.background;

      const outcome = await exportScreenPng(screen, {
        viewportHeight: referenceViewport.height,
        deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation,
        tokensCss,
        baseCss,
        screenOverrides,
        width: settings.frameWidth,
        clipToHeight: clipFirstScreen,
        clipHeight: referenceViewport.height,
        fallbackHeight: screen.measuredHeight || 800,
        scale: pngScale,
        bgColor
      });

      const pngRes = await saveExportFile({
        fileName: `${screen.name || 'design'}_${pngScale}x.png`,
        bytes: dataUrlToBytes(outcome.dataUrl),
        mimeType: 'image/png',
        filterName: t('export.filterPng'),
        extensions: ['png']
      });
      setSaveResult({ ...pngRes, label: `PNG ${pngScale}x` });

      if (outcome.engine === 'foreign-object') {
        setExportNotice(
          `已使用兼容渲染导出（${outcome.fallbackReason || '原生渲染不可用'}）。桌面端原生渲染可获得更高保真度。${outcome.warnings?.length ? ' '+outcome.warnings.join(' ') : ''}`
        );
      }
      setLastEngine(outcome.engine);
    } catch (err: any) {
      console.error('PNG export failed:', err);
      setExportError(err?.message || t('export.pngRenderFailed'));
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-sm">{t('export.modalTitle')}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none" aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {/* Export Type Tabs */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950 px-4 text-xs font-medium">
          <button
            onClick={() => setExportType('html')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              exportType === 'html'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>{t('export.tabHtml')}</span>
          </button>
          <button
            onClick={() => setExportType('png')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              exportType === 'png'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>{t('export.tabPng')}</span>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {loadingResources && <p className="text-xs text-blue-300">{t('export.loadingResources')}</p>}
          {resourceError && <div role="alert" className="rounded-lg bg-red-950/40 p-3 text-xs text-red-200">
            <p>{resourceError}</p>
            <button type="button" onClick={()=>{pageResources.retry();styleResources.retry();}} className="mt-2 rounded border border-red-700 px-2 py-1 hover:bg-red-900">{t('export.retryResources')}</button>
            <MediaDiagnosticsButton/>
          </div>}
          {saveResult && !exportError && (
            saveResult.status === 'canceled' ? (
              <div
                data-testid="export-canceled-banner"
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>{t('export.saveCanceled')}</span>
                </div>
                <button onClick={() => setSaveResult(null)} className="text-slate-500 hover:text-slate-300 text-sm leading-none px-1" aria-label={t('common.close')}>
                  ×
                </button>
              </div>
            ) : (
              <div
                data-testid="export-success-banner"
                className="p-3 bg-emerald-950/50 border border-emerald-800/70 rounded-xl text-xs text-emerald-300 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{t('export.savedLabel', { label: saveResult.label })}</span>
                  </div>
                  <button
                    onClick={() => setSaveResult(null)}
                    className="text-emerald-400 hover:text-emerald-200 text-sm leading-none px-1"
                    aria-label={t('common.close')}
                  >
                    ×
                  </button>
                </div>
                <div
                  className="font-mono text-[10px] text-emerald-400/80 break-all leading-relaxed"
                  title={saveResult.path || saveResult.fileName}
                >
                  {saveResult.path || saveResult.fileName}
                </div>
                {saveResult.status === 'downloaded' && (
                  <p className="text-[10px] text-emerald-400/70">
                    {t('export.browserDownloadHint')}
                  </p>
                )}
              </div>
            )
          )}

          {exportNotice && !exportError && (
            <div className="p-3 bg-amber-950/50 border border-amber-800/70 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{exportNotice}</span>
              </div>
              <button
                onClick={() => setExportNotice(null)}
                className="text-amber-400 hover:text-amber-200 text-sm leading-none px-1"
              >
                ×
              </button>
            </div>
          )}

          {exportError && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{exportError}</span>
              </div>
              <button
                onClick={() => setExportError(null)}
                className="text-red-400 hover:text-red-200 text-sm leading-none px-1"
              >
                ×
              </button>
            </div>
          )}

          {/* Target Screen Selector */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-semibold">{t('export.selectScreen')}</span>
            <select
              value={selectedScreenId}
              onChange={(e) => setSelectedScreenId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 text-xs"
            >
              {Object.values(screens).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({settings.frameWidth}px){s.metadata?.kind === 'specimen' ? t('export.specimenSuffix') : ''}
                </option>
              ))}
            </select>
          </div>

          {/* HTML Tab */}
          {exportType === 'html' && (
            <>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <span>{t('export.htmlBenefitInline')}</span>
                  <span>{t('export.htmlBenefitStripNid')}</span>
                  <span>{t('export.htmlBenefitTokens')}</span>
                </div>
                <p className="leading-relaxed">
                  {t('export.htmlBenefitHint')}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">{t('export.previewLabel')}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{(standaloneHtml.length / 1024).toFixed(1)} KB</span>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-auto text-[11px] font-mono text-slate-300 leading-relaxed">
                  {standaloneHtml.slice(0, 1200)}
                  {standaloneHtml.length > 1200 && `\n${t('export.previewTruncated')}`}
                </pre>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={includeManifest}
                    onChange={(e) => setIncludeManifest(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>{t('export.includeManifest', { name: screen?.name || 'design' })}</span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5 pt-0.5">
                  {t('export.includeManifestHint')}
                </p>
              </div>
            </>
          )}

          {/* PNG Tab */}
          {exportType === 'png' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block">{t('export.scaleLabel')}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as const).map((sc) => (
                      <button
                        key={sc}
                        onClick={() => setPngScale(sc)}
                        className={`py-1.5 rounded-lg border text-xs font-mono transition ${
                          pngScale === sc
                            ? 'border-blue-500 bg-blue-950 text-blue-300'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {sc}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block">{t('export.clipLabel')}</span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="clipMode"
                        checked={!clipFirstScreen}
                        onChange={() => setClipFirstScreen(false)}
                      />
                      <span>{t('export.clipFull', { height: screen?.measuredHeight || 800 })}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="clipMode"
                        checked={clipFirstScreen}
                        onChange={() => setClipFirstScreen(true)}
                      />
                      <span>{t('export.clipFirst', { height: referenceViewport.height })}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">{t('export.renderLabel')}</span>
                <p>
                  {t('export.renderHint')}
                </p>
                <p>
                  输出宽度: {settings.frameWidth * pngScale}px ·
                  {clipFirstScreen
                    ? t('export.heightFirstClip', { height: referenceViewport.height * pngScale })
                    : t('export.heightMeasured')}
                  {lastEngine && (
                    <span className="text-slate-500">
                      {' '}· {t('export.lastEngine', {
                        engine: lastEngine === 'foreign-object' ? t('export.engineCompat') : t('export.engineNative'),
                      })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          {exportType === 'html' ? (
            <button
              onClick={handleCopy}
              disabled={loadingResources || !!resourceError}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs transition border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t('export.copied') : t('export.copyCode')}</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs transition">
              {t('common.cancel')}
            </button>
            {exportType === 'html' ? (
              <button
                onClick={handleDownloadHtml}
                disabled={isSavingHtml || loadingResources || !!resourceError}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl text-xs transition shadow"
              >
                {isSavingHtml ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isSavingHtml ? t('export.savingHtml') : t('export.saveHtml')}</span>
              </button>
            ) : (
              <button
                onClick={handleExportPng}
                disabled={isExportingPng || loadingResources || !!resourceError}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl text-xs transition shadow"
              >
                {isExportingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExportingPng ? t('export.exportingPng') : t('export.downloadPng')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
