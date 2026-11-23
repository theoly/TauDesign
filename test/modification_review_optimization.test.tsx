import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { checkStructureIntegrity } from '../src/services/ai/engine/pipeline/interceptors/guardInterceptor';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { buildScopedPageContext } from '../src/services/ai/engine/context/scopedPageContext';
import { ModificationReviewCard } from '../src/components/chat/ModificationReviewCard';
import {
  analyzeScreenModification,
  buildModificationReviewReceipt,
  buildReviewedModificationRequest,
} from '../src/services/ai/modificationReview';
import { buildPageRedesignSource, inspectRedesignContent } from '../src/services/ai/pageRedesignSource';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Modification Review & Context Fidelity 优化验证', () => {
  let host: HTMLDivElement, root: Root, targetId: string;
  let engine: ReturnType<typeof useAIEngineChat>;
  let objectMock: ReturnType<typeof spyOn>, pipelineMock: ReturnType<typeof spyOn>;

  const pageHtml = `
    <main data-nid="root0001" class="col gap-4">
      <section data-nid="dim00001" class="card col gap-3">
        <h2 data-nid="dimh0001">偏好维度与权重</h2>
        <div data-nid="row00001" class="col gap-2">
          <span data-nid="lbl00001">候选 A 评价</span>
          <span data-nid="hearts01"><svg viewBox="0 0 24 24"></svg><svg viewBox="0 0 24 24"></svg></span>
        </div>
      </section>
      <section data-nid="sum00001" class="card col gap-2">
        <h2 data-nid="sumh0001">合成偏好分</h2>
        <div data-nid="sumr0001" class="row justify-between items-center">
          <span data-nid="suml0001">候选 A · Offer_A</span>
          <span data-nid="sumi0001"><svg viewBox="0 0 24 24"></svg><svg viewBox="0 0 24 24"></svg></span>
          <span data-nid="sums0001">64 偏好中等</span>
        </div>
      </section>
    </main>
  `.trim();

  const Harness = () => {
    engine = useAIEngineChat();
    return null;
  };
  const render = async (node: React.ReactNode) => {
    await act(async () => {
      root.render(node);
    });
  };

  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({
      name: '审查优化测试',
      deviceProfile: 'mobile',
      designSystem: defaultTheme,
      createSpecimen: false,
    });
    targetId = useProjectStore.getState().addScreen({ name: '偏好评估', htmlContent: pageHtml });
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) => (p.id === 'prov-deepseek' ? { ...p, apiKey: 'test' } : p)),
      bindings: defaultBindings,
    });
    objectMock = spyOn(DefaultAIEngineCore.prototype, 'generateObject').mockResolvedValue({
      summary: '维度评价紧凑化与样式对齐',
      items: [
        {
          title: '维度卡改为紧凑行式',
          reason: '当前纵向留白偏多',
          change: '将维度卡评价区改为与合成偏好分一致的行式结构，保留原有心形图标',
          scope: 'page',
          targetNids: ['dim00001'],
          operations: [],
        },
        {
          title: '压缩评价行间距',
          reason: '行间距偏宽',
          change: '将候选评价行间距从 gap-2 收紧为 gap-1',
          scope: 'page',
          targetNids: ['row00001'],
          operations: [],
        },
      ],
    });
    pipelineMock = spyOn(PipelineExecutor, 'execute').mockResolvedValue({
      status: 'staged_side_by_side',
      rawResponse: `<artifact type="screen">${pageHtml}</artifact>`,
      extractedHtml: pageHtml,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    objectMock.mockRestore();
    pipelineMock.mockRestore();
  });

  test('CHK-F-01: 确认页级修改传递 modificationReview 放行结构守卫，且 wholePageRedesign 注入同页只读样式参照', async () => {
    await render(<Harness />);
    await act(async () => {
      await engine.sendMessage('偏好维度与权重更紧凑些，使用下方合成偏好分的样式', undefined, {
        referencedScreenId: targetId,
      });
    });

    const plan = engine.messages.find((m) => m.modificationReview?.status === 'ready')!;
    expect(plan).toBeDefined();

    await act(async () => {
      await engine.confirmModification(plan.id, ['suggestion-1', 'suggestion-2'], '', 'page');
    });

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    const execOptions = pipelineMock.mock.calls[0][0];
    expect(execOptions.modificationReview).toBeDefined();
    expect(execOptions.modificationReview?.selectedIds).toEqual(['suggestion-1', 'suggestion-2']);

    const enriched = enrichContext({
      rawPrompt: '偏好维度与权重更紧凑些，使用下方合成偏好分的样式',
      intent: 'modify_screen',
      activeScreenId: targetId,
      screens: { [targetId]: { id: targetId, name: '偏好评估', htmlContent: pageHtml } },
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: '系统提示',
      wholePageRedesign: { useCustomNavigation: false },
    });
    const userPrompt = enriched.messages.at(-1)!.content;
    expect(userPrompt).toContain('同页只读样式参照片段');
    expect(userPrompt).toContain('<!-- 参照区块: 合成偏好分 -->');
    expect(userPrompt).toContain('候选 A · Offer_A');
    expect(userPrompt).toContain('visualIcons');
  });

  test('CHK-F-01b: checkStructureIntegrity 在存在 modificationReview 合同时不因提示词 nid 正则误锁定单节点', () => {
    const modifiedHtml = pageHtml
      .replace('gap-3', 'gap-2')
      .replace('gap-2', 'gap-1');
    const guard = checkStructureIntegrity(
      {
        input: {
          rawPrompt: '保留 nid="dim00001" 的标题，同时调整 nid="sum00001" 间距',
          activeScreenId: targetId,
          decision: { intent: 'modify_screen', targetScreenId: targetId, reason: '已确认审查修改' },
        },
        intent: 'modify_screen',
        intentReason: '已确认审查修改',
        hasExplicitStructuralChangeIntent: true,
        wholePageRedesign: false,
        targetScreen: { id: targetId, name: '偏好评估', htmlContent: pageHtml, isSkeleton: false },
        referencedScreens: [],
        unmatchedMentions: [],
        activeRules: [],
        activeDecisions: [],
        assembledMessages: [],
        estimatedChars: 0,
        isContextTrimmed: false,
        warnings: [],
        workflowContract: {
          modificationReview: {} as any,
        } as any,
      },
      modifiedHtml
    );
    expect(guard.passed).toBe(true);
  });

  test('CHK-F-02: buildScopedPageContext 在请求引用同页区块标题时注入只读 styleReferences', () => {
    const context = buildScopedPageContext({
      screenId: targetId,
      html: pageHtml,
      targetNids: ['dim00001'],
      request: '偏好维度与权重更紧凑些，使用下方合成偏好分的样式',
    });

    expect(context.targetNids).toEqual(['dim00001']);
    expect(context.styleReferences).toBeDefined();
    expect(context.styleReferences).toHaveLength(1);
    expect(context.styleReferences![0].heading).toBe('合成偏好分');
    expect(context.styleReferences![0].nid).toBe('sum00001');
    expect(context.styleReferences![0].html).toContain('候选 A · Offer_A');
    expect(context.notice).toContain('styleReferences');
  });

  test('CHK-F-03: 分析提示词包含收敛与图标保真约束，且 pageRedesignSource 提取 visualIcons', async () => {
    const core = new DefaultAIEngineCore({} as any);
    const analysis = await analyzeScreenModification(core, {
      provider: defaultProviders[0],
      model: 'test',
      html: pageHtml,
      name: '偏好评估',
      request: '更紧凑，使用下方合成偏好分样式',
      designSystem: defaultTheme,
      mode: 'light',
    });

    const systemPrompt = objectMock.mock.calls[0][1].messages[0].content as string;
    expect(systemPrompt).toContain('合并为同一条region建议');
    expect(systemPrompt).toContain('禁止出现“A或B”二选一歧义描述');
    expect(systemPrompt).toContain('不得改为数字方框按钮');
    expect(systemPrompt).toContain('禁止只用p-4改p-3、gap-3改gap-2等纯间距微调敷衍结构对齐需求');

    const reviewedText = buildReviewedModificationRequest(analysis, ['suggestion-1'], '');
    expect(reviewedText).toContain('目标区块: dim00001');
    expect(reviewedText).not.toContain('nid="dim00001"');

    const receipt = buildModificationReviewReceipt(analysis, ['suggestion-1'], '', {
      id: 'analysis-target',
      htmlContent: pageHtml,
    });
    expect(receipt.selectedIds).toEqual(['suggestion-1']);

    const redesignSource = buildPageRedesignSource(pageHtml, { deviceProfile: 'mobile' });
    expect(redesignSource.visualIcons).toBeDefined();
    expect(redesignSource.visualIcons!.some((icon) => icon.kind === 'svg' && icon.count === 2)).toBe(true);
    expect(redesignSource.notice).toContain('visualIcons');
    expect(inspectRedesignContent(redesignSource, pageHtml, '调整布局', pageHtml)).toEqual([]);
  });

  test('CHK-F-04: ModificationReviewCard 混选 local 与 region/page 建议时默认不降级为 local 而丢弃主修改', async () => {
    const mixedReview = {
      status: 'ready' as const,
      summary: '混合建议',
      elementCount: 20,
      items: [
        {
          id: 'suggestion-1',
          title: '微调计数',
          reason: '补充单位',
          change: '改为 2/6 维度',
          scope: 'local' as const,
          targetNids: ['dimh0001'],
          regionImpactIndexes: [1],
          operations: [{ nid: 'dimh0001', type: 'set_text' as const, value: '偏好维度与权重' }],
          impactIndexes: [1],
        },
        {
          id: 'suggestion-2',
          title: '维度卡紧凑化',
          reason: '纵向留白偏多',
          change: '改为与合成偏好分一致的行式结构',
          scope: 'region' as const,
          targetNids: ['row00001'],
          regionImpactIndexes: [3, 4],
        },
      ],
    };
    let confirmed: { ids: string[]; mode: string } | null = null;
    await render(
      <ModificationReviewCard
        review={mixedReview}
        onConfirm={(ids, _extra, mode) => {
          confirmed = { ids, mode };
        }}
        onCancel={() => {}}
      />
    );
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes).toHaveLength(2);
    await act(async () => {
      boxes[0].click();
      boxes[1].click();
    });
    const confirmBtn = host.querySelector<HTMLButtonElement>('button[type="button"]')!;
    await act(async () => {
      confirmBtn.click();
    });
    expect(confirmed).toEqual({ ids: ['suggestion-1', 'suggestion-2'], mode: 'region' });
  });
});
