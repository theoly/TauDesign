import {hasTemplateContract,projectSlottedComponent} from './componentTemplate';
import type { ComponentDefinition, Screen, StyleOverride } from '../types/project';
import { parseHtmlCopy } from './htmlDocument';
import { NidEngine } from './nidEngine';
import { setDirectText } from './textNode';

/** Pure projection shared by manual sync and checked AI delivery; never mutates project data. */
export function projectComponentSync(component: ComponentDefinition, screens: Screen[], overrides: Record<string, StyleOverride>, force = false) {
  const updates: Screen[] = [], details: string[] = [];
  let syncedCount = 0, skippedConflictCount = 0;
  for (const screen of screens) {
    const parsed = parseHtmlCopy(screen.htmlContent), doc = parsed.doc;
    const instances = Array.from(doc.querySelectorAll('[data-component-id]')).filter(el => el.getAttribute('data-component-id') === component.id);
    let modified = false;
    for (const instance of instances) {
      const rootNid = instance.getAttribute('data-nid');
      const nids = [rootNid, ...Array.from(instance.querySelectorAll('[data-nid]')).map(el => el.getAttribute('data-nid'))].filter((id): id is string => Boolean(id));
      const conflicting = nids.filter(nid => overrides[`${screen.id}:${nid}`]);
      if (conflicting.length && !force) {
        skippedConflictCount++;
        details.push(`画板「${screen.name}」中的实例存在 ${conflicting.length} 条手动样式覆盖 (L4)，已自动跳过保护`);
        continue;
      }
      let strictReplacement:Element|undefined;
      if(hasTemplateContract(component)){
        try{strictReplacement=projectSlottedComponent(component,instance);}
        catch(error){skippedConflictCount++;details.push(`画板「${screen.name}」插槽无法安全保留：${error instanceof Error?error.message:'合同无效'}`);continue;}
      }
      const texts: string[] = [], images: string[] = [];
      instance.querySelectorAll('*').forEach(child => {
        if (child.tagName.toLowerCase() === 'img') { const src = child.getAttribute('src'); if (src) images.push(src); }
        else if (!child.children.length && child.textContent?.trim()) texts.push(child.textContent.trim());
      });
      const template = new DOMParser().parseFromString(`<body>${component.templateHtml}</body>`, 'text/html');
      const replacement = strictReplacement??template.body.firstElementChild;
      if (!replacement) continue;
      replacement.setAttribute('data-component-id', component.id);
      replacement.setAttribute('data-component-instance', instance.getAttribute('data-component-instance') || `inst-${crypto.randomUUID()}`);
      replacement.setAttribute('data-component-version', String(component.version ?? 1));
      if (rootNid) replacement.setAttribute('data-nid', rootNid);
      let textIndex = 0, imageIndex = 0;
      if(!strictReplacement)replacement.querySelectorAll('*').forEach(child => {
        if (child.tagName.toLowerCase() === 'img' && imageIndex < images.length) child.setAttribute('src', images[imageIndex++]);
        else if (!child.children.length && child.textContent?.trim() && textIndex < texts.length) setDirectText(child, texts[textIndex++]);
      });
      const fragment = new DOMParser().parseFromString(`<body>${NidEngine.injectNids(replacement.outerHTML)}</body>`, 'text/html');
      if (fragment.body.firstElementChild) {
        instance.replaceWith(fragment.body.firstElementChild);modified = true;syncedCount++;
      }
    }
    if (modified) updates.push({...screen,htmlContent:parsed.serialize()});
  }
  return { screens:updates, syncedCount, skippedConflictCount, details };
}
