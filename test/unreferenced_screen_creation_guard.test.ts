import {stubPageCreationRender} from './helpers/pageCreation';
stubPageCreationRender();
import { describe, it, expect, beforeEach } from 'bun:test';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { useProjectStore } from '../src/stores/useProjectStore';

describe('未引用画框防误判与比选拦截测试 (Unreferenced Screen Creation Guard)', () => {
  const existingScreens = {
    'screen-1': {
      id: 'screen-1',
      name: '手机号验证码登录',
      htmlContent: '<div data-nid="root1"><button data-nid="btn1">获取验证码</button></div>',
      position: { x: 100, y: 120 }
    },
    'screen-2': {
      id: 'screen-2',
      name: '个人中心',
      htmlContent: '<div data-nid="root2"><h1>个人中心</h1></div>',
      position: { x: 530, y: 120 }
    }
  };

  beforeEach(() => {
    useProjectStore.setState({
      screens: { ...existingScreens },
      activeScreenId: null,
      selectedNids: [],
      stagedScreen: null
    });
  });

  it('CHK-F-01: activeScreenId 为 null (引用未启用) 且模型返回已存在 identifier="screen-1" 时，绝不判为 modify_screen，必须返回 create_screen', () => {
    const rawResponse = '<artifact identifier="screen-1" type="screen" title="推荐匹配 · 暂无数据"><div data-nid="r3"><h1>暂无数据</h1></div></artifact>';
    const extractedHtml = '<div data-nid="r3"><h1>暂无数据</h1></div>';

    const result = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '推荐匹配 · 暂无数据',
      activeScreenId: null,
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-1', title: '推荐匹配 · 暂无数据' }
    });

    expect(result).not.toBeNull();
    expect(result?.tool).toBe('create_screen');
    if (result?.tool === 'create_screen') {
      expect(result.params.title).toBe('推荐匹配 · 暂无数据');
      // identifier 保持为建议 ID
      expect(result.params.screenId).toBe('screen-1');
    }
  });

  it('CHK-F-02: 用户点击快捷输入“按附件图片精准创建/修改页面”，即使模型输出既有画框 ID 也必须为 create_screen', () => {
    const rawResponse = '<artifact identifier="screen-1" type="screen" title="新页面"><div data-nid="r4"><h1>按图生成</h1></div></artifact>';
    const extractedHtml = '<div data-nid="r4"><h1>按图生成</h1></div>';

    // 场景 A: 未启用引用
    const resA = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '按附件图片精准创建/修改页面',
      activeScreenId: null,
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-1', title: '按图生成' }
    });
    expect(resA?.tool).toBe('create_screen');

    // 场景 B (BR-RSM-01): 开启画框引用 (activeScreenId 有效) 时，“创建/修改”双态口令按修改执行
    const resB = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '按附件图片精准创建/修改页面',
      activeScreenId: 'screen-1',
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-1', title: '按图修改' }
    });
    expect(resB?.tool).toBe('modify_screen');
    if (resB?.tool === 'modify_screen') {
      expect(resB.params.screenId).toBe('screen-1');
    }
  });

  it('CHK-F-03: 正常画框修改链路保障：开启引用且包含修改动词时，必须正确路由至 modify_screen', () => {
    const rawResponse = '<artifact identifier="screen-1" type="screen" title="手机号验证码登录"><div data-nid="root1"><button data-nid="btn1">重新发送</button></div></artifact>';
    const extractedHtml = '<div data-nid="root1"><button data-nid="btn1">重新发送</button></div>';

    const result = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '把按钮文字修改为重新发送',
      activeScreenId: 'screen-1',
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-1', title: '手机号验证码登录' }
    });

    expect(result).not.toBeNull();
    expect(result?.tool).toBe('modify_screen');
    if (result?.tool === 'modify_screen') {
      expect(result.params.screenId).toBe('screen-1');
    }
  });

  it('CHK-F-03B: 通过 @画框名 明确指代修改时，即使未激活引用也正确路由至 modify_screen', () => {
    const rawResponse = '<artifact identifier="screen-2" type="screen" title="个人中心"><div data-nid="root2"><h1>我的个人中心</h1></div></artifact>';
    const extractedHtml = '<div data-nid="root2"><h1>我的个人中心</h1></div>';

    const result = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '@个人中心 把标题优化一下',
      activeScreenId: null,
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-2', title: '个人中心' }
    });

    expect(result).not.toBeNull();
    expect(result?.tool).toBe('modify_screen');
    if (result?.tool === 'modify_screen') {
      expect(result.params.screenId).toBe('screen-2');
    }
  });

  it('CHK-F-04: 局部元素引用 [引用元素 nid="..."] 依然准确触发 patch_element', () => {
    const fragmentHtml = '<button data-nid="btn1" class="btn-primary">重发验证码</button>';

    const result = resolveToolFromAIResponse({
      rawResponse: fragmentHtml,
      userPrompt: '[引用元素 nid="btn1" 画框="手机号验证码登录"] 把按钮改为深色主题',
      activeScreenId: null,
      screens: existingScreens,
      extractedHtml: fragmentHtml
    });

    expect(result).not.toBeNull();
    expect(result?.tool).toBe('patch_element');
    if (result?.tool === 'patch_element') {
      expect(result.params.screenId).toBe('screen-1');
      expect(result.params.nid).toBe('btn1');
    }
  });

  it('CHK-F-05: 执行未引用时生成的 create_screen，stagedScreen 必须保持为 null，不弹出比选替换栏', async () => {
    const rawResponse = '<artifact identifier="screen-1" type="screen" title="推荐匹配 · 暂无数据"><div data-nid="r3"><h1>暂无数据</h1></div></artifact>';
    const extractedHtml = '<div data-nid="r3"><h1>暂无数据</h1></div>';

    const call = resolveToolFromAIResponse({
      rawResponse,
      userPrompt: '推荐匹配 · 暂无数据',
      activeScreenId: null,
      screens: existingScreens,
      extractedHtml,
      artifactMetadata: { identifier: 'screen-1', title: '推荐匹配 · 暂无数据' }
    });

    expect(call).not.toBeNull();
    expect(call?.tool).toBe('create_screen');

    // 调用 CanvasToolExecutor 执行工具
    const execResult = await CanvasToolExecutor.executeAsync(call!);
    expect(execResult.success).toBe(true);

    const store = useProjectStore.getState();
    // 验证 stagedScreen 为 null (不弹出比选工具栏)
    expect(store.stagedScreen).toBeNull();

    // 验证新画框被成功添加，且由于 screen-1 已存在，新画框获得了全新的唯一 ID
    const screenKeys = Object.keys(store.screens);
    expect(screenKeys.length).toBe(3);
    const newScreen = Object.values(store.screens).find((s) => s.name === '推荐匹配 · 暂无数据');
    expect(newScreen).toBeDefined();
    expect(newScreen?.id).not.toBe('screen-1');
  });
});
