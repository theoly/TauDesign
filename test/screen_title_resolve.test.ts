import { describe, expect, test } from 'bun:test';
import {
  extractExplicitTitleFromPrompt,
  extractTitleFromHtml,
  isPromptLikeTitle,
  resolveScreenTitle,
  sanitizeScreenTitle
} from '../src/utils/screenTitle';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';

const longBrief = '你是微信原生小程序的资深UI/UX设计师。为“星命观”设计高保真中文移动页面。以下是完整约束…';

describe('页面标题裁决 · 禁止提示词前缀命名', () => {
  test('识别角色设定 / 提示词截断式伪标题', () => {
    expect(isPromptLikeTitle('你是微信原生小程序的资深UI', longBrief)).toBe(true);
    expect(isPromptLikeTitle('你是一名产品经理', longBrief)).toBe(true);
    expect(isPromptLikeTitle('Page Title')).toBe(true);
    expect(isPromptLikeTitle('贴切精简页面标题(不超过20字)')).toBe(true);
    expect(isPromptLikeTitle('材料上传', longBrief)).toBe(false);
    expect(isPromptLikeTitle('说说这次决定', longBrief)).toBe(false);
  });

  test('用户显式指定标题优先', () => {
    expect(extractExplicitTitleFromPrompt('新建页面「材料上传」，支持截图与文档')).toBe('材料上传');
    expect(extractExplicitTitleFromPrompt('页面标题：决策草稿\n其余说明很长')).toBe('决策草稿');
    expect(extractExplicitTitleFromPrompt(longBrief)).toBeUndefined();
  });

  test('从生成页 h1 提炼标题，跳过伪标题 artifact', () => {
    const html = `<main class="col"><h1>发来材料，说说你在犹豫什么</h1><p>一张图或一句话都可以。</p></main>`;
    expect(extractTitleFromHtml(html)).toBe('发来材料，说说你在犹豫什么');
    expect(resolveScreenTitle({
      artifactTitle: '你是微信原生小程序的资深UI',
      userPrompt: longBrief,
      html
    })).toBe('发来材料，说说你在犹豫什么');
  });

  test('合格 artifact 标题保留；过长仍截断', () => {
    expect(resolveScreenTitle({ artifactTitle: '会员中心', html: '<main><h1>别的</h1></main>' })).toBe('会员中心');
    expect(sanitizeScreenTitle('送花表达心意 - 牵手币充值 (AI 方案)')).toBe('送花表达心意 - 牵手币充值');
  });

  test('create_screen 工具解析使用内容标题而非提示词前缀', () => {
    const html = `<main data-nid="root"><h1 data-nid="h">说说这次决定</h1><p>补充材料后继续。</p></main>`;
    const call = resolveToolFromAIResponse({
      rawResponse: `<artifact identifier="screen_new" type="screen" title="你是微信原生小程序的资深UI">${html}</artifact>`,
      userPrompt: longBrief,
      activeScreenId: null,
      screens: {},
      extractedHtml: html,
      artifactMetadata: { identifier: 'screen_new', title: '你是微信原生小程序的资深UI' },
      decision: { intent: 'create_screen', targetScreenId: null }
    });
    expect(call?.tool).toBe('create_screen');
    expect(call?.params).toMatchObject({ title: '说说这次决定' });
  });
});
