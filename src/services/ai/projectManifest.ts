import {libraryReferenceIssue} from './designLibraryReference';
import type { Asset, ComponentDefinition, DesignLibraryBinding, DesignSystemOrigin, Screen } from '../../types/project';
import type { DesignSystem } from '../../types/designSystem';
import { inspectProjectAssetReferences } from './projectAssetIntegrity';

export interface DesignProjectManifestInput {
  projectId: string;
  projectName: string;
  deviceProfile: 'pc' | 'mobile';
  screens: Screen[];
  assets: Asset[];
  components?: ComponentDefinition[];
  designSystem?: DesignSystem;
  designSystemOrigin?: DesignSystemOrigin;
  designLibraryBinding?: DesignLibraryBinding;
}

export interface ManifestFormContract {
  nid?: string;
  id?: string;
  label: string;
  method: string;
  action: string;
  fields: Array<{ nid?: string; name: string; type: string; label: string; required: boolean }>;
  submitActions: Array<{ nid?: string; label: string; formaction?: string; formmethod?: string }>;
}

export interface DesignProjectManifest {
  version: 1;
  project: { id: string; name: string; deviceProfile: 'pc' | 'mobile' };
  pages: Array<{
    id: string; name: string; kind: 'screen' | 'specimen'; outgoingPageIds: string[]; componentIds: string[];
    pageGroup?: string; stateLabel?: string; audienceRole?: string; basedOnScreenId?: string;
    interactions: Array<{ nid?: string; label: string; kind: 'navigation' | 'field' | 'action'; stateSignals: string[] }>;
    forms: ManifestFormContract[];
    scopedStyleAsset?: { id: string; version: number; fingerprint: string; source: string };
  }>;
  assets: Array<{ id: string; name: string; relPath: string }>;
  components: Array<{ id: string; name: string; version: number; origin?: string }>;
  designSystem?: { id: string; name: string; tokenVersion: number; tokenFingerprint: string; origin: string };
  designLibrary?: { mode: DesignLibraryBinding['mode']; sourceProjectId: string; sourceName: string; sourceDeviceProfile: 'pc' | 'mobile'; sourceFingerprint: string; sourceTokenVersion: number };
  issues: Array<{ code: string; entityId?: string; severity?: 'warning'; message: string }>;
}

/** Derives a disposable project map from current saved entities; it is never a second persistence authority. */
export function buildDesignProjectManifest(input: DesignProjectManifestInput): DesignProjectManifest {
  const issues: DesignProjectManifest['issues'] = [];
  if(input.designSystem){
    const issue=libraryReferenceIssue({designLibraryBinding:input.designLibraryBinding,designSystem:input.designSystem,
      components:Object.fromEntries((input.components??[]).map(c=>[c.id,c])),assets:Object.fromEntries(input.assets.map(a=>[a.id,a]))});
    if(issue)issues.push({code:'invalid_library_reference',message:issue});
  }
  const screenIds = new Set<string>();
  const assetIds = new Set<string>();
  const assetPaths = new Set<string>();
  const componentIds = new Set<string>();
  for (const screen of input.screens) {
    if (!screen.id.trim()) issues.push({ code: 'empty_screen_id', message: '页面缺少稳定 ID。' });
    if (screenIds.has(screen.id)) issues.push({ code: 'duplicate_screen_id', entityId: screen.id, message: `页面 ID 重复：${screen.id}` });
    screenIds.add(screen.id);
    if (!Number.isFinite(screen.position?.x) || !Number.isFinite(screen.position?.y)) issues.push({ code: 'invalid_screen_position', entityId: screen.id, message: `页面「${screen.name}」坐标无效。` });
    if (!screen.htmlContent?.trim()) issues.push({ code: 'empty_screen_html', entityId: screen.id, message: `页面「${screen.name}」没有 HTML 内容。` });
    if (screen.metadata?.basedOnScreenId && (screen.metadata.basedOnScreenId === screen.id || !input.screens.some(item => item.id === screen.metadata?.basedOnScreenId))) {
      issues.push({ code: 'invalid_page_variant_source', entityId: screen.id, message: `页面「${screen.name}」的候选来源不存在或指向自身。` });
    }
  }
  for (const asset of input.assets) {
    if (assetIds.has(asset.id)) issues.push({ code: 'duplicate_asset_id', entityId: asset.id, message: `资源 ID 重复：${asset.id}` });
    assetIds.add(asset.id);
    if (assetPaths.has(asset.relPath)) issues.push({ code: 'duplicate_asset_path', entityId: asset.id, message: `资源路径重复登记：${asset.relPath}` });
    assetPaths.add(asset.relPath);
  }
  issues.push(...inspectProjectAssetReferences(input.screens, input.assets));
  const components = input.components ?? [];
  const componentById = new Map(components.map(component => [component.id, component]));
  for (const component of components) {
    if (componentIds.has(component.id)) issues.push({ code: 'duplicate_component_id', entityId: component.id, message: `组件 ID 重复：${component.id}` });
    componentIds.add(component.id);
  }

  const pages = input.screens.map(screen => {
    const doc = new DOMParser().parseFromString(screen.htmlContent ?? '', 'text/html');
    const pageIssue = (code: string, message: string) => issues.push({ code, entityId: screen.id, severity: 'warning', message: `页面「${screen.name}」${message}` });
    const interactionElements = Array.from(doc.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, [data-action-id], [data-target-screen-id]'));
    const interactions = interactionElements.map(element => {
      const tag = element.tagName.toLowerCase();
      const field = element as HTMLInputElement;
      const isField = tag === 'select' || tag === 'textarea' || tag === 'input' && !['button', 'submit', 'reset', 'image'].includes(field.type);
      const associatedLabel = field.id ? Array.from(doc.querySelectorAll('label')).find(label => label.htmlFor === field.id)?.textContent : undefined;
      const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => doc.getElementById(id)?.textContent || '').join(' ');
      const label = (element.getAttribute('aria-label') || labelledBy || associatedLabel || element.closest('label')?.textContent || element.getAttribute('placeholder')
        || element.getAttribute('title') || element.textContent || field.value || element.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!label) pageIssue('interactive_control_unlabeled', `存在没有可访问名称的${isField ? '表单字段' : '操作控件'}（${element.getAttribute('data-nid') || tag}）。`);
      const stateSignals = ['aria-expanded', 'aria-selected', 'aria-pressed', 'aria-checked', 'data-state']
        .filter(attribute => element.hasAttribute(attribute));
      if (isField && ['checkbox', 'radio'].includes(field.type)) stateSignals.push('checked');
      if (tag === 'select') stateSignals.push('selected-option');
      const isNavigation = tag === 'a' || element.hasAttribute('data-target-screen-id');
      return {
        ...(element.getAttribute('data-nid') ? { nid: element.getAttribute('data-nid')! } : {}),
        label: label || '未命名控件',
        kind: isNavigation ? 'navigation' as const : isField ? 'field' as const : 'action' as const,
        stateSignals: [...new Set(stateSignals)]
      };
    });
    const forms: ManifestFormContract[] = Array.from(doc.querySelectorAll('form')).map(form => {
      const formId = form.getAttribute('id')?.trim() || undefined;
      const controls = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea')) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
      const formLabel = (form.getAttribute('aria-label') || form.querySelector('legend')?.textContent || form.getAttribute('name') || formId || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const fields = controls.map(control => {
        const associatedLabel = control.id ? Array.from(doc.querySelectorAll('label')).find(label => label.htmlFor === control.id)?.textContent : undefined;
        const labelledBy = (control.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
          .map(id => doc.getElementById(id)?.textContent || '').join(' ');
        const label = (control.getAttribute('aria-label') || labelledBy || associatedLabel || control.closest('label')?.textContent || control.getAttribute('placeholder') || control.getAttribute('title') || control.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const tag = control.tagName.toLowerCase();
        const type = tag === 'input' ? ((control as HTMLInputElement).type || 'text').toLowerCase() : tag;
        return {
          ...(control.getAttribute('data-nid') ? { nid: control.getAttribute('data-nid')! } : {}),
          name: control.getAttribute('name')?.trim() || control.id || '未命名字段',
          type,
          label: label || '未命名字段',
          required: control.hasAttribute('required')
        };
      });
      const submitControls = Array.from(doc.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]'))
        .filter(control => {
          const associatedFormId = control.getAttribute('form');
          return associatedFormId ? associatedFormId === formId : control.closest('form') === form;
        });
      const submitActions = submitControls.map(control => ({
        ...(control.getAttribute('data-nid') ? { nid: control.getAttribute('data-nid')! } : {}),
        label: (control.getAttribute('aria-label') || control.textContent || control.getAttribute('value') || control.getAttribute('title') || '提交').replace(/\s+/g, ' ').trim().slice(0, 60) || '提交',
        ...(control.getAttribute('formaction') ? { formaction: control.getAttribute('formaction')! } : {}),
        ...(control.getAttribute('formmethod') ? { formmethod: control.getAttribute('formmethod')! } : {})
      }));
      if (controls.length && !submitActions.length) pageIssue('form_missing_submit_action', '包含表单字段但没有可识别的提交控件。');
      return {
        ...(form.getAttribute('data-nid') ? { nid: form.getAttribute('data-nid')! } : {}),
        ...(formId ? { id: formId } : {}),
        label: formLabel || '未命名表单',
        method: (form.getAttribute('method') || 'get').toLowerCase(),
        action: form.getAttribute('action') || '',
        fields,
        submitActions
      };
    });
    for (const link of Array.from(doc.querySelectorAll('a[href^="#"]'))) {
      const rawTargetId = link.getAttribute('href')?.slice(1);
      if (!rawTargetId) continue;
      let targetId = rawTargetId;
      try { targetId = decodeURIComponent(rawTargetId); } catch { /* Keep malformed fragment literal for the diagnostic. */ }
      if (!doc.getElementById(targetId)) pageIssue('unresolved_fragment_link', `包含指向不存在锚点「${targetId}」的链接。`);
    }
    for (const control of Array.from(doc.querySelectorAll('[aria-controls]'))) {
      const missing = (control.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean).filter(id => !doc.getElementById(id));
      if (missing.length) pageIssue('unresolved_aria_controls', `的 aria-controls 引用了不存在的节点：${missing.join('、')}。`);
    }
    const outgoingPageIds = [...new Set(Array.from(doc.querySelectorAll('[data-target-screen-id]'))
      .map(element => element.getAttribute('data-target-screen-id')?.trim()).filter((id): id is string => Boolean(id)))];
    for (const targetId of outgoingPageIds) {
      if (!screenIds.has(targetId)) issues.push({ code: 'unresolved_page_link', entityId: screen.id, message: `页面「${screen.name}」链接到不存在的页面 ${targetId}。` });
    }
    const componentInstances = Array.from(doc.querySelectorAll('[data-component-id]'));
    const componentIds = [...new Set(componentInstances.map(element => element.getAttribute('data-component-id')?.trim()).filter((id): id is string => Boolean(id)))];
    for (const instance of componentInstances) {
      const componentId = instance.getAttribute('data-component-id')?.trim();
      if (!componentId) continue;
      const definition = componentById.get(componentId);
      if (!definition) {
        issues.push({ code: 'unresolved_component_reference', entityId: screen.id, message: `页面「${screen.name}」引用了不存在的组件 ${componentId}。` });
        continue;
      }
      const instanceVersion = Number(instance.getAttribute('data-component-version'));
      if (Number.isInteger(instanceVersion) && instanceVersion > 0 && instanceVersion < (definition.version ?? 1)) {
        issues.push({ code: 'stale_component_instance', entityId: screen.id, message: `页面「${screen.name}」中的组件「${definition.name}」实例为 v${instanceVersion}，库版本为 v${definition.version ?? 1}。` });
      }
    }
    return {
      id: screen.id, name: screen.name, kind: screen.metadata?.kind === 'specimen' ? 'specimen' as const : 'screen' as const,
      outgoingPageIds, componentIds, interactions, forms,
      ...(screen.metadata?.pageGroup ? { pageGroup: screen.metadata.pageGroup } : {}),
      ...(screen.metadata?.stateLabel ? { stateLabel: screen.metadata.stateLabel } : {}),
      ...(screen.metadata?.audienceRole ? { audienceRole: screen.metadata.audienceRole } : {}),
      ...(screen.metadata?.basedOnScreenId ? { basedOnScreenId: screen.metadata.basedOnScreenId } : {}),
      ...(screen.metadata?.scopedStyleAsset ? { scopedStyleAsset: screen.metadata.scopedStyleAsset } : {})
    };
  });

  return {
    version: 1,
    project: { id: input.projectId, name: input.projectName, deviceProfile: input.deviceProfile },
    pages,
    assets: input.assets.map(({ id, name, relPath }) => ({ id, name, relPath })),
    components: components.map(component => ({ id: component.id, name: component.name, version: component.version ?? 1, ...(component.origin ? { origin: component.origin.kind } : {}) })),
    ...(input.designSystem ? { designSystem: {
      id: input.designSystem.id,
      name: input.designSystem.name,
      tokenVersion: input.designSystemOrigin?.tokenVersion ?? 1,
      tokenFingerprint: input.designSystemOrigin?.tokenFingerprint ?? '未记录',
      origin: input.designSystemOrigin?.kind ?? 'project'
    } } : {}),
    ...(input.designLibraryBinding ? { designLibrary: {
      mode: input.designLibraryBinding.mode, sourceProjectId: input.designLibraryBinding.sourceProjectId,
      sourceName: input.designLibraryBinding.sourceName, sourceDeviceProfile: input.designLibraryBinding.sourceDeviceProfile,
      sourceFingerprint: input.designLibraryBinding.sourceFingerprint,
      sourceTokenVersion: input.designLibraryBinding.sourceTokenVersion
    } } : {}),
    issues
  };
}

export function renderProjectManifestContext(manifest: DesignProjectManifest): string {
  const businessPages = manifest.pages.filter(page => page.kind === 'screen');
  const pageNames = businessPages.slice(0, 20).map(page => page.name).join('、') || '暂无业务页面';
  const morePages = businessPages.length > 20 ? `；另有 ${businessPages.length - 20} 个页面未列出` : '';
  const issues = manifest.issues.slice(0, 8).map(issue => issue.message).join('；');
  const moreIssues = manifest.issues.length > 8 ? `；另有 ${manifest.issues.length - 8} 项` : '';
  const pageNameById = new Map(manifest.pages.map(page => [page.id, page.name]));
  const relations = businessPages.filter(page => page.outgoingPageIds.length > 0).slice(0, 24)
    .map(page => `${page.name} → ${page.outgoingPageIds.map(id => pageNameById.get(id) ?? `缺失(${id})`).join('、')}`);
  const relationSummary = relations.length ? `\n页面跳转关系：${relations.join('；')}${businessPages.filter(page => page.outgoingPageIds.length > 0).length > relations.length ? '；其他关系省略' : ''}` : '\n页面跳转关系：尚未定义';
  const classified = businessPages.filter(page => page.pageGroup || page.stateLabel || page.audienceRole || page.basedOnScreenId).slice(0, 16)
    .map(page => `${page.name}${page.pageGroup ? ` [${page.pageGroup}]` : ''}${page.stateLabel ? ` 状态:${page.stateLabel}` : ''}${page.audienceRole ? ` 角色:${page.audienceRole}` : ''}${page.basedOnScreenId ? ` 候选来源:${pageNameById.get(page.basedOnScreenId) ?? page.basedOnScreenId}` : ''}`);
  const classificationSummary = `\n静态页面分类：${classified.join('；') || '未标注'}${businessPages.filter(page => page.pageGroup || page.stateLabel || page.audienceRole || page.basedOnScreenId).length > classified.length ? '；其他标注省略' : ''}。分类只用于设计上下文，不代表运行态权限或状态机。`;
  const components = manifest.components.slice(0, 16).map(component => `${component.name} v${component.version}`).join('、') || '暂无组件';
  const moreComponents = manifest.components.length > 16 ? `（另有 ${manifest.components.length - 16} 个）` : '';
  const interactionPages = businessPages.filter(page => page.interactions.length > 0).slice(0, 12).map(page => {
    const controls = page.interactions.slice(0, 8).map(item => `${item.kind}:${item.label}${item.stateSignals.length ? `[${item.stateSignals.join(',')}]` : ''}`).join('、');
    const more = page.interactions.length > 8 ? `，另有 ${page.interactions.length - 8} 个` : '';
    return `${page.name}(${page.interactions.length}项：${controls}${more})`;
  });
  const interactionSummary = `\n页面交互清单：${interactionPages.join('；') || '尚未识别到按钮、导航或表单控件'}。请保持未授权的既有交互与状态表达。`;
  const formPages = businessPages.filter(page => page.forms.length > 0).slice(0, 8).map(page => {
    const summaries = page.forms.slice(0, 2).map(form => {
      const fields = form.fields.slice(0, 5).map(field => `${field.name}:${field.label}/${field.type}${field.required ? '必填' : ''}`).join('、') || '无字段';
      const moreFields = form.fields.length > 5 ? `，另有 ${form.fields.length - 5} 个字段` : '';
      const submits = form.submitActions.slice(0, 2).map(action => action.label).join('、') || '未定义提交动作';
      const moreSubmits = form.submitActions.length > 2 ? `，另有 ${form.submitActions.length - 2} 个动作` : '';
      return `${form.label}(${form.method}${form.action ? ` ${form.action}` : ''}；字段 ${fields}${moreFields}；提交 ${submits}${moreSubmits})`;
    }).join('；');
    return `${page.name}：${summaries}${page.forms.length > 2 ? `；另有 ${page.forms.length - 2} 个表单` : ''}`;
  });
  const formSummary = `\n表单契约：${formPages.join('；') || '尚未识别到表单'}${businessPages.filter(page => page.forms.length > 0).length > formPages.length ? '；其余页面表单省略' : ''}。这是 HTML 结构信息，不代表业务提交已实现。`;
  const styleAssets = businessPages.filter(page => page.scopedStyleAsset).slice(0, 12)
    .map(page => `${page.name}:${page.scopedStyleAsset!.id} v${page.scopedStyleAsset!.version} #${page.scopedStyleAsset!.fingerprint}(${page.scopedStyleAsset!.source})`);
  const styleAssetSummary = `\n页面样式资产：${styleAssets.join('；') || '未拆分独立 scoped CSS 资产'}。`;
  const designSystem = manifest.designSystem ? `\n设计系统：${manifest.designSystem.name} [${manifest.designSystem.id}]，Token v${manifest.designSystem.tokenVersion}，指纹 ${manifest.designSystem.tokenFingerprint}，来源 ${manifest.designSystem.origin}。` : '';
  const designLibrary = manifest.designLibrary ? `\n设计库${manifest.designLibrary.mode==='pinned_reference'?'固定版本只读参考':'项目副本'}：${manifest.designLibrary.sourceName} [${manifest.designLibrary.sourceProjectId}]，源指纹 ${manifest.designLibrary.sourceFingerprint}，源 Token v${manifest.designLibrary.sourceTokenVersion}；${manifest.designLibrary.mode==='pinned_reference'?'使用本地缓存，Token 和库定义只读，需显式更新，页面实例可独立修改':'组件已复制进当前工程，修改不会回写源工程'}。` : '';
  return `### PROJECT MAP\n工程「${manifest.project.name}」(${manifest.project.deviceProfile})：${pageNames}${morePages}；组件 ${manifest.components.length} 个（${components}${moreComponents}）；资源 ${manifest.assets.length} 个。${relationSummary}${classificationSummary}${interactionSummary}${formSummary}${styleAssetSummary}${designSystem}${designLibrary}\n页面关系与工程清单仅作为上下文，不能把引用页面当成修改目标。${issues ? `\n清单检查提示：${issues}${moreIssues}` : ''}`;
}
