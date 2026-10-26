import { useProjectStore } from '../stores/useProjectStore';
import { parseHtmlCopy } from './htmlDocument';

/** Resolve by attribute value instead of interpolating an untrusted nid into a selector. */
export function findInspectorImage(html: string, nid: string) {
  const copy = parseHtmlCopy(html);
  const image = Array.from(copy.doc.querySelectorAll('img[data-nid]')).find((el) => el.getAttribute('data-nid') === nid);
  return { copy, image };
}

export function setInspectorImageAlt(screenId: string, nid: string, alt: string): boolean {
  const state = useProjectStore.getState();
  const screen = state.screens[screenId];
  if (!screen) return false;
  const { copy, image } = findInspectorImage(screen.htmlContent, nid);
  if (!image || image.getAttribute('alt') === alt) return false;
  image.setAttribute('alt', alt);
  state.updateScreenHtml(screenId, copy.serialize(), '修改图片替代文本');
  return true;
}

/** Capture the project and image before awaiting disk IO; never follow a later selection. */
export async function replaceInspectorImage(screenId: string, nid: string, name: string, dataUrl: string): Promise<boolean> {
  const initial = useProjectStore.getState();
  if (!initial.screens[screenId] || !findInspectorImage(initial.screens[screenId].htmlContent, nid).image) return false;
  const projectId = initial.id;
  const asset = await initial.getAttachmentStore().save(name, dataUrl);
  const current = useProjectStore.getState();
  if (current.id !== projectId) return false;
  if (!asset) throw new Error('图片保存失败，请检查工程目录后重试');
  if (!current.screens[screenId] || !findInspectorImage(current.screens[screenId].htmlContent, nid).image) {
    throw new Error('原图片已被删除，未应用替换');
  }
  return current.replaceNodeImage(screenId, nid, asset);
}
