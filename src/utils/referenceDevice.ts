import type { ProjectSettings, ReferenceDevice } from '../types/project';

/** CSS pixels, not hardware pixels. Snapshots keep old projects stable when presets evolve. */
export const REFERENCE_DEVICES: readonly ReferenceDevice[] = [
  { id: 'mobile-compact', name: '移动小屏', deviceProfile: 'mobile', width: 375, height: 667 },
  { id: 'mobile-standard', name: '移动标准', deviceProfile: 'mobile', width: 390, height: 844 },
  { id: 'mobile-tall', name: '移动长屏', deviceProfile: 'mobile', width: 412, height: 915 },
  { id: 'pc-laptop', name: '笔记本', deviceProfile: 'pc', width: 1366, height: 768 },
  { id: 'pc-standard', name: '桌面标准', deviceProfile: 'pc', width: 1440, height: 900 },
  { id: 'pc-wide', name: '桌面宽屏', deviceProfile: 'pc', width: 1920, height: 1080 },
];

export function defaultReferenceDevice(profile: ProjectSettings['deviceProfile']): ReferenceDevice {
  return { ...REFERENCE_DEVICES.find(device => device.id === `${profile}-standard`)! };
}

export function validReferenceDevice(value: unknown, profile: ProjectSettings['deviceProfile']): value is ReferenceDevice {
  if (!value || typeof value !== 'object') return false;
  const device = value as ReferenceDevice;
  return device.deviceProfile === profile && typeof device.id === 'string' && device.id.length > 0 &&
    typeof device.name === 'string' && device.name.length > 0 && device.name.length <= 100 &&
    Number.isFinite(device.width) && device.width >= 240 && device.width <= 7680 &&
    Number.isFinite(device.height) && device.height >= 240 && device.height <= 7680;
}

export function resolveProjectViewport(settings: Pick<ProjectSettings, 'deviceProfile' | 'frameWidth' | 'viewportGuideHeight' | 'referenceDevice' | 'useCustomNavigation'>) {
  const width = settings.frameWidth;
  const reference = validReferenceDevice(settings.referenceDevice, settings.deviceProfile)
    ? settings.referenceDevice
    : { id: 'legacy', name: '现有项目尺寸', deviceProfile: settings.deviceProfile, width,
      height: Number.isFinite(settings.viewportGuideHeight) && settings.viewportGuideHeight >= 240 && settings.viewportGuideHeight <= 7680
        ? settings.viewportGuideHeight : defaultReferenceDevice(settings.deviceProfile).height };
  const height = Math.round(reference.height * width / reference.width);
  const chromeHeight = settings.deviceProfile === 'mobile' ? settings.useCustomNavigation ? 44 : 92 : 0;
  return { width, height, contentHeight: Math.max(1, height - chromeHeight), reference };
}

export function referenceDevicePrompt(settings: Parameters<typeof resolveProjectViewport>[0]): string {
  const { width, height, contentHeight, reference } = resolveProjectViewport(settings);
  return `参考设备：${reference.name}（CSS ${reference.width}×${reference.height}）；工程参考视口 ${width}×${height}px，业务可用高度 ${contentHeight}px。按工程宽度布局，长页按内容自然增长，禁止将整页高度锁死为参考高度。参考图/导入来源的设备尺寸不能覆盖此设置。`;
}

/** Load and history both reconcile the fold guide with the saved reference snapshot. */
export function normalizeReferenceSettings(settings: ProjectSettings): ProjectSettings {
  const next = { ...settings, referenceDevice: validReferenceDevice(settings.referenceDevice, settings.deviceProfile) ? { ...settings.referenceDevice } : undefined };
  return { ...next, viewportGuideHeight: resolveProjectViewport(next).height };
}
