export const BACKGROUND_ROLES = ['page', 'primaryAction', 'decorativeSurface'] as const;
export type BackgroundRole = typeof BACKGROUND_ROLES[number];
export const BACKGROUND_LABELS: Record<BackgroundRole, string> = {
  page: '页面背景', primaryAction: '主操作背景', decorativeSurface: '装饰背景'
};
export interface BackgroundSource {
  kind: 'page' | 'html-import';
  name: string;
  selector: string;
  fingerprint: string;
}
export interface GradientStop { color: string; position?: number }
export interface GradientLayer {
  kind: 'linear' | 'radial';
  geometry?: string;
  stops: GradientStop[];
}
export type ThemeBackground = (
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; layers: GradientLayer[]; fallback?: string }
) & { source?: BackgroundSource };
export type ThemeBackgrounds = Partial<Record<BackgroundRole, Partial<Record<'light' | 'dark', ThemeBackground>>>>;
