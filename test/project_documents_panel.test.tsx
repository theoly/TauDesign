import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SideBar } from '../src/components/layout/SideBar';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { ProjectDocumentsPanel } from '../src/components/layout/panels/ProjectDocumentsPanel';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import * as knowledge from '../src/services/ai/projectKnowledge';
import type { ProjectDocumentEntry } from '../src/types/projectDocument';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let generation: ReturnType<typeof spyOn>;
let resolveGeneration: (value: { content: string; sourceFingerprint: string }) => void;
let fingerprint: string;
let projectId: string;
let projectNumber = 0;
let previousProject: ReturnType<typeof useProjectStore.getState>;
let previousConfig: ReturnType<typeof useAIConfigStore.getState>;
let previousHistory: ReturnType<typeof useHistoryStore.getState>;
const doc = (id: string, extra = {}): ProjectDocumentEntry => ({ id, title: id, content: '初始需求', source: 'manual', enabled: true, createdAt: 1, updatedAt: 1, ...extra });
const button = (name: string) => {
  const found = Array.from(document.body.querySelectorAll('button')).find(el => el.textContent?.trim() === name);
  expect(found).toBeDefined();
  return found!;
};
const click = async (name: string) => { await act(async () => button(name).click()); };
const change = async (label: string, value: string) => {
  const element = document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  expect(element).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); });
};
const render = () => act(() => root.render(<ProjectDocumentsPanel />));
const finish = async () => { await act(async () => resolveGeneration({ content: '# 新归纳\n功能需求', sourceFingerprint: fingerprint })); };

beforeEach(() => {
  previousProject = useProjectStore.getState(); previousConfig = useAIConfigStore.getState(); previousHistory = useHistoryStore.getState();
  projectId = `ui-knowledge-project-${++projectNumber}`;
  useProjectStore.setState({ id: projectId, folderPath: undefined, projectDocuments: { brief: doc('brief'), other: doc('other') } });
  useAIConfigStore.setState({ providers: defaultProviders.map(p => ({ ...p, apiKey: 'test-key' })), bindings: { ...defaultBindings } });
  fingerprint = knowledge.knowledgeFingerprint(useProjectStore.getState());
  generation = spyOn(knowledge, 'generateProjectKnowledge').mockImplementation(() => new Promise(resolve => { resolveGeneration = resolve; }));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); generation.mockRestore(); useProjectStore.setState(previousProject); useAIConfigStore.setState(previousConfig); useHistoryStore.setState(previousHistory); });

it('真实编辑直到明确保存才进入工程，并保护未保存的切换与删除', async () => {
  render(); await click('brief'); await change('文档正文', '需要搜索客户');
  expect(useProjectStore.getState().projectDocuments.brief.content).toBe('初始需求');
  await click('other'); expect(host.textContent).toContain('请先保存或放弃未保存修改');
  await click('删除文档'); expect(useProjectStore.getState().projectDocuments.brief).toBeDefined();
  await click('保存文档'); expect(useProjectStore.getState().projectDocuments.brief.content).toBe('需要搜索客户');
  await click('other'); expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('初始需求');
});
it('新建粘贴、启停与删除通过工程动作生效', async () => {
  render(); await click('新建文档'); await change('文档标题', '客户需求'); await change('文档正文', '姓名为必填字段'); await click('保存文档');
  const entry = Object.values(useProjectStore.getState().projectDocuments).find(d => d.title === '客户需求')!;
  expect(entry.content).toBe('姓名为必填字段'); await click('停用文档'); expect(useProjectStore.getState().projectDocuments[entry.id].enabled).toBe(false);
  await click('删除文档'); expect(useProjectStore.getState().projectDocuments[entry.id]).toBeUndefined();
});
it('上传原文可查看恢复，编辑保存保留原文', async () => {
  useProjectStore.setState({ projectDocuments: { uploaded: doc('uploaded', { source: 'upload', originalContent: '# 原始文件', content: '已编辑正文' }) } });
  render(); await click('uploaded'); await click('查看上传原文'); expect(host.textContent).toContain('# 原始文件');
  await click('恢复为编辑稿'); expect(useProjectStore.getState().projectDocuments.uploaded.content).toBe('已编辑正文');
  await click('保存文档'); expect(useProjectStore.getState().projectDocuments.uploaded.content).toBe('# 原始文件'); expect(useProjectStore.getState().projectDocuments.uploaded.originalContent).toBe('# 原始文件');
});
it('AI仅生成对比草稿，用户可编辑并明确采纳', async () => {
  render(); await click('AI 整理'); await finish();
  expect(document.body.querySelector('[role="dialog"]')).not.toBeNull(); expect(useProjectStore.getState().projectDocuments['project-analysis']).toBeUndefined();
  await change('AI 整理草稿', '# 人工确认后的功能'); await click('采纳草稿');
  expect(useProjectStore.getState().projectDocuments['project-analysis'].content).toBe('# 人工确认后的功能');
});
it('未保存内容阻止重新整理', async () => {
  render(); await click('brief'); await change('文档正文', '未保存'); await click('AI 整理'); expect(generation).not.toHaveBeenCalled(); expect(host.textContent).toContain('请先保存或放弃未保存修改');
});
it('无模型配置显示可操作错误', async () => {
  useAIConfigStore.setState({ providers: [] }); render(); await click('AI 整理'); expect(host.textContent).toContain('请先配置代码生成模型'); expect(generation).not.toHaveBeenCalled();
});
it('异步整理期间源文档变化拒绝旧结果', async () => {
  render(); await click('AI 整理'); act(() => useProjectStore.getState().upsertProjectDocument(doc('brief', { content: '源需求已改变' }))); await finish();
  expect(document.body.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).toContain('已变化'); expect(useProjectStore.getState().projectDocuments['project-analysis']).toBeUndefined();
});
it('草稿采纳时再次校验来源并拒绝过期结果', async () => {
  render(); await click('AI 整理'); await finish(); act(() => useProjectStore.getState().upsertProjectDocument(doc('brief', { content: '新来源' }))); await click('采纳草稿'); expect(useProjectStore.getState().projectDocuments['project-analysis']).toBeUndefined(); expect(document.body.textContent).toContain('已变化');
});
it('生成时AI文档被人工修改也不会被旧草稿覆盖', async () => {
  render(); await click('AI 整理'); act(() => useProjectStore.getState().upsertProjectDocument(doc('project-analysis', { source: 'ai', content: '人工更新' }))); await finish();
  expect(document.body.querySelector('[role="dialog"]')).toBeNull(); expect(useProjectStore.getState().projectDocuments['project-analysis'].content).toBe('人工更新');
});
it('取消请求后忽略迟到结果', async () => {
  render(); await click('AI 整理'); await click('取消整理'); await finish(); expect(document.body.querySelector('[role="dialog"]')).toBeNull(); expect(useProjectStore.getState().projectDocuments['project-analysis']).toBeUndefined();
});
it('切工程拒绝异步结果，并在返回原工程时保留未保存编辑', async () => {
  render(); await click('AI 整理'); act(() => useProjectStore.setState({ id: 'other-project', projectDocuments: {} })); await finish(); expect(document.body.querySelector('[role="dialog"]')).toBeNull(); expect(useProjectStore.getState().projectDocuments['project-analysis']).toBeUndefined();
  act(() => useProjectStore.setState({ id: projectId, projectDocuments: { brief: doc('brief') } })); await click('brief'); await change('文档正文', '未保存跨工程稿');
  act(() => useProjectStore.setState({ folderPath: '/another/location', projectDocuments: {} })); expect(host.querySelector('[aria-label="文档正文"]')).toBeNull();
  act(() => useProjectStore.setState({ folderPath: undefined, projectDocuments: { brief: doc('brief') } })); expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('未保存跨工程稿');
});
it('缺失正文和过期AI归纳有明确标记', async () => {
  useProjectStore.setState({ projectDocuments: { missing: doc('missing', { missing: true }), ai: doc('ai', { source: 'ai', sourceFingerprint: 'old' }) } }); render(); expect(host.textContent).toContain('正文缺失'); expect(host.textContent).toContain('归纳已过期');
});
it('采纳前AI归纳被人工更新也不会覆盖', async () => {
  render(); await click('AI 整理'); await finish();
  act(() => useProjectStore.getState().upsertProjectDocument(doc('project-analysis', { source: 'manual', content: '用户确认的新版本' })));
  await click('采纳草稿'); expect(useProjectStore.getState().projectDocuments['project-analysis'].content).toBe('用户确认的新版本'); expect(document.body.textContent).toContain('已变化');
});
it('编辑AI归纳另存独立人工需求，后续整理及采纳保留人工内容', async () => {
  useProjectStore.setState({ projectDocuments: { 'project-analysis': doc('project-analysis', { source: 'ai', sourceFingerprint: 'old', originalContent: '不应复制的原文' }) } });
  render(); await click('project-analysis');
  expect(host.textContent).toContain('编辑AI归纳后将另存为人工需求，后续整理会保留');
  await change('文档正文', '人工明确要求'); await click('保存文档');
  const saved = Object.values(useProjectStore.getState().projectDocuments).find(entry => entry.source === 'manual')!;
  expect(saved).toBeDefined(); expect(saved.id).not.toBe('project-analysis'); expect(saved.title).toContain('人工修订');
  expect(saved.sourceFingerprint).toBeUndefined(); expect(saved.originalContent).toBeUndefined(); expect(saved.content).toBe('人工明确要求');
  expect(useProjectStore.getState().projectDocuments['project-analysis'].source).toBe('ai'); expect(useProjectStore.getState().projectDocuments['project-analysis'].content).toBe('初始需求');
  await change('文档正文', '继续编辑人工明确要求'); await click('保存文档');
  expect(Object.keys(useProjectStore.getState().projectDocuments)).toHaveLength(2);
  expect(useProjectStore.getState().projectDocuments[saved.id].content).toBe('继续编辑人工明确要求');
  fingerprint = knowledge.knowledgeFingerprint(useProjectStore.getState());
  await click('AI 整理');
  const input = generation.mock.calls[0][1].state;
  expect(input.projectDocuments[saved.id].content).toBe('继续编辑人工明确要求');
  await finish(); await click('采纳草稿');
  expect(useProjectStore.getState().projectDocuments[saved.id].content).toBe('继续编辑人工明确要求');
  expect(useProjectStore.getState().projectDocuments['project-analysis'].source).toBe('ai');
  expect(useProjectStore.getState().projectDocuments['project-analysis'].content).toContain('新归纳');
});
it('当前编辑文档被外部改变时拒绝覆盖', async () => {
  render(); await click('brief'); await change('文档正文', '本地稿');
  act(() => useProjectStore.getState().upsertProjectDocument(doc('brief', { content: '其他位置更新' })));
  await click('保存文档'); expect(useProjectStore.getState().projectDocuments.brief.content).toBe('其他位置更新'); expect(host.textContent).toContain('文档已变化');
  await click('放弃修改'); expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('其他位置更新');
});
it('MD导入先形成编辑稿，保存时保留上传原文', async () => {
  render(); const input = host.querySelector('[aria-label="导入项目文档"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['# 上传需求'], 'requirements.md', { type: 'text/markdown' })] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(Object.values(useProjectStore.getState().projectDocuments).some(d => d.source === 'upload')).toBe(false);
  await change('文档正文', '调整后的需求'); await click('保存文档');
  const saved = Object.values(useProjectStore.getState().projectDocuments).find(d => d.title === 'requirements.md')!;
  expect(saved.content).toBe('调整后的需求'); expect(saved.originalContent).toBe('# 上传需求');
});
it('拒绝非MD/TXT导入并说明原因', async () => {
  render(); const input = host.querySelector('[aria-label="导入项目文档"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['{}'], 'requirements.json', { type: 'application/json' })] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).toContain('仅支持 MD 或 TXT'); expect(host.querySelector('[aria-label="文档正文"]')).toBeNull();
});

it('侧栏切换及折叠保留未保存编辑', async () => {
  act(() => root.render(<SideBar onOpenAssetCenter={() => {}} onOpenThemeEditor={() => {}} onOpenRestyle={() => {}} />));
  const navigate = async (label: string) => { await act(async () => (host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click()); };
  await navigate('项目文档'); await click('brief'); await change('文档正文', '侧栏切换仍保留');
  await navigate('页面'); await navigate('项目文档'); expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('侧栏切换仍保留');
  await navigate('项目文档'); await navigate('项目文档'); expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('侧栏切换仍保留');
  expect(useProjectStore.getState().projectDocuments.brief.content).toBe('初始需求');
});
it('回到工程管理后重开面板，未保存编辑仍保留', async () => {
  render(); await click('brief'); await change('文档正文', '重开工作台仍保留');
  act(() => root.unmount()); root = createRoot(host); render();
  expect((host.querySelector('[aria-label="文档正文"]') as HTMLTextAreaElement).value).toBe('重开工作台仍保留');
  expect(useProjectStore.getState().projectDocuments.brief.content).toBe('初始需求');
});

it('默认空API key不发起整理请求', async () => {
  useAIConfigStore.setState({ providers: defaultProviders.map(provider => ({ ...provider, apiKey: '' })), bindings: { ...defaultBindings } });
  render(); await click('AI 整理');
  expect(generation).not.toHaveBeenCalled(); expect(host.textContent).toContain('请先配置代码生成模型');
});
it('空白API key不发起整理请求', async () => {
  useAIConfigStore.setState({ providers: defaultProviders.map(provider => ({ ...provider, apiKey: '   ' })), bindings: { ...defaultBindings } });
  render(); await click('AI 整理');
  expect(generation).not.toHaveBeenCalled(); expect(host.textContent).toContain('请先配置代码生成模型');
});
it('本地Ollama允许无API key整理', async () => {
  useAIConfigStore.setState({ providers: [{ ...defaultProviders[0], id: 'local-ollama', protocol: 'ollama_native', apiKey: '', isEnabled: true }], bindings: { ...defaultBindings, code: { role: 'code', providerId: 'local-ollama', modelId: 'qwen2.5-coder' } } });
  render(); await click('AI 整理'); expect(generation).toHaveBeenCalledTimes(1); await click('取消整理'); await finish();
});
