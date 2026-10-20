import { expect, test } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { COMPONENT_CONTRACTS, renderComponentContracts } from '../src/services/ai/componentContracts';
import { buildStyleSpecimenHtml } from '../src/utils/styleSpecimen';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { techBlueTheme } from '../src/utils/themePresets';
test('通知徽标基座与真实样张在两个设备档位同步存在', () => {
  for (const device of ['pc', 'mobile'] as const) {
    const classes = extractClassWhitelist(getBaseCss(device));
    const doc = new DOMParser().parseFromString(buildStyleSpecimenHtml(device), 'text/html');
    for (const name of ['notification-control', 'badge-count', 'badge-dot']) {
      expect(classes).toContain(name); expect(doc.querySelector(`.${name}`)).not.toBeNull();
    }
    expect(doc.querySelector('.notification-control > .icon')).not.toBeNull();
  }
});
test('通知契约限定占位、大小与语义色层级，示例只用权威类', () => {
  const contract = COMPONENT_CONTRACTS.find(c => (c.id as string) === 'notification');
  expect(contract).toBeDefined();
  expect(contract!.rule).toContain('预留上沿'); expect(contract!.rule).not.toContain('禁用absolute'); expect(contract!.rule).toContain('紧急');
  expect(TokenLintEngine.scan(contract!.html, techBlueTheme, 'mobile').issues.filter(i => i.issueType === 'unknown_class')).toEqual([]);
  const prompt = renderComponentContracts(true, '通知未读角标');
  expect(prompt).toContain(contract!.html); expect(prompt).toContain('不能遮');
});
