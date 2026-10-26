import { describe, expect, test } from 'bun:test';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import { applyLocalCopyEdits } from '../src/services/ai/localCopyModification';
import { analyzePipelineIntent } from '../src/services/ai/engine/pipeline/interceptors/intentInterceptor';
import { checkStructureIntegrity } from '../src/services/ai/engine/pipeline/interceptors/guardInterceptor';
import type { PipelineContext } from '../src/services/ai/engine/pipeline/types';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { defaultProviders } from '../src/stores/useAIConfigStore';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { finalizeModelHtml } from '../src/services/ai/modelHtmlResult';

const before = '<main data-nid="root"><section data-nid="sheet"><p data-nid="detail">合同核销规则</p></section><footer data-nid="footer"><button data-nid="save" class="btn">暂存</button><button data-nid="submit" class="btn btn-primary"><svg class="icon"><path d="M1 1"/></svg><span data-nid="label">提交并核销 1 次合同约见权益</span></button></footer></main>';
const blank = '<main data-nid="root"><section data-nid="sheet"><p data-nid="detail">合同核销规则</p></section><footer data-nid="footer"><button data-nid="save" class="btn">暂存</button><button data-nid="submit" class="btn btn-primary"><svg class="icon"><path d="M1 1"/></svg><span data-nid="label"></span></button></footer></main>';
const shortened = before.replace('提交并核销 1 次合同约见权益', '提交并核销权益');
const context = (prompt: string): PipelineContext => ({ input: { rawPrompt: prompt, activeScreenId: 's1' }, intent: 'modify_screen', intentReason: 'test', hasExplicitStructuralChangeIntent: false,
  targetScreen: { id: 's1', name: '回访', htmlContent: before, isSkeleton: false }, referencedScreens: [], unmatchedMentions: [], activeRules: [], activeDecisions: [], assembledMessages: [], estimatedChars: 0, isContextTrimmed: false, warnings: [] });

describe('修改后的操作完整性', () => {
  test('结构未变但主按钮文字被清空不能通过质量检查', () => {
    const report = checkGenerationQuality(blank, { baselineHtml: before });
    expect(report.passed).toBe(false);
    expect(report.findings.some(f => f.code === 'action_label_lost' && f.nid === 'submit' && f.severity === 'error')).toBe(true);
  });
  test('结构重排授权不等于删除主操作，换节点标识也不能逃过比较', () => {
    const missing = '<main data-nid="root"><section><button class="btn">暂存</button></section></main>';
    expect(checkGenerationQuality(missing, { baselineHtml: before, modificationRequest: '重构底部抽屉为sheet' }).passed).toBe(false);
  });
  test('非空缩短按钮文案合法，明确删除该主按钮才放行删除', () => {
    expect(checkGenerationQuality(shortened, { baselineHtml: before }).passed).toBe(true);
    const removed = '<main><button class="btn">暂存</button></main>';
    expect(checkGenerationQuality(removed, { baselineHtml: before, modificationRequest: '删除主按钮，保留暂存按钮' }).passed).toBe(true);
    expect(checkGenerationQuality(removed, { baselineHtml: before, modificationRequest: '删除说明区，保留提交按钮' }).passed).toBe(false);
    expect(checkGenerationQuality(removed, { baselineHtml: before, modificationRequest: '不要删除主按钮' }).passed).toBe(false);
  });
  test('重排后非空主按钮可匹配；独立图标按钮不误报，但aria-label不能掩盖可见文案丢失', () => {
    expect(checkGenerationQuality('<div><button class="btn">暂存</button><button class="btn btn-primary">提交并核销权益</button></div>', { baselineHtml: before }).passed).toBe(true);
    expect(checkGenerationQuality('<button class="btn btn-primary" aria-label="提交"><svg class="icon"></svg></button>').passed).toBe(true);
    expect(checkGenerationQuality('<input type="submit">').passed).toBe(true);
    expect(checkGenerationQuality(blank.replace('<button data-nid="submit"', '<button aria-label="提交" data-nid="submit"'), { baselineHtml: before }).passed).toBe(false);
  });
  test('隐藏弹层原有控件不构成当前必需操作，纯图标有可访问名称时合法', () => {
    const hidden = '<section hidden><button class="btn btn-primary">弹层提交</button></section><button aria-label="返回"><svg class="icon"></svg></button>';
    expect(checkGenerationQuality('<button aria-label="返回"><svg class="icon"></svg></button>', { baselineHtml: hidden }).passed).toBe(true);
  });
  test('局部副本set_text也不能清空按钮标签，短文案正常保留其他内容', () => {
    expect(() => applyLocalCopyEdits(before, [{ nid: 'label', type: 'set_text', value: '' }], { device: 'mobile' })).toThrow('操作');
    const result = applyLocalCopyEdits(before, [{ nid: 'label', type: 'set_text', value: '提交并核销权益' }], { device: 'mobile' });
    expect(result.html).toContain('提交并核销权益'); expect(result.html).toContain('合同核销规则');
  });
  test('确认包装的空用户补充不能授予整页结构改动', () => {
    expect(analyzePipelineIntent({ rawPrompt: '仅优化按钮配色。\n用户补充：无', activeScreenId: 's1' }).hasExplicitStructuralChangeIntent).toBe(false);
    expect(analyzePipelineIntent({ rawPrompt: '用户补充：增加手机号字段', activeScreenId: 's1' }).hasExplicitStructuralChangeIntent).toBe(true);
  });
  test('引用节点仅允许改目标子树，目标之外的删除不能全页放行', () => {
    const c = context('[引用元素 nid="sheet"] 优化抽屉布局');
    const inside = before.replace('<p data-nid="detail">合同核销规则</p>', '<article><p data-nid="detail">合同核销规则</p></article>');
    expect(checkStructureIntegrity(c, inside).passed).toBe(true);
    expect(checkStructureIntegrity(c, '<main data-nid="root"><section data-nid="sheet"><p>新内容</p></section></main>').passed).toBe(false);
  });
  test('真实Pipeline遇到CTA丢失时拒绝，不能靠重构关键词得到可采纳候选', async () => {
    const transport = new MockTransport(); transport.queueResponse(`<artifact type="screen" identifier="s1">${blank}</artifact>`);
    const result = await PipelineExecutor.execute({ input: { rawPrompt: '重构底部抽屉，缩短主按钮文字，用户补充：无', activeScreenId: 's1', decision: { intent: 'modify_screen', targetScreenId: 's1', reason: 'user' } },
      provider: defaultProviders[0], model: 'test', engineCore: new DefaultAIEngineCore(transport), screens: { s1: { id: 's1', name: '回访', htmlContent: before } }, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: '修改原页面' });
    expect(result.status).toBe('rejected_by_quality'); expect(result.extractedHtml).toBeUndefined(); expect(result.stagedScreen).toBeUndefined();
  });
  test('强制应用与直接元素补丁也不能绕过CTA文案保护', () => {
    const prior = useProjectStore.getState(), history = useHistoryStore.getState();
    try {
      useProjectStore.getState().initNewProject({ name: '操作保护', deviceProfile: 'mobile' });
      const id = useProjectStore.getState().addScreen({ name: '原页', htmlContent: before });
      const force = CanvasToolExecutor.execute({ tool: 'modify_screen', params: { screenId: id, html: blank, forceInPlace: true } });
      expect(force.success).toBe(false); expect(useProjectStore.getState().screens[id].htmlContent).toBe(before);
      const patch = CanvasToolExecutor.execute({ tool: 'patch_element', params: { screenId: id, nid: 'submit', elementHtml: '<button data-nid="submit" class="btn btn-primary"></button>' } });
      expect(patch.success).toBe(false); expect(useProjectStore.getState().screens[id].htmlContent).toBe(before);
    } finally { useProjectStore.setState(prior); useHistoryStore.setState(history); }
  });
  test('真实工程同类截断停在主按钮开标签，未闭合artifact不能成为最终候选', async () => {
    const transport = new MockTransport();
    transport.enqueueScenario({ events: [
      { type: 'Delta', text: '<artifact type="screen" identifier="s1"><main><p>规则说明</p><button>暂存</button><button data-n' },
      { type: 'Done', finish_reason: 'length' }
    ] });
    transport.enqueueScenario({events:[{type:'Delta',text:'无恢复标记的重写内容'},{type:'Done',finish_reason:'stop'}]});
    const result = await PipelineExecutor.execute({ input: { rawPrompt: '重构抽屉，缩短提交按钮', activeScreenId: 's1', decision: { intent: 'modify_screen', targetScreenId: 's1', reason: 'user' } },
      provider: defaultProviders[0], model: 'test', engineCore: new DefaultAIEngineCore(transport), screens: { s1: { id: 's1', name: '回访', htmlContent: before } }, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: '修改原页面' });
    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('恢复标记');expect(result.extractedHtml).toBeUndefined();expect(result.changeSet).toBeUndefined();
    expect(result.continuationCheckpoint?.prefix).toBe(result.rawResponse);
    const terminal=finalizeModelHtml({rawResponse:result.rawResponse,finishReason:'length',warnings:[],continuationCount:1});
    expect(terminal.status).toBe('rejected_by_quality');expect(terminal.qualityReport?.findings.some(f => f.code === 'incomplete_artifact')).toBe(true);
  });
  test('结束原因透传并保留真实length，不被传输结束的stop覆盖', async () => {
    const transport = { id: 'end-sequence', stream(_request: unknown, onEvent: (event: any) => void) {
      onEvent({ type: 'Delta', text: '<artifact><main>' }); onEvent({ type: 'Done', finish_reason: 'length' }); onEvent({ type: 'Done', finish_reason: 'stop' });
      return { abort() {}, promise: Promise.resolve() };
    } };
    const result = new DefaultAIEngineCore(transport).streamText({ provider: defaultProviders[0], model: 'test', messages: [] });
    await result.textPromise;
    expect(await result.finishReasonPromise).toBe('length');
  });
  test('浏览器自动补全不能掩盖源HTML未完成；合法可省略闭合和void标签不误报', () => {
    for (const html of ['<main><button data-n', '<main><button>提交', '<main>内容</main', '<main><textarea>未结束', '<main><div>未关闭</main>', '<main><textarea/><button>提交</button></main>']) {
      expect(checkGenerationQuality(html).findings.some(f => f.code === 'incomplete_html' && f.severity === 'error')).toBe(true);
    }
    for (const html of ['<main><input placeholder="姓名"><br><button>提交</button></main>', '<ul><li>甲<li>乙</ul>', '<main><p>3 &lt; 4</p><svg><path d="M0 0"/></svg></main>']) {
      expect(checkGenerationQuality(html).findings.some(f => f.code === 'incomplete_html')).toBe(false);
    }
  });
  test('主操作不能借用已有暂存按钮充数，两个顺序及无nid均保持一对一', () => {
    for (const reverse of [false, true]) {
      const submit = '<button data-nid="submit" class="btn btn-primary">提交</button>', save = '<button data-nid="save" class="btn">暂存</button>';
      const original = `<main>${reverse ? save + submit : submit + save}</main>`;
      const onlySave = '<main><button data-nid="save" class="btn btn-primary">暂存</button></main>';
      expect(checkGenerationQuality(onlySave, { baselineHtml: original }).passed).toBe(false);
      expect(checkGenerationQuality(onlySave.replace(' data-nid="save"', ''), { baselineHtml: original.replaceAll(' data-nid="submit"', '').replaceAll(' data-nid="save"', '') }).passed).toBe(false);
    }
  });
  test('局部元素原始截断必须在DOM修补前拒绝，原页及历史不变', () => {
    const prior = useProjectStore.getState(), history = useHistoryStore.getState();
    try {
      useProjectStore.getState().initNewProject({ name: '片段完整性', deviceProfile: 'mobile' });
      const id = useProjectStore.getState().addScreen({ name: '原页', htmlContent: before });
      const checkpoints = useHistoryStore.getState().checkpoints.length;
      const result = CanvasToolExecutor.execute({ tool: 'patch_element', params: { screenId: id, nid: 'sheet', elementHtml: '<section data-nid="sheet"><p>更新</p><button data-n' } });
      expect(result.success).toBe(false); expect(useProjectStore.getState().screens[id].htmlContent).toBe(before);
      expect(useHistoryStore.getState().checkpoints.length).toBe(checkpoints);
    } finally { useProjectStore.setState(prior); useHistoryStore.setState(history); }
  });
  test('长页全量修改为实际请求提供更充分的输出预算', async () => {
    const longOriginal = before + '<!--' + 'expanded'.repeat(1800) + '-->';
    const transport = new MockTransport(); transport.queueResponse(`<artifact type="screen" identifier="s1">${shortened}</artifact>`);
    const result = await PipelineExecutor.execute({ input: { rawPrompt: '缩短主按钮文案', activeScreenId: 's1', decision: { intent: 'modify_screen', targetScreenId: 's1', reason: 'user' } },
      provider: defaultProviders[0], model: 'test', engineCore: new DefaultAIEngineCore(transport), screens: { s1: { id: 's1', name: '长回访页', htmlContent: longOriginal } }, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: '修改页面' });
    expect(result.status).toBe('staged_side_by_side');
    expect((transport.lastRequest!.body as any).max_tokens).toBe(16384);
  });
});
