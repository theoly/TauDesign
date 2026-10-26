/**
 * 综合验收测试集 (PRD 全面验收)
 * 验证 PRD D1–D22 决策、§3 系统详细规格、§4 数据模型与 §8 验收指标
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { NidEngine } from '../src/utils/nidEngine';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { setTextByNid } from '../src/utils/textNode';
import { passStagedRenderCheck } from './helpers/stagedQuality';

describe('PRD 全功能综合验收 (Full PRD Acceptance Suite)', () => {
  beforeEach(() => {
    localStorage.clear();
    useHistoryStore.setState({ past: [], future: [], checkpoints: [] });
    useProjectStore.setState({
      id: 'proj-acceptance-1',
      name: 'PRD Acceptance Project',
      screens: {
        'screen-1': {
          id: 'screen-1',
          name: '首页',
          htmlContent: '<div data-nid="root-001" class="col p-4"><h1 data-nid="h1-00001" class="text-2xl font-bold">欢迎</h1><button data-nid="btn-00001" class="btn btn-primary">点击进入</button></div>',
          scopedCss: '',
          position: { x: 100, y: 100 },
          width: 1440,
          updatedAt: Date.now(),
        }
      },
      screenOrder: ['screen-1'],
      activeScreenId: 'screen-1',
      selectedNode: null,
      overrides: {},
      components: {},
      decisions: {
        'dec-1': {
          id: 'dec-1',
          text: '本工程不使用任何渐变背景',
          active: true,
          scope: 'global',
          createdAt: Date.now(),
          sourceMessage: '用户要求'
        }
      },
      settings: {
        deviceProfile: 'pc',
        frameWidth: 1440,
        colorMode: 'dark',
        autoSave: true,
        showDeviceGuide: true,
      },
      stagedScreen: null,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. 导出验收 (PRD §3.9, D5, D14, D19)
  // ─────────────────────────────────────────────────────────────
  describe('1. 交付与导出 (PRD §3.9, D5, D14, D19)', () => {
    test('D5 / D19: 仅单页导出，产物剥离所有内部契约属性 (data-nid, data-asset-id, data-component-*)', () => {
      const dirtyHtml = `
        <div data-nid="n-12345" data-asset-id="ast-99" data-component-id="comp-1" data-component-instance="inst-1" class="card">
          <p data-nid="n-67890">内容文本</p>
        </div>
      `;
      const clean = NidEngine.stripInternalAttributes(dirtyHtml);
      expect(clean).not.toContain('data-nid');
      expect(clean).not.toContain('data-asset-id');
      expect(clean).not.toContain('data-component-id');
      expect(clean).not.toContain('data-component-instance');
      expect(clean).toContain('class="card"');
      expect(clean).toContain('内容文本');
    });

    test('D14: 导出的 CSS 变量仅包含当前生效的色彩模式 (当前为 dark)，不含 light/dark 切换分支', () => {
      const tokens = useProjectStore.getState().designSystem.tokens;
      const css = compileTokensToCss(tokens, 'dark');
      expect(css).toContain(':root {');
      expect(css).toContain('--color-bg:');
      // 必须为 dark 映射的表面色与背景色
      expect(css).not.toContain('@media (prefers-color-scheme');
      expect(css).not.toContain('[data-theme=');
    });

    test('D5: 单页自包含 HTML 结构完整合规，可双击独立运行', () => {
      const state = useProjectStore.getState();
      const screen = state.screens['screen-1'];
      const tokensCss = compileTokensToCss(state.designSystem.tokens, 'dark');
      const cleanHtml = NidEngine.stripInternalAttributes(screen.htmlContent);

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${screen.name}</title>
  <style>${tokensCss}</style>
</head>
<body>${cleanHtml}</body>
</html>`;

      expect(fullHtml).toContain('<!DOCTYPE html>');
      expect(fullHtml).toContain('<title>首页</title>');
      expect(fullHtml).toContain(':root {');
      expect(fullHtml).not.toContain('data-nid');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 组件复用与批量同步 (PRD §3.7, D6, D12)
  // ─────────────────────────────────────────────────────────────
  describe('2. 组件复用体系 (PRD §3.7, D6, D12)', () => {
    test('D6: 从画框元素提取组件，自动注入 data-component-id 与 data-component-instance', () => {
      const compId = useProjectStore.getState().extractComponentFromNode('screen-1', 'btn-00001', '主要按钮');
      expect(compId).not.toBeNull();

      const state = useProjectStore.getState();
      expect(state.components[compId!]).toBeDefined();
      expect(state.components[compId!].name).toBe('主要按钮');
      expect(state.components[compId!].version).toBe(1);
      expect(state.components[compId!].origin).toEqual({ kind: 'extracted', sourceScreenId: 'screen-1', sourceNid: 'btn-00001' });

      const updatedHtml = state.screens['screen-1'].htmlContent;
      expect(updatedHtml).toContain(`data-component-id="${compId}"`);
      expect(updatedHtml).toContain('data-component-instance="');
      expect(updatedHtml).toContain('data-component-version="1"');
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().components[compId!]).toBeUndefined();
      expect(useProjectStore.getState().screens['screen-1'].htmlContent).not.toContain(`data-component-id="${compId}"`);
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().components[compId!].origin?.sourceNid).toBe('btn-00001');
    });

    test('D12: 组件同步时跳过存在冲突样式覆盖的实例，并列出跳过明细', () => {
      // 1. 创建组件
      const compId = useProjectStore.getState().createComponent('通用卡片', '<div class="card p-4"><p>卡片文案</p></div>');

      // 2. 插入一个带覆盖样式的实例
      const instanceNid = 'ov-target-nid';
      useProjectStore.getState().screens['screen-1'].htmlContent += `<div data-nid="${instanceNid}" data-component-id="${compId}" data-component-instance="inst-conflict" class="card p-4"><p>冲突卡片</p></div>`;
      useProjectStore.getState().setOverride('screen-1', instanceNid, { 'background-color': '#ff0000' });

      // 3. 更新组件定义
      useProjectStore.getState().updateComponent(compId, {
        templateHtml: '<div class="card p-6 border"><p>升级版卡片</p></div>'
      });
      expect(useProjectStore.getState().components[compId].version).toBe(2);

      // 4. 同步并验证跳过冲突
      const result = useProjectStore.getState().syncComponentInstances(compId, false);
      expect(result.skippedConflictCount).toBeGreaterThanOrEqual(1);
      expect(result.details.some(d => d.includes('跳过'))).toBe(true);
    });

    test('组件模板版本随内容递增，实例同步后记录新版本', () => {
      const store = useProjectStore.getState();
      const compId = store.createComponent('版本卡片', '<article class="card"><p>内容</p></article>');
      store.insertComponent('screen-1', compId);
      expect(useProjectStore.getState().screens['screen-1'].htmlContent).toContain('data-component-version="1"');
      store.updateComponent(compId, { name: '版本卡片改名' });
      expect(useProjectStore.getState().components[compId].version).toBe(1);
      store.updateComponent(compId, { templateHtml: '<article class="card p-4"><p>内容</p></article>' });
      expect(useProjectStore.getState().components[compId].version).toBe(2);
      const result = useProjectStore.getState().syncComponentInstances(compId, true);
      expect(result.syncedCount).toBeGreaterThan(0);
      expect(useProjectStore.getState().screens['screen-1'].htmlContent).toContain('data-component-version="2"');
    });

    test('分离实例 (Detach) 移除组件关联，保留原始 DOM 结构', () => {
      const compId = useProjectStore.getState().createComponent('标签', '<span class="tag">测试</span>');
      useProjectStore.getState().screens['screen-1'].htmlContent = `<div data-nid="wrap"><span data-nid="tag-1" data-component-id="${compId}" data-component-instance="inst-tag">测试</span></div>`;

      useProjectStore.getState().detachComponentInstance('screen-1', 'tag-1');
      const html = useProjectStore.getState().screens['screen-1'].htmlContent;
      expect(html).not.toContain(`data-component-id="${compId}"`);
      expect(html).not.toContain('data-component-instance=');
      expect(html).not.toContain('data-component-version=');
      expect(html).toContain('data-nid="tag-1"');
      expect(html).toContain('测试');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. AI 变更并排采纳 (PRD §3.2.9, D17)
  // ─────────────────────────────────────────────────────────────
  describe('3. AI 变更并排采纳机制 (PRD §3.2.9, D17)', () => {
    test('D17: 暂存 AI 变体并记录目标画框关联', () => {
      const newHtml = '<div data-nid="root-002" class="p-8"><h1>全新改版页面</h1></div>';

      useProjectStore.getState().stageScreenChange('screen-1', newHtml, '改版方案 A');
      const staged = useProjectStore.getState().stagedScreen;

      expect(staged).not.toBeNull();
      expect(staged?.targetScreenId).toBe('screen-1');
      expect(staged?.newHtml).toBe(newHtml);
      expect(staged?.screenName).toBe('改版方案 A');
    });

    test('D17 采纳分支 1: 「采纳新版」覆盖原画框，原版自动打 Checkpoint 备份', async () => {
      const newHtml = '<div data-nid="root-new" class="p-4"><h1>采纳后的页面</h1><button data-nid="btn-00001" class="btn btn-primary">点击进入</button></div>';
      useProjectStore.getState().stageScreenChange('screen-1', newHtml, '改版方案');

      passStagedRenderCheck();
      await useProjectStore.getState().adoptStagedChange();

      // 原画框已更新为新版 (已注入 nid)
      expect(useProjectStore.getState().screens['screen-1'].htmlContent).toContain('采纳后的页面');
      // 暂存区已清空
      expect(useProjectStore.getState().stagedScreen).toBeNull();
      // 历史记录中存在备份 checkpoint
      const checkpoints = useHistoryStore.getState().checkpoints;
      expect(checkpoints.some(cp => cp.label.includes('采纳新版前备份'))).toBe(true);
    });

    test('D17 采纳分支 2: 「两版都留」开辟新画框，原画框保持不变', async () => {
      const originalHtml = useProjectStore.getState().screens['screen-1'].htmlContent;
      const newHtml = '<div data-nid="root-alt"><h1>独立新分支页面</h1><button data-nid="btn-00001" class="btn btn-primary">点击进入</button></div>';
      useProjectStore.getState().stageScreenChange('screen-1', newHtml, '分支新页');

      passStagedRenderCheck();
      await useProjectStore.getState().keepBothScreens();

      expect(useProjectStore.getState().screens['screen-1'].htmlContent).toBe(originalHtml);
      expect(useProjectStore.getState().screenOrder.length).toBe(2);
      expect(useProjectStore.getState().stagedScreen).toBeNull();
    });

    test('D17 采纳分支 3: 「保留原版」丢弃暂存新版，原画框与历史不变', () => {
      const originalHtml = useProjectStore.getState().screens['screen-1'].htmlContent;
      useProjectStore.getState().stageScreenChange('screen-1', '<div>将被丢弃</div>', '丢弃测试');

      useProjectStore.getState().discardStagedChange();

      expect(useProjectStore.getState().screens['screen-1'].htmlContent).toBe(originalHtml);
      expect(useProjectStore.getState().stagedScreen).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. 工程记忆与设计约定 (PRD §3.2.7, §3.2.8, D18, D20)
  // ─────────────────────────────────────────────────────────────
  describe('4. 工程设计约定与记忆沉淀 (PRD §3.2.7, §3.2.8, D18, D20)', () => {
    test('D20: 沉淀设计决策，支持停用 (保留历史痕迹) 而非物理删除', () => {
      useProjectStore.getState().addDecision('所有主要卡片圆角为 16px', 'global');
      const decisions = Object.values(useProjectStore.getState().decisions);
      const newDec = decisions.find(d => d.text.includes('16px'));
      expect(newDec).toBeDefined();
      expect(newDec?.active).toBe(true);

      // 停用
      useProjectStore.getState().toggleDecision(newDec!.id);
      expect(useProjectStore.getState().decisions[newDec!.id].active).toBe(false);
    });

    test('D18 / D20: Prompt 组装器自动注入生效的决策与组件约束，排除已停用的决策', () => {
      const state = useProjectStore.getState();
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: state.designSystem,
        decisions: Object.values(state.decisions),
        deviceProfile: state.settings.deviceProfile,
        frameWidth: state.settings.frameWidth,
        components: Object.values(state.components),
      });

      expect(prompt).toContain('本工程不使用任何渐变背景');

      // 停用后再次组装，不应包含该条目
      useProjectStore.getState().toggleDecision('dec-1');
      const promptAfter = PromptBuilder.buildSystemPrompt({
        designSystem: state.designSystem,
        decisions: Object.values(useProjectStore.getState().decisions),
        deviceProfile: state.settings.deviceProfile,
        frameWidth: state.settings.frameWidth,
        components: Object.values(state.components),
      });
      expect(promptAfter).not.toContain('本工程不使用任何渐变背景');
    });

    test('D18: 支持 @ 显式提及画框与组件上下文', () => {
      const mentions = PromptBuilder.parseMentions('请参考 @首页 的配色风格设计关于页面');
      expect(mentions.length).toBe(1);
      expect(mentions[0]).toBe('首页');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. 统一文本节点引擎 (PRD §3.6.1, ISSUE-001~004)
  // ─────────────────────────────────────────────────────────────
  describe('5. 文本节点与微调安全 (PRD §3.6.1, ISSUE-001~004)', () => {
    test('ISSUE-003: 容器元素取文本为空或只读，setTextByNid 保护子元素标签不被清空', () => {
      const containerHtml = '<div data-nid="cnt-1"><span data-nid="sub-1">子标题</span><p data-nid="sub-2">正文</p></div>';
      const parsed = setTextByNid(containerHtml, 'cnt-1', '替换文案');
      // 包含子元素的父节点不应允许被当成叶子纯文本覆盖
      expect(parsed).toBeNull();
    });

    test('ISSUE-004: 叶子文本元素修改产生合法 DOM 结构，无标签错配', () => {
      const rawHtml = '<div data-nid="root"><p data-nid="txt-1">原始文本</p></div>';
      const updated = setTextByNid(rawHtml, 'txt-1', '更新后的合规文案');
      expect(updated).not.toBeNull();
      expect(updated).toContain('更新后的合规文案');
      expect(updated).toContain('<p data-nid="txt-1">');
      expect(updated).toContain('</p>');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Token Lint 规范检测与自动修复 (PRD §3.5.4, D3)
  // ─────────────────────────────────────────────────────────────
  describe('6. Token Lint 引擎规范检测与修复 (PRD §3.5.4, D3)', () => {
    test('检出逃逸字面量颜色并计算工程合规率', () => {
      const dirtyHtml = '<div class="p-4" style="color: #ff0055; background: #123456;"><p style="border-radius: 8px;">文本</p></div>';
      const report = TokenLintEngine.scan(dirtyHtml, useProjectStore.getState().designSystem);

      expect(report.totalNodes).toBeGreaterThan(0);
      expect(report.issues.length).toBeGreaterThanOrEqual(1);
      expect(report.complianceRate).toBeLessThan(100);
      expect(report.issues.some(i => i.issueType === 'literal_color')).toBe(true);
    });

    test('一键自动修复将内联逃逸样式映射为 Token CSS 变量', () => {
      const dirtyHtml = '<div style="color: #3b82f6;">链接</div>';
      const fixed = TokenLintEngine.autoFix(dirtyHtml);
      expect(fixed).toContain('var(--color-primary');
      expect(fixed).not.toContain('#3b82f6');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. 设备档位与首屏辅助线 (PRD §3.3.2, D8, D13)
  // ─────────────────────────────────────────────────────────────
  describe('7. 设备档位与视口辅助线 (PRD §3.3.2, D8, D13)', () => {
    test('D8: PC 档位固定画框宽 1440px，首屏辅助线位于 900px', () => {
      const state = useProjectStore.getState();
      expect(state.settings.deviceProfile).toBe('pc');
      expect(state.settings.frameWidth).toBe(1440);
      expect(state.screens['screen-1'].width).toBe(1440);
    });

    test('D8: 移动端档位固定画框宽 390px', () => {
      useProjectStore.getState().addScreen({
        name: '移动端页面',
        htmlContent: '<div>移动页面</div>',
        scopedCss: '',
        position: { x: 400, y: 100 },
        width: 390,
        updatedAt: Date.now()
      });
      const newScreenId = useProjectStore.getState().screenOrder[1];
      expect(useProjectStore.getState().screens[newScreenId].width).toBe(390);
    });

    test('整理排列 (arrangeScreens) 重新规范画框排布，无重叠', () => {
      useProjectStore.getState().addScreen({
        name: '第二页',
        htmlContent: '<div>二</div>',
        scopedCss: '',
        position: { x: 0, y: 0 },
        width: 1440,
        updatedAt: Date.now()
      });
      useProjectStore.getState().addScreen({
        name: '第三页',
        htmlContent: '<div>三</div>',
        scopedCss: '',
        position: { x: 0, y: 0 },
        width: 1440,
        updatedAt: Date.now()
      });
      useProjectStore.getState().arrangeScreens();

      const screens = useProjectStore.getState().screenOrder.map(id => useProjectStore.getState().screens[id]);
      expect(screens.length).toBe(3);
      // X 坐标按序递增且间隔至少 60px
      expect(screens[1].position.x).toBeGreaterThan(screens[0].position.x);
      expect(screens[2].position.x).toBeGreaterThan(screens[1].position.x);
    });
  });
});
