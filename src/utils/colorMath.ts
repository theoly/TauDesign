type RGB = [number, number, number];
export const rgb = (hex: string): RGB => {
  const value = hex.replace(/^#/, '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  if (!/^[\da-f]{6}$/i.test(full)) throw new Error(`Invalid hex color: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as RGB;
};
const hex = (color: RGB) => '#' + color.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** sRGB 插值，用于生成低饱和表面和确定性的品牌色阶。 */
export function mixColor(a: string, b: string, weight: number): string {
  const x = rgb(a), y = rgb(b);
  const w = Math.max(0, Math.min(1, weight));
  return hex(x.map((v, i) => v * (1 - w) + y[i] * w) as RGB);
}

function luminance(color: string): number {
  const linear = rgb(color).map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function onColor(fill: string): string {
  const preferred = contrastRatio('#ffffff', fill) >= contrastRatio('#111111', fill) ? '#ffffff' : '#111111';
  // 中灰窄区间内白色和 #111 均可能不足 4.5，纯黑仍能满足普通文字。
  return contrastRatio(preferred, fill) >= 4.5 ? preferred : '#000000';
}

/** 在同一明暗表面组上选择最小幅度的明度修正；不改变填充种子色。 */
export function readableColor(foreground: string, backgrounds: string[], minimum = 4.5): string {
  const passes = (color: string) => backgrounds.every(bg => contrastRatio(color, bg) >= minimum);
  if (passes(foreground)) return foreground;
  const targets = ['#000000', '#ffffff'].filter(passes);
  if (!targets.length) return foreground; // 自定义混合明暗表面无法用单一前景满足，留给局部设计。
  let best = targets[0], bestWeight = Infinity;
  for (const target of targets) {
    let low = 0, high = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (passes(mixColor(foreground, target, mid))) high = mid;
      else low = mid;
    }
    if (high < bestWeight) { bestWeight = high; best = mixColor(foreground, target, high); }
  }
  return best;
}
