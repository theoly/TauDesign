import { describe, expect, test } from 'bun:test';
import { buildProjectKnowledgeContext, generateProjectKnowledge, knowledgeFingerprint, collectKnowledgeSources, type KnowledgeState } from '../src/services/ai/projectKnowledge';
import { defaultTheme } from '../src/utils/themePresets';
import { defaultProviders } from '../src/stores/useAIConfigStore';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';

function state(): KnowledgeState {
  return { id: 'project-a', settings: { deviceProfile: 'mobile', colorMode: 'light' }, designSystem: defaultTheme,
    decisions: {}, components: {}, overrides: {},
    projectDocuments: { req: { id: 'req', title: '会员需求', content: '项目服务红娘。\n\n会员详情必须展示合同进度和回访记录。', source: 'upload', enabled: true, createdAt: 1, updatedAt: 1 } },
    screens: { members: { id: 'members', name: '会员管理', htmlContent: '<main><h1>我的会员</h1><nav><a>工作台</a></nav><label>姓名<input placeholder="输入姓名"></label><button class="btn btn-primary">添加会员</button><script>secret_script</script><style>.fake{color:red}</style></main>' },
      specimen: { id: 'specimen', name: '样张', metadata: { kind: 'specimen' }, htmlContent: '<h1>specimen_secret</h1>' } } };
}
describe('项目功能与UI知识上下文', () => {
  test('只抽取可证实页面线索，排除脚本样式和风格样张', () => {
    const sources = collectKnowledgeSources(state(), '会员详情');
    const text = JSON.stringify(sources);
    expect(text).toContain('输入姓名'); expect(text).toContain('添加会员'); expect(text).toContain('btn-primary');
    expect(text).toContain('doc:req'); expect(text).toContain('screen:members');
    expect(text).not.toContain('secret_script'); expect(text).not.toContain('specimen_secret'); expect(text).not.toContain('.fake');
  });
  test('已启用资料及页面共同进入需求上下文，禁用资料不使用', () => {
    const s = state(); s.projectDocuments.off = { ...s.projectDocuments.req, id: 'off', title: '禁用', content: 'DISABLED_SECRET', enabled: false };
    const context = buildProjectKnowledgeContext(s, '设计会员详情');
    expect(context).toContain('合同进度'); expect(context).toContain('我的会员'); expect(context).toContain('UI');
    expect(context).toContain('本轮'); expect(context).toContain('推断'); expect(context).not.toContain('DISABLED_SECRET');
  });
  test('大项目按相关性挑选，预算封顶并披露省略', () => {
    const s = state();
    for (let i = 0; i < 20; i++) s.projectDocuments[`other-${i}`] = { ...s.projectDocuments.req, id: `other-${i}`, title: `仓储${i}`, content: '仓储说明'.repeat(5000) };
    s.projectDocuments.target = { ...s.projectDocuments.req, id: 'target', title: '退费审批', content: '退费审批需要财务复核和进度展示。' };
    const context = buildProjectKnowledgeContext(s, '退费审批');
    expect(context.length).toBeLessThanOrEqual(12000); expect(context).toContain('财务复核'); expect(context).toContain('省略');
  });
  test('资料很多时仍保留页面一致性证据，超长全局规则也不能突破预算', () => {
    const s = state();
    for (let i = 0; i < 18; i++) s.projectDocuments[`member-${i}`] = { ...s.projectDocuments.req, id: `member-${i}`, content: '会员详情页面合同回访需求。'.repeat(300) };
    expect(buildProjectKnowledgeContext(s, '会员详情页面合同回访需求')).toContain('screen:members');
    s.decisions.long = { id: 'long', text: '会员页面业务要求'.repeat(3000), scope: 'global', active: true, source: { kind: 'manual', createdAt: 1 } };
    const context = buildProjectKnowledgeContext(s, '会员详情');
    expect(context.length).toBeLessThanOrEqual(12000); expect(context).toContain('screen:members');
  });
  test('长段落末尾的相关要求仍能进入片段', () => {
    const s = state(); s.projectDocuments.req.content = '通用说明。'.repeat(1000) + '财务复核必须显示审批凭证。';
    expect(buildProjectKnowledgeContext(s, '财务复核')).toContain('审批凭证');
  });
  test('人工修订归纳作为独立来源保留，重新采纳AI槽后指纹仍稳定', async () => {
    const s = state();
    s.projectDocuments.revision = { ...s.projectDocuments.req, id: 'revision', title: '人工修订', source: 'manual', content: '会员退款必须保留审批记录。' };
    const transport = new MockTransport(); transport.queueResponse(JSON.stringify({ overview: '会员需求', requirements: [{ text: '退款保留审批记录', basis: 'document', sourceIds: ['doc:revision'] }], uiRequirements: [], questions: [] }));
    const result = await generateProjectKnowledge(new DefaultAIEngineCore(transport), { state: s, provider: defaultProviders[0], model: 'test' });
    expect(JSON.stringify(transport.lastRequest!.messages)).toContain('会员退款必须保留审批记录');
    s.projectDocuments['project-analysis'] = { ...s.projectDocuments.req, id: 'project-analysis', source: 'ai', content: result.content, sourceFingerprint: result.sourceFingerprint };
    expect(knowledgeFingerprint(s)).toBe(result.sourceFingerprint);
    expect(s.projectDocuments.revision.content).toBe('会员退款必须保留审批记录。');
  });
  test('来源指纹忽略画布位置和归纳自身，但跟随页面需求与主题变化', () => {
    const s = state(), before = knowledgeFingerprint(s);
    s.screens.members.position = { x: 4, y: 5 };
    s.projectDocuments['project-analysis'] = { ...s.projectDocuments.req, id: 'project-analysis', source: 'ai', content: '归纳' };
    expect(knowledgeFingerprint(s)).toBe(before);
    s.screens.members.htmlContent += '<button>注销</button>';
    expect(knowledgeFingerprint(s)).not.toBe(before);
  });
  test('过期AI归纳明确作为待核对推断，missing正文不作需求', () => {
    const s = state();
    s.projectDocuments['project-analysis'] = { ...s.projectDocuments.req, id: 'project-analysis', source: 'ai', content: '旧的推断', sourceFingerprint: 'outdated' };
    s.projectDocuments.broken = { ...s.projectDocuments.req, id: 'broken', content: 'MISSING_SECRET', missing: true };
    const context = buildProjectKnowledgeContext(s, '会员详情');
    expect(context).toContain('过期'); expect(context).toContain('旧的推断'); expect(context).not.toContain('MISSING_SECRET');
  });
  test('AI归纳引用必须匹配实际来源，无依据的功能和UI要求降为推断', async () => {
    const s = state(), transport = new MockTransport();
    transport.queueResponse(JSON.stringify({ overview: '会员管理项目', requirements: [
      { text: '展示合同进度', basis: 'document', sourceIds: ['doc:req'] },
      { text: '信用评分', basis: 'document', sourceIds: ['doc:invented'] }
    ], uiRequirements: [{ text: '主按钮沿用主题', basis: 'page', sourceIds: ['screen:members'] }], questions: ['是否需要审批权限？'] }));
    const result = await generateProjectKnowledge(new DefaultAIEngineCore(transport), { state: s, provider: defaultProviders[0], model: 'test' });
    expect(result.content).toContain('文档明确要求'); expect(result.content).toContain('会员需求');
    expect(result.content).toContain('AI推断'); expect(result.content).toContain('信用评分');
    expect(result.content).toContain('页面已有事实'); expect(result.content).toContain('是否需要审批权限');
    expect(result.sourceFingerprint).toBe(knowledgeFingerprint(s));
    expect(transport.lastRequest!.messages![0].content).toContain('"uiRequirements"');
    expect(s.projectDocuments['project-analysis']).toBeUndefined();
  });
  test('没有源数据或已取消时不伪造归纳，非法模型结果拒绝', async () => {
    const transport = new MockTransport(), s = state();
    const core = new DefaultAIEngineCore(transport);
    const controller = new AbortController(); controller.abort();
    await expect(generateProjectKnowledge(core, { state: s, provider: defaultProviders[0], model: 'test', signal: controller.signal })).rejects.toThrow('取消');
    expect(transport.lastRequest).toBeUndefined();
    transport.queueResponse('{"summary":"错误协议"}');
    await expect(generateProjectKnowledge(core, { state: s, provider: defaultProviders[0], model: 'test' })).rejects.toThrow('格式');
    await expect(generateProjectKnowledge(core, { state: { ...s, screens: {}, projectDocuments: {} }, provider: defaultProviders[0], model: 'test' })).rejects.toThrow('页面或文档');
  });
  test('真实生成Pipeline传入项目依据，仍保留当前提示词及HTML输出契约', async () => {
    const transport = new MockTransport(); transport.queueResponse('<artifact type="screen" identifier="screen_new" title="会员详情"><main class="p-4">详情</main></artifact>');
    const s = state();
    const output = await PipelineExecutor.execute({ input: { rawPrompt: '新建会员详情', activeScreenId: null }, provider: defaultProviders[0], model: 'test', engineCore: new DefaultAIEngineCore(transport),
      screens: s.screens, deviceProfile: 'mobile', frameWidth: 390, baseSystemPrompt: 'UI设计', designSystem: defaultTheme, projectKnowledge: buildProjectKnowledgeContext(s, '会员详情') });
    const sent = JSON.stringify(transport.lastRequest!.messages);
    expect(sent).toContain('合同进度'); expect(sent).toContain('新建会员详情'); expect(sent).toContain('screen_new'); expect(output.status).toBe('applied');
  });
});
