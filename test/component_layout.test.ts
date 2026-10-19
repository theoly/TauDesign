import { describe, expect, test } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import { techBlueTheme } from '../src/utils/themePresets';

describe('组件内容布局契约', () => {
  for (const device of ['pc', 'mobile'] as const) {
    test(`${device}: 标签、头像、输入组合计算样式`, () => {
      const host = document.createElement('div');
      const style = document.createElement('style');
      style.textContent = getBaseCss(device);
      document.head.append(style);
      host.innerHTML = `<div class="row wrap"><span class="badge">第 2 次 / 合同 3 次</span><span class="badge-soft">有效约见待核销</span><span class="tag">提醒待解冻</span></div>
        <span class="avatar">王</span><span class="icon-box"><svg class="icon" viewBox="0 0 24 24"></svg></span>
        <div class="input-group"><input class="input"><button class="btn">获取验证码</button></div>
        <p class="min-w-0 break-words">https://example.com/long-address</p><span class="text-nowrap">王先生</span><div class="nowrap"></div>`;
      document.body.append(host);
      const css = (selector: string) => getComputedStyle(host.querySelector(selector)!);
      try {
        for (const selector of ['.badge', '.badge-soft', '.tag', '.btn']) {
          expect(css(selector).whiteSpace).toBe('nowrap');
          expect(css(selector).flexShrink).toBe('0');
        }
        for (const selector of ['.avatar', '.icon-box']) {
          expect(css(selector).display).toBe('inline-flex');
          expect(css(selector).alignItems).toBe('center');
          expect(css(selector).justifyContent).toBe('center');
          expect(css(selector).flexShrink).toBe('0');
        }
        expect(css('.icon-box > .icon').display).toBe('block');
        expect(css('.input').minWidth).toBe('0');
        expect(css('.input-group').minWidth).toBe('0');
        expect(css('.min-w-0').minWidth).toBe('0');
        expect(css('.break-words').overflowWrap).toBe('anywhere');
        expect(css('.text-nowrap').whiteSpace).toBe('nowrap');
        expect(css('.nowrap').flexWrap).toBe('nowrap');
        expect(css('.nowrap').whiteSpace).not.toBe('nowrap');
      } finally {
        host.remove();
        style.remove();
      }
    });

    test(`${device}: 生成/修改/润色均注入布局契约并保留润色结构限制`, () => {
      const options = { designSystem: techBlueTheme, deviceProfile: device, frameWidth: device === 'pc' ? 1440 : 390 };
      const prompts = [
        PromptBuilder.buildSystemPrompt({ ...options, intent: 'create_screen' }),
        PromptBuilder.buildSystemPrompt({ ...options, intent: 'modify_screen' }),
        buildPolishPrompt(options)
      ];
      for (const prompt of prompts) {
        expect(prompt).toContain('COMPONENT LAYOUT CONTRACT');
        expect(prompt).toContain('.row.wrap.gap-2');
        expect(prompt).toContain('职业位于姓名下方');
        expect(prompt).toContain('不新增或移动节点');
      }
    });
  }
});
