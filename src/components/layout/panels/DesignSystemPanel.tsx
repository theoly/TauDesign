import { ReferenceDeviceOption } from '../../theme/ReferenceDeviceOption';
import { resolveThemeColors } from '../../../utils/semanticColors';
import React, { useState } from 'react';
import { useProjectStore } from '../../../stores/useProjectStore';
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
        className="w-4 h-4 rounded border border-white/10 shrink-0"
        style={{ background: color }}
      />
      <span className="text-slate-400 flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] text-slate-600">{color}</span>
    </div>
  );

  return (
    <>
      {extracting&&<PageStyleExtractionDialog onClose={()=>setExtracting(false)}/>}
      <div className="px-2 py-1.5 border-b border-slate-850/80">
        <button onClick={()=>setExtracting(true)} className="mb-1.5 w-full rounded-md bg-slate-800 py-2 text-[11px] text-slate-200 hover:bg-slate-700">从已有页面提取风格</button>
        <button
          onClick={onOpenThemeEditor}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-md text-[11px] transition"
        >
          <Palette className="w-3.5 h-3.5 text-blue-400" />
          <span>完整主题编辑器</span>
        </button>
        <button
          onClick={onOpenRestyle}
          title="把当前风格应用到已有页面中「换主题回溯不到」的部分（类名选择与结构）"
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-md text-[11px] transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>批量风格重塑</span>
        </button>
      </div>

      <div className="p-2 border-b border-slate-800"><ReferenceDeviceOption settings={settings} onChange={id => useProjectStore.getState().setReferenceDevice(id)} /></div>
      {settings.deviceProfile === 'mobile' && <div className="p-2"><MobileNavigationOption /></div>}
      <Accordion panelKey="design.colors" title="色彩">
        <div className="px-1">
          {swatch('品牌识别色 · Primary 500', colors.brand)}
          {swatch('主按钮背景', colors.primary)}
          {swatch('主按钮文字', colors.onPrimary)}
          {swatch('品牌文字', colors.primaryText)}
          <div className="h-px bg-slate-850 my-1 mx-2" />
          {swatch(`背景 (${mode})`, colors.background)}
          {swatch(`表面 (${mode})`, colors.surface)}
          {swatch(`主文本 (${mode})`, colors.textPrimary)}
          {swatch(`副文本 (${mode})`, colors.textSecondary)}
          {swatch(`边框 (${mode})`, colors.border)}
          {swatch('成功文字', colors.successText)}
          {swatch('警告文字', colors.warningText)}
          {swatch('危险文字', colors.dangerText)}
        </div>
      </Accordion>

      <Accordion panelKey="design.typography" title="排版" defaultOpen={false}>
        <div className="px-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 shrink-0">无衬线</span>
            <span className="text-slate-300 truncate text-right">{t.typography.fontFamilySans}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 shrink-0">等宽</span>
            <span className="text-slate-300 truncate text-right">{t.typography.fontFamilyMono}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {Object.entries(t.typography.sizes).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-400">
                {k}:{v}
              </span>
            ))}
          </div>
        </div>
      </Accordion>

      <Accordion panelKey="design.scales" title="间距 · 圆角 · 阴影" defaultOpen={false}>
        <div className="px-3 space-y-2 text-[11px]">
          <div>
            <span className="text-slate-500 block mb-1">圆角</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(t.radius).map(([k, v]) => (
                <span key={k} className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-400">
                  {k}:{v}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-slate-500 block mb-1">间距</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(t.spacing).map(([k, v]) => (
                <span key={k} className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-400">
                  {k}:{v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Accordion>

      {/* D20 工程记忆：Token 管可量化的值，约定管不可量化的偏好 */}
      <Accordion panelKey="design.decisions" title="工程约定" badge={decisionList.filter((d) => d.active).length}>
        <div className="px-2 space-y-1">
          {decisionList.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-slate-600 leading-relaxed">
              尚无约定。每次生成请求都会附带这里的条目，作为 Token 之外的风格约束。
            </p>
          )}
          {decisionList.map((d) => (
            <div
              key={d.id}
              className={`group flex items-start gap-1.5 px-2 py-1.5 rounded-md text-[11px] ${
                d.active ? 'bg-slate-950 text-slate-300' : 'bg-slate-950/40 text-slate-600 line-through'
              }`}
            >
              <input
                type="checkbox"
                checked={d.active}
                onChange={() => toggleDecision(d.id)}
                className="mt-0.5 accent-blue-500 shrink-0"
                title={d.active ? '停用（保留痕迹）' : '重新启用'}
              />
              <span className="flex-1 leading-snug">{d.text}</span>
              <button
                onClick={() => removeDecision(d.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 shrink-0"
                title="删除"
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
              placeholder="新增约定，如「按钮一律胶囊圆角」"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                if (newDecision.trim()) {
                  addDecision(newDecision.trim());
                  setNewDecision('');
                }
              }}
              className="p-1 text-slate-400 hover:text-blue-400 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Accordion>
    </>
  );
};
