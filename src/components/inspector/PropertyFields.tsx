import { useEffect, useRef, useState, type ReactNode } from 'react';

export type PropertyPatch = Record<string, string>;
export interface DesignSectionProps {
  declarations: PropertyPatch;
  computed: PropertyPatch;
  authored?: PropertyPatch;
  onChange: (patch: PropertyPatch) => void;
  onPreview?: (patch: PropertyPatch | null) => void;
  tokens?: Record<string, string>;
  pageColors?: string[];
}

const collapsed = new Map<string, boolean>();

export function Section({ title, children, onReset }: {
  title: string;
  children: ReactNode;
  onReset?: () => void;
}) {
  const [closed, setClosed] = useState(() => collapsed.get(title) ?? false);
  function toggle() {
    setClosed(previous => {
      collapsed.set(title, !previous);
      return !previous;
    });
  }
  return (
    <section className="border-b border-slate-700/70 py-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-expanded={!closed} onClick={toggle} className="text-xs font-semibold text-slate-200">
          {closed ? '▸' : '▾'} {title}
        </button>
        {onReset && <button type="button" onClick={onReset} className="text-[10px] text-slate-500 hover:text-blue-400">还原分区</button>}
      </div>
      {!closed && <div className="space-y-2">{children}</div>}
    </section>
  );
}

interface FieldProps {
  label: string;
  property: string;
  value: string;
  computed: string;
  onChange: (patch: PropertyPatch) => void;
  onPreview?: (patch: PropertyPatch | null) => void;
  options?: Array<{ label: string; value: string }>;
  type?: 'text' | 'number' | 'color';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

function nativeColor(value: string): string {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{8}$/i.test(value)) return value.slice(0, 7);
  if (/^#[\da-f]{3,4}$/i.test(value)) return '#' + value.slice(1, 4).split('').map(c => c + c).join('');
  const rgb = value.match(/^rgba?\(\s*(\d+)[, ]+(\d+)[, ]+(\d+)/);
  return rgb ? '#' + rgb.slice(1).map(v => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('') : '#000000';
}

export function PropertyField({
  label, property, value, computed, onChange, onPreview, options,
  type = 'text', min, max, step = 1, unit = '', disabled,
}: FieldProps) {
  const shown = value || computed || '';
  const [draft, setDraft] = useState(shown);
  const [error, setError] = useState('');
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const dragCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDraft(shown);
    draftRef.current = shown;
    setError('');
    dirty.current = false;
    onPreview?.(null);
  }, [shown, property]);
  useEffect(() => () => {
    dragCleanup.current?.();
    onPreview?.(null);
  }, []);

  function normalize(raw: string): string | null {
    let next = raw.trim();
    if (!next) return '';
    if (type === 'number' && /^[-+]?(?:\d*\.)?\d+$/.test(next)) {
      next = `${Number(next)}${unit}`;
    }
    if (type === 'number') {
      const number = parseFloat(next);
      if (Number.isFinite(number) && ((min !== undefined && number < min) || (max !== undefined && number > max))) return null;
    }
    const probe = document.createElement('span').style;
    probe.setProperty(property, next);
    return probe.getPropertyValue(property) ? next : null;
  }

  function update(next: string) {
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    setError('');
  }

  function commit() {
    if (!dirty.current) return;
    const next = normalize(draftRef.current);
    if (next === null) {
      setError('请输入有效的 CSS 值');
      return;
    }
    dirty.current = false;
    onPreview?.(null);
    if (next !== value) onChange({ [property]: next });
  }

  function cancel() {
    dirty.current = false;
    draftRef.current = shown;
    setDraft(shown);
    setError('');
    onPreview?.(null);
  }

  // Literal values retain their authored unit. Token/calc values start from the
  // measured value; stepping then deliberately creates a custom declaration.
  function numericBase() {
    const pattern = /^([-+]?(?:\d*\.)?\d+)([a-z%]*)$/i;
    const authored = draftRef.current.trim().match(pattern);
    const actual = computed.trim().match(pattern);
    const match = authored || actual;
    return match ? { number: Number(match[1]), suffix: match[2] || unit } : null;
  }

  function stepped(number: number, suffix: string) {
    return `${Number(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, number)).toFixed(4))}${suffix}`;
  }

  function startDrag(event: React.PointerEvent) {
    if (type !== 'number' || disabled || event.button !== 0) return;
    const start = numericBase();
    if (!start) return;
    event.preventDefault();
    const startX = event.clientX;
    let moved = false;
    const move = (next: PointerEvent) => {
      moved = true;
      const result = stepped(start.number + (next.clientX - startX) * step, start.suffix);
      update(result);
      onPreview?.({ [property]: result });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', escape);
      dragCleanup.current = null;
    };
    const finish = () => {
      cleanup();
      if (moved) commit();
    };
    const abort = () => {
      cleanup();
      cancel();
    };
    const escape = (next: KeyboardEvent) => {
      if (next.key === 'Escape') abort();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', escape);
    dragCleanup.current = cleanup;
  }

  function handleKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (type === 'number' && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const base = numericBase();
      if (base) update(stepped(base.number + (event.key === 'ArrowUp' ? step : -step) * (event.shiftKey ? 10 : 1), base.suffix));
    }
  }

  const inputClass = 'min-w-0 w-full rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 border border-transparent focus:border-blue-500 outline-none disabled:opacity-40';
  return (
    <div className="property-field space-y-1">
      <div className="property-field-row flex items-center gap-2">
        <label data-drag-label={type === 'number' ? 'true' : undefined} onPointerDown={startDrag}
          className={`property-field-label text-[11px] text-slate-400 w-16 shrink-0 ${type === 'number' ? 'cursor-ew-resize' : ''}`}>{label}</label>
        {type === 'color' && <input type="color" aria-label={`${label} 调色盘`} disabled={disabled}
          title="连续调色预览，关闭并失焦后提交；Escape 取消"
          className="w-6 h-6 shrink-0 cursor-pointer bg-transparent border-0 p-0"
          value={nativeColor(draft.startsWith('var(') ? computed : draft)}
          onChange={event => {
            update(event.target.value);
            onPreview?.({ [property]: event.target.value });
          }}
          onPointerUp={commit} onBlur={commit} onKeyDown={handleKey} />}
        {options ? (
          <select aria-label={label} className={inputClass} value={draft} disabled={disabled}
            onChange={event => {
              update(event.target.value);
              const next = normalize(event.target.value);
              if (next !== null) {
                dirty.current = false;
                onChange({ [property]: next });
              }
            }}>
            {!options.some(option => option.value === draft) && <option value={draft}>{draft || '继承'}</option>}
            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <input aria-label={label} className={inputClass} value={draft} disabled={disabled}
            inputMode={type === 'number' ? 'decimal' : undefined} onChange={event => update(event.target.value)}
            onBlur={commit} onKeyDown={handleKey} />
        )}
        <button type="button" title={value ? '清除手动覆盖' : '继承 / 基线'} disabled={!value || disabled}
          onClick={() => { cancel(); onChange({ [property]: '' }); }}
          className="text-[9px] text-slate-500 shrink-0 disabled:cursor-default">{value ? '覆写 ↶' : '继承'}</button>
      </div>
      {type === 'number' && dirty.current && /^(var|calc)\(/.test(shown) && <p className="text-[10px] text-amber-400 pl-16">从实际值调整，将写入自定义值</p>}
      {error && <p role="alert" className="text-[10px] text-red-400 pl-16">{error}</p>}
    </div>
  );
}
