import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
import { UserFacingNotice } from '../src/components/common/UserFacingNotice';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { BoxModelInspector } from '../src/components/inspector/BoxModelInspector';
import { RadiusInspector } from '../src/components/inspector/RadiusInspector';
import { CandidateEvidencePanel } from '../src/components/canvas/CandidateEvidencePanel';
import { PageTaskPlanContent } from '../src/components/chat/PageTaskPlanCard';
import { HistoricalFailureCard } from '../src/components/chat/HistoricalFailureCard';
import { RenderCoverageDetails } from '../src/components/chat/RenderCoverageDetails';
import type { CandidateValidationEvidence } from '../src/services/ai/candidateValidation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CJK_RE = /[\u4e00-\u9fff]/;

function resetState() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
  useHistoryStore.setState({ past: [], future: [] });
}

function Bomb(): React.ReactElement {
  throw new Error('Synthetic failure');
}

describe('i18n blank screen and secondary panels', () => {
  beforeEach(resetState);
  afterEach(resetState);

  test('addBlankScreen produces localized screen name and blank HTML copy', () => {
    useProjectStore.getState().initNewProject({
      name: 'BlankI18nTest',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false,
    });

    const zhId = useProjectStore.getState().addBlankScreen();
    const zhScreen = useProjectStore.getState().screens[zhId];
    expect(zhScreen.name).toContain('页面');
    expect(zhScreen.htmlContent).toContain('空白画框');
    expect(zhScreen.htmlContent).toContain('主要操作');

    useLocaleStore.getState().setLocale('en');
    const enId = useProjectStore.getState().addBlankScreen();
    const enScreen = useProjectStore.getState().screens[enId];
    expect(enScreen.name).toContain('Screen');
    expect(enScreen.name).not.toMatch(CJK_RE);
    expect(enScreen.htmlContent).toContain('Blank screen');
    expect(enScreen.htmlContent).toContain('Primary Action');
    expect(enScreen.htmlContent).toContain('Secondary Action');
    expect(enScreen.htmlContent).not.toMatch(CJK_RE);
  });

  test('secondary inspector, canvas evidence, error boundary, and chat diagnostic cards adapt to English', () => {
    useProjectStore.getState().initNewProject({
      name: 'PanelsI18nTest',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false,
    });

    const evidence: CandidateValidationEvidence = {
      version: 1,
      capturedAt: 1_700_000_000_000,
      candidateFingerprint: 'cand-fp',
      contextFingerprint: 'ctx-fp',
      projectFingerprint: 'proj-fp',
      baselineFingerprint: 'base-fp',
      viewport: { profile: 'pc', width: 1440, height: 900 },
      designSystem: { id: 'default', tokenFingerprint: 'tok-fp' },
      source: { passed: true, findings: [] },
      quality: { passed: true, findings: [] },
      delivery: {
        status: 'ready',
        checks: [{ id: 'task', status: 'passed', message: 'Task checks passed' }],
      },
    };

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const origError = console.error;
    console.error = () => {};

    try {
      act(() => {
        useLocaleStore.getState().setLocale('en');
        root.render(
          <div>
            <UserFacingNotice message="Raw failure message differs from friendly notice" />
            <BoxModelInspector
              computedBox={{
                width: 200,
                height: 100,
                top: 0,
                left: 0,
                padding: { top: 8, right: 8, bottom: 8, left: 8 },
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
              }}
              declarations={{}}
              onStyleChange={() => {}}
            />
            <RadiusInspector declarations={{}} onStyleChange={() => {}} />
            <CandidateEvidencePanel current={evidence} />
            <PageTaskPlanContent
              plan={{
                goal: 'Create dashboard',
                actor: 'Analyst',
                completion: ['Metrics rendered'],
                questions: [],
                features: [
                  {
                    id: 'f1',
                    title: 'KPI cards',
                    change: 'add',
                    basis: 'user',
                    sourceIds: ['req-1'],
                    information: [{ label: 'Total orders', kind: 'display' }],
                    interactions: [
                      {
                        label: 'Refresh',
                        precondition: 'Ready',
                        outcome: 'Updated metrics',
                        targetScreenId: 'screen-1',
                      },
                    ],
                    states: [{ name: 'Empty', condition: 'Zero rows', feedback: 'Show placeholder' }],
                  },
                ],
              }}
            />
            <HistoricalFailureCard
              failure={{
                version: 1,
                status: 'failed',
                message: 'Provider error',
                model: 'gpt-4o',
                requests: 1,
                requestLimit: 4,
              }}
              onReuse={() => {}}
            />
            <RenderCoverageDetails coverage={'invalid' as unknown as []} />
            <ErrorBoundary>
              <Bomb />
            </ErrorBoundary>
          </div>,
        );
      });

      const enText = host.textContent ?? '';
      expect(enText).toContain(t('quality.evidenceCurrentTitle', undefined, 'en'));
      expect(enText).toContain(t('inspector.radiusTitle', undefined, 'en'));
      expect(enText).toContain(t('chat.histFailReuseBtn', undefined, 'en'));
      expect(enText).toContain(t('quality.coverageInvalid', undefined, 'en'));
      expect(enText).toContain(t('app.resetAndRetry', undefined, 'en'));
      expect(enText).not.toMatch(CJK_RE);

      act(() => {
        useLocaleStore.getState().setLocale('zh-CN');
      });

      const zhText = host.textContent ?? '';
      expect(zhText).toContain(t('quality.evidenceCurrentTitle', undefined, 'zh-CN'));
      expect(zhText).toContain(t('inspector.radiusTitle', undefined, 'zh-CN'));
      expect(zhText).toContain(t('chat.histFailReuseBtn', undefined, 'zh-CN'));
      expect(zhText).toContain(t('quality.coverageInvalid', undefined, 'zh-CN'));
    } finally {
      console.error = origError;
      act(() => root.unmount());
      host.remove();
    }
  });
});
