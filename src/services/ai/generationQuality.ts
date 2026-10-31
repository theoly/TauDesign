import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import type { DesignSystem } from '../../types/designSystem';
import type { DeviceProfile } from '../../styles/baseCss';
import { TokenLintEngine, type TokenLintContext } from '../../utils/tokenLint';
import { parseHtmlCopy } from '../../utils/htmlDocument';
import { techBlueTheme } from '../../utils/themePresets';
import { inspectActionIntegrity } from './actionIntegrity';
import { htmlIsComplete } from '../../utils/htmlCompleteness';
import {inspectFormRuleChanges} from './formBehaviorChanges';

export interface QualityFinding {
  code: string;
  severity: 'error' | 'warning';
  nid?: string;
  actual: string;
  expected: string;
  message: string;
}
export interface QualityReport { passed: boolean; findings: QualityFinding[] }
export interface QualityOptions {
  deviceProfile?: DeviceProfile;
  useCustomNavigation?: boolean;
  designSystem?: DesignSystem;
  baselineHtml?: string;
  protectedNids?: string[];
  preserveNids?: boolean;
  modificationRequest?: string;
  tokenLintContext?: TokenLintContext;
  formRuleRoots?:string[];
}

/** 所有生产入口共用；离线DOM检查不冒充像素或光学验收，不自动改写结果。 */
export function checkGenerationQuality(html: string, options: QualityOptions = {}): QualityReport {
  options = { ...options, baselineHtml: options.baselineHtml ? normalizeMobileNavigation(options.baselineHtml, options).html : undefined };
  const { doc } = parseHtmlCopy(html);
  const elements = Array.from(doc.querySelectorAll('*'));
  // template内容不会被querySelectorAll遍历，但仍必须检查其中潜在的活动内容。
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    if (element.tagName.toLowerCase() === 'template') elements.push(...Array.from((element as HTMLTemplateElement).content.querySelectorAll('*')));
  }
  const findings: QualityFinding[] = [];
  if(options.baselineHtml&&options.modificationRequest)for(const finding of inspectFormRuleChanges(options.baselineHtml,html,options.modificationRequest,options.formRuleRoots))findings.push({code:'form_rule_not_applied',severity:'error',...finding});
  if (!htmlIsComplete(html)) findings.push({ code: 'incomplete_html', severity: 'error', message: '页面HTML未完整结束或标签嵌套损坏，不能采纳浏览器自动补全后的残缺页面。', actual: '存在未完成的标签、属性、文本容器或必需闭合标签', expected: '重新生成完整页面；原页面保持不变' });
  const byNid = new Map<string, Element>();
  const add = (el: Element, code: string, severity: QualityFinding['severity'], message: string, actual: string, expected: string) =>
    findings.push({ code, severity, nid: el.getAttribute('data-nid') || undefined, actual, expected, message });
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const nid = el.getAttribute('data-nid');
    if (nid) {
      if (byNid.has(nid)) add(el, 'duplicate_nid', 'error', '节点标识重复，无法安全定位修改。', nid, '唯一data-nid');
      else byNid.set(nid, el);
    }
    if (['script', 'iframe', 'object', 'embed', 'base'].includes(tag) || (tag === 'meta' && el.hasAttribute('http-equiv'))) {
      add(el, 'active_content', 'error', '生成页面包含不允许的活动内容。', tag, '静态HTML与受控资源');
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) add(el, 'event_handler', 'error', '生成页面包含内联事件。', name, '无脚本或内联事件');
      if (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name)) {
        const value = attr.value.replace(/[\s\u0000-\u001f\u007f]/g, '').toLowerCase();
        if (/^(javascript|vbscript):/.test(value) || value.startsWith('data:text/html')) add(el, 'unsafe_url', 'error', '资源或链接使用了不允许的协议。', name, '普通链接或受控图片资源');
      }
    }
    if (['badge', 'badge-soft', 'tag', 'btn'].some(c => el.classList.contains(c))) {
      if (el.querySelector('br')) add(el, 'component_line_break', 'warning', '按钮或标签包含强制换行，建议让整项换行。', '<br>', '完整单行文案');
      if (el.classList.contains('flex-1') && !el.classList.contains('btn')) add(el, 'compressed_label', 'warning', '标签使用等分伸缩，长文案可能被挤压。', 'flex-1', '标签自身不压缩，父组wrap');
    }
    if (tag === 'svg' && el.closest('.btn, .badge, .badge-soft, .tag, .icon-box, .input-group') && !el.classList.contains('icon') && !el.hasAttribute('width') && !el.hasAttribute('height')) {
      add(el, 'unbounded_icon', 'warning', '组件内SVG缺少明确尺寸；若为功能图标请使用icon。', 'svg无尺寸', 'icon或明确内容SVG几何');
    }
  }
  for (const issue of TokenLintEngine.scan(html, options.designSystem ?? techBlueTheme, options.deviceProfile, options.tokenLintContext).issues) {
    findings.push({ code: issue.issueType, severity: 'warning', nid: issue.nid === 'unknown' ? undefined : issue.nid,
      message: issue.description, actual: issue.rawSnippet, expected: issue.suggestedFix });
  }
  if (options.baselineHtml) {
    const original = parseHtmlCopy(options.baselineHtml).doc;
    for (const el of Array.from(original.querySelectorAll('[data-nid]'))) {
      const nid = el.getAttribute('data-nid')!;
      const next = byNid.get(nid);
      if (options.preserveNids && (!next || el.tagName !== next.tagName)) {
        add(el, 'identity_changed', 'error', '润色结果丢失或替换了原节点标识。', nid, '保留原节点身份');
      }
      if (options.protectedNids?.includes(nid) && (!next || ['class', 'style'].some(attr => el.getAttribute(attr) !== next.getAttribute(attr)))) {
        add(el, 'protected_style_changed', 'error', '结果改动了受手动样式保护的节点。', nid, '保留手动覆盖节点的class与style');
      }
    }
  }
  findings.push(...inspectActionIntegrity(doc, options.baselineHtml ? parseHtmlCopy(options.baselineHtml).doc : undefined, options.modificationRequest));
  return { passed: !findings.some(f => f.severity === 'error'), findings };
}

export function qualitySummary(report: QualityReport): string {
  const errors = report.findings.filter(f => f.severity === 'error');
  const ordered = errors.length ? errors : report.findings;
  return ordered.slice(0, 4).map(f => `${f.nid ? `[${f.nid}] ` : ''}${f.message}`).join('；')
    + (ordered.length > 4 ? `；另有${ordered.length - 4}项${errors.length?'阻断问题':'提示'}` : '');
}

/** Validate raw source before DOM normalization; business/action checks run on the retained content. */
export function checkGenerationSourceSafety(html: string, options: QualityOptions = {}): QualityReport {
  const safetyCodes = new Set(['incomplete_html', 'duplicate_nid', 'active_content', 'event_handler', 'unsafe_url']);
  const findings = checkGenerationQuality(html, options).findings.filter(finding => safetyCodes.has(finding.code));
  return { passed: !findings.some(finding => finding.severity === 'error'), findings };
}
