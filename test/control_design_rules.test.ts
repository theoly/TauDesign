import { describe, test, expect } from 'bun:test';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import { getBaseCss } from '../src/styles/baseCss';
import { techBlueTheme } from '../src/utils/themePresets';

describe('控件设计规范', () => {
  test('PC/Mobile新建、修改、润色均要求按钮单行，保留用户多行例外与文案', () => {
    for (const deviceProfile of ['pc', 'mobile'] as const) {
      const options = { designSystem: techBlueTheme, deviceProfile, frameWidth: deviceProfile === 'pc' ? 1440 : 390 };
      const prompts = [
        PromptBuilder.buildSystemPrompt({ ...options, intent: 'create_screen' }),
        PromptBuilder.buildSystemPrompt({ ...options, intent: 'modify_screen' }),
        buildPolishPrompt(options)
      ];
      for (const prompt of prompts) {
        expect(prompt).toContain('按钮文字默认不换行');
        expect(prompt).toContain('white-space: nowrap');
        expect(prompt).toContain('让按钮组整体换行');
        expect(prompt).toContain('不改写、截断指定文案');
        expect(prompt).toContain('仅用户明确要求时');
        expect(prompt).toContain('white-space: normal');
      }
    }
  });

  test('仅新建注入同组多状态规则，参考图不漏注入，保留业务一致与移动约束', () => {
    for (const deviceProfile of ['pc', 'mobile'] as const) {
      const options = { designSystem: techBlueTheme, deviceProfile, frameWidth: deviceProfile === 'pc' ? 1440 : 390 };
      for (const hasAttachment of [false, true]) {
        const prompt = PromptBuilder.buildSystemPrompt({ ...options, intent: 'create_screen', hasAttachment });
        expect(prompt).toContain('新页面同组控件多状态');
        expect(prompt).toContain('尽量利用现有实例展示代表性不同状态');
        expect(prompt).toContain('空值/已填/错误/禁用');
        expect(prompt).toContain('互斥组最多一个选中');
        expect(prompt).toContain('不额外堆砌控件');
        expect(prompt).toContain('遵守用户指定状态和参考图');
        expect(prompt).toContain('移动端不依赖hover');
      }
      for (const intent of ['modify_screen', 'change_theme', 'question'] as const) {
        expect(PromptBuilder.buildSystemPrompt({ ...options, intent })).not.toContain('新页面同组控件多状态');
      }
      expect(buildPolishPrompt(options)).not.toContain('新页面同组控件多状态');
    }
  });

  test('两设备基座按钮单行，嵌套文案继承；显式多行样式可覆盖', () => {
    for (const device of ['pc', 'mobile'] as const) {
      const doc = document;
      const style = doc.createElement('style');
      style.textContent = getBaseCss(device);
      doc.head.append(style);
      const button = doc.createElement('button');
      button.className = 'btn btn-primary';
      const label = doc.createElement('span');
      label.textContent = '确认并提交所有选择';
      button.append(label);
      doc.body.append(button);
      try {
        expect(window.getComputedStyle(button).whiteSpace).toBe('nowrap');
        expect(window.getComputedStyle(label).whiteSpace).toBe('nowrap');
        button.style.whiteSpace = 'normal';
        expect(window.getComputedStyle(button).whiteSpace).toBe('normal');
        expect(window.getComputedStyle(label).whiteSpace).toBe('normal');
      } finally {
        button.remove();
        style.remove();
      }
    }
  });
});
