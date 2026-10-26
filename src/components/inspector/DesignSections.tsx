import { useState } from 'react';
import { PropertyField, Section, type DesignSectionProps, type PropertyPatch } from './PropertyFields';
type Axis = 'width' | 'height';
type SizeMode = 'auto' | 'fixed' | 'hug' | 'fill';
export function buildSizeModePatch(axis: Axis, mode: SizeMode, size: number, parentDisplay = '', parentDirection = 'row'): PropertyPatch {
    const main = parentDisplay.includes('flex') && (parentDirection.startsWith('column') ? axis === 'height' : axis === 'width');
    const patch: PropertyPatch = { [axis]: mode === 'auto' ? 'auto' : mode === 'fixed' ? `${Math.max(0, size)}px` : mode === 'hug' ? 'fit-content' : parentDisplay.includes('flex') || parentDisplay.includes('grid') ? 'auto' : '100%', [`min-${axis}`]: mode === 'fill' ? '0' : '' };
    if (main)
        Object.assign(patch, { 'flex-grow': mode === 'fill' ? '1' : '0', 'flex-shrink': '1', 'flex-basis': mode === 'fill' ? '0%' : 'auto' });
    if (parentDisplay.includes('flex') && !main || parentDisplay.includes('grid'))
        patch[parentDisplay.includes('grid') && axis === 'width' ? 'justify-self' : 'align-self'] = mode === 'fill' ? 'stretch' : '';
    return patch;
}
function readTransform(value: string) {
    const source = value === 'none' ? '' : value.trim();
    const result: Record<string, number> = { rotate: 0, scaleX: 1, scaleY: 1 };
    const matches = [...source.matchAll(/(rotate|scaleX|scaleY)\(\s*(-?\d+(?:\.\d+)?)\s*(deg)?\s*\)/g)];
    const remainder = source.replace(/(rotate|scaleX|scaleY)\(\s*(-?\d+(?:\.\d+)?)\s*(deg)?\s*\)/g, '').trim();
    if (remainder)
        return null;
    const seen = new Set<string>();
    for (const match of matches) {
        if (seen.has(match[1]) || (match[1] === 'rotate' && !match[3]) || (match[1] !== 'rotate' && match[3]))
            return null;
        seen.add(match[1]);
        result[match[1]] = Number(match[2]);
    }
    return result;
}
export function buildTransformPatch(value: string, operation: 'rotate' | 'scaleX' | 'scaleY', next: number): PropertyPatch | null {
    const values = readTransform(value);
    if (!values || !Number.isFinite(next))
        return null;
    const source = value === 'none' ? '' : value.trim();
    const expression = new RegExp(`${operation}\\([^)]*\\)`);
    const replacement = `${operation}(${next}${operation === 'rotate' ? 'deg' : ''})`;
    // Transform order is significant: replace in place rather than normalizing order.
    return { transform: expression.test(source) ? source.replace(expression, replacement) : [source, replacement].filter(Boolean).join(' ') };
}
export function buildAlignmentPatch(direction: string, row: number, column: number): PropertyPatch {
    const align = ['flex-start', 'center', 'flex-end'];
    const vertical = direction.startsWith('column');
    const reversed = direction.endsWith('reverse');
    const mainIndex = vertical ? row : column;
    return { 'align-items': align[vertical ? column : row], 'justify-content': align[reversed ? 2 - mainIndex : mainIndex] };
}
export function buildLinkedSpacingPatch(property: 'padding' | 'margin', value: string): PropertyPatch {
    return { [property]: '', ...Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [`${property}-${side}`, value])) };
}
const options = (values: string[][]) => values.map(([value, label]) => ({ value, label }));
const buttonClass = 'rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40';
export function DesignSections(props: DesignSectionProps & {
    tagName: string;
    width: number;
    height: number;
    parentDisplay?: string;
    parentDirection?: string;
    authored?: PropertyPatch;
    geometry?: PositionGeometry;
}) {
    const { declarations, computed, onChange, onPreview, width, height, parentDisplay, parentDirection, geometry, tokens } = props;
    // Read the persisted declaration on every render so Undo and re-opening remain authoritative.
    const aspectRatio = declarations['aspect-ratio'] || props.authored?.['aspect-ratio'] || computed['aspect-ratio'] || 'auto';
    const ratioParts = aspectRatio.replace(/^auto\s+/, '').split('/').map(Number);
    const ratio = ratioParts.length === 2 ? ratioParts[0] / ratioParts[1] : ratioParts[0];
    const ratioLocked = Number.isFinite(ratio) && ratio > 0;
    const [linked, setLinked] = useState<Record<'padding' | 'margin', 'all' | 'axis' | 'each'>>({ padding: 'all', margin: 'all' });
    const [corners, setCorners] = useState(false);
    const value = (p: string) => declarations[p] || (p === 'transform' ? props.authored?.transform : '') || computed[p] || '';
    const clear = (properties: string[]) => () => onChange(Object.fromEntries(properties.map(p => [p, ''])));
    const field = (label: string, property: string, extra: Partial<React.ComponentProps<typeof PropertyField>> = {}) => {
        const number = /^(width$|height$|min-|max-|padding-|margin-|row-gap|column-gap|top$|right$|bottom$|left$|border-.*radius|border-radius)/.test(property);
        const nonnegative = /^(width$|height$|min-|max-|padding-|row-gap|column-gap|border-.*radius|border-radius)/.test(property);
        const pattern = property.includes('radius') ? /^--(?:td-import-)?radius-/ : /padding|margin|gap/.test(property) ? /^--(?:td-import-)?space-/ : null;
        return <div key={property} className="space-y-1">
        <PropertyField
          label={label}
          property={property}
          value={declarations[property] || ''}
          computed={computed[property] || ''}
          type={number ? 'number' : 'text'}
          min={nonnegative ? 0 : undefined}
          unit="px"
          onChange={onChange}
          onPreview={onPreview}
          {...extra}/>{pattern &&
                <TokenChoice
                  label={label}
                  property={property}
                  tokens={tokens}
                  pattern={pattern}
                  onChange={extra.onChange || onChange}/>}
        </div>;
    };
    const transform = readTransform(value('transform'));
    const changeTransform = (operation: 'rotate' | 'scaleX' | 'scaleY', next: number, preview = false) => {
        const patch = buildTransformPatch(value('transform'), operation, next);
        if (patch)
            preview ? onPreview?.(patch) : onChange(patch);
    };
    const position = value('position') || 'static';
    const display = value('display');
    const direction = value('flex-direction') || 'row';
    const sizeChange = (axis: Axis, patch: PropertyPatch) => {
        const size = patch[axis];
        const main = parentDisplay?.includes('flex') && (parentDirection?.startsWith('column') ? axis === 'height' : axis === 'width');
        const result: PropertyPatch = { ...patch, ...(main ? { 'flex-grow': '0', 'flex-basis': 'auto' } : {}) };
        if (ratioLocked && /^\d+(?:\.\d+)?px$/.test(size)) {
            result[axis === 'width' ? 'height' : 'width'] = `${Number((parseFloat(size) * (axis === 'width' ? 1 / ratio : ratio)).toFixed(2))}px`;
        }
        return result;
    };
    const mode = (axis: Axis) => getSizeMode(axis, { ...props.authored, ...declarations }, computed, parentDisplay, parentDirection);
    return <>

    <Section title="位置与变换" onReset={clear(['position', 'top', 'right', 'bottom', 'left', 'z-index', 'transform'])}>
      {field('定位方式', 'position', { onChange: p => onChange(buildPositionPatch(p.position, geometry)), options: options([['static', '常规流'], ['relative', '相对定位'], ['absolute', '绝对定位'], ['fixed', '固定定位'], ['sticky', '粘性定位']]) })}
      {!geometry &&
            <p className="text-xs text-slate-500">尚未取得定位参照，切换绝对定位后可手动设置偏移。
            </p>}
      {position === 'static' ?
            <p className="text-xs text-slate-500">位置由父级布局和内外边距决定。
            </p> : <>

        <p className="text-xs text-slate-500">{position === 'relative' ? '相对自身原位置偏移' : position === 'fixed' ? '相对画框视口定位' : position === 'sticky' ? '相对滚动容器吸附' : '相对最近的定位父级定位'}
        </p>

        <div className="grid grid-cols-2 gap-2">{['top', 'right', 'bottom', 'left'].map((p, i) => field(['上', '右', '下', '左'][i], p))}
        </div>
      </>}
      {field('层级', 'z-index', { type: 'number', step: 1, unit: '' })}

    <PropertyField
      label="旋转"
      property="rotate"
      value={declarations.transform?.includes('rotate(') && transform ? `${transform.rotate}deg` : ''}
      computed={`${transform?.rotate ?? 0}deg`}
      type="number"
      unit="deg"
      disabled={!transform}
      onChange={p => p.rotate ? changeTransform('rotate', parseFloat(p.rotate)) : onChange({ transform: (declarations.transform || '').replace(/rotate\([^)]*\)/g, '').trim() })}
      onPreview={p => p ? changeTransform('rotate', parseFloat(p.rotate), true) : onPreview?.(null)}/>

    <div className="flex gap-2">
    <button
      className={buttonClass}
      disabled={!transform}
      aria-pressed={transform?.scaleX === -1}
      onClick={() => changeTransform('scaleX', transform?.scaleX === -1 ? 1 : -1)}>水平翻转
    </button>
    <button
      className={buttonClass}
      disabled={!transform}
      aria-pressed={transform?.scaleY === -1}
      onClick={() => changeTransform('scaleY', transform?.scaleY === -1 ? 1 : -1)}>垂直翻转
    </button>
    </div>
      {!transform &&
            <p className="text-xs text-amber-400">已有复杂变换，保留原值；旋转与翻转暂不可编辑。
            <code className="block break-all">{value('transform')}
            </code>
            </p>}

    </Section>

    <Section title="尺寸与布局" onReset={clear(['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio', 'align-self', 'justify-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'grid-template-columns', 'gap', 'row-gap', 'column-gap', 'overflow', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'])}>

    <div className="grid grid-cols-2 gap-2">{(['width', 'height'] as const).map((axis, index) => <div key={axis} className="space-y-2">
        {field(index === 0 ? '宽度 W' : '高度 H', axis, { onChange: p => onChange(sizeChange(axis, p)), onPreview: p => onPreview?.(p ? sizeChange(axis, p) : null) })}

        <label className="block text-xs text-slate-400">{index === 0 ? '宽度模式' : '高度模式'}
        <select
          aria-label={index === 0 ? '宽度模式' : '高度模式'}
          className="mt-1 w-full rounded bg-slate-800 p-1.5"
          value={mode(axis)}
          onChange={e => onChange(buildSizeModePatch(axis, e.target.value as SizeMode, axis === 'width' ? width : height, parentDisplay, parentDirection))}>
        <option value="auto">自动
        </option>
        <option value="fixed">固定
        </option>
        <option value="hug">适应内容
        </option>
        <option value="fill">填充
        </option>
        </select>
        </label>

        </div>)}
    </div>

    <button className={buttonClass} aria-pressed={ratioLocked} onClick={() => { const next = !ratioLocked; onChange({ 'aspect-ratio': next && width > 0 && height > 0 ? `${width} / ${height}` : '' }); }}>{ratioLocked ? '已锁定宽高比例' : '锁定宽高比例'}
    </button>

    <details className="text-xs text-slate-400">
    <summary>最小与最大尺寸
    </summary>
    <div className="mt-2 grid grid-cols-2 gap-2">{field('最小宽度', 'min-width')}{field('最大宽度', 'max-width')}{field('最小高度', 'min-height')}{field('最大高度', 'max-height')}
    </div>
    </details>
      {field('布局方式', 'display', { options: options([['block', '常规流'], ['flex', 'Flex 自动布局'], ['grid', 'Grid 网格'], ['inline-block', '行内块']]) })}
      {display.includes('flex') && <>
        {field('方向', 'flex-direction', { options: options([['row', '横向'], ['column', '纵向'], ['row-reverse', '横向反转'], ['column-reverse', '纵向反转']]) })}

        <div className="grid w-24 grid-cols-3 gap-1" role="group" aria-label="子项九宫格对齐">{Array.from({ length: 9 }, (_, i) => <button
          key={i}
          className={buttonClass}
          aria-label={`对齐 ${Math.floor(i / 3) + 1} 行 ${i % 3 + 1} 列`}
          onClick={() => onChange(buildAlignmentPatch(direction, Math.floor(i / 3), i % 3))}>•
            </button>)}
        </div>
        {field('分布', 'justify-content', { options: options([['flex-start', '起始'], ['center', '居中'], ['flex-end', '末尾'], ['space-between', '两端分布'], ['space-around', '环绕分布'], ['space-evenly', '均匀分布']]) })}
        {field('换行', 'flex-wrap', { options: options([['nowrap', '不换行'], ['wrap', '换行'], ['wrap-reverse', '反向换行']]) })}
      </>}
      {display.includes('grid') && field('网格列', 'grid-template-columns')}
      {(display.includes('grid') || display.includes('flex')) &&
            <div className="grid grid-cols-2 gap-2">{field('行间距', 'row-gap', { onChange: p => onChange(buildGapPatch(p, computed)), onPreview: p => onPreview?.(p ? buildGapPatch(p, computed) : null) })}{field('列间距', 'column-gap', { onChange: p => onChange(buildGapPatch(p, computed)), onPreview: p => onPreview?.(p ? buildGapPatch(p, computed) : null) })}
            </div>}
      {field('溢出', 'overflow', { options: options([['visible', '显示'], ['hidden', '裁剪'], ['auto', '自动滚动'], ['scroll', '始终滚动']]) })}
      {(['padding', 'margin'] as const).map(p => {
            const preserved = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [`${p}-${side}`, value(`${p}-${side}`) || '0px']));
            const label = p === 'padding' ? '内边距' : '外边距';
            return <div key={p} className="space-y-2">
            <label className="flex items-center justify-between text-xs text-slate-400">{label}
            <select
              aria-label={`${label}联动模式`}
              className={buttonClass}
              value={linked[p]}
              onChange={e => setLinked({ ...linked, [p]: e.target.value as 'all' | 'axis' | 'each' })}>
            <option value="all">联动四边
            </option>
            <option value="axis">横纵联动
            </option>
            <option value="each">独立四边
            </option>
            </select>
            </label>
        {linked[p] === 'all' ? field(`统一${label}`, `${p}-top`, { onChange: patch => onChange(buildLinkedSpacingPatch(p, patch[`${p}-top`])), onPreview: patch => onPreview?.(patch ? buildLinkedSpacingPatch(p, patch[`${p}-top`]) : null) }) : linked[p] === 'axis' ?
                    <div className="grid grid-cols-2 gap-2">{(['horizontal', 'vertical'] as const).map(axis => { const property = `${p}-${axis === 'horizontal' ? 'left' : 'top'}`; return field(`${axis === 'horizontal' ? '水平' : '垂直'}${label}`, property, { onChange: patch => onChange(buildAxisSpacingPatch(p, axis, patch[property], preserved)), onPreview: patch => onPreview?.(patch ? buildAxisSpacingPatch(p, axis, patch[property], preserved) : null) }); })}
                    </div> :
                    <div className="grid grid-cols-2 gap-2">{['top', 'right', 'bottom', 'left'].map((side, i) => field(['上', '右', '下', '左'][i], `${p}-${side}`, { onChange: patch => onChange({ [p]: '', ...preserved, ...patch }), onPreview: patch => onPreview?.(patch ? { [p]: '', ...preserved, ...patch } : null) }))}
                    </div>}
            </div>;
        })}

    </Section>

    <Section title="圆角" onReset={clear(['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'])}>

    <button className={buttonClass} aria-pressed={corners} onClick={() => setCorners(!corners)}>{corners ? '四角独立' : '统一圆角'}
    </button>
      {!corners ? field('圆角', 'border-radius', { onChange: patch => onChange({ 'border-top-left-radius': '', 'border-top-right-radius': '', 'border-bottom-right-radius': '', 'border-bottom-left-radius': '', ...patch }) }) :
            <div className="grid grid-cols-2 gap-2">{['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner, i) => field(['左上', '右上', '右下', '左下'][i], `border-${corner}-radius`, { onChange: patch => onChange({ 'border-radius': '', ...Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(c => [`border-${c}-radius`, value(`border-${c}-radius`) || '0px'])), ...patch }) }))}
            </div>}

    </Section>
  </>;
}
export function TypographySection({ declarations, computed, onChange, onPreview, tokens }: DesignSectionProps) {
    const field = (label: string, property: string, extra: Partial<React.ComponentProps<typeof PropertyField>> = {}) => {
        const pattern = property === 'font-size' ? /^--(?:td-import-)?font-size-/ : property === 'font-family' ? /^--(?:td-import-)?font-(?:sans|mono)$/ : property === 'letter-spacing' ? /^--(?:td-import-)?space-/ : null;
        return <div key={property} className="space-y-1">
        <PropertyField
          label={label}
          property={property}
          value={declarations[property] || ''}
          computed={computed[property] || ''}
          type={['font-size', 'line-height', 'letter-spacing'].includes(property) ? 'number' : 'text'}
          min={property === 'font-size' || property === 'line-height' ? 0 : undefined}
          unit={property === 'line-height' ? '' : 'px'}
          onChange={onChange}
          onPreview={onPreview}
          {...extra}/>{pattern &&
                <TokenChoice
                  label={label}
                  property={property}
                  tokens={tokens}
                  pattern={pattern}
                  onChange={extra.onChange || onChange}/>}
        </div>;
    };
    const properties = ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'color', 'text-align', 'text-decoration-line', 'text-transform', 'white-space', 'text-overflow', 'overflow'];
    return <Section title="文本" onReset={() => onChange(Object.fromEntries(properties.map(p => [p, ''])))}>
    {field('字体', 'font-family')}

    <div className="grid grid-cols-2 gap-2">{field('字重', 'font-weight', { options: options([['100', 'Thin 100'], ['200', 'ExtraLight 200'], ['300', 'Light 300'], ['400', 'Regular 400'], ['500', 'Medium 500'], ['600', 'SemiBold 600'], ['700', 'Bold 700'], ['800', 'ExtraBold 800'], ['900', 'Black 900']]) })}{field('字号', 'font-size')}
    </div>

    <div className="grid grid-cols-2 gap-2">{field('行高', 'line-height')}{field('字距', 'letter-spacing')}
    </div>
    {field('文字颜色', 'color')}
    {!!tokens &&
            <label className="block text-xs text-slate-400">文字颜色 Token
            <select
              aria-label="文字颜色 Token"
              className="mt-1 w-full rounded bg-slate-800 p-1.5"
              value=""
              onChange={e => e.target.value && onChange({ color: `var(${e.target.value})` })}>
            <option value="">选择工程 Token
            </option>{Object.entries(tokens).filter(([key]) => key.startsWith('--') && /color|text|foreground|primary|accent/.test(key)).map(([key, value]) => <option key={key} value={key}>{key} · {value}
                </option>)}
            </select>
            </label>}
    {field('文字对齐', 'text-align', { options: options([['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['justify', '两端对齐'], ['start', '起始'], ['end', '末尾']]) })}
    {field('文字修饰', 'text-decoration-line', { options: options([['none', '无'], ['underline', '下划线'], ['line-through', '删除线'], ['underline line-through', '下划线与删除线']]) })}
    {field('大小写', 'text-transform', { options: options([['none', '原文'], ['uppercase', '大写'], ['lowercase', '小写'], ['capitalize', '首字母大写']]) })}
    {field('换行', 'white-space', { options: options([['normal', '自动换行'], ['nowrap', '不换行'], ['pre-wrap', '保留空白并换行'], ['pre', '保留原始格式']]) })}

    <label className="block text-xs text-slate-400">省略方式
    <select
      aria-label="省略方式"
      className="mt-1 w-full rounded bg-slate-800 p-1.5"
      value={(declarations['text-overflow'] || computed['text-overflow']) === 'ellipsis' ? 'ellipsis' : 'clip'}
      onChange={e => onChange(e.target.value === 'ellipsis' ? { 'text-overflow': 'ellipsis', overflow: 'hidden', 'white-space': 'nowrap' } : { 'text-overflow': 'clip', overflow: '', 'white-space': '' })}>
    <option value="clip">不省略
    </option>
    <option value="ellipsis">单行省略号
    </option>
    </select>
    </label>

    </Section>;
}
export interface PositionGeometry {
    top: number;
    left: number;
    width: number;
    height: number;
    parentTop: number;
    parentLeft: number;
    parentBorderTop: number;
    parentBorderLeft: number;
    parentScrollTop: number;
    parentScrollLeft: number;
}
export function buildPositionPatch(position: string, geometry?: PositionGeometry): PropertyPatch {
    if (position !== 'absolute' || !geometry)
        return { position };
    const px = (n: number) => `${Number(n.toFixed(3))}px`;
    return { position, top: px(geometry.top - geometry.parentTop - geometry.parentBorderTop + geometry.parentScrollTop), left: px(geometry.left - geometry.parentLeft - geometry.parentBorderLeft + geometry.parentScrollLeft), width: px(geometry.width), height: px(geometry.height), right: 'auto', bottom: 'auto', 'margin-top': '0px', 'margin-left': '0px', 'box-sizing': 'border-box' };
}
export function buildGapPatch(patch: PropertyPatch, computed: PropertyPatch): PropertyPatch {
    return { gap: '', 'row-gap': computed['row-gap'] || 'normal', 'column-gap': computed['column-gap'] || 'normal', ...patch };
}
export function buildAxisSpacingPatch(property: 'padding' | 'margin', axis: 'horizontal' | 'vertical', value: string, computed: PropertyPatch): PropertyPatch {
    const sides = axis === 'horizontal' ? ['left', 'right'] : ['top', 'bottom'];
    return { [property]: '', ...Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [`${property}-${side}`, sides.includes(side) ? value : computed[`${property}-${side}`] || '0px'])) };
}
export function getSizeMode(axis: Axis, declarations: PropertyPatch, computed: PropertyPatch, parentDisplay = '', parentDirection = 'row'): SizeMode {
    const value = (p: string) => declarations[p] || computed[p] || '';
    const flex = parentDisplay.includes('flex');
    const main = flex && (parentDirection.startsWith('column') ? axis === 'height' : axis === 'width');
    if (main && Number(value('flex-grow')) > 0 || (!main && flex || parentDisplay.includes('grid')) && value(parentDisplay.includes('grid') && axis === 'width' ? 'justify-self' : 'align-self') === 'stretch' && value(axis) === 'auto' || value(axis) === '100%')
        return 'fill';
    if (value(axis) === 'auto' || !value(axis)) return 'auto';
    if (['fit-content', 'max-content'].includes(value(axis)))
        return 'hug';
    return 'fixed';
}
function TokenChoice({ label, property, tokens, pattern, onChange }: {
    label: string;
    property: string;
    tokens?: Record<string, string>;
    pattern: RegExp;
    onChange: (patch: PropertyPatch) => void;
}) {
    const entries = Object.entries(tokens || {}).filter(([key]) => pattern.test(key));
    if (!entries.length)
        return null;
    return <details className="text-[10px] text-slate-500"><summary className="cursor-pointer">工程 Token</summary><select
      aria-label={`${label} Token`}
      className="w-full rounded bg-slate-800 p-1.5 text-xs text-slate-400"
      value=""
      onChange={e => e.target.value && onChange({ [property]: `var(${e.target.value})` })}>
    <option value="">{label} · 工程 Token
    </option>{entries.map(([key, value]) => <option key={key} value={key}>{key} · {value}
        </option>)}
    </select></details>;
}
