#!/usr/bin/env node
/**
 * Bump TauDesign package versions and optionally commit / tag / push.
 *
 * Syncs:
 *   package.json
 *   src-tauri/tauri.conf.json
 *   src-tauri/Cargo.toml  ([package] version only)
 *   src-tauri/Cargo.lock  (name = "app" entry only)
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major|<x.y.z>] [options]
 *
 * Options:
 *   --commit          Create a release commit (includes already-staged files)
 *   --tag             Create lightweight tag vX.Y.Z after commit/files update
 *   --push            Push current branch and the new tag (implies --tag)
 *   -m, --message <s> Commit body after the "release: vX.Y.Z …" subject line
 *   --dry-run         Print actions without writing files or running git
 *
 * Examples:
 *   node scripts/bump-version.mjs
 *   node scripts/bump-version.mjs --commit --tag -m "fix region nid remap"
 *   node scripts/bump-version.mjs minor --commit --tag --push
 *   node scripts/bump-version.mjs 0.1.0 --commit --tag
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseArgs(argv) {
  const out = { bump: 'patch', commit: false, tag: false, push: false, dryRun: false, message: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') out.commit = true;
    else if (a === '--tag') out.tag = true;
    else if (a === '--push') { out.push = true; out.tag = true; out.commit = true; }
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-m' || a === '--message') {
      const next = argv[++i];
      if (!next) throw new Error(`${a} requires a message`);
      out.message = next;
    } else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else rest.push(a);
  }
  if (rest.length > 1) throw new Error(`Unexpected args: ${rest.slice(1).join(' ')}`);
  if (rest[0]) out.bump = rest[0];
  return out;
}

export function readCurrentVersion(pkgJson) {
  const version = JSON.parse(pkgJson).version;
  if (!SEMVER.test(version)) throw new Error(`Invalid package.json version: ${version}`);
  return version;
}

export function nextVersion(current, bump) {
  if (SEMVER.test(bump)) {
    if (bump === current) throw new Error(`Version is already ${current}`);
    return bump;
  }
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(`Expected patch|minor|major|<x.y.z>, got: ${bump}`);
  }
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function replacePackageJson(text, version) {
  const next = text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  if (next === text) throw new Error('package.json: version field not found');
  return next;
}

export function replaceTauriConf(text, version) {
  const next = text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  if (next === text) throw new Error('tauri.conf.json: version field not found');
  return next;
}

export function replaceCargoToml(text, version) {
  // Only the [package] stanza version — keep dependency versions intact.
  const next = text.replace(/^(\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m, `$1"${version}"`);
  if (next === text) throw new Error('Cargo.toml: [package] version not found');
  return next;
}

export function replaceCargoLock(text, version) {
  const next = text.replace(
    /(\[\[package\]\]\nname = "app"\nversion = )"[^"]*"/,
    `$1"${version}"`
  );
  if (next === text) throw new Error('Cargo.lock: app package version not found');
  return next;
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function write(rel, text, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] write ${rel}`);
    return;
  }
  writeFileSync(join(root, rel), text);
}

function git(args, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] git ${args.join(' ')}`);
    return '';
  }
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function assertRepoReady(tagName, { commit, tag }) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], false);
  if (branch === 'HEAD') throw new Error('Detached HEAD; check out a branch first');
  if (tag) {
    try {
      git(['rev-parse', '-q', '--verify', `refs/tags/${tagName}`], false);
      throw new Error(`Tag already exists: ${tagName}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Tag already exists')) throw error;
      // rev-parse fails when the tag is missing — expected.
    }
  }
  if (commit) {
    const staged = git(['diff', '--cached', '--name-only'], false);
    const dirty = git(['status', '--porcelain'], false);
    if (!staged && !dirty) {
      // Version files will create a diff; fine.
    }
  }
  return branch;
}

export function applyVersionWrites(version, { dryRun = false } = {}) {
  const files = {
    'package.json': replacePackageJson(read('package.json'), version),
    'src-tauri/tauri.conf.json': replaceTauriConf(read('src-tauri/tauri.conf.json'), version),
    'src-tauri/Cargo.toml': replaceCargoToml(read('src-tauri/Cargo.toml'), version),
    'src-tauri/Cargo.lock': replaceCargoLock(read('src-tauri/Cargo.lock'), version),
  };
  for (const [rel, text] of Object.entries(files)) write(rel, text, dryRun);
  return Object.keys(files);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const current = readCurrentVersion(read('package.json'));
  const version = nextVersion(current, opts.bump);
  const tagName = `v${version}`;

  if (!opts.dryRun) assertRepoReady(tagName, opts);

  console.log(`${current} → ${version}`);
  const touched = applyVersionWrites(version, { dryRun: opts.dryRun });

  if (opts.commit || opts.tag) {
    git(['add', '--', ...touched], opts.dryRun);
  }

  if (opts.commit) {
    const subject = opts.message.trim()
      ? `release: ${tagName} ${opts.message.trim()}`
      : `release: ${tagName}`;
    git(['commit', '-m', subject], opts.dryRun);
    console.log(`committed: ${subject}`);
  }

  if (opts.tag) {
    if (!opts.commit && !opts.dryRun) {
      // Tag whatever HEAD is after file updates (user may commit separately).
      const status = git(['status', '--porcelain', '--', ...touched], false);
      if (status) {
        throw new Error('Version files are dirty; pass --commit (or commit them) before --tag');
      }
    }
    git(['tag', tagName], opts.dryRun);
    console.log(`tagged: ${tagName}`);
  }

  if (opts.push) {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], false);
    if (branch === 'HEAD') throw new Error('Detached HEAD; check out a branch before --push');
    git(['push', '-u', 'origin', `HEAD:refs/heads/${branch}`], opts.dryRun);
    git(['push', 'origin', tagName], opts.dryRun);
    console.log(`pushed: ${branch} + ${tagName}`);
  }

  if (!opts.commit && !opts.tag) {
    console.log(`Updated ${touched.length} files. Next: commit, then --tag / --push.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
