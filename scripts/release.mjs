// Small, testable release helpers. No network calls or publication on import.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function releaseMetadata(tag, productName) {
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?)$/.exec(tag ?? '');
  if (!match || match[0] !== tag || match[2]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new Error('Use an existing SemVer tag such as v1.0.0 or v1.1.0-beta.1 (no build metadata).');
  }
  if (match[1].split('-')[0].split('.').some(part => Number(part) > 65535)) throw new Error('Version exceeds Windows installer limits.');
  if (typeof productName !== 'string' || !productName.trim() || /[\r\n/\\]/.test(productName) || productName.startsWith('-')) throw new Error('Invalid productName.');
  const slug = productName.replace(/[^\da-zA-Z._-]+/g, '-');
  if (!/[\da-zA-Z]/.test(slug)) throw new Error('Product name needs an ASCII release filename.');
  return { version: match[1], slug, prerelease: Boolean(match[2]) };
}

const targets = {
  'aarch64-apple-darwin': 'macos-arm64',
  'x86_64-apple-darwin': 'macos-x64',
  'x86_64-unknown-linux-gnu': 'linux-x64',
  'x86_64-pc-windows-msvc': 'windows-x64',
};
export function expectedBinaries(slug, version) {
  return [
    `${slug}-${version}-macos-arm64.app.tar.gz`, `${slug}-${version}-macos-x64.app.tar.gz`,
    `${slug}-${version}-linux-x64.deb`, `${slug}-${version}-linux-x64.AppImage`,
    `${slug}-${version}-windows-x64-setup.exe`,
  ];
}

/** Fail on any missing/ambiguous/empty bundle, rather than uploading a partial platform. */
export function collectBinaries({ root, output, target, tag, productName }) {
  const { slug, version } = releaseMetadata(tag, productName), platform = targets[target];
  if (!platform) throw new Error(`Unsupported release target: ${target}`);
  const selected = [];
  if (platform.startsWith('macos')) {
    const app = join(root, 'macos', `${productName}.app`);
    if (!existsSync(join(app, 'Contents', 'MacOS')) || !statSync(app).isDirectory()) throw new Error(`Missing macOS app: ${app}`);
    const executables = readdirSync(join(app, 'Contents', 'MacOS')).filter(name => {
      const info = statSync(join(app, 'Contents', 'MacOS', name)); return info.isFile() && info.size > 0 && (info.mode & 0o111);
    });
    if (!executables.length) throw new Error('macOS application has no executable.');
    selected.push({ app, name: `${slug}-${version}-${platform}.app.tar.gz` });
  } else {
    const kinds = platform === 'linux-x64' ? [['deb', '.deb', 'deb'], ['appimage', '.AppImage', 'AppImage']] : [['nsis', '.exe', 'exe']];
    for (const [folder, extension, suffix] of kinds) {
      const directory = join(root, folder);
      const matches = existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(extension) && statSync(join(directory, name)).isFile() && statSync(join(directory, name)).size > 0) : [];
      if (matches.length !== 1) throw new Error(`Expected exactly one nonempty ${extension} bundle in ${directory}; found ${matches.length}.`);
      selected.push({ source: join(directory, matches[0]), name: `${slug}-${version}-${platform}${platform.startsWith('windows') ? '-setup' : ''}.${suffix}` });
    }
  }
  mkdirSync(output, { recursive: true });
  for (const item of selected) {
    if (item.app) execFileSync('tar', ['-czf', resolve(output, item.name), '-C', join(root, 'macos'), '--', `${productName}.app`]);
    else cpSync(item.source, join(output, item.name));
  }
  return selected.map(item => item.name);
}

function main() {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const tag = process.env.RELEASE_TAG, metadata = releaseMetadata(tag, config.productName);
  switch (process.argv[2]) {
    case 'metadata':
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(metadata).map(([key, value]) => `${key}=${value}\n`).join(''));
      break;
    case 'config':
      writeFileSync(process.env.RELEASE_CONFIG, JSON.stringify({ version: metadata.version }));
      break;
    case 'collect':
      console.log(collectBinaries({ root: join('src-tauri', 'target', process.env.RELEASE_TARGET, 'release', 'bundle'), output: 'release-assets', target: process.env.RELEASE_TARGET, tag, productName: config.productName }).join('\n'));
      break;
    case 'verify':
      for (const name of expectedBinaries(metadata.slug, metadata.version)) {
        const file = join('release-assets', name);
        if (!existsSync(file) || !statSync(file).isFile() || !statSync(file).size) throw new Error(`Missing release payload: ${name}`);
      }
      break;
    default: throw new Error('Expected metadata, config, collect, or verify command.');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
