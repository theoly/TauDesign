import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../stores/useLocaleStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { findInspectorImage, replaceInspectorImage, setInspectorImageAlt } from '../../utils/inspectorImage';
import { PropertyField, Section, type DesignSectionProps } from './PropertyFields';

export type ImageSectionProps = DesignSectionProps & { screenId: string; nid: string; tagName: string };

const FOCUS_KEYS = [
  'focusTopLeft',
  'focusTop',
  'focusTopRight',
  'focusMiddleLeft',
  'focusCenter',
  'focusMiddleRight',
  'focusBottomLeft',
  'focusBottom',
  'focusBottomRight'
] as const;

const readFile = (file: File, t: ReturnType<typeof useT>) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('inspector.image.errReadFailed')));
    reader.onerror = () => reject(new Error(t('inspector.image.errReadFailed')));
    reader.onabort = () => reject(new Error(t('inspector.image.errReadAborted')));
    reader.readAsDataURL(file);
  });

export function ImageSection({ screenId, nid, tagName, declarations, computed, onChange, onPreview }: ImageSectionProps) {
  const t = useT();
  const i = (key: string, params?: Record<string, string | number>) =>
    t(`inspector.image.${key}` as Parameters<typeof t>[0], params);

  const focusNames = useMemo(() => FOCUS_KEYS.map((key) => i(key)), [t]);
  const objectFitOptions = useMemo(
    () => [
      { label: i('fitDefault'), value: 'fill' },
      { label: i('fitContain'), value: 'contain' },
      { label: i('fitCover'), value: 'cover' },
      { label: i('fitNone'), value: 'none' },
      { label: i('fitScaleDown'), value: 'scale-down' }
    ],
    [t]
  );

  const html = useProjectStore(state => state.screens[screenId]?.htmlContent || '');
  const isImage = tagName.toLowerCase() === 'img';
  const currentAlt = isImage && html ? findInspectorImage(html, nid).image?.getAttribute('alt') || '' : '';
  const [alt, setAlt] = useState(currentAlt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setAlt(currentAlt);
    setBusy(false);
    setError('');
    request.current++;
    return () => { request.current++; };
  }, [screenId, nid, currentAlt]);

  const commitAlt = () => {
    try { setInspectorImageAlt(screenId, nid, alt); setError(''); }
    catch { setError(i('errAltSaveFailed')); }
  };
  const upload = async (file: File) => {
    const token = ++request.current;
    const projectId = useProjectStore.getState().id;
    setBusy(true); setError('');
    try {
      const dataUrl = await readFile(file, t);
      if (useProjectStore.getState().id !== projectId) return;
      const applied = await replaceInspectorImage(screenId, nid, file.name, dataUrl);
      if (!applied && request.current === token) setError(i('errProjectChanged'));
    } catch (cause) {
      if (request.current === token) setError(cause instanceof Error ? cause.message : i('errReplaceFailed'));
    } finally {
      if (request.current === token) setBusy(false);
    }
  };
  const field = (label: string, property: string, options?: { value: string; label: string }[]) => (
    <PropertyField
      label={label}
      property={property}
      value={declarations[property] || ''}
      computed={computed[property] || ''}
      onChange={onChange}
      onPreview={onPreview}
      options={options}
    />
  );

  if (!isImage) return null;

  return (
    <Section title={i('sectionTitle')} onReset={() => onChange({ 'object-fit': '', 'object-position': '' })}>
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        aria-label={i('pickReplaceAria')}
        disabled={busy}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
        className="w-full rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? i('saving') : i('replaceLocal')}
      </button>
      {busy && <p role="status" className="text-xs text-slate-400">{i('savingStatus')}</p>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <label className="block space-y-1 text-xs text-slate-400">
        {i('altText')}
        <input
          aria-label={i('altAria')}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          value={alt}
          onChange={event => setAlt(event.target.value)}
          onBlur={commitAlt}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commitAlt(); }
            if (event.key === 'Escape') { event.preventDefault(); setAlt(currentAlt); }
          }}
        />
      </label>
      {field(i('objectFit'), 'object-fit', objectFitOptions)}
      {field(i('objectPosition'), 'object-position')}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">{i('focus')}</span>
        <div className="grid w-20 grid-cols-3 gap-1" role="group" aria-label={i('focusGridAria')}>
          {focusNames.map((name, index) => {
            const position = `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`;
            const selected = (declarations['object-position'] || computed['object-position'] || '50% 50%') === position;
            return (
              <button
                key={name}
                type="button"
                aria-label={i('focusPointAria', { name })}
                aria-pressed={selected}
                onClick={() => onChange({ 'object-position': position })}
                className={`h-5 rounded text-xs ${selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                ·
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}