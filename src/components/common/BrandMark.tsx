import React from 'react';

/**
 * TauDesign 品牌标记 (assets/brand/taudesign-mark.svg)
 *
 * 画框里挖出希腊字母 τ (tau)——产品的核心隐喻是无限画布上的画框，
 * 名字的词根又恰好是 tau。字形在 16px 下会退化成一个 T，这是有意为之：
 * 它不会糊成一团，只会变简单。
 *
 * 源文件是 `assets/brand/` 下的 SVG；此处内联是为了跟随 currentColor
 * 与尺寸，避免为一个 400 字节的图形发一次网络请求。
 */
export interface BrandMarkProps {
  /** 边长（px） */
  size?: number;
  /** 底板色，默认品牌主色 */
  tile?: string;
  /** 字形色，需与底板保持足够对比 */
  glyph?: string;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 28,
  tile = '#8FCBB0',
  glyph = '#10241C',
  className
}) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    className={className}
    role="img"
    aria-label="TauDesign"
  >
    <rect x="3" y="3" width="58" height="58" rx="17" fill={tile} />
    <g fill="none" stroke={glyph} strokeWidth="9" strokeLinecap="round">
      <path d="M17 21H47" />
      <path d="M32 21v13.5c0 5.1 2.8 7.7 6.4 7.7" />
    </g>
  </svg>
);
