import React from 'react';
import type { ProjectSettings } from '../../types/project';
import { REFERENCE_DEVICES, resolveProjectViewport } from '../../utils/referenceDevice';

export function ReferenceDeviceOption({ settings, onChange }: { settings: ProjectSettings; onChange: (presetId: string) => void }) {
  const viewport = resolveProjectViewport(settings);
  const presets = REFERENCE_DEVICES.filter(device => device.deviceProfile === settings.deviceProfile);
  const selected = presets.find(device => device.id === viewport.reference.id && device.width === viewport.reference.width && device.height === viewport.reference.height);
  return <label className="block space-y-1.5 text-xs text-slate-300">
    <span className="font-medium">参考设备</span>
    <select aria-label="参考设备" value={selected?.id ?? 'saved'} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
      {!selected && <option value="saved">{viewport.reference.name} · {viewport.reference.width} × {viewport.reference.height}</option>}
      {presets.map(device => <option key={device.id} value={device.id}>{device.name} · {device.width} × {device.height}{device.id.endsWith('-standard') ? '（默认）' : ''}</option>)}
    </select>
    <span className="block text-[11px] leading-relaxed text-slate-400">生效参考视口 {viewport.width} × {viewport.height} CSS px{settings.deviceProfile === 'mobile' ? ` · 业务高度 ${viewport.contentHeight}px` : ''}</span>
    <span className="block text-[10px] leading-relaxed text-slate-500">按工程宽度等比适配；用于首屏、导入、AI 设计及图片导出，长页按内容展开。</span>
  </label>;
}
