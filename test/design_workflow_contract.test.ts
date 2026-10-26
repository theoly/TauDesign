import { describe, expect, it } from 'bun:test';
import { buildDesignTaskContract, contentFingerprint, renderDesignTaskContract } from '../src/services/ai/designWorkflow';
import { selectChatWorkflow, selectImportWorkflow, selectModificationEntryWorkflow, selectRestyleWorkflow, WORKFLOW_CATALOG } from '../src/services/ai/workflowCatalog';

describe('design task contract', () => {
  it('routes a specified element to a candidate copy and records its immutable baseline', () => {
    const html = '<button data-nid="cta-1">Submit</button>';
    const contract = buildDesignTaskContract({ intent: 'modify_screen', request: '增大图标，缩小角标',
      target: { id: 'screen-a', name: '工作台', htmlContent: html }, elementNid: 'cta-1',
      deviceProfile: 'mobile', frameWidth: 390, referenceDeviceName: 'iPhone 16' });
    expect(contract.workflowId).toBe('edit-element-copy');
    expect(contract.strategy).toBe('candidate-copy');
    expect(contract.target?.baselineFingerprint).toBe(contentFingerprint(html));
    expect(contract.elementNid).toBe('cta-1');
    expect(contract.acceptance.join(' ')).toContain('已指定元素');
    expect(renderDesignTaskContract(contract)).toContain('target=工作台 [screen-a]');
  });

  it('keeps create, theme and question work in separate lanes', () => {
    const base = { request: '需求', deviceProfile: 'pc' as const, frameWidth: 1440 };
    expect(buildDesignTaskContract({ ...base, intent: 'create_screen' }).strategy).toBe('new-page');
    expect(buildDesignTaskContract({ ...base, intent: 'change_theme' }).strategy).toBe('no-canvas-mutation');
    expect(buildDesignTaskContract({ ...base, intent: 'question' }).workflowId).toBe('answer-question');
  });

  it('renders the project design system source so later work can honor its provenance', () => {
    const contract = buildDesignTaskContract({ intent: 'create_screen', request: '生成页面', deviceProfile: 'mobile', frameWidth: 390,
      designSystem: { id: 'warm-coral', name: '暖珊瑚' },
      designSystemOrigin: { kind: 'html_import', sourceName: '充值页.html', sourceFingerprint: '8a12bc34', tokenVersion: 4, tokenFingerprint: 'c0ffee12' } });
    const rendered = renderDesignTaskContract(contract);
    expect(rendered).toContain('designSystem=暖珊瑚 [warm-coral]');
    expect(rendered).toContain('tokens-v4 #c0ffee12');
    expect(rendered).toContain('designSystemOrigin=html_import: 充值页.html [8a12bc34]');
  });

  it('captures a stable source ID and effective token version for adoption checks', () => {
    const source = { kind: 'project' as const, sourceId: 'library-a', sourceName: '设计库 A', sourceFingerprint: 'revision-a',
      tokenVersion: 3, tokenFingerprint: 'c0ffee12' };
    const contract = buildDesignTaskContract({ intent: 'create_screen', request: '生成页面', deviceProfile: 'mobile', frameWidth: 390,
      designSystem: { id: 'warm-coral', name: '暖珊瑚' },
      designSystemOrigin: source });
    expect(contract.designSystemOrigin).toMatchObject({ sourceId: 'library-a', sourceFingerprint: 'revision-a', tokenVersion: 3 });
    expect(renderDesignTaskContract(contract)).toContain('id=library-a [revision-a] v3');
    source.sourceId = 'library-b';
    expect(contract.designSystemOrigin?.sourceId).toBe('library-a');
  });

  it('uses one workflow catalog across chat, import and restyle, with explicit element precedence', () => {
    expect(selectChatWorkflow({ intent: 'modify_screen', elementNid: 'cta-1' }).id).toBe('edit-element-copy');
    expect(selectChatWorkflow({ intent: 'create_screen', elementNid: 'cta-1' }).id).toBe('create-page');
    expect(selectChatWorkflow({ intent: 'change_theme', elementNid: 'cta-1' }).id).toBe('propose-theme');
    expect(selectImportWorkflow('selective').id).toBe('import-html-selective');
    expect(selectRestyleWorkflow('batch').id).toBe('restyle-batch');
    expect(WORKFLOW_CATALOG['edit-element-copy'].requiredContext).toContain('element');
  });

  it('routes broad edits through a non-mutating review contract while concrete element edits proceed directly', () => {
    expect(selectModificationEntryWorkflow('优化页面').id).toBe('review-page-modification');
    expect(selectModificationEntryWorkflow('增大图标，缩小角标', { hasElementReference: true }).id).toBe('edit-element-copy');
    expect(selectModificationEntryWorkflow('先分析主按钮，再给出建议', { hasElementReference: true }).id).toBe('review-page-modification');
    const contract = buildDesignTaskContract({ intent: 'modify_screen', reviewRequired: true, request: '优化页面',
      target: { id: 'screen-a', name: '首页', htmlContent: '<main>原页</main>' },
      deviceProfile: 'mobile', frameWidth: 390 });
    expect(contract.workflowId).toBe('review-page-modification');
    expect(contract.operation).toBe('analyze');
    expect(contract.strategy).toBe('review-first');
    expect(contract.allowedChanges).toEqual([]);
    expect(renderDesignTaskContract(contract)).toContain('workflow=review-page-modification');
  });

  it('snapshots the authorized scope and the actual knowledge identities', () => {
    const input = { intent: 'modify_screen' as const, request: '只修改主按钮', target: { id: 'screen-a', name: '首页', htmlContent: '<button>原文</button>' },
      elementNid: 'button-1', deviceProfile: 'mobile' as const, frameWidth: 390,
      protectedNids: ['safe-1', 'safe-1'], allowedChanges: ['element:button-1'], knowledgeFingerprint: 'project-v1',
      knowledgeSources: [{ kind: 'document' as const, id: 'doc:brief', fingerprint: 'brief-v1', stale: true }] };
    const first = buildDesignTaskContract(input), second = buildDesignTaskContract(input);
    expect(first.taskId).not.toBe(second.taskId);
    expect(first.request).toBe('只修改主按钮');
    expect(first.allowedChanges).toEqual(['element:button-1']);
    expect(first.protectedNids).toEqual(['safe-1']);
    expect(first.knowledgeSources).toEqual([{ kind: 'document', id: 'doc:brief', fingerprint: 'brief-v1', stale: true }]);
    expect(renderDesignTaskContract(first)).toContain('"id":"doc:brief","fingerprint":"brief-v1","stale":true');
    input.knowledgeSources[0].fingerprint = 'changed';
    expect(first.knowledgeSources[0].fingerprint).toBe('brief-v1');
  });
});
