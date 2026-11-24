import React, { useMemo } from 'react';
import { useProjectStore } from '../../../stores/useProjectStore';
import { Accordion } from '../Accordion';
import { Boxes, Image as ImageIcon, Library, Settings2, Shapes } from 'lucide-react';
import { parseHtmlCopy } from '../../../utils/htmlDocument';
import { AssetPreviewImage } from '../../assets/AssetPreviewImage';
import { listActiveBuiltinMotherMeta } from '../../../reference-pages/builtinMetaIndex';
import { useT } from '../../../stores/useLocaleStore';

interface AssetsPanelProps {
  /** 打开完整资源中心：上传、AI 生图、批量管理等重操作仍走弹窗 */
  onOpenAssetCenter: () => void;
}

/**
 * 侧边栏「资源」视图 (PRD §3.0.3 / §3.4)
 *
 * 侧边栏负责**浏览与插入**（高频、需与画板同时可见）；上传、AI 生图、
 * 批量替换等重操作留在资源中心弹窗，避免把宽布局硬塞进 260px 侧栏。
 */
export const AssetsPanel: React.FC<AssetsPanelProps> = ({ onOpenAssetCenter }) => {
  const t = useT();
  const {
    assets,
    components,
    screens,
    activeScreenId,
    selectedNode,
    updateScreenHtml,
    insertComponent
  } = useProjectStore();

  const assetList = Object.values(assets);
  const images = assetList.filter((a) => a.type === 'image');
  const icons = assetList.filter((a) => a.type === 'svg_icon');
  const media=assetList.filter(a=>a.type==='media'),fonts=assetList.filter(a=>a.type==='font');
  const componentList = Object.values(components);
  const builtinMothers = useMemo(() => listActiveBuiltinMotherMeta(), []);

  /** 应用到当前选中元素：img 改 src，其他元素设为背景图 */
  const applyImage = (url: string) => {
    if (!activeScreenId || !selectedNode) {
      alert('请先在画板中点击选中一个图片或容器元素');
      return;
    }
    const cur = screens[activeScreenId];
    if (!cur) return;
    const parsed = parseHtmlCopy(cur.htmlContent), doc = parsed.doc;
    const el = doc.querySelector(`[data-nid="${selectedNode.nid}"]`) as HTMLElement | null;
    if (!el) return;

    if (el.tagName.toLowerCase() === 'img') {
      el.setAttribute('src', url);
    } else {
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }
    updateScreenHtml(activeScreenId, parsed.serialize(), `应用素材到 #${selectedNode.nid}`);
  };

  const empty = (text: string) => (
    <p className="px-3 py-3 text-[11px] text-host-tertiary leading-relaxed">{text}</p>
  );

  return (
    <>
      <div className="px-2 py-1.5 border-b border-host-border">
        <button
          onClick={onOpenAssetCenter}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-host-border bg-host-sunken hover:bg-host-elevated text-host-primary rounded-md text-[11px] transition"
        >
          <Settings2 className="w-3.5 h-3.5 text-host-brand" />
          <span>{t('assets.openCenter')}</span>
        </button>
      </div>

      <Accordion panelKey="assets.images" title={t('assets.panelImages')} badge={images.length}>
        {images.length === 0
          ? empty(t('assets.emptyImages'))
          : (
            <div className="grid grid-cols-3 gap-1.5 px-2">
              {images.map((a) => (
                <button
                  key={a.id}
                  onClick={() => applyImage(a.relPath)}
                  title={`${a.name}\n点击应用到当前选中元素`}
                  className="aspect-square rounded-md overflow-hidden border border-host-border hover:border-host-accent bg-host-sunken transition"
                >
                  <AssetPreviewImage asset={a} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.icons" title={t('assets.panelIcons')} badge={icons.length}>
        {icons.length === 0
          ? empty(t('assets.emptyIcons'))
          : (
            <div className="grid grid-cols-5 gap-1.5 px-2">
              {icons.map((a) => (
                <div
                  key={a.id}
                  title={a.name}
                  className="aspect-square rounded-md border border-host-border bg-host-sunken flex items-center justify-center p-1.5 text-host-secondary"
                ><AssetPreviewImage asset={a} mask className="h-full w-full"/></div>
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.components" title={t('assets.panelComponents')} badge={componentList.length}>
        {componentList.length === 0
          ? empty(t('assets.emptyComponents'))
          : (
            <div className="space-y-0.5 px-1.5">
              {componentList.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] text-host-secondary hover:bg-host-elevated hover:text-host-primary"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Boxes className="w-3.5 h-3.5 text-host-brand shrink-0" />
                    <span className="truncate" title={c.description || c.name}>
                      {c.name}
                    </span>
                  </div>
                  <button
                    onClick={() => activeScreenId && insertComponent(activeScreenId, c.id)}
                    disabled={!activeScreenId}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-host-accent hover:bg-host-accent-hover disabled:opacity-30 text-host-on-accent font-medium rounded text-[10px] transition shrink-0"
                    title="插入当前画板"
                  >
                    {t('assets.insert')}
                  </button>
                </div>
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.mothers" title={t('assets.panelMothers')} badge={builtinMothers.length} defaultOpen={false}>
        {builtinMothers.length === 0
          ? empty(t('assets.emptyMothers'))
          : (
            <div className="space-y-0.5 px-1.5">
              {builtinMothers.slice(0, 12).map((meta) => (
                <div
                  key={meta.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-host-secondary"
                  title={`${meta.device} · ${meta.pageKind}`}
                >
                  <Library className="w-3.5 h-3.5 text-host-brand/80 shrink-0" />
                  <span className="truncate">{meta.id}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-host-tertiary">{t('assets.readonly')}</span>
                </div>
              ))}
              {builtinMothers.length > 12 && (
                <p className="px-3 py-1 text-[10px] text-host-tertiary">另有 {builtinMothers.length - 12} 条，见资源中心「母版」</p>
              )}
              <button
                type="button"
                onClick={onOpenAssetCenter}
                className="mx-2 mb-1 mt-1 w-[calc(100%-1rem)] py-1.5 rounded-md border border-host-border bg-host-sunken hover:bg-host-elevated text-[10px] text-host-primary transition"
              >
                打开资源中心存为母版
              </button>
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.media" title={t('assets.panelMedia')} badge={media.length} defaultOpen={false}>
        {media.length?media.map(asset=><p key={asset.id} title={asset.relPath} className="break-words px-3 py-2 text-[11px] text-host-secondary">{asset.name}<span className="block text-host-tertiary">{asset.mimeType}</span></p>):empty('导入页面引用的音视频与字幕会作为独立文件保存在工程中。')}
      </Accordion>
      <Accordion panelKey="assets.fonts" title={t('assets.panelFonts')} badge={fonts.length} defaultOpen={false}>
        {fonts.map(asset=><p key={asset.id} title={asset.relPath} className="break-words px-3 py-2 text-[11px] text-host-secondary">{asset.name}</p>)}
        <p className="px-3 py-3 text-[11px] text-host-tertiary leading-relaxed flex items-start gap-1.5">
          <Shapes className="w-3.5 h-3.5 mt-0.5 shrink-0 text-host-tertiary" />
          <span>字体家族在「设计系统 → 排版」中配置；导入的字体文件独立保存，由来源 CSS 的 @font-face 引用。</span>
        </p>
      </Accordion>

      {assetList.length === 0 && componentList.length === 0 && (
        <div className="px-3 py-6 text-center">
          <ImageIcon className="w-6 h-6 text-host-tertiary mx-auto mb-2" />
          <p className="text-[11px] text-host-tertiary">{t('assets.emptyLibrary')}</p>
        </div>
      )}
    </>
  );
};
