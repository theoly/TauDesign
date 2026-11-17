import { describe, expect, test } from 'bun:test';
import {
  nextVersion,
  parseArgs,
  readCurrentVersion,
  replaceCargoLock,
  replaceCargoToml,
  replacePackageJson,
  replaceTauriConf,
} from '../scripts/bump-version.mjs';

describe('bump-version helpers', () => {
  test('parses bump kind and flags', () => {
    expect(parseArgs([])).toMatchObject({ bump: 'patch', commit: false, tag: false, push: false });
    expect(parseArgs(['minor', '--commit', '--tag', '-m', 'fix nid'])).toEqual({
      bump: 'minor', commit: true, tag: true, push: false, dryRun: false, message: 'fix nid',
    });
    expect(parseArgs(['0.1.0', '--push'])).toMatchObject({ commit: true, tag: true, push: true });
    expect(() => parseArgs(['--message'])).toThrow(/requires a message/);
  });

  test('bumps and validates semver', () => {
    expect(readCurrentVersion('{"version":"0.0.17"}')).toBe('0.0.17');
    expect(nextVersion('0.0.17', 'patch')).toBe('0.0.18');
    expect(nextVersion('0.0.17', 'minor')).toBe('0.1.0');
    expect(nextVersion('0.0.17', 'major')).toBe('1.0.0');
    expect(nextVersion('0.0.17', '0.0.20')).toBe('0.0.20');
    expect(() => nextVersion('0.0.17', '0.0.17')).toThrow(/already/);
    expect(() => nextVersion('0.0.17', 'beta')).toThrow(/Expected/);
  });

  test('rewrites synced version files without touching dependency versions', () => {
    expect(replacePackageJson('{\n  "version": "0.0.17"\n}\n', '0.0.18')).toContain('"version": "0.0.18"');
    expect(replaceTauriConf('{\n  "version": "0.0.17"\n}\n', '0.0.18')).toContain('"version": "0.0.18"');
    const toml = `[package]\nname = "app"\nversion = "0.0.17"\n\n[dependencies]\nserde = { version = "1.0" }\n`;
    expect(replaceCargoToml(toml, '0.0.18')).toContain('version = "0.0.18"');
    expect(replaceCargoToml(toml, '0.0.18')).toContain('serde = { version = "1.0" }');
    const lock = `[[package]]\nname = "app"\nversion = "0.0.17"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n`;
    const nextLock = replaceCargoLock(lock, '0.0.18');
    expect(nextLock).toContain('name = "app"\nversion = "0.0.18"');
    expect(nextLock).toContain('name = "serde"\nversion = "1.0.0"');
  });
});
