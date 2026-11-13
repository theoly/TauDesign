import {prepareReferenceEvidence} from '../src/services/ai/referenceEvidence';
import {referenceBytes,sha256} from '../src/utils/referenceImagePreparation';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {createChatTaskBudget} from '../src/services/ai/taskBudgetPolicy';
import { beforeEach, afterEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useAIConfigStore, defaultBindings, defaultProviders } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import type { AIEngineCore, StreamTextOptions } from '../src/services/ai/engine/core/types';
import { chatPageTaskPlan } from './fixtures/pageTaskPlan';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';

const originalExecute = PipelineExecutor.execute;
let root: Root, host: HTMLDivElement, engine: ReturnType<typeof useAIEngineChat>;
let calls: string[] = [];
let plannerInput: StreamTextOptions | undefined;
let lastOptions:Parameters<typeof PipelineExecutor.execute>[0]|undefined;
let shouldFailHtml = false;
let oldAct: unknown;
let originalProject: ReturnType<typeof useProjectStore.getState>;
let originalHistory: ReturnType<typeof useHistoryStore.getState>;
let originalConfig: ReturnType<typeof useAIConfigStore.getState>;

const originalHtml = '<main data-nid="root0001"><h1 data-nid="head0001">完善资料弹窗</h1></main>';

const Harness = () => {
  engine = useAIEngineChat();
  return null;
};

beforeEach(async () => {
  originalProject = useProjectStore.getState();
  originalHistory = useHistoryStore.getState();
  originalConfig = useAIConfigStore.getState();
  oldAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  localStorage.clear();
  useHistoryStore.getState().restore(null);
  useProjectStore.getState().initNewProject({
    name: '重试规划复用测试',
    deviceProfile: 'mobile',
    designSystem: defaultTheme,
    createSpecimen: false
  });
  useProjectStore.getState().addScreen({ name: '完善资料弹窗', htmlContent: originalHtml }, 'screen-popup');
  useAIConfigStore.setState({
    providers: defaultProviders.map((p) => ({ ...p, apiKey: 'test-key' })),
    bindings: defaultBindings
  });

  calls = [];
  plannerInput = undefined;
  shouldFailHtml = false;

  const mockCore: AIEngineCore = {
    async generateObject<T>(_schema: Record<string, unknown>, options: Omit<StreamTextOptions, 'jsonSchema'>) {
      calls.push('plan');
      plannerInput = options;
      return {
        ...chatPageTaskPlan,
        features: chatPageTaskPlan.features.map((f) => ({
          ...f,
          title: '基础资料与择偶要求',
          information: [{ label: '基础资料表单与身高', kind: 'input' }],
          interactions: [{ label: '保存', precondition: '表单有效', outcome: '提交更新', targetScreenId: '' }]
        }))
      } as T;
    },
    streamText(options: StreamTextOptions) {
      calls.push('html');
      if (shouldFailHtml) {
        throw new Error('[timeout] 数据流传输超时: 超过 90s 未收到任何新分片');
      }
      const text = '<artifact title="完善资料弹窗"><main data-nid="root0001"><h1>完善资料弹窗</h1><section>已生成表单<label>身高<input class="input"/></label></section></main></artifact>';
      return {
        textStream: (async function* () {
          yield text;
        })(),
        reasoningStream: (async function* () {})(),
        textPromise: Promise.resolve(text),
        reasoningPromise: Promise.resolve(undefined),
        usagePromise: Promise.resolve(undefined),
        abort() {}
      };
    }
  };

  PipelineExecutor.execute = (options) => {lastOptions=options;return originalExecute({ ...options, engineCore: mockCore });};

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  PipelineExecutor.execute = originalExecute;
  useProjectStore.setState(originalProject, true);
  useHistoryStore.setState(originalHistory, true);
  useAIConfigStore.setState(originalConfig, true);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = oldAct;
});

test('CHK-F-01: 规划成功后HTML生成报错，消息仍完整保留已梳理的 pageTaskPlan', async () => {
  shouldFailHtml = true;
  await act(async () => {
    await engine.sendMessage('修改当前页面，增加基础资料和择偶要求折叠表单', undefined, { referencedScreenId: 'screen-popup' });
  });

  expect(calls).toEqual(['plan', 'html']);
  const assistantMsg = engine.messages.find((m) => m.sender === 'assistant' && m.id !== 'welcome');
  expect(assistantMsg).toBeDefined();
  expect(assistantMsg?.isError).toBe(true);
  expect(assistantMsg?.text).toContain('[timeout] 数据流传输超时');
  // 关键断言：即使 HTML 流超时报错，已梳理的规划产物必须即时保存在消息上
  expect(assistantMsg?.pageTaskPlan).toBeDefined();
  expect(assistantMsg?.pageTaskPlan?.plan.goal).toBeDefined();
});

test('CHK-F-02: 重试时直接复用已梳理规划，跳过 preparePageTaskPlan，不再调用模型进行功能梳理', async () => {
  shouldFailHtml = true;
  await act(async () => {
    await engine.sendMessage('修改当前页面，增加基础资料和择偶要求折叠表单', undefined, { referencedScreenId: 'screen-popup' });
  });

  expect(calls).toEqual(['plan', 'html']);
  const failedMsg = engine.messages.find((m) => m.sender === 'assistant' && m.id !== 'welcome');
  expect(failedMsg?.pageTaskPlan).toBeDefined();

  // 重置调用记录并允许 HTML 正常生成
  calls = [];
  shouldFailHtml = false;

  await act(async () => {
    await engine.retryTurn(failedMsg!.id);
  });

  // 关键断言：重试时完全跳过 'plan'，只调用 'html' 页面生成！
  expect(calls).toEqual(['html']);
  const latestAssistantMsg = engine.messages.filter((m) => m.sender === 'assistant' && m.id !== 'welcome').at(-1);
  expect(latestAssistantMsg?.isError).toBeFalsy();
  expect(latestAssistantMsg?.htmlOutput).toContain('已生成表单');
});

test('CHK-F-03: 用户显式选择重新梳理规划 (rePlan: true) 时，重新发起模型规划', async () => {
  shouldFailHtml = true;
  await act(async () => {
    await engine.sendMessage('修改当前页面，增加基础资料和择偶要求折叠表单', undefined, { referencedScreenId: 'screen-popup' });
  });

  expect(calls).toEqual(['plan', 'html']);
  const failedMsg = engine.messages.find((m) => m.sender === 'assistant' && m.id !== 'welcome');
  expect(failedMsg?.pageTaskPlan).toBeDefined();

  calls = [];
  shouldFailHtml = false;

  await act(async () => {
    await engine.retryTurn(failedMsg!.id, { rePlan: true });
  });

  // 关键断言：显式 rePlan 时，重新执行 'plan' 并生成 'html'
  expect(calls).toEqual(['plan', 'html']);
});

test('CHK-F-04: ChatDrawer 渲染直接重试(复用规划)、重新梳理与针对性超时提示', async () => {
  shouldFailHtml = true;
  await act(async () => {
    root.unmount();
    root = createRoot(host);
    root.render(<ChatDrawer />);
    await new Promise((r) => setTimeout(r, 20));
  });

  const textarea = host.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      '修改当前页面，增加基础资料和择偶要求折叠表单'
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const sendBtn = host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
  await act(async () => {
    sendBtn.click();
    await new Promise((r) => setTimeout(r, 80));
  });

  // 界面文案与诊断断言
  expect(host.textContent).toContain('直接重试 (复用规划)');
  expect(host.textContent).toContain('重新梳理规划');
  expect(host.textContent).toContain('模型在无活动时限内未返回数据分片');
});

test('CHK-F-05: 附带参考图超时失败时，支持【仅重试文字要求 (不附图)】通道', async () => {
  shouldFailHtml = true;
  const dummyAttachment = {
    name: 'test.png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  await act(async () => {
    await engine.sendMessage('修改当前页面，增加基础资料和择偶要求折叠表单', dummyAttachment, { referencedScreenId: 'screen-popup' });
  });

  const failedMsg = engine.messages.find((m) => m.sender === 'assistant' && m.id !== 'welcome');
  expect(failedMsg?.originalAttachment).toBeDefined();
  expect(lastOptions?.referenceProcessing).toBeDefined();

  calls = [];
  shouldFailHtml = false;

  await act(async () => {
    await engine.retryTurn(failedMsg!.id, { withoutAttachment: true });
  });

  // 关键断言：去除图片后重新发起规划与生成，且不带附件
  expect(calls).toEqual(['plan', 'html']);
  const latestAssistantMsg = engine.messages.filter((m) => m.sender === 'assistant' && m.id !== 'welcome').at(-1);
  expect(latestAssistantMsg?.originalAttachment).toBeUndefined();
  expect(latestAssistantMsg?.htmlOutput).toContain('已生成表单');
});


test('RP-C03/04: 图像证据和规划复用，文字附件及生成方式完整恢复，代码请求不再携带图片',async()=>{
 const attachment={name:'reference.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='};
 const role=useAIConfigStore.getState().getActiveProviderForRole('vision')!;
 const hash=await sha256(referenceBytes(attachment.dataUrl).bytes),b=createChatTaskBudget();
 const prepared=await prepareReferenceEvidence({streamText(){throw Error('not needed');},async generateObject<T>(){return {summary:'基础资料表单',texts:['身高'],groups:[],fields:[{label:'身高',type:'number',required:true,group:'基础资料',value:''}],visual:['单列布局'],uncertainties:[]} as T;}},{attachment,processing:{binding:{provider:role.provider,model:role.modelId},storage:new LocalStorageStorage('preparation-'+crypto.randomUUID())},budget:b,taskId:'synthetic',prepareImage:async()=>({version:1,sourceSha256:hash,width:1,height:1,parts:[{dataUrl:attachment.dataUrl,sha256:hash,mime:'image/png',width:1,height:1,rect:{x:0,y:0,width:1,height:1}}]})});b.close();
 // Seed the same actual independent files in the current project's storage.
 const store=useProjectStore.getState().getAttachmentStore();await store.saveReference(attachment.name,attachment.dataUrl);
 const textReferences=[{name:'rules.txt',content:'保持在当前页填写',source:'upload' as const}];
 shouldFailHtml=true;calls=[];
 await act(async()=>{await engine.sendMessage('修改当前页面，增加基础资料表单',attachment,{referencedScreenId:'screen-popup',writeStrategy:'patch',textReferences,referenceEvidence:prepared});});
 expect(calls).toEqual(['plan','html']);expect(plannerInput?.messages.some(m=>m.imageUrl)).toBe(false);expect(JSON.stringify(plannerInput?.messages)).toContain('身高');
 const failed=engine.messages.filter(m=>m.sender==='assistant').at(-1)!;expect(failed.pageTaskPlan).toBeDefined();expect(failed.referenceEvidence?.fingerprint).toBe(prepared.fingerprint);
 shouldFailHtml=false;calls=[];
 await act(async()=>{await engine.retryTurn(failed.id,{withoutAttachment:true});});
 expect(calls).toEqual(['html']);expect(lastOptions?.input.textReferences).toEqual(textReferences);expect(lastOptions?.writeStrategy).toBe('patch');expect(lastOptions?.pageTaskPlanning?.snapshot).toBeDefined();expect(lastOptions?.input.attachment).toBeDefined();
 const success=engine.messages.filter(m=>m.sender==='assistant').at(-1)!;expect(success.htmlOutput).toContain('已生成表单');expect(success.referenceReused).toBe(true);
});

test('RP-C04: 修改原页后旧任务重试被拒绝，不重新推断目标或发送模型请求',async()=>{
 shouldFailHtml=true;await act(async()=>{await engine.sendMessage('修改当前页面，增加基础资料表单',undefined,{referencedScreenId:'screen-popup'});});const failed=engine.messages.filter(m=>m.sender==='assistant').at(-1)!;
 act(()=>useProjectStore.getState().updateScreenHtml('screen-popup',originalHtml+'<p>新版本</p>'));calls=[];
 await act(async()=>{await engine.retryTurn(failed.id);});expect(calls).toEqual([]);expect(engine.messages.find(m=>m.id===failed.id)?.text).toContain('已变化');
});
