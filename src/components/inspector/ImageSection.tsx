import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { findInspectorImage, replaceInspectorImage, setInspectorImageAlt } from '../../utils/inspectorImage';
import { PropertyField, Section, type DesignSectionProps } from './PropertyFields';

export type ImageSectionProps = DesignSectionProps & { screenId: string; nid: string; tagName: string };
const focusNames = ['左上', '上中', '右上', '左中', '居中', '右中', '左下', '下中', '右下'];
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
  reader.onerror = () => reject(new Error('图片读取失败'));
  reader.onabort = () => reject(new Error('图片读取已取消'));
  reader.readAsDataURL(file);
});

export function ImageSection({ screenId, nid, tagName, declarations, computed, onChange, onPreview }: ImageSectionProps) {
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
  if (!isImage) return null;

  const commitAlt = () => {
    try { setInspectorImageAlt(screenId, nid, alt); setError(''); }
    catch { setError('替代文本保存失败，请重试'); }
  };
  const upload = async (file: File) => {
    const token = ++request.current;
    const projectId = useProjectStore.getState().id;
    setBusy(true); setError('');
    try {
      const dataUrl = await readFile(file);
      if (useProjectStore.getState().id !== projectId) return;
      const applied = await replaceInspectorImage(screenId, nid, file.name, dataUrl);
      if (!applied && request.current === token) setError('工程或原图片已改变，未应用替换');
    } catch (cause) {
      if (request.current === token) setError(cause instanceof Error ? cause.message : '图片替换失败，请重试');
    } finally {
      if (request.current === token) setBusy(false);
    }
  };
  const field = (label: string, property: string, options?: { value: string; label: string }[]) => <PropertyField label={label} property={property} value={declarations[property] || ''} computed={computed[property] || ''} onChange={onChange} onPreview={onPreview} options={options} />;
  return <Section title="图片" onReset={() => onChange({ 'object-fit': '', 'object-position': '' })}>
    <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" aria-label="选择替换图片" disabled={busy} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void upload(file);
    }} />
    <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="w-full rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50">{busy ? '正在保存图片…' : '替换本地图片'}</button>
    {busy && <p role="status" className="text-xs text-slate-400">正在将图片保存至工程资产库</p>}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <label className="block space-y-1 text-xs text-slate-400">替代文本
      <input aria-label="替代文本" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200" value={alt} onChange={event => setAlt(event.target.value)} onBlur={commitAlt} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); commitAlt(); }
        if (event.key === 'Escape') { event.preventDefault(); setAlt(currentAlt); }
      }} />
    </label>
    {field('图片适应', 'object-fit', [ { label: '默认填充', value: 'fill' }, { label: '完整显示', value: 'contain' }, { label: '裁切铺满', value: 'cover' }, { label: '原始尺寸', value: 'none' }, { label: '仅缩小', value: 'scale-down' } ])}
    {field('裁切焦点', 'object-position')}
    <div className="flex items-center gap-3"><span className="text-xs text-slate-400">焦点</span><div className="grid w-20 grid-cols-3 gap-1" role="group" aria-label="图片焦点">
      {focusNames.map((name, index) => {
        const position = `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`;
        const selected = (declarations['object-position'] || computed['object-position'] || '50% 50%') === position;
        return <button key={name} type="button" aria-label={`焦点${name}`} aria-pressed={selected} onClick={() => onChange({ 'object-position': position })} className={`h-5 rounded text-xs ${selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>·</button>;
      })}
    </div></div>
  </Section>;
}
