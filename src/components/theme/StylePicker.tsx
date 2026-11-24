import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { buildStyleSpecimenHtml } from '../../utils/styleSpecimen';
import { themePresets } from '../../utils/themePresets';
import { computeRetraceability } from '../../utils/tokenLint';
import { useT } from '../../stores/useLocaleStore';

/**
 * 风格候选并排选择 (A2 / T-AE-19)。
 *
 * 风格确认的最佳时机不是用户还没看到画面的新建时刻——那时他们没有参照物，
 * 答不准"你偏好什么留白节奏"。有了样张页做确定性载体，就可以把同一份 HTML
 * 套上不同 Token 并排渲染，让用户**看着选**。
 *
 * 全程零 LLM 调用：样张是静态模板，切 Token 只是 CSS 变量重算。
 * 参见 doc/aesthetic/spec.md §6.3 / §6.6.3。
 */
export const StylePicker: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const { designSystem, settings, setDesignSystem, screens, screenOrder, overrides, scanThemeConflicts, clearOverridesForTheme } =
    useProjectStore();
  const libraryReadOnly=useProjectStore(state=>state.designLibraryBinding?.mode==='pinned_reference');
  const [picked, setPicked] = useState<string>(designSystem.id);
  // 换肤前的预期管理：先告诉用户有多少内容其实跟不上新主题 (T-AE-22/23)
  const [confirming, setConfirming] = useState(false);

  const conflicts = useMemo(() => scanThemeConflicts(), [scanThemeConflicts, overrides]);
  const clearable = conflicts.filter((c) => !c.escaped);
  const retrace = useMemo(
    () =>
      computeRetraceability(
        screenOrder.map((id) => screens[id]).filter(Boolean),
        designSystem,
        Object.values(overrides).map((o) => o.nid),
        settings.deviceProfile
      ),
    [screenOrder, screens, designSystem, overrides, settings.deviceProfile]
  );

  // 样张 HTML 与基座 CSS 在四个候选间完全相同——差异只来自 Token，
  // 这才使并排对比是 apples-to-apples 的。
  const specimenHtml = useMemo(() => buildStyleSpecimenHtml(settings.deviceProfile), [settings.deviceProfile]);
  const baseCss = useMemo(() => getBaseCss(settings.deviceProfile), [settings.deviceProfile]);

  const srcDoc = (tokensCss: string) =>
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseCss}</style><style>${tokensCss}</style>` +
    `<style>body{margin:0;transform-origin:0 0;}</style></head><body>${specimenHtml}</body></html>`;

  const frameWidth = settings.frameWidth;
  const previewWidth = 260;
  const scale = previewWidth / frameWidth;

  const applyTheme = (clearConflicts: boolean) => {
    if(useProjectStore.getState().designLibraryBinding?.mode==='pinned_reference')return;
    if (clearConflicts) {
      // escaped 覆盖是用户显式逃逸，不在清除范围内
      clearOverridesForTheme(clearable.map((c) => c.key));
    }
    const preset = themePresets.find((p) => p.theme.id === picked);
    if (preset) setDesignSystem(preset.theme);
    onClose();
  };

  const onApplyClick = () => {
    // 有手动覆盖或可回溯率偏低时，必须先让用户知情，不得静默换肤
    if (clearable.length > 0 || retrace.rate < 90) setConfirming(true);
    else applyTheme(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-slate-100 font-semibold text-sm">{t('theme.stylePickerTitle')}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {t('theme.stylePickerSubtitle')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 overflow-y-auto">
          {themePresets.map((preset) => {
            const tokensCss = compileTokensToCss(preset.theme.tokens, settings.colorMode);
            const isPicked = picked === preset.theme.id;
            return (
              <button
                key={preset.id}
                onClick={() => setPicked(preset.theme.id)}
                className={`text-left rounded-xl border-2 overflow-hidden transition ${
                  isPicked ? 'border-blue-500' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className="bg-white overflow-hidden relative"
                  style={{ height: 300, width: '100%' }}
                >
                  <iframe
                    title={preset.name}
                    srcDoc={srcDoc(tokensCss)}
                    sandbox="allow-same-origin"
                    scrolling="no"
                    style={{
                      width: frameWidth,
                      height: frameWidth * 1.4,
                      border: 'none',
                      transform: `scale(${scale})`,
                      transformOrigin: '0 0',
                      pointerEvents: 'none'
                    }}
                  />
                </div>
                <div className="p-3 bg-slate-950 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-none"
                      style={{ background: preset.primaryColor }}
                    />
                    <span className="text-slate-200 text-xs font-semibold truncate">{preset.name}</span>
                    {isPicked && <Check className="w-3 h-3 text-blue-400 ml-auto flex-none" />}
                  </div>
                  <p className="text-slate-500 text-[10px] mt-1 leading-relaxed">{preset.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {confirming ? (
          <div className="p-4 border-t border-slate-800 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-none mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1.5">
                <p className="font-semibold text-slate-100">{t('theme.stylePickerWarningTitle')}</p>
                <p className="text-slate-400 leading-relaxed">
                  {t('theme.stylePickerRetraceBefore')}<span className="text-amber-400 font-semibold">{retrace.rate}%</span>
                  {t('theme.stylePickerRetraceMid', { total: retrace.totalNodes, literal: retrace.literalNodes, overridden: retrace.overriddenNodes })}
                </p>
                {clearable.length > 0 && (
                  <p className="text-slate-400 leading-relaxed">
                    {t('theme.stylePickerClearableBefore')}<span className="text-slate-100 font-semibold">{clearable.length}</span>{t('theme.stylePickerClearableAfter')}
                    {conflicts.length - clearable.length > 0 && (
                      <span className="text-slate-500">
                        {t('theme.stylePickerEscapedNote', { count: conflicts.length - clearable.length })}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-slate-500">{t('theme.stylePickerUndoHint')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100">
                {t('theme.stylePickerBack')}
              </button>
              <button
                disabled={libraryReadOnly}
                onClick={() => applyTheme(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg"
              >
                {t('theme.stylePickerKeepOverrides')}
              </button>
              {clearable.length > 0 && (
                <button
                  onClick={() => applyTheme(true)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg"
                >
                  {t('theme.stylePickerClearAndApply')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">
              {t('theme.stylePickerFooterHint')}
            </span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100">
                {t('theme.stylePickerLater')}
              </button>
              <button
                disabled={libraryReadOnly} title={libraryReadOnly?t('theme.libraryReadonlyTitle'):undefined}
                onClick={onApplyClick}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg"
              >
                {t('theme.stylePickerApplyProject')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
