export interface ReferenceRegion {
  sourceFingerprint: string;
  sourceWidth: number;
  sourceHeight: number;
  x: number; y: number; width: number; height: number;
}
export interface ImageAttachment { name: string; dataUrl: string; region?: ReferenceRegion }

export function validReferenceRegion(value: unknown): value is ReferenceRegion {
  const r=value as ReferenceRegion|undefined;
  return Boolean(r && /^[a-f0-9]{8}$/.test(r.sourceFingerprint)
    && ['sourceWidth','sourceHeight','x','y','width','height'].every(k=>Number.isInteger((r as unknown as Record<string,number>)[k]))
    && r.sourceWidth>0 && r.sourceHeight>0 && r.sourceWidth<=32768 && r.sourceHeight<=32768
    && r.x>=0 && r.y>=0 && r.width>=8 && r.height>=8 && r.width*r.height<=16_000_000
    && r.x+r.width<=r.sourceWidth && r.y+r.height<=r.sourceHeight);
}
