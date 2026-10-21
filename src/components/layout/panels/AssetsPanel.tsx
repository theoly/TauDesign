import React from 'react';
import { useProjectStore } from '../../../stores/useProjectStore';
import { Accordion } from '../Accordion';
import { Boxes, Image as ImageIcon, Settings2, Shapes } from 'lucide-react';
import { parseHtmlCopy } from '../../../utils/htmlDocument';
import { AssetPreviewImage } from '../../assets/AssetPreviewImage';

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
  const componentList = Object.values(components);

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
    <p className="px-3 py-3 text-[11px] text-slate-600 leading-relaxed">{text}</p>
  );

  return (
    <>
      <div className="px-2 py-1.5 border-b border-slate-850/80">
        <button
          onClick={onOpenAssetCenter}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-md text-[11px] transition"
        >
          <Settings2 className="w-3.5 h-3.5 text-purple-400" />
          <span>资源中心（上传 / AI 生成）</span>
        </button>
      </div>

      <Accordion panelKey="assets.images" title="图片" badge={images.length}>
        {images.length === 0
          ? empty('还没有图片素材。在资源中心上传，或用 AI 生成。')
          : (
            <div className="grid grid-cols-3 gap-1.5 px-2">
              {images.map((a) => (
                <button
                  key={a.id}
                  onClick={() => applyImage(a.relPath)}
                  title={`${a.name}\n点击应用到当前选中元素`}
                  className="aspect-square rounded-md overflow-hidden border border-slate-800 hover:border-blue-500 bg-slate-950 transition"
                >
                  <AssetPreviewImage asset={a} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.icons" title="图标" badge={icons.length}>
        {icons.length === 0
          ? empty('还没有图标。在资源中心搜索内置图标库或上传 SVG。')
          : (
            <div className="grid grid-cols-5 gap-1.5 px-2">
              {icons.map((a) => (
                <div
                  key={a.id}
                  title={a.name}
                  className="aspect-square rounded-md border border-slate-800 bg-slate-950 flex items-center justify-center p-1.5 text-slate-300"
                  dangerouslySetInnerHTML={a.rawSvg ? { __html: a.rawSvg } : undefined}
                />
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.components" title="组件" badge={componentList.length}>
        {componentList.length === 0
          ? empty('同一结构重复 3 次以上时，可在检查器中提取为组件。')
          : (
            <div className="space-y-0.5 px-1.5">
              {componentList.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] text-slate-300 hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Boxes className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate" title={c.description || c.name}>
                      {c.name}
                    </span>
                  </div>
                  <button
                    onClick={() => activeScreenId && insertComponent(activeScreenId, c.id)}
                    disabled={!activeScreenId}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded text-[10px] transition shrink-0"
                    title="插入当前画板"
                  >
                    插入
                  </button>
                </div>
              ))}
            </div>
          )}
      </Accordion>

      <Accordion panelKey="assets.fonts" title="字体" defaultOpen={false}>
        <p className="px-3 py-3 text-[11px] text-slate-600 leading-relaxed flex items-start gap-1.5">
          <Shapes className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-700" />
          <span>字体家族在「设计系统 → 排版」中配置，本期仅支持系统已安装字体。</span>
        </p>
      </Accordion>

      {assetList.length === 0 && componentList.length === 0 && (
        <div className="px-3 py-6 text-center">
          <ImageIcon className="w-6 h-6 text-slate-700 mx-auto mb-2" />
          <p className="text-[11px] text-slate-600">工程资源库为空</p>
        </div>
      )}
    </>
  );
};
