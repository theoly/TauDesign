import { beforeEach, describe, expect, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
import { normalizeMobileNavigation } from '../src/utils/mobileNavigation';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { getFewShotExample } from '../src/services/ai/aestheticRules';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import type { AIProviderConfig } from '../src/types/provider';

const source = '<main data-nid="root0001"><div class="status-bar" data-nid="status01">9:41</div><nav class="appbar" data-nid="nav00001"><button aria-label="返回">‹</button><span class="appbar-title">订单</span></nav><article data-nid="body0001"><h1>订单详情</h1><button class="btn btn-primary" data-nid="submit01">确认订单</button></article></main>';
const provider: AIProviderConfig = { id: 'nav-test', name: 'test', protocol: 'openai_compatible', baseUrl: 'https://example.com/v1', apiKey: '', isEnabled: true };
beforeEach(() => {
  localStorage.clear(); useProjectStore.getState().initNewProject({ name: '导航测试', deviceProfile: 'mobile', designSystem: structuredClone(defaultTheme) });
  useHistoryStore.getState().restore(null);
});
describe('移动导航：持久化与生成管道', () => {
  test('缺省关闭、开关可撤销和重做，重载兼容旧工程，PC不切换', () => {
    const store = useProjectStore.getState();
    expect(store.settings.useCustomNavigation).toBe(false);
    store.setUseCustomNavigation(true); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
    expect(useHistoryStore.getState().past.length).toBe(1);
    useHistoryStore.getState().undo(); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    useHistoryStore.getState().redo(); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
    const data = { ...useProjectStore.getState(), settings: { ...store.settings, useCustomNavigation: true } };
    store.loadProject(JSON.stringify(data)); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
    delete (data.settings as any).useCustomNavigation;
    store.loadProject(JSON.stringify(data)); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    store.initNewProject({ name: 'PC', deviceProfile: 'pc' }); useHistoryStore.getState().restore(null);
    store.setUseCustomNavigation(true); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    expect(useHistoryStore.getState().past.length).toBe(0);
  });
  test('新增/更新清理顶部栏，标题记录，读取旧工程与仅测量高度不重写正文', () => {
    const store = useProjectStore.getState();
    const id = store.addScreen({ name: '订单页', htmlContent: source });
    const created = useProjectStore.getState().screens[id];
    expect(created.htmlContent).not.toContain('class="appbar"'); expect(created.metadata?.navigationTitle).toBe('订单');
    expect(created.htmlContent).toContain('确认订单');
    store.updateScreen(id, { htmlContent: source.replace('订单详情', '订单信息') });
    expect(useProjectStore.getState().screens[id].htmlContent).not.toContain('class="status-bar"');
    const data = { ...useProjectStore.getState(), screens: { [id]: { ...created, htmlContent: source } } };
    store.loadProject(JSON.stringify(data)); expect(useProjectStore.getState().screens[id].htmlContent).toBe(source);
    store.updateScreen(id, { measuredHeight: 900 }); expect(useProjectStore.getState().screens[id].htmlContent).toBe(source);
  });
  test('导入自定义设置和页面一次提交，撤销恢复默认；自定义导航被处理', () => {
    const store = useProjectStore.getState();
    const id = store.importHtmlScreen({ name: '导入订单', htmlContent: source, metadata: { importedHtml: { fileName: 'order.html', mode: 'preserve', categories: [], changes: [], retained: [], version: 1 } } }, { projectId: store.id, useCustomNavigation: true });
    expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
    expect(useProjectStore.getState().screens[id].htmlContent).toContain('class="appbar"');
    expect(useProjectStore.getState().screens[id].htmlContent).not.toContain('class="status-bar"');
    expect(useHistoryStore.getState().past.length).toBe(1);
    useHistoryStore.getState().undo(); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    expect(useProjectStore.getState().screens[id]).toBeUndefined();
    useHistoryStore.getState().redo(); expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
  });
  test('候选清理保留导航标题，采纳不丢节点身份且可撤销', () => {
    const store = useProjectStore.getState();
    const id = store.addScreen({ name: '原页', htmlContent: '<main><p>正文</p></main>' });
    store.stageScreenChange(id, '<main><nav class="appbar"><span class="appbar-title">详情</span></nav><p>正文</p></main>', '新方案');
    expect(useProjectStore.getState().stagedScreen?.newHtml).not.toContain('class="appbar"');
    expect(useProjectStore.getState().stagedScreen?.navigationTitle).toBe('详情');
    const before = useProjectStore.getState().screens[id];
    store.adoptStagedChange();
    const after = useProjectStore.getState().screens[id];
    expect(after.metadata?.navigationTitle).toBe('详情'); expect(after.htmlContent).toContain('data-nid=');
    useHistoryStore.getState().undo(); expect(useProjectStore.getState().screens[id]).toEqual(before);
  });
  test('默认与自定义Prompt/范例一致，参考图也遵循策略', () => {
    for (const intent of ['create_screen', 'modify_screen'] as const) for (const hasAttachment of [false, true]) {
      const options = { designSystem: defaultTheme, deviceProfile: 'mobile' as const, frameWidth: 390, intent, hasAttachment };
      const standard = PromptBuilder.buildSystemPrompt(options);
      expect(standard).toContain('WECHAT NATIVE NAVIGATION'); expect(standard).toContain('页面产物只输出业务内容');
      expect(standard).not.toContain('MUST begin with a separate .status-bar');
      expect(PromptBuilder.buildSystemPrompt({ ...options, useCustomNavigation: true })).toContain('CUSTOM MOBILE NAVIGATION ENABLED');
    }
    expect(getFewShotExample('mobile')).not.toContain('class="appbar"');
    expect(getFewShotExample('mobile', true)).toContain('class="appbar"');
  });
  test('完整性与活动内容检查先于清理，删除主按钮仍然拦截', async () => {
    for (const raw of [source.replace('</main>', ''), source.replace('9:41', '9:41<script>alert(1)</script>')]) {
      const transport = new MockTransport(); transport.queueResponse('```html\n' + raw + '\n```');
      const output = await PipelineExecutor.execute({ input: { rawPrompt: '创建订单页' }, provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport),
        screens: {}, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: 'test' });
      expect(output.status).toBe('rejected_by_quality');
    }
    const clean = normalizeMobileNavigation(source, { deviceProfile: 'mobile' }).html;
    const deleted = clean.replace('<button class="btn btn-primary" data-nid="submit01">确认订单</button>', '');
    expect(checkGenerationQuality(deleted, { deviceProfile: 'mobile', baselineHtml: source }).passed).toBe(false);
  });
  test('默认忽略导航自身文案问题，自定义开启后仍检查其操作', async () => {
    const input = source.replace('<button aria-label="返回">‹</button>', '<button class="btn btn-primary"></button>');
    for (const useCustomNavigation of [false, true]) {
      const transport = new MockTransport(); transport.queueResponse('```html\n' + input + '\n```');
      const output = await PipelineExecutor.execute({ input: { rawPrompt: '创建订单页' }, provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport),
        screens: {}, deviceProfile: 'mobile', useCustomNavigation, frameWidth: 390, baseSystemPrompt: 'test' });
      expect(output.status).toBe(useCustomNavigation ? 'rejected_by_quality' : 'applied');
    }
  });
  test('自定义导航仍受L4保护，不能借默认清理绕开检查', async () => {
    const transport = new MockTransport();
    transport.queueResponse('```html\n' + source.replace('class="appbar"', 'class="appbar bg-surface-alt"') + '\n```');
    const output = await PipelineExecutor.execute({ input: { rawPrompt: '优化颜色', activeScreenId: 'page' }, provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport),
      screens: { page: { id: 'page', name: '订单', htmlContent: source } }, deviceProfile: 'mobile', useCustomNavigation: true, protectedNids: ['nav00001'], frameWidth: 390, baseSystemPrompt: 'test' });
    expect(output.status).toBe('rejected_by_quality');
    expect(output.qualityReport?.findings.some(finding => finding.code === 'protected_style_changed')).toBe(true);
  });
  test('移动端新建清理来源顶部，修改旧页用业务正文基准；自定义保留导航', async () => {
    for (const custom of [false, true]) {
      const transport = new MockTransport(); transport.queueResponse('```html\n' + source + '\n```');
      const output = await PipelineExecutor.execute({ input: { rawPrompt: '创建订单页' }, provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport),
        screens: {}, deviceProfile: 'mobile', useCustomNavigation: custom, frameWidth: 390, baseSystemPrompt: 'test' });
      expect(output.status).toBe('applied'); expect(output.extractedHtml).not.toContain('class="status-bar"');
      expect(output.extractedHtml?.includes('class="appbar"')).toBe(custom);
    }
    const transport = new MockTransport(); transport.queueResponse('```html\n' + normalizeMobileNavigation(source, { deviceProfile: 'mobile' }).html + '\n```');
    const output = await PipelineExecutor.execute({ input: { rawPrompt: '优化页面颜色', activeScreenId: 'page' }, provider, model: 'mock', engineCore: new DefaultAIEngineCore(transport),
      screens: { page: { id: 'page', name: '订单', htmlContent: source } }, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: 'test' });
    expect(output.status).toBe('staged_side_by_side');
  });
});
