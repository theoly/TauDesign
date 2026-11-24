import { ReferenceDeviceOption } from '../../theme/ReferenceDeviceOption';
import { resolveThemeColors } from '../../../utils/semanticColors';
import React, { useState } from 'react';
import { useProjectStore } from '../../../stores/useProjectStore';
import { useT } from '../../../stores/useLocaleStore';
import { Accordion } from '../Accordion';
import { Palette, Plus, Sparkles, Trash2 } from 'lucide-react';
import { MobileNavigationOption } from '../../theme/MobileNavigationOption';
import {PageStyleExtractionDialog} from '../../theme/PageStyleExtractionDialog';

interface DesignSystemPanelProps {
  /** 打开完整主题编辑器：色阶推导、预设切换等留在弹窗 */
  onOpenThemeEditor: () => void;
  /** T-AE-27: 批量风格重塑——处理换主题回溯不到的类名与结构部分 */
  onOpenRestyle: () => void;
}

/** 侧边栏「设计系统」视图 (PRD §3.0.3 / §3.5) */
export const DesignSystemPanel: React.FC<DesignSystemPanelProps> = ({ onOpenThemeEditor, onOpenRestyle }) => {
  const translate = useT();
  const { designSystem, settings, decisions, addDecision, removeDecision, toggleDecision } =
    useProjectStore();
  const [newDecision, setNewDecision] = useState('');
  const [extracting,setExtracting]=useState(false);

  const t = designSystem.tokens;
  const mode = settings.colorMode;
  const colors = resolveThemeColors(t, mode).values;
  const decisionList = Object.values(decisions);

  const swatch = (label: string, color: string) => (
    <div key={label} className="flex items-center gap-2 px-2 py-1 text-[11px]">
      <span
        className="w-4 h-4 rounded border border-host-border shrink-0"
        style={{ background: color }}
      />
      <span className="text-host-secondary flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] text-host-tertiary">{color}</span>
    </div>
  );

  return (
    <>
      {extracting&&<PageStyleExtractionDialog onClose={()=>setExtracting(false)}/>}
      <div className="px-2 py-1.5 border-b border-host-border">
        <button onClick={()=>setExtracting(true)} className="mb-1.5 w-full rounded-md border border-host-border bg-host-sunken py-2 text-[11px] text-host-primary hover:bg-host-elevated transition">{translate('theme.extractStyle')}</button>
        <button
          onClick={onOpenThemeEditor}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-host-border bg-host-sunken hover:bg-host-elevated text-host-primary rounded-md text-[11px] transition"
        >
          <Palette className="w-3.5 h-3.5 text-host-brand" />
          <span>{translate('theme.fullEditor')}</span>
        </button>
        <button
          onClick={onOpenRestyle}
          title={translate('theme.restyleBatchHint')}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1.5 border border-host-border bg-host-sunken hover:bg-host-elevated text-host-primary rounded-md text-[11px] transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-host-warning" />
          <span>{translate('theme.batchRestyle')}</span>
        </button>
      </div>

      <div className="p-2 border-b border-host-border"><ReferenceDeviceOption settings={settings} onChange={id => useProjectStore.getState().setReferenceDevice(id)} /></div>
      {settings.deviceProfile === 'mobile' && <div className="p-2"><MobileNavigationOption /></div>}
      <Accordion panelKey="design.colors" title={translate('theme.panelColors')}>
        <div className="px-1">
          {swatch(translate('theme.swatchBrand'), colors.brand)}
          {swatch(translate('theme.swatchPrimaryBg'), colors.primary)}
          {swatch(translate('theme.swatchPrimaryFg'), colors.onPrimary)}
          {swatch(translate('theme.swatchBrandText'), colors.primaryText)}
          <div className="h-px bg-host-border my-1 mx-2" />
          {swatch(translate('theme.swatchBackground', { mode }), colors.background)}
          {swatch(translate('theme.swatchSurface', { mode }), colors.surface)}
          {swatch(translate('theme.swatchTextPrimary', { mode }), colors.textPrimary)}
          {swatch(translate('theme.swatchTextSecondary', { mode }), colors.textSecondary)}
          {swatch(translate('theme.swatchBorder', { mode }), colors.border)}
          {swatch(translate('theme.swatchSuccess'), colors.successText)}
          {swatch(translate('theme.swatchWarning'), colors.warningText)}
          {swatch(translate('theme.swatchDanger'), colors.dangerText)}
        </div>
      </Accordion>

      <Accordion panelKey="design.typography" title={translate('theme.panelTypography')} defaultOpen={false}>
        <div className="px-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-host-tertiary shrink-0">{translate('theme.fontSans')}</span>
            <span className="text-host-primary truncate text-right">{t.typography.fontFamilySans}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-host-tertiary shrink-0">{translate('theme.fontMono')}</span>
            <span className="text-host-primary truncate text-right">{t.typography.fontFamilyMono}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {Object.entries(t.typography.sizes).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 bg-host-sunken border border-host-border rounded font-mono text-[10px] text-host-secondary">
                {k}:{v}
              </span>
            ))}
          </div>
        </div>
      </Accordion>

      <Accordion panelKey="design.scales" title={translate('theme.panelScales')} defaultOpen={false}>
        <div className="px-3 space-y-2 text-[11px]">
          <div>
            <span className="text-host-tertiary block mb-1">{translate('theme.scaleRadius')}</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(t.radius).map(([k, v]) => (
                <span key={k} className="px-1.5 py-0.5 bg-host-sunken border border-host-border rounded font-mono text-[10px] text-host-secondary">
                  {k}:{v}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-host-tertiary block mb-1">{translate('theme.scaleSpacing')}</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(t.spacing).map(([k, v]) => (
                <span key={k} className="px-1.5 py-0.5 bg-host-sunken border border-host-border rounded font-mono text-[10px] text-host-secondary">
                  {k}:{v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Accordion>

      {/* D20 工程记忆：Token 管可量化的值，约定管不可量化的偏好 */}
      <Accordion panelKey="design.decisions" title={translate('theme.panelDecisions')} badge={decisionList.filter((d) => d.active).length}>
        <div className="px-2 space-y-1">
          {decisionList.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-host-tertiary leading-relaxed">
              {translate('theme.decisionsEmpty')}
            </p>
          )}
          {decisionList.map((d) => (
            <div
              key={d.id}
              className={`group flex items-start gap-1.5 px-2 py-1.5 rounded-md text-[11px] ${
                d.active ? 'bg-host-sunken border border-host-border/60 text-host-primary' : 'bg-host-sunken/40 text-host-tertiary line-through'
              }`}
            >
              <input
                type="checkbox"
                checked={d.active}
                onChange={() => toggleDecision(d.id)}
                className="mt-0.5 accent-host-accent shrink-0"
                title={d.active ? translate('theme.decisionDisableTitle') : translate('theme.decisionEnableTitle')}
              />
              <span className="flex-1 leading-snug">{d.text}</span>
              <button
                onClick={() => removeDecision(d.id)}
                className="opacity-0 group-hover:opacity-100 text-host-tertiary hover:text-host-danger shrink-0"
                title={translate('common.delete')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-1 pt-1">
            <input
              value={newDecision}
              onChange={(e) => setNewDecision(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDecision.trim()) {
                  addDecision(newDecision.trim());
                  setNewDecision('');
                }
              }}
              placeholder={translate('theme.decisionPlaceholder')}
              className="flex-1 bg-host-sunken border border-host-border rounded-md px-2 py-1 text-[11px] text-host-primary placeholder:text-host-tertiary focus:outline-none focus:border-host-accent"
            />
            <button
              onClick={() => {
                if (newDecision.trim()) {
                  addDecision(newDecision.trim());
                  setNewDecision('');
                }
              }}
              className="p-1 text-host-secondary hover:text-host-brand shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Accordion>
    </>
  );
};
