import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import { COMPONENT_CONTRACTS, renderProjectComponents, renderComponentContracts } from '../src/services/ai/componentContracts';
import { PromptBuilder, extractSectionOrder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import { acceptRestyleResult } from '../src/services/ai/restyleService';
import { applyLocalCopyEdits } from '../src/services/ai/localCopyModification';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { techBlueTheme } from '../src/utils/themePresets';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { QualityReportCard } from '../src/components/chat/QualityReportCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const provider = { id: 'mock', name: 'Mock', protocol: 'openai_compatible' as const, baseUrl: 'http://localhost', apiKey: 'test', enabled: true, models: [] };
const component = { id: 'shared', name: '完整组件', templateHtml: `<article class="card"><h2>完整标题</h2><p>${'长文案'.repeat(100)}</p><button class="btn">末尾操作</button></article>`, createdAt: 0, updatedAt: 0 };
const target = { kind: 'screen' as const, id: 's1', name: '原页面', html: '<main data-nid="root"><p data-nid="text" class="text-sm">保留文案</p></main>', protectedNids: ['text'] };
async function pipeline(html: string, modify = false) {
  const transport = new MockTransport(); transport.queueResponse(`<artifact identifier="candidate" type="screen" title="候选">${html}</artifact>`);
  return PipelineExecutor.execute({
    input: { rawPrompt: modify ? '调整原页面样式' : '新建页面', activeScreenId: modify ? target.id : null,
      decision: { intent: modify ? 'modify_screen' : 'create_screen', targetScreenId: modify ? target.id : null, reason: 'test' } },
    provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport), screens: { s1: { ...target, htmlContent: target.html } },
    deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: '', designSystem: techBlueTheme, protectedNids: modify ? target.protectedNids : []
  });
}

describe('设计上下文与组件结构参考', () => {
  for (const device of ['mobile', 'pc'] as const) {
    test(`${device}: 所有组件范例均为合法白名单，功能图标有边界`, () => {
      for (const contract of COMPONENT_CONTRACTS) {
        expect(TokenLintEngine.scan(contract.html, techBlueTheme, device).issues).toEqual([]);
        expect(checkGenerationQuality(contract.html, { deviceProfile: device }).findings).toEqual([]);
      }
    });
    test(`${device}: 新建/修改/润色共用设计规范、Token、组件、规则及决策`, () => {
      const base = { designSystem: techBlueTheme, deviceProfile: device, frameWidth: device === 'pc' ? 1440 : 390,
        colorMode: 'dark' as const, designProseMarkdown: '# 项目品牌\n遵循项目唯一品牌', components: [component],
        designRules: ['地址完整显示'], decisions: [{ id: 'd1', rule: '沿用紧凑布局', rationale: '一致性' }] };
      const prompts = [PromptBuilder.buildSystemPrompt({ ...base, intent: 'create_screen' }), PromptBuilder.buildSystemPrompt({ ...base, intent: 'modify_screen' }), buildPolishPrompt(base)];
      for (const prompt of prompts) {
        for (const content of ['遵循项目唯一品牌', 'DARK', '末尾操作', '地址完整显示', '沿用紧凑布局', 'CRAFT REFERENCES']) expect(prompt).toContain(content);
        expect(extractSectionOrder(prompt).at(-1)).toBe('output_contract');
      }
      expect(prompts[2]).toContain('STRUCTURAL CONTRACT');
      expect(prompts[2]).not.toContain('<artifact identifier=');
      expect(prompts[2]).not.toContain('REFERENCE EXAMPLE');
    });
  }
  test('组件按任务选择完整范例；参考图与修改不强加新结构', () => {
    expect(renderComponentContracts(true, '人物会员')).toContain(COMPONENT_CONTRACTS[0].html);
    expect(renderComponentContracts(true, '统计看板')).toContain(COMPONENT_CONTRACTS[3].html);
    expect(renderComponentContracts(false)).not.toContain('```html');
    const prompt = PromptBuilder.buildSystemPrompt({ designSystem: techBlueTheme, deviceProfile: 'mobile', frameWidth: 390, hasAttachment: true });
    expect(prompt).not.toContain(COMPONENT_CONTRACTS[0].html);
  });
  test('完整项目模板不截断；超预算整项省略并说明，不丢后续小组件', () => {
    expect(renderProjectComponents([component])).toContain(component.templateHtml);
    const short = { ...component, id: 'short', templateHtml: '<button class="btn">短组件</button>' };
    const text = renderProjectComponents([component, short], 180);
    expect(text).not.toContain('<article'); expect(text).toContain(short.templateHtml); expect(text).toContain('1个组件超出');
  });
});

describe('统一离线质量检查', () => {
  for (const html of ['<script>alert(1)</script>', '<button onclick="x()">按钮</button>', '<a href="java&#x73;cript:alert(1)">链接</a>', '<template><img onerror="x()"></template>', '<p data-nid="a">A</p><p data-nid="a">B</p>']) {
    test(`拒绝活动内容或重复标识 ${html.slice(0, 35)}`, () => expect(checkGenerationQuality(html).passed).toBe(false));
  }
  test('转义文本、合法SVG和图片不会被当成活动内容', () => {
    const report = checkGenerationQuality('<p>&lt;script&gt;示例&lt;/script&gt;</p><svg class="icon" viewBox="0 0 24 24"><path d="M1 1h8"/></svg><img src="data:image/png;base64,AA==">');
    expect(report.findings).toEqual([]);
  });
  test('Token及组件风险定位到nid并给建议，警告不阻断', () => {
    const report = checkGenerationQuality('<span data-nid="tag1" class="tag flex-1 unknown" style="color:var(--color-primary);background:#fff">长标签<br>换行</span>');
    expect(report.passed).toBe(true);
    for (const code of ['compressed_label', 'component_line_break', 'unknown_class', 'literal_color']) expect(report.findings.some(f => f.code === code && f.nid === 'tag1' && f.expected)).toBe(true);
    expect(renderToStaticMarkup(<QualityReportCard report={report} />)).toContain('[tag1]');
  });
  test('润色保留节点身份及手动样式；文案漂移沿用报告策略', () => {
    expect(acceptRestyleResult(target, target.html.replace('data-nid="text"', 'data-nid="other"')).status).toBe('failed');
    expect(acceptRestyleResult(target, target.html.replace('text-sm', 'text-xl')).status).toBe('failed');
    const drift = acceptRestyleResult(target, target.html.replace('保留文案', '年度统计'));
    expect(drift.status).toBe('applied'); expect(drift.message).toContain('文案变化');
  });
  test('主生成入口对新建和修改阻断危险内容，不产生可放行候选', async () => {
    for (const modify of [false, true]) {
      const output = await pipeline('<main><button onclick="bad()">危险按钮</button></main>', modify);
      expect(output.status).toBe('rejected_by_quality'); expect(output.qualityReport?.passed).toBe(false);
      expect(output.stagedScreen).toBeUndefined(); expect(output.extractedHtml).toBeUndefined(); expect(output.changeSet).toBeUndefined();
    }
  });
  test('主流程保留警告报告，手动覆盖冲突拒绝', async () => {
    const warning = await pipeline('<main><span class="tag flex-1">长标签</span></main>');
    expect(warning.status).toBe('applied'); expect(warning.qualityReport?.findings[0].code).toBe('compressed_label');
    const rejected = await pipeline(target.html.replace('text-sm', 'text-xl'), true);
    expect(rejected.status).toBe('rejected_by_quality'); expect(rejected.qualityReport?.findings.some(f => f.code === 'protected_style_changed')).toBe(true);
  });
  test('润色/批量接受函数与局部副本也拒绝危险内容', () => {
    expect(acceptRestyleResult(target, target.html.replace('<p ', '<p onclick="bad()" ')).status).toBe('failed');
    const html = `<main><p data-nid="text">原标题</p><script>bad()</script>${'<p>其他内容</p>'.repeat(12)}</main>`;
    expect(() => applyLocalCopyEdits(html, [{ nid: 'text', type: 'set_text', value: '新标题' }], { device: 'mobile' })).toThrow();
    const clean = html.replace('<script>bad()</script>', '');
    expect(applyLocalCopyEdits(clean, [{ nid: 'text', type: 'set_text', value: '新标题' }], { device: 'mobile' }).qualityReport.passed).toBe(true);
  });
});

describe('DOM TokenLint与安全样式修复', () => {
  test('文本中的HTML示例不误报，未分配nid的节点独立计数', () => {
    const report = TokenLintEngine.scan('<p>&lt;span class="fake"&gt;示例&lt;/span&gt;</p><span class="fake-one">A</span><span class="fake-two">B</span>', techBlueTheme);
    expect(report.totalNodes).toBe(3); expect(report.compliantNodes).toBe(1); expect(report.issues).toHaveLength(2);
  });
  test('自动修复只改声明，保留子树/SVG/文本/优先级与完整文档', () => {
    const html = '<!doctype html><html lang="zh"><head><title>保留</title></head><body><div data-nid="x" style="color:#f00!important;border-radius:9px"><span>示例 color: #f00; border-radius: 9px</span><svg viewBox="0 0 24 24"><path d="M1 1h8"/></svg></div></body></html>';
    const fixed = TokenLintEngine.autoFix(html); const doc = new DOMParser().parseFromString(fixed, 'text/html');
    expect(fixed.toLowerCase()).toContain('<!doctype html>'); expect(doc.documentElement.lang).toBe('zh');
    expect(doc.title).toBe('保留'); expect(doc.querySelector('span')?.textContent).toBe('示例 color: #f00; border-radius: 9px');
    expect(doc.querySelector('path')?.getAttribute('d')).toBe('M1 1h8');
    expect(doc.querySelector('div')!.style.getPropertyValue('border-radius')).toBe('var(--radius-md)');
    expect(doc.querySelector('div')!.style.getPropertyPriority('color')).toBe('important');
  });
});


describe('质量报告与实际应用边界', () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({ name: '质量检查', deviceProfile: 'mobile', designSystem: techBlueTheme, createSpecimen: false });
    useAIConfigStore.setState({ providers: defaultProviders.map(p => p.id === 'prov-deepseek' ? { ...p, apiKey: 'test' } : p), bindings: defaultBindings });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  test('对话拒绝质量错误时不新建、不暂存，也不提供强制放行HTML', async () => {
    const rejected = await pipeline('<main><button onclick="bad()">危险</button></main>');
    const executor = spyOn(PipelineExecutor, 'execute').mockResolvedValue(rejected);
    let engine!: ReturnType<typeof useAIEngineChat>;
    function Harness() { engine = useAIEngineChat(); return null; }
    try {
      await act(async () => { root.render(<Harness />); });
      await act(async () => { await engine.sendMessage('新建一个客户列表页面'); });
      expect(executor).toHaveBeenCalledTimes(1);
      expect(useProjectStore.getState().screenOrder).toHaveLength(0);
      expect(useProjectStore.getState().stagedScreen).toBeNull();
      const response = engine.messages.at(-1)!;
      expect(response.isError).toBe(true); expect(response.qualityReport?.passed).toBe(false);
      expect(response.htmlOutput).toBeUndefined(); expect(response.isGuardRejected).not.toBe(true);
    } finally { executor.mockRestore(); }
  });
  test('单页润色等候选路径在对比栏显示警告，错误候选不能采纳', async () => {
    const id = useProjectStore.getState().addScreen({ name: '原页', htmlContent: '<main>原页</main>' });
    const baseline = useProjectStore.getState().screens[id].htmlContent;
    useProjectStore.getState().stageScreenChange(id, '<main><span data-nid="tag1" class="tag flex-1">待回访</span></main>', '候选');
    await act(async () => { root.render(<InfiniteCanvas />); });
    expect(host.textContent).toContain('设计检查提示');
    expect(host.textContent).toContain('[tag1]');
    let adopt = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('采纳新版'))!;
    expect(adopt.disabled).toBe(true); // 等待当前候选的渲染检查
    act(() => useProjectStore.getState().setStagedRenderQuality(useProjectStore.getState().getStagedRenderContextKey(), { status: 'complete', findings: [], inspected: 1 }));
    expect(adopt.disabled).toBe(false);
    act(() => { useProjectStore.getState().stageScreenChange(id, '<main><button onclick="bad()">不安全</button></main>', '拒绝候选'); });
    expect(host.textContent).toContain('结果未通过检查');
    adopt = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('采纳新版'))!;
    expect(adopt.disabled).toBe(true);
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(baseline);
  });
});
