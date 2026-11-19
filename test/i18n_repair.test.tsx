import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CandidateRepairControl, RepairReceipt } from '../src/components/canvas/CandidateRepairControl';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import type { PageRepairRecord } from '../src/services/ai/pageRepairRecord';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

const sampleRepair: PageRepairRecord = {
  version: 1,
  attempts: 1,
  status: 'repaired',
  checkedAt: Date.now(),
  contextFingerprint: 'abcdef01',
  beforeHtmlFingerprint: 'abcdef02',
  afterHtmlFingerprint: 'abcdef03',
  providerId: 'fixture',
  model: 'fixture',
  requestFingerprint: 'abcdef04',
  initialRender: { status: 'complete', inspected: 1, findings: [] },
  operations: [{ nid: 'save', type: 'remove_styles', value: 'font-size' }],
  usage: { inputTokens: 10, outputTokens: 4 },
  usageEstimated: true,
  message: 'ok',
};

describe('i18n CandidateRepairControl', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('repair chrome and receipt follow locale switch', () => {
    const project = useProjectStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nRepair', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <CandidateRepairControl />
            <RepairReceipt value={{ invalid: true }} />
            <RepairReceipt value={sampleRepair} />
          </>,
        );
      });

      expect(host.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(
        t('repair.sectionAria', undefined, 'zh-CN'),
      );
      expect(host.textContent).toContain(t('repair.fixOnce', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('repair.receiptCorrupt', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('repair.statusRepaired', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('repair.technicalDetails', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('repair.receiptFooter', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(
        t('repair.sectionAria', undefined, 'en'),
      );
      expect(host.textContent).toContain(t('repair.fixOnce', undefined, 'en'));
      expect(host.textContent).toContain(t('repair.receiptCorrupt', undefined, 'en'));
      expect(host.textContent).toContain(t('repair.statusRepaired', undefined, 'en'));
      expect(host.textContent).toContain(t('repair.technicalDetails', undefined, 'en'));
      expect(host.textContent).toContain(t('repair.receiptFooter', undefined, 'en'));
      expect(host.textContent).not.toContain('修复一次并重新检查');
      expect(host.textContent).not.toContain('修复记录损坏');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
    }
  });
});
