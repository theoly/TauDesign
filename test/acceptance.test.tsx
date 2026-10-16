/**
 * 验收测试：按 doc/plan-phase1.md 的 M1 验收脚本走真实组件树
 * (工程管理页 → 新建 → 工作空间 → 侧边栏 → 顶栏 → 画框拖动 → 返回)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from '../src/App';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { listProjects } from '../src/utils/projectRegistry';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const render = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(React.createElement(App));
  });
};

const cleanup = () => {
  act(() => root.unmount());
  container.remove();
};

const text = () => container.textContent || '';
const byTitle = (t: string) => container.querySelector(`[title="${t}"]`) as HTMLElement | null;
const allByTitle = (t: string) => Array.from(container.querySelectorAll(`[title*="${t}"]`)) as HTMLElement[];
const click = (el: Element | null) => {
  expect(el).not.toBeNull();
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const findButton = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label)) || null;

describe('M1 验收 · 工程管理页与工作空间外壳', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  });
  afterEach(cleanup);

  test('1. 启动进入的是工程管理页，而非工作空间；首次启动显示空状态引导', () => {
    render();
    expect(text()).toContain('选择一个工程继续');
    expect(text()).toContain('还没有任何工程');
    expect(findButton('新建第一个工程')).not.toBeNull();
    // 工作空间的标志性元素不应存在
    expect(text()).not.toContain('交付导出');
  });

  test('2-3. 新建工程（移动端档位）后进入工作空间，顶栏只读展示档位且无切换按钮', () => {
    render();
    click(findButton('新建第一个工程'));
    expect(text()).toContain('新建工程');
    // D8 的不可更改警示必须出现在新建对话框里
    expect(text()).toContain('设备档位在工程创建后不可更改');

    click(findButton('移动端'));
    click(findButton('创建并进入'));

    // 已进入工作空间
    expect(text()).toContain('交付导出');
    expect(useWorkspaceStore.getState().view).toBe('workspace');
    expect(useProjectStore.getState().settings.deviceProfile).toBe('mobile');
    expect(useProjectStore.getState().settings.frameWidth).toBe(390);

    // 顶栏：只读徽标存在
    const badge = allByTitle('设备档位：移动端');
    expect(badge.length).toBe(1);
    expect(badge[0].tagName.toLowerCase()).toBe('span'); // 不是 button，不可点击
    expect(badge[0].textContent).toContain('390');

    // 顶栏：不存在任何档位切换控件
    expect(byTitle('PC 桌面档位 (1440px)')).toBeNull();
    expect(byTitle('移动端档位 (390px)')).toBeNull();
    const switchBtns = Array.from(container.querySelectorAll('header button')).filter((b) =>
      /PC \(1440\)|移动端 \(390\)/.test(b.textContent || '')
    );
    expect(switchBtns.length).toBe(0);
  });

  test('4. 活动栏五视图互斥切换；再点当前项折叠侧边栏', () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));

    const activity = ['页面', '资源', '设计系统', '历史', '元素属性'].map((t) => byTitle(t));
    expect(activity.every((el) => el !== null)).toBe(true);

    // 默认「页面」视图
    expect(text()).toContain('页面画框');

    click(byTitle('资源'));
    expect(text()).toContain('资源中心（上传 / AI 生成）');
    expect(text()).not.toContain('页面画框');

    click(byTitle('设计系统'));
    expect(text()).toContain('完整主题编辑器');
    expect(text()).toContain('工程约定');

    click(byTitle('历史'));
    expect(text()).toContain('撤销栈');
    expect(text()).toContain('自动还原点');

    click(byTitle('元素属性'));
    expect(byTitle('元素属性')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="resource-sidebar"]')?.textContent).toContain('未选中任何元素');
    click(byTitle('历史'));

    // 再点当前项 → 折叠
    click(byTitle('历史'));
    expect(text()).not.toContain('撤销栈');
    // 活动栏本身仍在
    expect(byTitle('页面')).not.toBeNull();
  });

  test('8. 返回工程管理后，最近列表出现该工程并可重新打开', () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));
    const projectId = useWorkspaceStore.getState().activeProjectId!;

    click(byTitle('保存并返回工程管理'));
    expect(useWorkspaceStore.getState().view).toBe('manager');
    expect(text()).toContain('未命名工程');
    expect(text()).toContain('PC 1440');
    expect(text()).toContain('0 个页面');

    // 注册表确有该工程
    expect(listProjects().map((p) => p.id)).toContain(projectId);

    // 重新打开
    const card = Array.from(container.querySelectorAll('div')).find((d) =>
      (d.className || '').includes('group relative bg-slate-900')
    );
    click(card!);
    expect(useWorkspaceStore.getState().view).toBe('workspace');
    expect(useProjectStore.getState().id).toBe(projectId);
  });

  test('10. 工程数据丢失时卡片置灰并阻止打开', () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));
    const projectId = useWorkspaceStore.getState().activeProjectId!;
    click(byTitle('保存并返回工程管理'));

    // 模拟工程文件夹被移走
    localStorage.removeItem(`ai_designer_project_${projectId}`);
    act(() => {
      useWorkspaceStore.getState().refresh();
    });

    expect(useWorkspaceStore.getState().missingIds).toContain(projectId);
    expect(text()).toContain('工程数据已丢失');
  });
});

describe('画框顶栏拖动 (PRD §3.3.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  });
  afterEach(cleanup);

  const enterWorkspace = () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));
    if (useProjectStore.getState().screenOrder.length === 0) {
      useProjectStore.getState().addBlankScreen();
    }
  };

  const drag = (el: HTMLElement, dx: number, dy: number) => {
    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + dx, clientY: 100 + dy }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', {}));
    });
  };

  test('按住顶栏拖动会改变画框位置，位移按画板缩放比换算', () => {
    enterWorkspace();
    const screenId = useProjectStore.getState().screenOrder[0];
    const before = { ...useProjectStore.getState().screens[screenId].position };

    // 画板初始缩放 0.7：屏幕位移 70px 对应世界坐标 100px
    act(() => useProjectStore.getState().setViewportTransform({ x: 0, y: 0, scale: 0.7 }));
    const bar = byTitle('按住拖动可调整画框位置');
    expect(bar).not.toBeNull();

    drag(bar!, 70, 35);
    const after = useProjectStore.getState().screens[screenId].position;
    expect(after.x).toBe(before.x + 100);
    expect(after.y).toBe(before.y + 50);
  });

  test('缩放 25% 时同样的屏幕位移对应四倍世界位移', () => {
    enterWorkspace();
    const screenId = useProjectStore.getState().screenOrder[0];
    const before = { ...useProjectStore.getState().screens[screenId].position };

    act(() => useProjectStore.getState().setViewportTransform({ x: 0, y: 0, scale: 0.25 }));
    drag(byTitle('按住拖动可调整画框位置')!, 25, 0);

    expect(useProjectStore.getState().screens[screenId].position.x).toBe(before.x + 100);
  });

  test('微小抖动不改变位置（点击不应被误判为拖动）', () => {
    enterWorkspace();
    const screenId = useProjectStore.getState().screenOrder[0];
    const before = { ...useProjectStore.getState().screens[screenId].position };

    act(() => useProjectStore.getState().setViewportTransform({ x: 0, y: 0, scale: 1 }));
    drag(byTitle('按住拖动可调整画框位置')!, 1, 1);

    expect(useProjectStore.getState().screens[screenId].position).toEqual(before);
  });
});

describe('工程隔离', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  });
  afterEach(cleanup);

  test('两个工程的档位与页面互不串台', () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入')); // PC 默认
    const pcId = useWorkspaceStore.getState().activeProjectId!;
    act(() => useProjectStore.getState().setName('PC 工程'));
    click(byTitle('保存并返回工程管理'));

    click(findButton('新建工程'));
    click(findButton('移动端'));
    click(findButton('创建并进入'));
    const mobileId = useWorkspaceStore.getState().activeProjectId!;
    expect(mobileId).not.toBe(pcId);
    expect(useProjectStore.getState().settings.frameWidth).toBe(390);

    // 切回 PC 工程
    click(byTitle('保存并返回工程管理'));
    act(() => {
      useWorkspaceStore.getState().openProject(pcId);
    });
    expect(useProjectStore.getState().name).toBe('PC 工程');
    expect(useProjectStore.getState().settings.frameWidth).toBe(1440);
    expect(listProjects().length).toBe(2);
  });
});

describe('ISSUE-001～004 验收 · 检查器文本字段', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  });
  afterEach(cleanup);

  /** 定位「文本内容」分组里的输入框：从 label 出发，避免匹配到外层容器 */
  const textInput = (): HTMLInputElement | null => {
    const label = Array.from(container.querySelectorAll('label')).find((l) =>
      (l.textContent || '').includes('文本内容')
    );
    return (label?.parentElement?.querySelector('input') as HTMLInputElement) || null;
  };

  const select = (nid: string, textContent: string, editable: boolean, reason?: string) => {
    const screenId = useProjectStore.getState().screenOrder[0];
    act(() => {
      useProjectStore.getState().selectNode({
        screenId,
        nid,
        tagName: 'p',
        textContent,
        textEditable: editable,
        textReason: reason as any,
        classNames: [],
        parentChain: [],
        computedBox: {
          width: 100, height: 20, top: 0, left: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      });
    });
  };

  const enterWorkspace = () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));
    if (useProjectStore.getState().screenOrder.length === 0) {
      useProjectStore.getState().addBlankScreen();
    }
  };

  test('ISSUE-001：连续切换选中元素，文本框始终显示当前元素的文本', () => {
    enterWorkspace();

    select('n-a', '甲元素文案', true);
    expect(textInput()?.value).toBe('甲元素文案');

    // 关键路径：A → B 之间不插入无文本元素。旧实现在这里仍显示 A 的文本
    select('n-b', '乙元素文案', true);
    expect(textInput()?.value).toBe('乙元素文案');

    select('n-c', '丙元素文案', true);
    expect(textInput()?.value).toBe('丙元素文案');

    // 来回切换二十次，结果必须稳定（原缺陷是间歇性的，单次通过不足以证明）
    for (let i = 0; i < 20; i++) {
      select('n-a', '甲元素文案', true);
      expect(textInput()?.value).toBe('甲元素文案');
      select('n-b', '乙元素文案', true);
      expect(textInput()?.value).toBe('乙元素文案');
    }
  });

  test('ISSUE-002：无文本元素时字段仍在，只是置灰，不整块消失', () => {
    enterWorkspace();
    select('n-empty', '', true);
    const input = textInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe('');
    expect(input!.disabled).toBe(false);
  });

  test('ISSUE-003：含子元素时字段只读并给出原因', () => {
    enterWorkspace();
    select('n-container', '标题正文', false, 'has-children');
    const input = textInput();
    expect(input).not.toBeNull();
    expect(input!.disabled).toBe(true);
    expect(text()).toContain('请选中具体的文本节点编辑');
  });

  test('ISSUE-003：空元素（img 等）字段只读并给出原因', () => {
    enterWorkspace();
    select('n-img', '', false, 'void-element');
    expect(textInput()!.disabled).toBe(true);
    expect(text()).toContain('此元素不能包含文本');
  });
});

describe('折叠面板展开状态随工程持久化 (PRD §3.0.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  });
  afterEach(cleanup);

  const enterWorkspace = () => {
    render();
    click(findButton('新建第一个工程'));
    click(findButton('创建并进入'));
  };

  /** 折叠面板的标题按钮 */
  const panelToggle = (title: string) =>
    Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-expanded') !== null && (b.textContent || '').includes(title)
    ) || null;

  test('未记录过的面板回落到 defaultOpen（新增面板无需数据迁移）', () => {
    enterWorkspace();
    click(byTitle('设计系统'));
    expect(useProjectStore.getState().panelStates['design.colors']).toBeUndefined();
    // 色彩 defaultOpen=true → 内容可见；排版 defaultOpen=false → 内容不可见
    expect(text()).toContain('Primary 500');
    expect(text()).not.toContain('无衬线');
  });

  test('折叠后状态写入 store 并落盘', () => {
    enterWorkspace();
    click(byTitle('设计系统'));

    click(panelToggle('色彩'));
    expect(useProjectStore.getState().panelStates['design.colors']).toBe(false);
    expect(text()).not.toContain('Primary 500');

    const projectId = useProjectStore.getState().id;
    const saved = JSON.parse(localStorage.getItem(`ai_designer_project_${projectId}`)!);
    expect(saved.panelStates['design.colors']).toBe(false);
  });

  test('切走再回来，展开状态恢复（跨视图 / 跨会话）', () => {
    enterWorkspace();
    click(byTitle('设计系统'));
    click(panelToggle('色彩'));        // 收起
    click(panelToggle('排版'));        // 展开（原本 defaultOpen=false）

    // 切到别的视图再切回来
    click(byTitle('页面'));
    click(byTitle('设计系统'));
    expect(text()).not.toContain('Primary 500');
    expect(text()).toContain('无衬线');

    // 回工程管理再重新打开工程 —— 相当于跨会话
    const projectId = useProjectStore.getState().id;
    click(byTitle('保存并返回工程管理'));
    act(() => {
      useProjectStore.setState({ panelStates: {} }); // 确保不是内存残留
      useWorkspaceStore.getState().openProject(projectId);
    });

    expect(useProjectStore.getState().panelStates['design.colors']).toBe(false);
    expect(useProjectStore.getState().panelStates['design.typography']).toBe(true);
    click(byTitle('设计系统'));
    expect(text()).not.toContain('Primary 500');
    expect(text()).toContain('无衬线');
  });

  test('不同工程各记各的，互不影响', () => {
    enterWorkspace();
    click(byTitle('资源'));
    click(panelToggle('图片'));        // 工程 A 收起图片面板
    const projectA = useProjectStore.getState().id;
    expect(useProjectStore.getState().panelStates['assets.images']).toBe(false);

    click(byTitle('保存并返回工程管理'));
    click(findButton('新建工程'));
    click(findButton('创建并进入'));

    // 工程 B 是全新的，不继承 A 的折叠状态
    expect(useProjectStore.getState().panelStates).toEqual({});
    click(byTitle('资源'));
    expect(text()).toContain('还没有图片素材');

    // 切回 A 仍是收起的
    click(byTitle('保存并返回工程管理'));
    act(() => {
      useWorkspaceStore.getState().openProject(projectA);
    });
    expect(useProjectStore.getState().panelStates['assets.images']).toBe(false);
  });
});
