import { describe, it, expect } from 'bun:test';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { techBlueTheme } from '../src/utils/themePresets';
import { TokenLintEngine } from '../src/utils/tokenLint';

describe('高保真视觉与布局复刻协议 2.0 (Vision Fidelity 2.0)', () => {
  it('CHK-VF-01: contextEnricher 彻底移除历史交友登录页特异性硬编码，保持通用普适性', () => {
    const enriched = enrichContext({
      rawPrompt: '参考附件图片生成认证中心页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'MOCK_SYSTEM_PROMPT',
      attachment: {
        name: 'certification_screen.png',
        dataUrl: 'data:image/png;base64,mockImageContent'
      }
    });

    const userMessage = enriched.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();
    const content = userMessage?.content || '';

    // 严禁包含历史单身相亲交友硬编码
    expect(content).not.toContain('单身青年');
    expect(content).not.toContain('获取验证码');
    expect(content).not.toContain('线下见面');
    expect(content).not.toContain('兴趣匹配');
  });

  it('CHK-VF-02: 多模态反推协议 2.0 包含色彩调性、全幅顶栏、双态按钮、贴角角标与抗笑脸幻觉', () => {
    const enriched = enrichContext({
      rawPrompt: '精准复刻页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'MOCK_SYSTEM_PROMPT',
      attachment: {
        name: 'reference.png',
        dataUrl: 'data:image/png;base64,mockImageContent'
      }
    });

    const content = enriched.messages.find((m) => m.role === 'user')?.content || '';

    // 1. 色彩与氛围：明确禁止死白扁平化，识别温润暖杏/米色底色
    expect(content).toContain('GLOBAL CANVAS & AMBIENT MOOD');
    expect(content).toContain('DO NOT flatten warm or colored backgrounds to stark white');
    expect(content).toContain('#FFF9F0');

    // 2. 顶栏拓扑：全幅沉浸顶栏直铺，严禁底部加圆角做成悬浮药丸卡片
    expect(content).toContain('Full-bleed Hero Integrity');
    expect(content).toContain('DO NOT wrap the top area in an artificial floating card with bottom rounded corners');

    // 3. 按钮位置与双态：已完成静止态 vs 活跃 CTA
    expect(content).toContain('BUTTON PLACEMENT & IN-FLOW INTEGRITY');
    expect(content).toContain('Dual-state Button Styling');
    expect(content).toContain('Inactive / Completed state');

    // 4. 微形态：贴角角标 Ribbon 与次级提示条
    expect(content).toContain('Corner Badges (Ribbons)');
    expect(content).toContain('Secondary Notice Bars');

    // 5. 严格抗幻觉：严禁生成卡通笑脸表情
    expect(content).toContain('STRICT ANTI-HALLUCINATION');
    expect(content).toContain('NEVER invent cartoon smileys');
  });

  it('CHK-VF-03: 移动端美学规范支持 Full-Bleed 沉浸式顶栏与角标状态条指引', () => {
    const promptMobile = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen'
    });

    expect(promptMobile).toContain('FULL-BLEED HERO BANNERS & GRADIENTS');
    expect(promptMobile).toContain('RIBBON BADGES & STATUS STRIPS');
    expect(promptMobile).toContain('CTA BUTTON PLACEMENT');
  });

  it('CHK-VF-04: 当带附件 (hasAttachment: true) 时，注入 REFERENCE IMAGE FIDELITY 且保持输出契约末位', () => {
    const prompt = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen',
      hasAttachment: true
    });

    expect(prompt).toContain('REFERENCE IMAGE FIDELITY');
    expect(prompt).not.toContain('### REFERENCE EXAMPLE');
    expect(prompt).toContain('### OUTPUT CONTRACT');
  });

  it('CHK-VF-05: 贴角角标与次级通栏基座 HTML 结构通过 TokenLint 静态检查 0 报错', () => {
    // 模拟符合规范的高保真认证卡片与提示通栏
    const sampleHtml = `
      <main class="col bg-ambient-warm">
        <div class="col p-4">
          <div class="card p-4 col gap-3">
            <div class="row items-center justify-between">
              <div class="row items-center gap-3">
                <div class="p-2 r-md bg-warning-light">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
                </div>
                <div class="col">
                  <div class="row items-center gap-2">
                    <span class="font-bold text-md">工作认证</span>
                    <span class="badge badge-soft text-warning">推荐完成</span>
                  </div>
                  <span class="text-xs text-muted">上传工牌或名片，人工审核</span>
                </div>
              </div>
              <button class="btn btn-primary text-xs">立即认证</button>
            </div>
            <div class="row items-center gap-2 p-2 r-md bg-surface-alt">
              <svg class="icon text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span class="text-xs text-muted">你的资料已展示「已认证」金色徽章</span>
            </div>
          </div>
        </div>
      </main>
    `;

    const report = TokenLintEngine.scan(sampleHtml, techBlueTheme, 'mobile');
    const unknownClasses = report.issues.filter((i) => i.issueType === 'unknown_class');
    const literalColors = report.issues.filter((i) => i.issueType === 'literal_color');

    expect(unknownClasses.length).toBe(0);
    expect(literalColors.length).toBe(0);
  });

  it('CHK-VF-06: 多模态协议包含内容范围忠实度约束，禁止新增参考图未出现的功能区块/菜单项/标签', () => {
    const enriched = enrichContext({
      rawPrompt: '参考附件图片精准复刻页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'MOCK_SYSTEM_PROMPT',
      attachment: {
        name: 'reference.png',
        dataUrl: 'data:image/png;base64,mockImageContent'
      }
    });

    const content = enriched.messages.find((m) => m.role === 'user')?.content || '';

    expect(content).toContain('CONTENT SCOPE FIDELITY');
    expect(content).toContain('DO NOT invent, add, or supplement extra sections/items that do not appear in the reference image');
  });
});
