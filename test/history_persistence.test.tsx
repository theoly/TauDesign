import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { useProjectStore,waitForProjectSave } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { defaultTheme } from '../src/utils/themePresets';
import { handleHistoryShortcut } from '../src/utils/historyShortcuts';
import {
  HistoryRepository,
  HistorySnapshot,
  historyKey,historyCacheKey,
  parseHistory,
  serializeHistory,
  trimHistoryForPersist,
  HISTORY_SCHEMA_VERSION
} from '../src/services/storage/historyRepository';
import {
  flushHistorySave,
  flushHistorySaveChecked,
  loadHistoryForProject,
  resumeHistoryPersistence,
  scheduleHistorySave,
  suspendHistoryPersistence
} from '../src/services/storage/historyPersistence';
import { ProjectStorage } from '../src/services/storage/projectStorage';

/** 内存版 ProjectStorage，用于验证文件夹工程通道 */
class MemoryStorage implements ProjectStorage {
  readonly kind = 'folder' as const;
  files = new Map<string, string>();
  async ensureDir() {}
  async exists(rel: string) { return this.files.has(rel); }
  async readText(rel: string) { return this.files.get(rel) ?? null; }
  async writeTextAtomic(rel: string, contents: string) { this.files.set(rel, contents); }
  async appendLine(rel: string, line: string) {
    this.files.set(rel, (this.files.get(rel) ?? '') + line + '\n');
  }
  async readTailLines() { return []; }
  async readAllLines() { return []; }
  async writeBinary(rel: string, data: string) { this.files.set(rel, data); }
  async readBinary(rel: string) { return this.files.get(rel) ?? null; }
  async listDir() { return []; }
  async remove(rel: string) { this.files.delete(rel); }
}

const entry = (id: string, label = id) => ({
  id,
  label,
  timestamp: 1,
  patches: [{ op: 'replace' as const, path: ['screens', 'sc-1'], value: { id: 'sc-1' } }],
  inversePatches: [{ op: 'replace' as const, path: ['screens', 'sc-1'], value: { id: 'sc-1' } }]
});

function bootstrapProject() {
  useProjectStore.getState().initNewProject({name:'History Test Project',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});
  useProjectStore.setState({
    name: 'History Test Project',
    folderPath: undefined,
    screens: {
      'sc-1': { id: 'sc-1', name: '首页', position: { x: 0, y: 0 }, htmlContent: '<main data-nid="r1">A</main>' },
      'sc-2': { id: 'sc-2', name: '详情页', position: { x: 500, y: 0 }, htmlContent: '<main data-nid="r2">B</main>' }
    },
    screenOrder: ['sc-1', 'sc-2'],
    overrides: {},
    decisions: {},
    components: {},
    assets: {},
    activeScreenId: 'sc-1'
  });
  useHistoryStore.getState().restore(null);
}
async function waitOpened(id:string,previous:unknown){
 const deadline=Date.now()+2000;
 while(useProjectStore.getState().id!==id||useProjectStore.getState().projectAuthoringSession===previous||useWorkspaceStore.getState().view!=='workspace'){
  if(Date.now()>deadline)throw Error('Expected asynchronous workspace open did not finish');await new Promise(resolve=>setTimeout(resolve,0));
 }
}

describe('撤销/重做完备性与跨会话持久化 (History Completeness & Persistence)', () => {
  beforeEach(async () => {
    localStorage.clear();
    // 取消在途防抖写入，避免跨用例串扰
    suspendHistoryPersistence();
    resumeHistoryPersistence();
    bootstrapProject();await useProjectStore.getState().saveProjectChecked();
  });

  afterEach(() => {
    suspendHistoryPersistence();
    resumeHistoryPersistence();
  });

  describe('CHK-F-01 ~ CHK-F-05: 变更入栈与回放完备性 (BR-HIS-08/09)', () => {
    test('CHK-F-01: 新建/删除画框的撤销重做连同 screenOrder 序位一并复原', () => {
      const store = useProjectStore.getState();
      const newId = store.addScreen({ name: '新页面', htmlContent: '<main data-nid="r3">C</main>' });
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-1', 'sc-2', newId]);

      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().screens[newId]).toBeUndefined();
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-1', 'sc-2']);

      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().screens[newId]).toBeDefined();
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-1', 'sc-2', newId]);

      // 删除中间画框后撤销，序位必须回到原处而非被追加到末尾
      useProjectStore.getState().removeScreen('sc-1');
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-2', newId]);
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-1', 'sc-2', newId]);
    });

    test('CHK-F-02: 工程约定 (decisions) 增删改可撤销可重做', () => {
      useProjectStore.getState().addDecision('按钮统一圆角 8px');
      const decId = Object.keys(useProjectStore.getState().decisions)[0];
      expect(decId).toBeDefined();

      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().decisions[decId]).toBeUndefined();
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().decisions[decId].text).toBe('按钮统一圆角 8px');

      useProjectStore.getState().toggleDecision(decId);
      expect(useProjectStore.getState().decisions[decId].active).toBe(false);
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().decisions[decId].active).toBe(true);

      useProjectStore.getState().removeDecision(decId);
      expect(useProjectStore.getState().decisions[decId]).toBeUndefined();
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().decisions[decId]).toBeDefined();
    });

    test('CHK-F-03: 组件定义增删改可撤销可重做', () => {
      const compId = useProjectStore.getState().createComponent('主按钮', '<button data-nid="b1">确认</button>');
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().components[compId]).toBeUndefined();
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().components[compId].name).toBe('主按钮');

      useProjectStore.getState().updateComponent(compId, { name: '次按钮' });
      expect(useProjectStore.getState().components[compId].name).toBe('次按钮');
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().components[compId].name).toBe('主按钮');

      useProjectStore.getState().deleteComponent(compId);
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().components[compId]).toBeDefined();
    });

    test('CHK-F-04: 素材新增/删除/清理未使用可撤销', () => {
      const asset = {
        id: 'asset-1',
        name: 'logo.png',
        type: 'image' as const,
        mimeType: 'image/png',
        source: 'upload' as const,
        relPath: 'assets/images/logo.png',
        refCount: 0
      };
      useProjectStore.getState().addAsset(asset);
      expect(useProjectStore.getState().assets['asset-1']).toBeDefined();
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().assets['asset-1']).toBeUndefined();
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().assets['asset-1']).toBeDefined();

      useProjectStore.getState().removeAsset('asset-1');
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().assets['asset-1'].name).toBe('logo.png');

      // 未被任何画框引用 → 会被清理，且清理可撤销
      const cleaned = useProjectStore.getState().cleanupUnusedAssets();
      expect(cleaned).toBe(1);
      expect(useProjectStore.getState().assets['asset-1']).toBeUndefined();
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().assets['asset-1']).toBeDefined();
    });

    test('CHK-F-05: 画框排序与一键整理可撤销可重做', () => {
      useProjectStore.getState().reorderScreens(['sc-2', 'sc-1']);
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-2', 'sc-1']);
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-1', 'sc-2']);
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().screenOrder).toEqual(['sc-2', 'sc-1']);

      const before = { ...useProjectStore.getState().screens['sc-2'].position! };
      useProjectStore.getState().arrangeScreens();
      const arranged = { ...useProjectStore.getState().screens['sc-2'].position! };
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().screens['sc-2'].position).toEqual(before);
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().screens['sc-2'].position).toEqual(arranged);
    });
  });

  describe('CHK-F-07 ~ CHK-F-10: 归档序列化与通道 (BR-HIS-01/03/05)', () => {
    test('CHK-F-08: projectId 或 schemaVersion 不符的归档一律丢弃', () => {
      const snap: HistorySnapshot = { past: [entry('h1')], future: [], checkpoints: [] };
      const raw = serializeHistory('proj_a', snap, 1024 * 1024);

      expect(parseHistory(raw, 'proj_a')?.past.length).toBe(1);
      expect(parseHistory(raw, 'proj_b')).toBeNull();
      expect(parseHistory(JSON.stringify({ ...JSON.parse(raw), schemaVersion: 99 }), 'proj_a')).toBeNull();
      expect(parseHistory('{ 坏掉的 json', 'proj_a')).toBeNull();
      expect(parseHistory(null, 'proj_a')).toBeNull();
      expect(JSON.parse(raw).schemaVersion).toBe(HISTORY_SCHEMA_VERSION);
    });

    test('CHK-F-10: 超预算时自最旧 past 起裁剪，至少保留最近 1 条', () => {
      const snapshot: HistorySnapshot = {
        past: Array.from({ length: 30 }, (_, i) => entry(`h${i}`, `动作${i}`)),
        future: [entry('f1')],
        checkpoints: [
          { id: 'cp1', label: 'cp1', timestamp: 1, screenSnapshot: { screenId: 'sc-1', htmlContent: 'x'.repeat(200) } }
        ]
      };

      const budget = 900;
      const trimmed = trimHistoryForPersist(snapshot, budget);
      expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(budget);
      expect(trimmed.past.length).toBeGreaterThanOrEqual(1);
      // 保留的是最近的动作，丢弃的是最旧的
      expect(trimmed.past[trimmed.past.length - 1].id).toBe('h29');

      // 预算充足时原样保留
      const intact = trimHistoryForPersist(snapshot, 10 * 1024 * 1024);
      expect(intact.past.length).toBe(30);
      expect(intact.checkpoints.length).toBe(1);
    });

    test('CHK-F-07: 文件夹工程归档写入 history.json 并可读回', async () => {
      const storage = new MemoryStorage();
      const repo = new HistoryRepository(storage, 'proj_folder');
      await repo.save({ past: [entry('h1', '修改页面内容')], future: [entry('f1')], checkpoints: [] });

      expect(storage.files.has('history.json')).toBe(true);
      const loaded = await repo.load();
      expect(loaded?.past[0].label).toBe('修改页面内容');
      expect(loaded?.future.length).toBe(1);

      // 工程 id 不符时读回为空
      expect(await new HistoryRepository(storage, 'proj_other').load()).toBeNull();

      await repo.remove();
      expect(storage.files.has('history.json')).toBe(false);
    });

    test('CHK-F-09: 加载期挂起时，调度与 flush 均不落盘', async () => {
      const projectId = 'proj_suspend';
      useHistoryStore.getState().commit('动作 A', [], []);

      suspendHistoryPersistence();
      scheduleHistorySave(projectId);
      flushHistorySave(projectId);
      expect(localStorage.getItem(historyKey(projectId))).toBeNull();

      resumeHistoryPersistence();
      await flushHistorySaveChecked(projectId);
      expect(localStorage.getItem(historyKey(projectId))).not.toBeNull();
    });
  });

  describe('CHK-F-06 & CHK-F-11: 关闭工程后重新打开仍可 undo/redo (BR-HIS-02/07)', () => {
    test('CHK-F-06: localStorage 工程重开后撤销栈、重做栈与还原点原样恢复且可继续撤销', async () => {
      const ws = useWorkspaceStore.getState();
      ws.createProject('历史持久化工程', 'pc', defaultTheme);
      const projectId = useProjectStore.getState().id;

      // 三次可撤销的编辑
      const screenId = useProjectStore.getState().addScreen({
        name: '首页',
        htmlContent: '<main data-nid="r1">V1</main>'
      });
      useProjectStore.getState().updateScreenHtml(screenId, '<main data-nid="r1">V2</main>', '改为 V2');
      useProjectStore.getState().updateScreenHtml(screenId, '<main data-nid="r1">V3</main>', '改为 V3');
      useHistoryStore.getState().addCheckpoint('AI 生成前备份', {
        screenId,
        htmlContent: '<main data-nid="r1">V1</main>'
      });
      // 撤销一步，让 redo 栈非空
      useHistoryStore.getState().undo();

      const beforeClose = {
        past: useHistoryStore.getState().past.map((h) => h.label),
        future: useHistoryStore.getState().future.map((h) => h.label),
        checkpoints: useHistoryStore.getState().checkpoints.length,
        html: useProjectStore.getState().screens[screenId].htmlContent
      };
      expect(beforeClose.past.length).toBeGreaterThanOrEqual(2);
      expect(beforeClose.future.length).toBe(1);

      // 关闭工程（返回工程管理页）→ 归档落盘
      useWorkspaceStore.getState().backToManager();
      await waitForProjectSave(projectId);
      expect(localStorage.getItem(historyCacheKey(projectId))).not.toBeNull();

      // 模拟重新打开应用：历史清空后再打开同一工程
      useHistoryStore.getState().restore(null);
      expect(useHistoryStore.getState().canUndo()).toBe(false);

      const previous=useProjectStore.getState().projectAuthoringSession;useWorkspaceStore.getState().openProject(projectId);await waitOpened(projectId,previous);

      expect(useHistoryStore.getState().past.map((h) => h.label)).toEqual(beforeClose.past);
      expect(useHistoryStore.getState().future.map((h) => h.label)).toEqual(beforeClose.future);
      expect(useHistoryStore.getState().checkpoints.length).toBe(beforeClose.checkpoints);
      expect(useHistoryStore.getState().canUndo()).toBe(true);
      expect(useHistoryStore.getState().canRedo()).toBe(true);
      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('V2');

      // 上一会话的动作依然可以继续撤销 / 重做
      useHistoryStore.getState().undo();
      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('V1');
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('V2');
      useHistoryStore.getState().redo();
      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('V3');
    });

    test('CHK-F-06b: 工程隔离——A 工程的历史不会出现在 B 工程', async () => {
      const ws = useWorkspaceStore.getState();
      ws.createProject('工程 A', 'pc', defaultTheme);
      const idA = useProjectStore.getState().id;
      useProjectStore.getState().addScreen({ name: 'A 页', htmlContent: '<main data-nid="a">A</main>' });
      useWorkspaceStore.getState().backToManager();
      await waitForProjectSave(idA);

      useWorkspaceStore.getState().createProject('工程 B', 'pc', defaultTheme);
      expect(useHistoryStore.getState().past.length).toBe(0);
      expect(useHistoryStore.getState().canUndo()).toBe(false);

      // A 的归档未被 B 覆盖
      const archiveA = parseHistory(localStorage.getItem(historyCacheKey(idA)), idA);
      expect(archiveA?.past.length).toBeGreaterThanOrEqual(1);
    });

    test('CHK-F-11: 删除工程时历史归档一并清除', async () => {
      const projectId = useProjectStore.getState().id;
      useHistoryStore.getState().commit('动作', [], []);
      await flushHistorySaveChecked(projectId);
      expect(localStorage.getItem(historyCacheKey(projectId))).not.toBeNull();

      await useProjectStore.getState().deleteProject(projectId);
      expect(localStorage.getItem(historyCacheKey(projectId))).toBeNull();
    });
  });

  describe('CHK-F-12: 撤销/重做快捷键统一判定 (BR-HIS-10)', () => {
    const fire = (el: HTMLElement, init: KeyboardEventInit) => {
      let result: 'undo' | 'redo' | null = null;
      const handler = (e: Event) => { result = handleHistoryShortcut(e as KeyboardEvent); };
      el.addEventListener('keydown', handler);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
      el.removeEventListener('keydown', handler);
      return result;
    };

    test('画框内 Cmd+Z / Cmd+Shift+Z 触发撤销与重做', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      useProjectStore.getState().updateScreenHtml('sc-1', '<main data-nid="r1">改过</main>', '改内容');
      expect(fire(div, { key: 'z', metaKey: true })).toBe('undo');
      expect(useProjectStore.getState().screens['sc-1'].htmlContent).toContain('A');

      expect(fire(div, { key: 'z', metaKey: true, shiftKey: true })).toBe('redo');
      expect(useProjectStore.getState().screens['sc-1'].htmlContent).toContain('改过');

      // Ctrl+Z（Windows/Linux）等效
      expect(fire(div, { key: 'Z', ctrlKey: true })).toBe('undo');
      div.remove();
    });

    test('文本编辑态不拦截，交还浏览器原生撤销', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      document.body.append(input, textarea, editable);

      expect(fire(input, { key: 'z', metaKey: true })).toBeNull();
      expect(fire(textarea, { key: 'z', metaKey: true })).toBeNull();
      if (editable.isContentEditable) {
        expect(fire(editable, { key: 'z', metaKey: true })).toBeNull();
      }
      // 无修饰键不触发
      const div = document.createElement('div');
      document.body.appendChild(div);
      expect(fire(div, { key: 'z' })).toBeNull();

      input.remove();
      textarea.remove();
      editable.remove();
      div.remove();
    });
  });
});
