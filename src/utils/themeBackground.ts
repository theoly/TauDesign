import { BACKGROUND_ROLES, type GradientLayer, type GradientStop, type ThemeBackground, type ThemeBackgrounds } from '../types/themeBackground';
export { BACKGROUND_ROLES, BACKGROUND_LABELS } from '../types/themeBackground';

// Deliberately finite grammar: no browser/CSSOM dependency and no executable CSS.
const number = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
function color(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (/^#[\da-f]{3,4}$/i.test(value) || /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return true;
  if (/^(?:transparent|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|navy|teal|cyan|magenta|lime|maroon|olive|silver|aqua|fuchsia)$/i.test(value)) return true;
  const match = /^(rgb|rgba)\(([^()]*)\)$/i.exec(value);
  if (!match) return false;
  const parts = match[2].split(',').map(p => p.trim());
  if (parts.length !== (match[1].toLowerCase() === 'rgba' ? 4 : 3)) return false;
  const channelPercent = parts[0].endsWith('%');
  if (parts.slice(0, 3).some(channel => channel.endsWith('%') !== channelPercent)) return false;
  return parts.every((p,i) => {
    if (!new RegExp(`^${number}%?$`).test(p)) return false;
    const n = parseFloat(p);
    return n <= (p.endsWith('%') ? 100 : i === 3 ? 1 : 255);
  });
}
function split(value: string): string[] | null {
  let depth = 0, start = 0;
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (depth < 0 || depth > 2) return null;
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (depth) return null;
  result.push(value.slice(start).trim());
  return result.every(Boolean) ? result : null;
}
function geometry(kind: GradientLayer['kind'], value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (kind === 'linear') return new RegExp(`^-?${number}deg$`).test(value) || /^to (?:top|bottom|left|right|(?:top|bottom) (?:left|right)|(?:left|right) (?:top|bottom))$/.test(value);
  const parts = value.split(' at ');
  let shape = parts[0], placement = parts[1];
  if (value.startsWith('at ')) { shape = ''; placement = value.slice(3); }
  if (parts.length > 2 || (shape && !/^(?:(?:circle|ellipse)(?: (?:closest-side|closest-corner|farthest-side|farthest-corner))?|closest-side|closest-corner|farthest-side|farthest-corner)$/.test(shape))) return false;
  if (placement === undefined) return Boolean(shape);
  const positions = placement.split(' ');
  const percent = (p: string) => /^\d+(?:\.\d+)?%$/.test(p) && parseFloat(p) <= 100;
  const horizontal = (p: string) => p === 'left' || p === 'right';
  const vertical = (p: string) => p === 'top' || p === 'bottom';
  const center = (p: string) => p === 'center';
  if (positions.length === 1) return horizontal(positions[0]) || vertical(positions[0]) || center(positions[0]) || percent(positions[0]);
  if (positions.length !== 2) return false;
  const [x,y] = positions;
  // Percentage pairs have fixed x/y order; keyword pairs can be reversed.
  return ((horizontal(x) || center(x) || percent(x)) && (vertical(y) || center(y) || percent(y)))
    || (vertical(x) && (horizontal(y) || center(y)))
    || (center(x) && horizontal(y));
}
function stop(value: string): GradientStop | null {
  if (color(value)) return { color: value };
  const match = /^(.*?)\s+(\d+(?:\.\d+)?|\.\d+)%$/.exec(value);
  return match && color(match[1]) && +match[2] <= 100 ? { color: match[1], position: +match[2] } : null;
}
export function parseThemeBackground(value: string, fallback?: string): ThemeBackground | null {
  if (typeof value !== 'string' || value.length > 16000) return null;
  value = value.trim();
  if (color(value)) return { kind: 'solid', color: value };
  if (fallback !== undefined && !color(fallback.trim())) return null;
  const expressions = split(value);
  if (!expressions || expressions.length > 16) return null;
  // A compiled background may include its final fallback color.
  if (color(expressions[expressions.length - 1])) {
    if (fallback !== undefined) return null;
    fallback = expressions.pop();
  }
  const layers: GradientLayer[] = [];
  for (const expression of expressions) {
    const match = /^(linear|radial)-gradient\((.*)\)$/i.exec(expression);
    if (!match) return null;
    const kind = match[1].toLowerCase() as GradientLayer['kind'];
    const parts = split(match[2]);
    if (!parts) return null;
    let shape: string | undefined;
    if (geometry(kind, parts[0].toLowerCase())) shape = parts.shift()!.toLowerCase();
    const stops = parts.map(stop);
    if (stops.length < 2 || stops.length > 64 || stops.some(s => !s)) return null;
    layers.push({ kind, ...(shape ? {geometry:shape} : {}), stops: stops as GradientStop[] });
  }
  return layers.length ? {kind:'gradient',layers,...(fallback ? {fallback:fallback.trim()} : {})} : null;
}
export function compileThemeBackground(paint: ThemeBackground): string | null {
  if (!paint || typeof paint !== 'object') return null;
  if (paint.kind === 'solid') return color(paint.color) ? paint.color : null;
  if (paint.kind !== 'gradient' || !Array.isArray(paint.layers) || !paint.layers.length || paint.layers.length > 16) return null;
  if (paint.fallback !== undefined && !color(paint.fallback)) return null;
  const layers: string[] = [];
  for (const layer of paint.layers) {
    if (!layer || !['linear','radial'].includes(layer.kind) || (layer.geometry !== undefined && !geometry(layer.kind,layer.geometry)) || !Array.isArray(layer.stops) || layer.stops.length < 2 || layer.stops.length > 64) return null;
    const stops: string[] = [];
    for (const s of layer.stops) {
      if (!s || !color(s.color) || (s.position !== undefined && (typeof s.position !== 'number' || !Number.isFinite(s.position) || s.position < 0 || s.position > 100))) return null;
      stops.push(s.color + (s.position === undefined ? '' : ` ${s.position}%`));
    }
    layers.push(`${layer.kind}-gradient(${[...(layer.geometry ? [layer.geometry] : []), ...stops].join(', ')})`);
  }
  return [...layers,...(paint.fallback ? [paint.fallback] : [])].join(', ');
}
const variables = { page: ['page','bg'], primaryAction: ['primary-action','primary'], decorativeSurface: ['decorative-surface','surface'] } as const;
export function compileBackgroundVariables(backgrounds: ThemeBackgrounds | undefined, mode: 'light' | 'dark'): string {
  const declarations = BACKGROUND_ROLES.map(role => {
    const [name,fallback] = variables[role];
    return `--background-${name}: ${compileThemeBackground(backgrounds?.[role]?.[mode] as ThemeBackground) ?? `var(--color-${fallback})`};`;
  });
  const primary = backgrounds?.primaryAction?.[mode];
  const gradient = primary?.kind === 'gradient' && compileThemeBackground(primary);
  const page=backgrounds?.page?.[mode];
  declarations.push(`--background-page-full-height: ${page?.kind==='gradient'&&compileThemeBackground(page)?1:0};`);
  declarations.push(`--background-primary-hover-filter: ${gradient ? 'brightness(.94)' : 'none'};`, `--background-primary-active-filter: ${gradient ? 'brightness(.86)' : 'none'};`);
  return declarations.join('\n  ');
}
