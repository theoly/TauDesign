#!/usr/bin/env python3
"""Local streaming fixture and Chromium/WebKit client; never reads Provider settings."""
import argparse
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--browser', choices=['chromium', 'webkit'])
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = {}
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def handle(self):
            try:
                super().handle()
            except ConnectionResetError:
                # A cancelled keep-alive connection is an expected fixture outcome.
                pass

        def log_message(self, *_):
            pass

        def reply(self, data):
            raw = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5174')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5174')
            self.send_header('Access-Control-Allow-Headers', 'content-type')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_GET(self):
            if self.path == '/status':
                with lock:
                    self.reply(records)
            else:
                self.send_error(404)

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            path = urlparse(self.path).path
            if path.startswith('/report/'):
                stage = path.rsplit('/', 1)[-1]
                report = json.loads(body)
                with lock:
                    report['upstream'] = dict(records)
                (output / (stage + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                self.reply({'saved': True})
                print(json.dumps({'stage': stage, 'status': report['status'], 'checks': len(report['checks'])}), flush=True)
                return
            parts = path.strip('/').split('/')
            if len(parts) < 3:
                self.send_error(404)
                return
            stage, case, mode = parts[:3]
            key = stage + '/' + case
            record = {'chunks': 0, 'disconnected': False, 'completed': False, 'started': time.monotonic(), 'origin': self.headers.get('Origin')}
            with lock:
                records[key] = record
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            try:
                if mode == 'headers':
                    time.sleep(.5)
                if mode == 'error':
                    self.send_response(503)
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    record['completed'] = True
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Transfer-Encoding', 'chunked')
                self.end_headers()
                if mode == 'idle':
                    time.sleep(.5)
                count = 4 if mode == 'normal' else 100
                for i in range(count):
                    raw = ('data: ' + json.dumps({'choices': [{'delta': {'content': '本机分片🙂'}, 'finish_reason': None}]}, ensure_ascii=False) + '\n\n').encode()
                    self.wfile.write(('%x\r\n' % len(raw)).encode() + raw + b'\r\n')
                    self.wfile.flush()
                    record['chunks'] += 1
                    time.sleep(.04)
                raw = b'data: [DONE]\n\n'
                self.wfile.write(('%x\r\n' % len(raw)).encode() + raw + b'\r\n0\r\n\r\n')
                self.wfile.flush()
                record['completed'] = True
            except (BrokenPipeError, ConnectionResetError, OSError):
                record['disconnected'] = True
                record['disconnectedAt'] = time.monotonic()
            finally:
                with lock:
                    (output / 'upstream.json').write_text(json.dumps(records, indent=2) + '\n')

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    port = server.server_port
    url = f'http://127.0.0.1:5174/doc/design-workflow-refactor/evidence/request-cancellation/harness.html?port={port}'
    (output / 'fixture.json').write_text(json.dumps({'port': port, 'url': url}, indent=2) + '\n')
    print(json.dumps({'port': port, 'url': url}), flush=True)
    try:
        if args.browser:
            from playwright.sync_api import sync_playwright
            threading.Thread(target=server.serve_forever, daemon=True).start()
            with sync_playwright() as p:
                browser = getattr(p, args.browser).launch(headless=True)
                page = browser.new_page()
                page.goto(url + '&stage=' + args.browser)
                page.wait_for_function('window.__cancellationReport !== undefined', timeout=45000)
                report = page.evaluate('window.__cancellationReport')
                page.screenshot(path=str(output / (args.browser + '.png')), full_page=True)
                browser.close()
                if report['status'] != 'passed':
                    raise RuntimeError(json.dumps(report, ensure_ascii=False))
        else:
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if args.browser:
            server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
