import {test,expect} from 'bun:test';
import {validatePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';

const attachment = {
  name: 'screenshot.png',
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
};
const imageIdentity = referenceImageIdentity(attachment);

const baseContract = () => buildDesignTaskContract({
  intent: 'create_screen',
  request: '根据截图内容重新设计，要求有美感，高端商务质感',
  deviceProfile: 'pc',
  frameWidth: 1440,
  referenceImage: imageIdentity
});

const validFeatureBase = {
  id: 'f1',
  title: '企业服务概览',
  change: 'add' as const,
  basis: 'image' as const,
  sourceIds: [`image:${imageIdentity.fingerprint}`],
  information: [{ label: '服务标题', kind: 'display' as const }],
  interactions: [{ label: '点击了解', precondition: '展示列表', outcome: '静态展示服务详情', targetScreenId: '' }],
  states: [{ name: '默认态', condition: '初始载入', feedback: '展示企业级服务卡片' }]
};

test('CHK-F-01: 新建画框下模型返回 retain 或 update 自动归一化为 add', () => {
  const contract = baseContract();
  const planWithRetain = {
    goal: '高端商务企业官网重新设计',
    actor: '企业客户',
    completion: ['查看服务概览并进行商务咨询'],
    features: [
      { ...validFeatureBase, id: 'f1', change: 'retain' as const },
      { ...validFeatureBase, id: 'f2', change: 'update' as const }
    ],
    questions: []
  };

  const validated = validatePageTaskPlan(planWithRetain, contract);
  expect(validated.features[0].change).toBe('add');
  expect(validated.features[1].change).toBe('add');
});

test('CHK-F-02: 存在参考图时，basis: image 下常见的别名或留空自动对齐为合法图片指纹', () => {
  const contract = baseContract();
  const planWithAliases = {
    goal: '高端商务企业官网重新设计',
    actor: '企业客户',
    completion: ['查看服务概览'],
    features: [
      { ...validFeatureBase, id: 'f1', sourceIds: ['image'] },
      { ...validFeatureBase, id: 'f2', sourceIds: ['screenshot'] },
      { ...validFeatureBase, id: 'f3', sourceIds: ['attachment'] },
      { ...validFeatureBase, id: 'f4', sourceIds: [] } // 留空补齐
    ],
    questions: []
  };

  const validated = validatePageTaskPlan(planWithAliases, contract);
  const expectedImageId = `image:${imageIdentity.fingerprint}`;
  expect(validated.features[0].sourceIds).toEqual([expectedImageId]);
  expect(validated.features[1].sourceIds).toEqual([expectedImageId]);
  expect(validated.features[2].sourceIds).toEqual([expectedImageId]);
  expect(validated.features[3].sourceIds).toEqual([expectedImageId]);
});

test('CHK-F-03: basis: user 与 inference 的来源智能对齐与清洗', () => {
  const contract = baseContract();
  const plan = {
    goal: '高端商务企业官网重新设计',
    actor: '企业客户',
    completion: ['查看服务概览'],
    features: [
      { ...validFeatureBase, id: 'f1', basis: 'user' as const, sourceIds: ['user'] },
      { ...validFeatureBase, id: 'f2', basis: 'user' as const, sourceIds: [] },
      { ...validFeatureBase, id: 'f3', basis: 'inference' as const, sourceIds: ['inference', 'user:request'] }
    ],
    questions: []
  };

  const validated = validatePageTaskPlan(plan, contract);
  expect(validated.features[0].sourceIds).toEqual(['user:request']);
  expect(validated.features[1].sourceIds).toEqual(['user:request']);
  expect(validated.features[2].sourceIds).toEqual([]); // 清洗为空数组
});

test('CHK-F-04: 伪造未授权的文档来源依然严格抛错拦截', () => {
  const contract = baseContract();
  const planWithForgedSource = {
    goal: '高端商务企业官网重新设计',
    actor: '企业客户',
    completion: ['查看服务概览'],
    features: [
      { ...validFeatureBase, id: 'f1', basis: 'document' as const, sourceIds: ['forged-document'] }
    ],
    questions: []
  };

  expect(() => validatePageTaskPlan(planWithForgedSource, contract)).toThrow('来源或变更不在当前授权内');
});
