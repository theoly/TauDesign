#!/usr/bin/env python3
"""Local control server for opt-in native live-provider validation.

Reads only TauDesign's current code binding. Credential stays in memory and is
served only to the local Vite origin; no credential or user project is archived.
Start Vite, this server, then Tauri with the printed harness URL. No AI mock.
"""
import argparse
import hashlib
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ORIGIN = 'http://127.0.0.1:5174'


def current_binding():
    found = []
    root = Path.home() / 'Library/WebKit/com.taudesign.studio'
    for path in root.rglob('localstorage.sqlite3'):
        with sqlite3.connect(path.as_uri()+'?mode=ro', uri=True) as db:
            row = db.execute('SELECT value FROM ItemTable WHERE key=?', ('ai_designer_providers_v1',)).fetchone()
        if not row:
            continue
        raw = row[0].decode('utf-16-le') if isinstance(row[0], bytes) else row[0]
        data = json.loads(raw)
        binding = data.get('bindings', {}).get('code')
        provider = next((p for p in data.get('providers', []) if binding and p.get('id') == binding.get('providerId') and p.get('isEnabled')), None)
        if provider and binding.get('modelId'):
            found.append(({'provider': provider, 'model': binding['modelId']}, hashlib.sha256(raw.encode()).hexdigest()))
    if len(found) != 1:
        raise ValueError('Expected exactly one configured native code binding; select it in TauDesign first')
    return found[0]


def main(args):
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    binding, config_hash = current_binding()
    secret = binding['provider'].get('apiKey', '')
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, status, body=b''):
            self.send_response(status)
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def permitted(self):
            return self.headers.get('Origin') == ORIGIN

        def do_OPTIONS(self):
            if not self.permitted():
                self.send(403)
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
            self.send_header('Access-Control-Allow-Headers', 'content-type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST')
            self.end_headers()

        def do_GET(self):
            if self.path != '/binding' or not self.permitted():
                self.send(403)
                return
            self.send(200, json.dumps(binding).encode())

        def do_POST(self):
            if self.path != '/report' or not self.permitted():
                self.send(403)
                return
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 4*1024*1024:
                self.send(413)
                return
            raw = self.rfile.read(size).decode()
            # Never archive a credential, even if a provider echoes it in an error.
            if secret:
                raw = raw.replace(secret, '[REDACTED]')
            data = json.loads(raw)
            try:
                data['nativeProviderConfigUnchanged'] = current_binding()[1] == config_hash
            except Exception:
                data['nativeProviderConfigUnchanged'] = False
            target = output / ('report.json' if data.get('complete') else 'progress.json')
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2))
            print(json.dumps({'status': data.get('status'), 'complete': data.get('complete'), 'cases': [(c['id'], c['status']) for c in data.get('checks', [])], 'requests': len(data.get('requests', [])), 'configUnchanged': data['nativeProviderConfigUnchanged']}, ensure_ascii=False), flush=True)
            self.send(200, b'{}')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    print(json.dumps({'port':server.server_port,'harness':f'{ORIGIN}/doc/design-workflow-refactor/evidence/live-provider/harness.html?port={server.server_port}','provider':binding['provider']['name'],'model':binding['model']},ensure_ascii=False),flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    main(parser.parse_args())
