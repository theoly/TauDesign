import { describe, expect, test } from 'bun:test';
import {
  isStyleOnlyReferenceRequest,
  referencePlanningFields,
  validReferenceEvidence,
  type ReferenceEvidence
} from '../src/services/ai/referenceEvidence';
import {
  reconcileReferenceFieldsInPlan,
  resolveReferenceFieldOwnership
} from '../src/services/ai/referenceFieldOwnership';
import { preparePageTaskPlan, pageTaskPlanIssue, type PageTaskPlan } from '../src/services/ai/pageTaskPlan';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import { buildDesignTaskContract, contentFingerprint } from '../src/services/ai/designWorkflow';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { TaskBudget } from '../src/services/ai/taskBudget';
import { neutralModernTheme } from '../src/utils/themePresets';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { installReferenceImageDecoder } from './helpers/referenceImageDecoder';
import { referenceImageIdentity } from '../src/services/ai/workflowSources';
import { endpointIdentity } from '../src/services/ai/modelCapabilities';

const provider = {
  id: 'ref-advisory-test',
  name: 'RefAdvisoryTest',
  protocol: 'openai_compatible' as const,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'unit-only',
  isEnabled: true
};

function makeEvidence(labels: string[], group = '基础功能'): ReferenceEvidence {
  const hash = 'd'.repeat(64);
  const body = {
    version: 1 as const,
    transformVersion: 1 as const,
    image: { name: 'ref.png', fingerprint: '12345678' },
    sourceSha256: hash,
    sourcePath: `assets/images/${hash}.png`,
    width: 390,
    height: 844,
    parts: [
      { sha256: hash, relPath: `assets/images/${hash}.png`, width: 390, height: 844, rect: { x: 0, y: 0, width: 390, height: 844 } }
    ],
    parser: {
      version: 1 as const,
      providerId: 'vision',
      model: 'observer',
      configurationFingerprint: 'e'.repeat(64),
      inputFingerprint: 'f'.repeat(64)
    },
    observation: {
      summary: '纠结决策首页',
      texts: labels,
      groups: [],
      fields: labels.map(label => ({ label, type: 'text', required: false, group, value: '' })),
      visual: [],
      uncertainties: []
    }
  };
  const evidence = { ...body, fingerprint: contentFingerprint(JSON.stringify(body)) };
  expect(validReferenceEvidence(evidence)).toBe(true);
  return evidence;
}

describe('reference field advisory handling', () => {
  test('slash-containing field label matches verbatim and visual alignment requests bypass required fields', () => {
    const slashLabel = '拍照/截图识图对比免费次数';
    const evidence = makeEvidence([slashLabel], '决策工具');

    const stylePrompt =
      '修改页面图标和按钮配色，与附图一致\n\n仅执行以下用户确认的修改；未选择的建议不授权实施。';
    expect(isStyleOnlyReferenceRequest(stylePrompt)).toBe(true);
    expect(referencePlanningFields(evidence, stylePrompt)).toEqual([]);

    const plan: PageTaskPlan = {
      goal: '纠结决策',
      actor: '用户',
      completion: ['展示次数'],
      questions: [],
      features: [
        {
          id: 'f1',
          title: '决策工具',
          change: 'add',
          basis: 'image',
          sourceIds: ['image:12345678'],
          information: [{ label: slashLabel, kind: 'display' }],
          interactions: [],
          states: []
        },
        {
          id: 'f2',
          title: '其他区',
          change: 'add',
          basis: 'user',
          sourceIds: ['user:request'],
          information: [{ label: '说明', kind: 'display' }],
          interactions: [],
          states: []
        }
      ]
    };

    const resolved = resolveReferenceFieldOwnership(plan, evidence, '按截图中的字段还原全部表单');
    expect(resolved.warnings).toEqual([]);
    expect(resolved.ownership).toHaveLength(1);
    expect(resolved.ownership[0].featureId).toBe('f1');
  });

  test('reconcileReferenceFieldsInPlan deduplicates multi-owner fields while preserving compound info entries', () => {
    const label = '拍照/截图识图对比免费次数';
    const evidence = makeEvidence([label], '会员权益');
    const plan: PageTaskPlan = {
      goal: '对比次数展示',
      actor: '用户',
      completion: ['完成'],
      questions: [],
      features: [
        {
          id: 'f1',
          title: '首页卡片',
          change: 'add',
          basis: 'image',
          sourceIds: ['image:12345678'],
          information: [{ label, kind: 'display' }],
          interactions: [],
          states: []
        },
        {
          id: 'f2',
          title: '会员权益',
          change: 'add',
          basis: 'image',
          sourceIds: ['image:12345678'],
          information: [{ label, kind: 'display' }, { label: `额度说明、${label}`, kind: 'display' }],
          interactions: [],
          states: []
        }
      ]
    };

    const reconciled = reconcileReferenceFieldsInPlan(plan, evidence, '还原页面字段');
    expect(reconciled.warnings.some(w => w.includes(label) && w.includes('会员权益'))).toBe(true);
    // Group title '会员权益' wins ownership -> f1's duplicate exact entry is removed; f2 keeps compound entry intact
    expect(reconciled.plan.features[0].information).toEqual([]);
    expect(reconciled.plan.features[1].information.map(i => i.label)).toEqual([label, `额度说明、${label}`]);
  });

  test('PipelineExecutor surfaces reconciled field warnings without blocking generation', async () => {
    const restore = installReferenceImageDecoder();
    const attachment = {
      name: 'ref.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };
    const imgId = referenceImageIdentity(attachment).fingerprint;
    const slashLabel = '拍照/截图识图对比免费次数';
    const evidence = makeEvidence([slashLabel], '功能卡片');
    const planWithoutField: PageTaskPlan = {
      goal: '纠结决策',
      actor: '用户',
      completion: ['展示功能'],
      questions: [],
      features: [
        {
          id: 'f1',
          title: '功能卡片',
          change: 'add',
          basis: 'image',
          sourceIds: [`image:${imgId}`],
          information: [],
          interactions: [],
          states: []
        }
      ]
    };

    const transport = new MockTransport();
    transport.queueResponse(JSON.stringify(evidence.observation), 1);
    transport.queueResponse(JSON.stringify(planWithoutField), 1);
    transport.queueResponse(
      '<artifact type="screen" title="纠结决策首页"><main data-nid="root" class="col p-4"><h1>纠结决策首页</h1><button data-nid="go" class="btn btn-primary">去对比</button></main></artifact>',
      1
    );

    const vision = {
      ...provider,
      modelCapabilities: {
        observer: {
          version: 1 as const,
          revision: '1',
          source: 'user' as const,
          endpointIdentity: endpointIdentity(provider),
          mediaInput: 'native-part' as const
        }
      }
    };
    const budget = new TaskBudget({ maxRequests: 5, maxRequestedOutputTokens: 34568, maxDurationMs: 10000, maxRequestDurationMs: 10000 });
    try {
      const output = await PipelineExecutor.execute({
        input: { rawPrompt: '根据附图创建纠结决策首页', activeScreenId: null, attachment },
        provider,
        model: 'synthetic',
        engineCore: new DefaultAIEngineCore(transport),
        screens: {},
        deviceProfile: 'mobile',
        frameWidth: 390,
        designSystem: neutralModernTheme,
        baseSystemPrompt: 'test',
        pageTaskPlanning: {},
        taskBudget: budget,
        referenceProcessing: {
          binding: { provider: vision, model: 'observer' },
          storage: new LocalStorageStorage('ref-advisory-' + crypto.randomUUID())
        }
      });

      expect(output.status).toBe('applied');
      expect(output.workflowContract?.pageTaskPlan?.plan.features[0].information.some(i => i.label === slashLabel)).toBe(true);
      expect(pageTaskPlanIssue(output.workflowContract!)).toBeUndefined();
      expect(output.warnings?.some(w => w.includes(slashLabel))).toBe(true);
      expect(output.qualityReport?.passed).toBe(true);
      expect(output.qualityReport?.findings.find(f => f.code === 'reference_field_missing')?.severity).toBe('warning');
    } finally {
      restore();
      budget.close();
    }
  });

  test('capacity-full PageTaskPlan still succeeds without throwing and emits advisory coverage warning', async () => {
    const evidence = makeEvidence(['额外参考字段'], '补充区');
    const contract = buildDesignTaskContract({
      intent: 'create_screen',
      request: '按截图还原页面',
      deviceProfile: 'mobile',
      frameWidth: 390,
      referenceImage: evidence.image
    });
    contract.referenceImage!.evidence = evidence;

    const fullPlan: PageTaskPlan = {
      goal: '满载页面',
      actor: '用户',
      completion: ['完成'],
      questions: [],
      features: Array.from({ length: 8 }, (_, fi) => ({
        id: `f${fi + 1}`,
        title: `区块${fi + 1}`,
        change: 'add' as const,
        basis: 'image' as const,
        sourceIds: [`image:${evidence.image.fingerprint}`],
        information: Array.from({ length: 8 }, (__, ii) => ({ label: `字段${fi}-${ii}`, kind: 'display' as const })),
        interactions: [],
        states: []
      }))
    };

    const transport = new MockTransport();
    transport.queueResponse(JSON.stringify(fullPlan), 1);
    const budget = new TaskBudget({ maxRequests: 2, maxRequestedOutputTokens: 10000, maxDurationMs: 10000, maxRequestDurationMs: 10000 });
    const warnings: string[] = [];
    try {
      const snapshot = await preparePageTaskPlan(new DefaultAIEngineCore(transport), {
        contract,
        provider,
        model: 'synthetic',
        budget,
        isCurrent: () => true,
        onWarning: w => warnings.push(w)
      });
      expect(pageTaskPlanIssue({ ...contract, pageTaskPlan: snapshot })).toBeUndefined();
      expect(warnings.some(w => w.includes('额外参考字段'))).toBe(true);
      expect(warnings.some(w => w.includes('参考图字段检查提示'))).toBe(true);
    } finally {
      budget.close();
    }
  });

  test('checkGenerationQuality emits reference_field_missing as advisory warning only', () => {
    const evidence = makeEvidence(['拍照/截图识图对比免费次数']);
    const contract = buildDesignTaskContract({
      intent: 'modify_screen',
      request: '保留功能并优化布局',
      deviceProfile: 'mobile',
      frameWidth: 390,
      referenceImage: evidence.image
    });
    contract.referenceImage!.evidence = evidence;
    contract.pageTaskPlan = {
      version: 1,
      bindingFingerprint: 'a'.repeat(8),
      request: { providerId: provider.id, model: 'synthetic', inputFingerprint: 'b'.repeat(8), status: 'completed' },
      plan: {
        goal: '优化布局',
        actor: '用户',
        completion: ['完成'],
        questions: [],
        features: [
          {
            id: 'f1',
            title: '对比区',
            change: 'update',
            basis: 'image',
            sourceIds: [`image:${evidence.image.fingerprint}`],
            information: [{ label: '拍照/截图识图对比免费次数', kind: 'display' }],
            interactions: [],
            states: []
          }
        ]
      }
    };

    const report = checkGenerationQuality('<main data-nid="root" class="col p-4"><h1>纠结决策首页</h1></main>', {
      contentTask: contract
    });
    expect(report.passed).toBe(true);
    const finding = report.findings.find(f => f.code === 'reference_field_missing');
    expect(finding?.severity).toBe('warning');
  });
});
