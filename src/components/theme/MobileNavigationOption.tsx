import React from 'react';
import { useProjectStore } from '../../stores/useProjectStore';

export const MobileNavigationOption: React.FC<{ disabled?: boolean; value?: boolean; onChange?: (value: boolean) => void }> = ({ disabled, value, onChange }) => {
  const settings = useProjectStore(state => state.settings);
  const setUseCustomNavigation = useProjectStore(state => state.setUseCustomNavigation);
  if (settings.deviceProfile !== 'mobile') return null;
  return <div className="rounded-lg border border-slate-700 p-3">
    <label className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" aria-label="使用自定义导航栏" checked={value ?? !!settings.useCustomNavigation} disabled={disabled} onChange={event => (onChange ?? setUseCustomNavigation)(event.target.checked)} />使用自定义导航栏</label>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">默认关闭：忽略来源顶部栏，画布与图片展示微信顶部栏，页面 HTML 不包含。开启后，后续导入或 AI 调整会处理自定义导航；现有页面不自动重建。</p>
  </div>;
};
