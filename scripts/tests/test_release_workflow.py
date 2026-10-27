"""Execute release.yml's real shell blocks against an isolated Git repo / fake gh.
Requires PyYAML; never creates a remote tag or release.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = yaml.safe_load((ROOT / '.github/workflows/release.yml').read_text())

def block(name):
    return next(s['run'] for s in WORKFLOW['jobs']['release']['steps'] if s.get('name') == name)

class ReleaseWorkflowTests(unittest.TestCase):
    def test_archives_use_exact_commit_and_checksums_cover_source_and_binaries(self):
        with tempfile.TemporaryDirectory(prefix='tau-source-') as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', '-C', directory, *args], text=True).strip()
            git('init', '-q')
            (root / 'source.txt').write_text('version 0.0.1\n')
            git('add', 'source.txt')
            git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Source fixture')
            sha = git('rev-parse', 'HEAD')
            (root / 'source.txt').write_text('uncommitted content must not leak')
            (root / 'private.txt').write_text('untracked must not leak')
            assets = root / 'release-assets'; assets.mkdir()
            (assets / 'TauDesign-0.0.1-linux-x64.deb').write_bytes(b'fake binary')
            env = {**os.environ, 'RELEASE_SLUG': 'TauDesign', 'RELEASE_TAG': 'v0.0.1', 'RELEASE_SHA': sha}
            subprocess.run(['bash', '-euo', 'pipefail', '-c', block('Archive the exact source commit')], cwd=root, env=env, check=True)
            expected = 'TauDesign-v0.0.1/source.txt'
            with zipfile.ZipFile(assets / 'TauDesign-v0.0.1-src.zip') as archive:
                self.assertEqual([item.filename for item in archive.infolist() if not item.is_dir()], [expected])
                self.assertEqual(archive.read(expected), b'version 0.0.1\n')
            with tarfile.open(assets / 'TauDesign-v0.0.1-src.tar.gz') as archive:
                self.assertEqual(archive.extractfile(expected).read(), b'version 0.0.1\n')
                self.assertNotIn('private.txt', '\n'.join(archive.getnames()))
            subprocess.run(['bash', '-euo', 'pipefail', '-c', block('Create and verify checksums')], cwd=assets, env=env, check=True, capture_output=True)
            lines = (assets / 'SHA256SUMS').read_text().splitlines()
            self.assertEqual(len(lines), 3)
            for line in lines:
                digest, name = line.split('  ', 1)
                self.assertEqual(digest, hashlib.sha256((assets / name).read_bytes()).hexdigest())

    def test_publication_stays_draft_on_failure_and_resumes_only_drafts(self):
        cases = [('missing', '', True), ('draft', '', True), ('public', '', False), ('missing', 'upload', False), ('missing', 'create', False)]
        for state, failure, success in cases:
            with self.subTest(state=state, failure=failure), tempfile.TemporaryDirectory(prefix='tau-publish-') as directory:
                root = Path(directory); (root / 'release-assets').mkdir(); (root / 'release-assets' / 'binary.exe').write_bytes(b'binary')
                gh = root / 'gh'
                gh.write_text('#!' + sys.executable + '\n' + '''import json,os,sys
with open(os.environ['GH_TRACE'],'a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')
command=sys.argv[2]
if command=='view':
 state=os.environ['GH_STATE']
 if state=='missing':sys.exit(1)
 print('true' if state=='draft' else 'false')
if command==os.environ.get('GH_FAIL'):sys.exit(1)
''')
                gh.chmod(0o755)
                env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'], 'GH_TRACE': str(root / 'trace.jsonl'), 'GH_STATE': state, 'GH_FAIL': failure, 'RUNNER_TEMP': str(root), 'RELEASE_TAG': 'v0.0.1', 'RELEASE_SHA': 'a'*40, 'RELEASE_SLUG': 'TauDesign', 'RELEASE_PRERELEASE': 'false'}
                result = subprocess.run(['bash', '-euo', 'pipefail', '-c', block('Upload all assets to a draft, then publish')], cwd=root, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, success, result.stderr)
                calls = [json.loads(line) for line in (root / 'trace.jsonl').read_text().splitlines()]
                commands = [call[1] for call in calls]
                self.assertEqual('edit' in commands, success)
                if success:
                    self.assertEqual(commands[-2:], ['upload', 'edit'])
                    self.assertIn('--draft=false', calls[-1])
                if state == 'public':self.assertEqual(commands, ['view'])
                if state == 'draft':self.assertNotIn('create', commands)
                if 'create' in commands:
                    created = calls[commands.index('create')]
                    self.assertIn('--draft', created); self.assertIn('--verify-tag', created)
                    self.assertEqual(created[created.index('--target')+1], 'a'*40)

if __name__ == '__main__':
    unittest.main()
