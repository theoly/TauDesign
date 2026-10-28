#!/usr/bin/env python3
"""Run the original 42 refactor browser entries against one frozen source snapshot."""
import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

WORKFLOWS = [
    'page-creation', 'pc-workflow', 'structured-edits', 'modification-analysis',
    'restyle-gates', 'html-import', 'multi-page', 'page-variants', 'resource-final',
    'design-entities', 'workflow-sources', 'candidate-repair', 'page-repair',
    'component-template', 'design-library-import', 'design-library-reference',
    'design-library-source', 'delivery-history', 'project-bundle', 'visual-evidence',
    'large-page'
]


def snapshot(root):
    paths = set()
    for pattern in ('src/**/*', 'scripts/**/*.py', 'src-tauri/src/**/*.rs',
                    'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json', 'vite.config.ts', 'package.json'):
        paths.update(p for p in root.glob(pattern) if p.is_file())
    files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
    return {'fingerprint': hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest(), 'files': files}


def main(args):
    root = Path(__file__).resolve().parents[1]
    output = args.artifacts.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit('Use an empty artifacts directory; historical reports must be preserved.')
    output.mkdir(parents=True, exist_ok=True)
    frozen = snapshot(root)
    (output / 'source.json').write_text(json.dumps(frozen, indent=2))
    report = {'codeFingerprint': frozen['fingerprint'], 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
              'scope': '42 deterministic browser entries; actual store/iframe/History/repository. Not native OS IO or live model proof.', 'cases': []}
    for browser in ('chromium', 'webkit'):
        for name in WORKFLOWS:
            case = output / browser / name
            case.mkdir(parents=True)
            path = case / 'report.json'
            command = [sys.executable, str(root / 'scripts' / f'verify-{name}.py'), '--browser', browser, '--url', args.url]
            if name in ('project-bundle', 'visual-evidence'):
                command += ['--artifacts', str(case)]
            elif name == 'large-page':
                command += ['--report', str(path)]
            else:
                command += ['--report', str(path), '--screenshot', str(case / 'screen.png')]
            if name == 'delivery-history':
                command += ['--candidate-preview']
            start = time.monotonic()
            timed_out = False
            with (case / 'run.log').open('w') as log:
                process = subprocess.Popen(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    code = process.wait(timeout=180)
                except subprocess.TimeoutExpired:
                    timed_out = True
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        code = process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        code = process.wait()
            try:
                status = json.loads(path.read_text()).get('status')
            except (OSError, ValueError):
                status = 'missing-or-invalid-report'
            result = {'workflow': name, 'browser': browser, 'exitCode': code, 'reportStatus': status,
                      'timeout': timed_out, 'seconds': round(time.monotonic()-start, 2), 'passed': code == 0 and status == 'passed',
                      'report': str(path), 'log': str(case / 'run.log'), 'command': command}
            report['cases'].append(result)
            report['status'] = 'running'
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(json.dumps({k: result[k] for k in ('workflow', 'browser', 'passed', 'seconds')}, ensure_ascii=False), flush=True)
    report['sourceUnchanged'] = snapshot(root) == frozen
    report['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    report['status'] = 'passed' if report['sourceUnchanged'] and all(c['passed'] for c in report['cases']) else 'failed'
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'status': report['status'], 'passed': sum(c['passed'] for c in report['cases']), 'total': len(report['cases'])}), flush=True)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--artifacts', type=Path, required=True)
    sys.exit(main(parser.parse_args()))
