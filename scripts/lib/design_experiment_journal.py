"""Append-only trial journal. Interrupted dispatches are never sent twice."""
import fcntl
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path


def exclusive_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def heartbeat(path, value):
    path = Path(path)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False))
    os.replace(tmp, path)


@contextmanager
def experiment_lock(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / 'runner.lock').open('a') as lock:
        # A stale file alone never proves a process is dead; the OS lock is authoritative.
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def dispatch_state(folder, plan, run):
    """Call while holding the experiment lock. Return new, terminal, or interrupted."""
    directory = Path(folder) / 'runs' / run['id']
    record = directory / 'record.json'
    started = directory / 'started.json'
    if record.exists():
        value = json.loads(record.read_text())
        if value['id'] != run['id'] or value['planId'] != plan['id']:
            raise ValueError('Foreign terminal record')
        return 'terminal'
    if started.exists():
        value = json.loads(started.read_text())
        if value['runId'] != run['id'] or value['planId'] != plan['id']:
            raise ValueError('Foreign dispatch')
        # The old owner has released/died (we hold the lock). Accounting after its last
        # observation is unknown, not zero. Keep this job in the full denominator.
        exclusive_json(record, {
            'id': run['id'], 'planId': plan['id'], 'status': 'interrupted',
            'firstPassed': False, 'finalPassed': False, 'firstSevereLayoutIssues': 0,
            'finalSevereLayoutIssues': 0, 'durationMs': max(0, (time.time()-value['epoch'])*1000),
            'inputTokens': 0, 'outputTokens': 0, 'usageEstimated': True,
            'requests': 0, 'requestedOutputTokens': 0, 'imageReady': False,
            'measurementComplete': False,
        })
        return 'interrupted'
    exclusive_json(started, {'version': 1, 'planId': plan['id'], 'runId': run['id'], 'epoch': time.time()})
    return 'new'
