import { useEffect, useRef, useState } from 'react';
import { useT } from '../../stores/useLocaleStore';
import { PropertyField, Section, type DesignSectionProps, type PropertyPatch } from './PropertyFields';
const choice = (items: string[]) => items.map(value => ({
  label: value,
  value
}));
const backgroundKeys = ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat'];
const borderKeys = ['border', 'border-width', 'border-style', 'border-color', ...['top', 'right', 'bottom', 'left'].flatMap(side => [`border-${side}`, `border-${side}-width`, `border-${side}-style`, `border-${side}-color`])];
function colorWithAlpha(color: string, alpha: number) {
  const mixed = color.match(/^color-mix\(in srgb, (.+) [\d.]+%, transparent\)$/);
  if (mixed) color = mixed[1];
  if (/^#[\da-f]{3,4}$/i.test(color)) color = '#' + color.slice(1, 4).split('').map(v => v + v).join('');
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) {
    const n = parseInt(color.slice(1, 7), 16);
    return `rgba(${n >> 16}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*[\d.]+)?\s*\)$/);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const hsl = color.match(/^hsla?\((.+?)(?:[,/]\s*[\d.]+%?)?\)$/);
  if (hsl) return `hsl(${hsl[1].replace(/,/g, ' ')} / ${alpha})`;
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
function splitShadows(input: string) {
  const result: string[] = [];
  let level = 0,
    start = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '(') level++;
    if (input[i] === ')') level--;
    if (input[i] === ',' && !level) {
      result.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(input.slice(start).trim());
  return result.filter(v => v && v !== 'none');
}
export function AppearanceSections(props: DesignSectionProps) {
  const t = useT();
  const tr = (key: string, params?: Record<string, string | number>) =>
    t(`inspector.appearance.${key}` as Parameters<typeof t>[0], params);
  const {
    declarations: d,
    computed: c,
    onChange,
    tokens = {},
    pageColors = []
  } = props;
  const [borderMode, setBorderMode] = useState('all');
  const [editingShadow, setEditingShadow] = useState(-1);
  const hiddenBefore = useRef<PropertyPatch | null>(null);
  const [gradient, setGradient] = useState({
    kind: 'linear',
    angle: '135',
    from: '#6366f1',
    to: '#a855f7'
  });
  const [imageUrl, setImageUrl] = useState('');
  const [shadow, setShadow] = useState({
    x: '0',
    y: '4',
    blur: '12',
    spread: '0',
    color: '#00000040',
    inset: false
  });
  const fill = d['background-color'] || c['background-color'] || '#ffffff';
  const readAlpha = (value: string) => {
    const mixed = value.match(/^color-mix\(in srgb, .+ ([\d.]+)%, transparent\)$/);
    if (mixed) return Number(mixed[1]);
    const hex = value.match(/^#(?:[\da-f]{6})([\da-f]{2})$/i);
    if (hex) return Math.round(parseInt(hex[1], 16) / 255 * 100);
    const short = value.match(/^#[\da-f]{3}([\da-f])$/i);
    if (short) return Math.round(parseInt(short[1] + short[1], 16) / 255 * 100);
    const rgba = value.match(/^(?:rgba?|hsla?)\(.*?(?:,|\/)\s*([\d.]+%?)\s*\)$/);
    if (rgba && (value.startsWith('rgba') || value.startsWith('hsla') || value.includes('/'))) return rgba[1].endsWith('%') ? parseFloat(rgba[1]) : Math.round(Number(rgba[1]) * 100);
    return 100;
  };
  const [alpha, setAlpha] = useState(() => readAlpha(fill));
  const alphaBase = useRef(fill);
  const alphaChanged = useRef(false);
  useEffect(() => {
    setAlpha(readAlpha(fill));
    alphaBase.current = fill;
    alphaChanged.current = false;
  }, [fill]);
  const finishAlpha = () => {
    if (!alphaChanged.current) return;
    alphaChanged.current = false;
    props.onPreview?.(null);
    onChange({
      'background-color': colorWithAlpha(alphaBase.current, alpha / 100)
    });
  };
  const reset = (keys: string[]) => () => {
    if (keys.includes('visibility')) hiddenBefore.current = null;
    onChange(Object.fromEntries(keys.map(k => [k, ''])));
  };
  const field = (label: string, property: string, extra: Partial<React.ComponentProps<typeof PropertyField>> = {}) => <PropertyField key={property} label={label} property={property} value={d[property] || ''} computed={c[property] || ''} onChange={onChange} onPreview={props.onPreview} {...extra} />;
  const small = 'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300';
  const colorOptions = (property: string) => <details className="pl-16 text-[10px] text-slate-400"><summary className="cursor-pointer">{tr('tokenPageColors')}</summary><div className="flex flex-wrap gap-1 pt-2">{Object.entries(tokens).filter(([key, value]) => key.includes('color') || /^(#|rgb|hsl)/.test(value)).map(([key, value]) => <button key={key} type="button" title={`${key}: ${value}`} aria-label={`${property} ${key}`} className="w-5 h-5 rounded border border-slate-600" style={{
        background: value
      }} onClick={() => onChange({
        [property]: `var(${key})`
      })} />)}{pageColors.map(value => <button type="button" key={value} title={tr('pageColorTitle', { color: value })} aria-label={tr('pageColorAria', { property, color: value })} className="w-5 h-5 rounded border border-slate-600" style={{
        background: value
      }} onClick={() => onChange({
        [property]: value
      })} />)}</div></details>;
  const color = (label: string, property: string) => <div key={property}>{field(label, property, {
      type: 'color'
    })}{colorOptions(property)}</div>;
  const mini = (label: string, value: string, change: (value: string) => void, type = 'text') => <label key={label} className="flex min-w-0 gap-1 items-center text-[10px] text-slate-400">{label}<input aria-label={label} type={type} className="w-full min-w-0 rounded bg-slate-800 p-1 text-slate-200" value={value} onChange={e => change(e.target.value)} /></label>;
  const layerHidden = d.display === 'none' || c.display === 'none' || d.visibility === 'hidden' || c.visibility === 'hidden';
  return <>
 <Section title={tr('sectionLayer')} onReset={reset(['opacity', 'display', 'visibility', 'pointer-events', 'mix-blend-mode'])}>
 {field(tr('opacity'), 'opacity', {
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01
      })}
 <div className="flex items-center justify-between"><span className="text-[11px] text-slate-400">{tr('visibility')}</span><button type="button" className={small} onClick={() => {
          if (d.display === 'none' || c.display === 'none') {
            onChange({
              display: d.display === 'none' ? '' : 'revert'
            });
            return;
          }
          if (d.visibility === 'hidden' || c.visibility === 'hidden') {
            onChange(hiddenBefore.current || {
              visibility: d.visibility === 'hidden' ? '' : 'visible',
              'pointer-events': d['pointer-events'] === 'none' ? '' : d['pointer-events'] || ''
            });
            hiddenBefore.current = null;
          } else {
            hiddenBefore.current = {
              visibility: d.visibility || '',
              'pointer-events': d['pointer-events'] || ''
            };
            onChange({
              visibility: 'hidden',
              'pointer-events': 'none'
            });
          }
        }}>{layerHidden ? tr('showLayer') : tr('hideLayer')}</button></div>
 {field(tr('mixBlendMode'), 'mix-blend-mode', {
        options: choice(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'])
      })}
 </Section>
 <Section title={tr('sectionFill')} onReset={reset(backgroundKeys)}>
 {color(tr('bgColor'), 'background-color')}
 <div className="flex items-center gap-2"><label className="text-[11px] text-slate-400 w-16 shrink-0">{tr('fillAlpha')}</label><input aria-label={tr('fillAlpha')} type="range" min="0" max="100" value={alpha} className="w-full" onChange={e => {
          const n = Number(e.target.value);
          alphaChanged.current = true;
          setAlpha(n);
          props.onPreview?.({
            'background-color': colorWithAlpha(alphaBase.current, n / 100)
          });
        }} onPointerUp={finishAlpha} onBlur={finishAlpha} onKeyUp={e => {
          if (e.key.startsWith('Arrow')) finishAlpha();
        }} onKeyDown={e => {
          if (e.key === 'Escape') {
            alphaChanged.current = false;
            setAlpha(readAlpha(fill));
            props.onPreview?.(null);
          }
        }} /><span className="text-[10px] text-slate-400">{alpha}%</span></div>
 <details className="text-xs text-slate-400"><summary className="cursor-pointer">{tr('gradientTool')}</summary><div className="space-y-2 pt-2"><select aria-label={tr('gradientKindAria')} className={small} value={gradient.kind} onChange={e => setGradient({
            ...gradient,
            kind: e.target.value
          })}><option value="linear">{tr('gradientLinear')}</option><option value="radial">{tr('gradientRadial')}</option></select><div className="grid grid-cols-2 gap-2">{mini(tr('gradientFrom'), gradient.from, v => setGradient({
              ...gradient,
              from: v
            }))}{mini(tr('gradientTo'), gradient.to, v => setGradient({
              ...gradient,
              to: v
            }))}{mini(tr('gradientAngle'), gradient.angle, v => setGradient({
              ...gradient,
              angle: v
            }), 'number')}</div><button type="button" className={small} onClick={() => {
            const probe = document.createElement('span').style;
            const value = gradient.kind === 'linear' ? `linear-gradient(${Number(gradient.angle) || 0}deg, ${gradient.from}, ${gradient.to})` : `radial-gradient(circle, ${gradient.from}, ${gradient.to})`;
            const from = document.createElement('span').style;
            const to = document.createElement('span').style;
            from.color = gradient.from;
            to.color = gradient.to;
            probe.backgroundImage = value;
            if (from.color && to.color && probe.backgroundImage) onChange({
              'background-image': value
            });
          }}>{tr('applyGradient')}</button></div></details>
 {field(tr('bgImage'), 'background-image')}
 <details className="text-xs text-slate-400"><summary className="cursor-pointer">{tr('imageBg')}</summary><div className="space-y-2 pt-2">{mini(tr('imageUrl'), imageUrl, setImageUrl)}<button type="button" className={small} onClick={() => {
            if (imageUrl.trim() && !/[\n\r]/.test(imageUrl) && !/^\s*(javascript|data):/i.test(imageUrl)) onChange({
              'background-image': `url(${JSON.stringify(imageUrl.trim())})`,
              'background-size': 'cover',
              'background-position': 'center',
              'background-repeat': 'no-repeat'
            });
          }}>{tr('applyImageBg')}</button>{field(tr('bgSize'), 'background-size', {
            options: choice(['cover', 'contain', 'auto'])
          })}{field(tr('bgPosition'), 'background-position')}{field(tr('bgRepeat'), 'background-repeat', {
            options: choice(['no-repeat', 'repeat', 'repeat-x', 'repeat-y'])
          })}</div></details>
 </Section>
 <Section title={tr('sectionStroke')} onReset={reset(borderKeys)}>
 <select aria-label={tr('borderSideAria')} className={`${small} w-full`} value={borderMode} onChange={e => setBorderMode(e.target.value)}><option value="all">{tr('borderAll')}</option><option value="top">{tr('borderTop')}</option><option value="right">{tr('borderRight')}</option><option value="bottom">{tr('borderBottom')}</option><option value="left">{tr('borderLeft')}</option></select>
 {field(tr('borderWidth'), borderMode === 'all' ? 'border-width' : `border-${borderMode}-width`, {
        type: 'number',
        min: 0,
        unit: 'px'
      })}
 {field(tr('borderStyle'), borderMode === 'all' ? 'border-style' : `border-${borderMode}-style`, {
        options: choice(['none', 'solid', 'dashed', 'dotted', 'double'])
      })}
 {color(tr('borderColor'), borderMode === 'all' ? 'border-color' : `border-${borderMode}-color`)}
 </Section>
 <Section title={tr('sectionEffects')} onReset={reset(['box-shadow', 'filter', 'backdrop-filter'])}>
 {field(tr('boxShadow'), 'box-shadow')}
 <div className="flex gap-1 flex-wrap">{Object.entries(tokens).filter(([key]) => key.includes('shadow')).map(([key, value]) => <button type="button" key={key} title={value} className={small} onClick={() => onChange({
          'box-shadow': `var(${key})`
        })}>{key.replace('--shadow-', '')}</button>)}</div>
 <details className="text-xs text-slate-400"><summary className="cursor-pointer">{tr('shadowParams')}</summary><div className="space-y-2 pt-2"><select aria-label={tr('editShadowLayerAria')} className={small} value={editingShadow} onChange={e => {
            const i = Number(e.target.value);
            setEditingShadow(i);
            if (i >= 0) {
              const original = splitShadows(d['box-shadow'] || c['box-shadow'] || '')[i];
              const lengths = original.match(/-?(?:\d*\.)?\d+(?:px|rem|em)/g) || [];
              const rest = original.replace(/\binset\b/g, '').replace(/-?(?:\d*\.)?\d+(?:px|rem|em)/g, '').trim();
              setShadow({
                x: lengths[0] || '0',
                y: lengths[1] || '0',
                blur: lengths[2] || '0',
                spread: lengths[3] || '0',
                color: rest || '#000000',
                inset: original.includes('inset')
              });
            }
          }}><option value={-1}>{tr('shadowNew')}</option>{splitShadows(d['box-shadow'] || c['box-shadow'] || '').map((_, i) => <option key={i} value={i}>{tr('shadowEditLayer', { n: i + 1 })}</option>)}</select><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'blur', 'spread'] as const).map(key => mini({
              x: tr('shadowX'),
              y: tr('shadowY'),
              blur: tr('shadowBlur'),
              spread: tr('shadowSpread')
            }[key], shadow[key], v => setShadow({
              ...shadow,
              [key]: v
            })))}{mini(tr('shadowColor'), shadow.color, v => setShadow({
              ...shadow,
              color: v
            }))}</div><label className="flex gap-2"><input type="checkbox" checked={shadow.inset} onChange={e => setShadow({
              ...shadow,
              inset: e.target.checked
            })} />{tr('shadowInset')}</label><button type="button" className={small} onClick={() => {
            const parts = [shadow.x, shadow.y, shadow.blur, shadow.spread].map(v => v.trim());
            if (parts.some(v => !/^-?(?:\d*\.)?\d+(?:px|rem|em)?$/.test(v)) || parseFloat(parts[2]) < 0) return;
            const next = `${shadow.inset ? 'inset ' : ''}${parts.map(v => /[a-z]$/.test(v) ? v : `${v}px`).join(' ')} ${shadow.color}`;
            const probe = document.createElement('span').style;
            const colorProbe = document.createElement('span').style;
            colorProbe.color = shadow.color;
            probe.boxShadow = next;
            if (probe.boxShadow && colorProbe.color) {
              const layers = splitShadows(d['box-shadow'] || c['box-shadow'] || '');
              if (editingShadow >= 0 && editingShadow < layers.length) layers[editingShadow] = next;else layers.push(next);
              onChange({
                'box-shadow': layers.join(', ')
              });
            }
          }}>{editingShadow >= 0 ? tr('shadowUpdateLayer') : tr('shadowAddLayer')}</button></div></details>
 {splitShadows(d['box-shadow'] || c['box-shadow'] || '').map((s, i) => <div key={`${i}-${s}`} className="flex gap-2 text-[10px] text-slate-400"><span className="truncate flex-1" title={s}>{s}</span><button type="button" aria-label={tr('shadowDeleteAria', { n: i + 1 })} onClick={() => {
          const next = splitShadows(d['box-shadow'] || c['box-shadow'] || '').filter((_, index) => index !== i);
          onChange({
            'box-shadow': next.length ? next.join(', ') : 'none'
          });
        }}>{t('common.delete')}</button></div>)}
 {field(tr('filter'), 'filter')}{field(tr('backdropFilter'), 'backdrop-filter')}
 <div className="flex gap-1"><button type="button" className={small} onClick={() => onChange({
          filter: 'blur(4px)'
        })}>{tr('blurElement4')}</button><button type="button" className={small} onClick={() => onChange({
          'backdrop-filter': 'blur(12px)'
        })}>{tr('blurBackdrop12')}</button></div>
 </Section>
 </>;
}