import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useProjectStore } from '../src/stores/useProjectStore';
import { listProjects, upsertMeta, writeProject, ProjectMeta } from '../src/utils/projectRegistry';
import { captureScreenSnippetAsDataUrl } from '../src/utils/screenCapture';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { ProjectManager } from '../src/components/workspace/ProjectManager';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';

describe('工程列表封面特性 (Project Cover Image - T-PCI-01 ~ T-PCI-05)', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // 初始化测试工程
    useProjectStore.getState().initNewProject({
      name: '测试测试工程',
      deviceProfile: 'pc',
      designSystem: useProjectStore.getState().designSystem,
      createSpecimen: false
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    if (container && container.parentNode) {
      container.remove();
    }
  });

  const renderComponent = (ui: React.ReactElement) => {
    act(() => {
      root.render(ui);
    });
  };

  test('CHK-F-01: useProjectStore 支持 setCoverImage 并在 saveProject 完成后更新注册表元信息', async () => {
    const store = useProjectStore.getState();
    expect(store.coverImage).toBeNull();

    const sampleCover = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
    store.setCoverImage(sampleCover);

    expect(useProjectStore.getState().coverImage).toBe(sampleCover);

    await store.saveProjectChecked();
    // 校验注册表
    const all = listProjects();
    const currentMeta = all.find((p) => p.id === store.id);
    expect(currentMeta).toBeDefined();
    expect(currentMeta?.coverImage).toBe(sampleCover);
  });

  test('CHK-F-02: captureScreenSnippetAsDataUrl 能够将画框核心视口转换为合法图片 DataURL', async () => {
    const mockScreen = {
      id: 'screen-test-1',
      name: '仪表盘主页',
      position: { x: 0, y: 0 },
      htmlContent: '<div data-nid="dash0001" class="card p-4"><h1>Dashboard Title</h1><p>Content</p></div>'
    };

    const dataUrl = await captureScreenSnippetAsDataUrl(mockScreen, {
      frameWidth: 1440,
      tokensCss: ':root { --color-bg: #ffffff; }',
      baseCss: '.card { padding: 16px; }',
      colorMode: 'light'
    });

    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.startsWith('data:image/')).toBe(true);
  });

  test('CHK-F-03: 画框处于激活态时显示「设为工程封面」按钮，非激活态隐藏', () => {
    const screenObj = {
      id: 'screen-101',
      name: '登录注册页',
      position: { x: 100, y: 100 },
      htmlContent: '<div data-nid="test0001" class="p-6"><h1>Login</h1></div>'
    };

    useProjectStore.setState({
      screens: { [screenObj.id]: screenObj },
      screenOrder: [screenObj.id]
    });

    // 1. 未激活态：activeScreenId 不是它
    useProjectStore.setState({ activeScreenId: 'other-screen' });
    renderComponent(<ScreenFrame screen={screenObj} lodLevel={2} />);
    expect(container.querySelector('[data-testid="set-as-cover-btn"]')).toBeNull();

    // 2. 激活态：activeScreenId 与 screen.id 一致
    useProjectStore.setState({ activeScreenId: screenObj.id });
    renderComponent(<ScreenFrame screen={screenObj} lodLevel={2} />);
    const btn = container.querySelector('[data-testid="set-as-cover-btn"]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('设为工程封面');
  });

  test('CHK-F-04: 点击「设为工程封面」成功截取并更新工程封面与反馈状态', async () => {
    const screenObj = {
      id: 'screen-202',
      name: '电商首页',
      position: { x: 50, y: 50 },
      htmlContent: '<div data-nid="hero0001" class="hero"><h1>Summer Sale</h1></div>'
    };

    useProjectStore.setState({
      activeScreenId: screenObj.id,
      screens: { [screenObj.id]: screenObj },
      screenOrder: [screenObj.id]
    });

    renderComponent(<ScreenFrame screen={screenObj} lodLevel={2} />);
    const btn = container.querySelector('[data-testid="set-as-cover-btn"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    await act(async () => {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // 确认 store 中的 coverImage 已被写入截取的数据
    const currentCover = useProjectStore.getState().coverImage;
    expect(typeof currentCover).toBe('string');
    expect(currentCover!.startsWith('data:image/')).toBe(true);

    // 确认注册表也已同步该封面
    const meta = listProjects().find((p) => p.id === useProjectStore.getState().id);
    expect(meta?.coverImage).toBe(currentCover);
  });

  test('CHK-F-05: 工程列表卡片优先渲染显式指定的 coverImage', () => {
    localStorage.clear();
    const customCoverUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    const mockMeta: ProjectMeta = {
      id: 'proj_with_cover',
      name: 'AI 绘画助手',
      deviceProfile: 'pc',
      frameWidth: 1440,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      screenCount: 3,
      previewHtml: '<div data-nid="prev0001">Old Preview</div>',
      coverImage: customCoverUrl
    };

    upsertMeta(mockMeta);
    writeProject(mockMeta.id, JSON.stringify({ id: mockMeta.id, name: mockMeta.name, screens: {} }));
    useWorkspaceStore.getState().refresh();

    renderComponent(<ProjectManager />);

    const coverContainer = container.querySelector('[data-testid="project-custom-cover"]');
    expect(coverContainer).not.toBeNull();
    const img = coverContainer?.querySelector('img');
    expect(img?.getAttribute('src')).toBe(customCoverUrl);
    expect(coverContainer?.textContent).toContain('自定义封面');
  });

  test('CHK-F-06: 未指定封面但有画框时，展示首个画框的部分截图视图', () => {
    localStorage.clear();
    const mockMeta: ProjectMeta = {
      id: 'proj_no_cover_has_screens',
      name: '金融大盘监控',
      deviceProfile: 'pc',
      frameWidth: 1440,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      screenCount: 2,
      previewHtml: '<div data-nid="fin0001" class="finance-header"><h1>Stock View</h1></div>'
    };

    upsertMeta(mockMeta);
    writeProject(mockMeta.id, JSON.stringify({ id: mockMeta.id, name: mockMeta.name, screens: {} }));
    useWorkspaceStore.getState().refresh();

    renderComponent(<ProjectManager />);

    const screenCover = container.querySelector('[data-testid="project-screen-cover"]');
    expect(screenCover).not.toBeNull();
    const iframe = screenCover?.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('Stock View');
  });

  test('CHK-F-07: 工程无页面（0 页面）时，展示优雅的空白与工程名字封面', () => {
    localStorage.clear();
    const mockMeta: ProjectMeta = {
      id: 'proj_empty_screens',
      name: '空白创新实验',
      deviceProfile: 'mobile',
      frameWidth: 390,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      screenCount: 0
    };

    upsertMeta(mockMeta);
    writeProject(mockMeta.id, JSON.stringify({ id: mockMeta.id, name: mockMeta.name, screens: {} }));
    useWorkspaceStore.getState().refresh();

    renderComponent(<ProjectManager />);

    const nameCover = container.querySelector('[data-testid="project-name-cover"]');
    expect(nameCover).not.toBeNull();
    expect(nameCover?.textContent).toContain('空白创新实验');
    expect(nameCover?.textContent).toContain('移动端 390');
    expect(nameCover?.textContent).toContain('空白画板');
  });
});

