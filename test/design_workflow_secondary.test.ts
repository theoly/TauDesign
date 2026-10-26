import { describe, expect, it } from 'bun:test';
import { buildHtmlImportContract, buildRestyleContract, contentFingerprint } from '../src/services/ai/designWorkflow';
import { convertHtmlImport, analyzeHtmlImport } from '../src/services/import/htmlImport';
import { acceptRestyleResult } from '../src/services/ai/restyleService';
import { defaultTheme } from '../src/utils/themePresets';

describe('secondary design workflows keep their contracts and provenance', () => {
  it('persists HTML import strategy, source identity and project device in the imported page metadata', () => {
    const source = '<html><head><title>Signup</title></head><body><main style="color:#222">表单</main></body></html>';
    const analysis = analyzeHtmlImport(source, 'signup.html');
    const contract = buildHtmlImportContract({ fileName: 'signup.html', html: analysis.sanitizedHtml, mode: 'selective', categories: ['colors'],
      deviceProfile: 'mobile', frameWidth: 390, designSystem: defaultTheme });
    const result = convertHtmlImport(analysis, { mode: 'selective', categories: ['colors'], designSystem: defaultTheme,
      colorMode: 'light', deviceProfile: 'mobile', frameWidth: 390 });
    expect(contract.workflowId).toBe('import-html-selective');
    expect(result.metadata.workflow).toEqual({ id: 'import-html-selective', contractVersion: 1,
      strategy: 'normalize-selected-tokens', sourceFingerprint: contentFingerprint(analysis.sanitizedHtml),
      designSystemId: defaultTheme.id, deviceProfile: 'mobile', frameWidth: 390 });
  });

  it('includes restyle contract on accepted and rejected candidates', () => {
    const target = { kind: 'screen' as const, id: 's1', name: 'Home', html: '<main data-nid="main0001"><p data-nid="text0001">Hello</p></main>' };
    const contract = buildRestyleContract({ scope: 'single', target, deviceProfile: 'mobile', frameWidth: 390, designSystem: defaultTheme });
    expect(contract.workflowId).toBe('restyle-page');
    expect(acceptRestyleResult(target, target.html, {}, contract).workflowContract).toEqual(contract);
    expect(acceptRestyleResult(target, '<main><p>missing ids</p></main>', {}, contract).workflowContract).toEqual(contract);
    expect(buildRestyleContract({ scope: 'batch', target, deviceProfile: 'pc', frameWidth: 1440 }).strategy).toBe('validated-batch');
  });
});
