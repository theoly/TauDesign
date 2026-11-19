import React from 'react';
import type { ProjectSettings } from '../../types/project';
import { REFERENCE_DEVICES, resolveProjectViewport } from '../../utils/referenceDevice';
import { localizedReferenceDeviceName } from '../../utils/themePresetLabels';
import { useT } from '../../stores/useLocaleStore';

export function ReferenceDeviceOption({ settings, onChange }: { settings: ProjectSettings; onChange: (presetId: string) => void }) {
  const t = useT();
  const viewport = resolveProjectViewport(settings);
  const presets = REFERENCE_DEVICES.filter(device => device.deviceProfile === settings.deviceProfile);
  const selected = presets.find(device => device.id === viewport.reference.id && device.width === viewport.reference.width && device.height === viewport.reference.height);
  return <label className="block space-y-1.5 text-xs text-slate-300">
    <span className="font-medium">{t('theme.referenceDevice')}</span>
    <select aria-label={t('theme.referenceDevice')} value={selected?.id ?? 'saved'} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
      {!selected && <option value="saved">{localizedReferenceDeviceName(viewport.reference.id, viewport.reference.name)} · {viewport.reference.width} × {viewport.reference.height}</option>}
      {presets.map(device => <option key={device.id} value={device.id}>{localizedReferenceDeviceName(device.id, device.name)} · {device.width} × {device.height}{device.id.endsWith('-standard') ? t('theme.referenceDeviceDefaultSuffix') : ''}</option>)}
    </select>
    <span className="block text-[11px] leading-relaxed text-slate-400">{t('theme.referenceViewport', { width: viewport.width, height: viewport.height })}{settings.deviceProfile === 'mobile' ? t('theme.referenceContentHeight', { height: viewport.contentHeight }) : ''}</span>
    <span className="block text-[10px] leading-relaxed text-slate-500">{t('theme.referenceDeviceHint')}</span>
  </label>;
}
