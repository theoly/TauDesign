import {stubPageCreationRender} from './helpers/pageCreation';
stubPageCreationRender();
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';
import { sanitizeScreenTitle, CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('画框上方浮动标题（Trae 风格）、明暗可视性与 AI 命名测试', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-F-01: 画布缩小至 scale < 0.25 时，页面内容保持高保真 iframe 呈现，不变成白板', async () => {
    const mockScreen = {
      id: 'screen-zoom-test',
      name: '会员中心',
      htmlContent: '<div data-nid="c001" class="p-4"><h1>会员权益</h1></div>',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 800
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen as any },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      viewportTransform: { x: 0, y: 0, scale: 0.15 }, // 缩小到 0.15 比例
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390
      }
    });

    await act(async () => {
      root.render(<InfiniteCanvas />);
    });

    // 验证 iframe 依然存在于 DOM 中（高保真渲染保持）
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    // 验证不展示 L0 位图降级文本占位
    expect(container.textContent).not.toContain('L0 位图降级缩略视图');
  });

  test('CHK-F-02: 画框采用 Trae 风格纯净文本标题，无内嵌黑色条与多余图标，支持折行', async () => {
    const mockScreen = {
      id: 'screen-header-test',
      name: '实名认证与安全信息绑定中心',
      htmlContent: '<div data-nid="root001" class="p-4"><p>内容</p></div>',
      position: { x: 100, y: 150 },
      width: 390,
      measuredHeight: 700
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen as any },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen as any} lodLevel={2} />);
    });

    // 1. 验证上方浮动标题区域存在，且不包含手机图标等冗余装饰
    const headerTitle = container.querySelector('div.min-h-\\[26px\\]');
    expect(headerTitle).not.toBeNull();
    expect(headerTitle?.querySelector('svg.lucide-smartphone')).toBeNull();
    expect(headerTitle?.querySelector('svg.lucide-monitor')).toBeNull();

    // 2. 验证标题文本与 break-words 属性存在，支持超长标题自适应折行
    const titleSpan = headerTitle?.querySelector('span[title*="双击重命名"]');
    expect(titleSpan).not.toBeNull();
    expect(titleSpan?.textContent).toBe('实名认证与安全信息绑定中心');
    expect(titleSpan?.className).toContain('break-words');
    expect(titleSpan?.className).toContain('max-w-full');

    // 3. 验证下方原型画框卡片主体为圆角卡片，内嵌 iframe
    const artboardCard = container.querySelector('div.rounded-2xl');
    expect(artboardCard).not.toBeNull();
    expect(artboardCard?.querySelector('iframe')).not.toBeNull();
  });

  test('CHK-F-03: 动作按钮仅在页面激活 (isActive === true) 时展示，未激活页面完全不展示按钮', async () => {
    const mockScreenInactive = {
      id: 'screen-inactive',
      name: '喜欢我的人',
      htmlContent: '<div data-nid="root002" class="p-4"><p>内容</p></div>',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600
    };

    // 1. 未激活状态：按钮完全不渲染 (Trae 极简纯净呈现)
    useProjectStore.setState({
      screens: { [mockScreenInactive.id]: mockScreenInactive as any },
      screenOrder: [mockScreenInactive.id],
      activeScreenId: 'other-screen', // 当前不是激活页
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreenInactive as any} lodLevel={1} />);
    });

    // 查找复制按钮与删除按钮，未激活时不应存在
    expect(container.querySelector('button[title="复制画框"]')).toBeNull();
    expect(container.querySelector('button[title="删除画框"]')).toBeNull();

    // 2. 切换为激活状态：按钮展示
    useProjectStore.setState({
      activeScreenId: mockScreenInactive.id
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreenInactive as any} lodLevel={2} />);
    });

    expect(container.querySelector('button[title="复制画框"]')).not.toBeNull();
    expect(container.querySelector('button[title="删除画框"]')).not.toBeNull();
  });

  test('CHK-F-04: 浅色与深色主题下标题文字可视性断言 (ISSUE-022 统一深色画布高对比度)', async () => {
    const mockScreen = {
      id: 'screen-theme-vis-test',
      name: '动态详情',
      htmlContent: '<div data-nid="root003" class="p-4"></div>',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600
    };

    // 1. 浅色模式下：画板为深色底，未激活具备高对比度亮色 text-slate-300，激活具备醒目亮蓝 text-blue-400
    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen as any },
      screenOrder: [mockScreen.id],
      activeScreenId: 'other',
      settings: {
        ...useProjectStore.getState().settings,
        colorMode: 'light'
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen as any} lodLevel={1} />);
    });
    const headerLightInactive = container.querySelector('div.min-h-\\[26px\\]');
    expect(headerLightInactive?.className).toContain('text-slate-300');
    expect(headerLightInactive?.className).not.toContain('text-slate-700');

    // 激活态
    useProjectStore.setState({ activeScreenId: mockScreen.id });
    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen as any} lodLevel={2} />);
    });
    const headerLightActive = container.querySelector('div.min-h-\\[26px\\]');
    expect(headerLightActive?.className).toContain('text-blue-400');
    expect(headerLightActive?.className).not.toContain('text-blue-600');

    // 2. 深色模式下：未激活具备 text-slate-300，激活具备 text-blue-400
    useProjectStore.setState({
      activeScreenId: 'other',
      settings: {
        ...useProjectStore.getState().settings,
        colorMode: 'dark'
      }
    });
    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen as any} lodLevel={1} />);
    });
    const headerDarkInactive = container.querySelector('div.min-h-\\[26px\\]');
    expect(headerDarkInactive?.className).toContain('text-slate-300');

    // 激活态
    useProjectStore.setState({ activeScreenId: mockScreen.id });
    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen as any} lodLevel={2} />);
    });
    const headerDarkActive = container.querySelector('div.min-h-\\[26px\\]');
    expect(headerDarkActive?.className).toContain('text-blue-400');
  });

  test('CHK-F-05: AI 新建页面命名放宽：<= 20 汉字完整保留，过滤 (AI 方案) 冗余标记', async () => {
    // 1. 贴切且中等长度的标题（如用户提出的 <= 20 汉字）完整保留
    expect(sanitizeScreenTitle('送花表达心意 - 牵手币充值')).toBe('送花表达心意 - 牵手币充值');
    expect(sanitizeScreenTitle('动态详情')).toBe('动态详情');
    expect(sanitizeScreenTitle('会员权益与开通指南')).toBe('会员权益与开通指南');

    // 2. 常见 AI 括号修饰词过滤
    expect(sanitizeScreenTitle('送花表达心意 - 牵手币充值 (AI 方案)')).toBe('送花表达心意 - 牵手币充值');
    expect(sanitizeScreenTitle('实名认证中心 (AI新版)')).toBe('实名认证中心');
    expect(sanitizeScreenTitle('个人资料编辑【候选草稿】')).toBe('个人资料编辑');

    // 3. 超出 20 字截断保底
    const over20 = '这是一个超级长长长长长长长长长长长长长长长长长长长长长长长页面名称';
    expect(sanitizeScreenTitle(over20).length).toBe(20);

    // 4. 空值与兜底
    expect(sanitizeScreenTitle('')).toBe('新页面');

    // 5. CanvasToolExecutor 在 create_screen 时自动执行 sanitize
    const res = await CanvasToolExecutor.executeAsync({
      tool: 'create_screen',
      params: {
        title: '送花表达心意 - 牵手币充值 (AI 方案)',
        html: '<div data-nid="nid1">充值</div>'
      }
    });
    expect(res.success).toBe(true);
    expect(res.screenName).toBe('送花表达心意 - 牵手币充值');
  });
});
