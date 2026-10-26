#!/usr/bin/env python3
"""Loopback-only byte-split Provider fixture for the real Tauri WebView/Rust proxy.
Start this server, then run Tauri dev with the URL printed in fixture.json.
No online Providers, existing settings or project writes. Ctrl-C stops the server.
"""
import argparse,hashlib,json,socket,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

TEXT='<artifact type="screen" title="测试"><main><button>主按钮🙂🚀</button></main></artifact>'
OBJECT={'label':'主按钮🙂🚀','ok':True}
PROTOCOLS=['openai_compatible','anthropic','gemini','ollama_native']
def wire_response(protocol,kind):
 if kind=='http-error':return json.dumps({'error':{'message':'本地服务错误🙂'}},ensure_ascii=False).encode()
 if kind=='read-error':return b'data: {"choices":[{"delta":{"content":"'+bytes([0xe4,0xb8])
 raw=TEXT if kind=='text' else json.dumps(OBJECT,ensure_ascii=False,separators=(',',':'))
 reason=('max_tokens' if protocol=='anthropic' else 'MAX_TOKENS' if protocol=='gemini' else 'length') if kind=='limited' else ('end_turn' if protocol=='anthropic' else 'STOP' if protocol=='gemini' else 'stop')
 dump=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
 if protocol=='openai_compatible':wire='data: '+dump({'choices':[{'delta':{'content':raw},'finish_reason':reason}]})+'\n\ndata: [DONE]\n\n'
 elif protocol=='anthropic':wire='event: content_block_delta\ndata: '+dump({'type':'content_block_delta','delta':{'type':'text_delta','text':raw}})+'\n\nevent: message_delta\ndata: '+dump({'type':'message_delta','delta':{'stop_reason':reason}})+'\n\n'
 elif protocol=='gemini':wire='data: '+dump({'candidates':[{'content':{'parts':[{'text':raw}]},'finishReason':reason}]})+'\n\n'
 else:wire=dump({'message':{'content':raw}})+'\n'+dump({'done':True,'done_reason':reason})+'\n'
 return wire.encode()
def split_bytes(wire):
 # One HTTP chunk per non-ASCII byte, with delayed flushes: intentionally split every code point.
 parts=[];start=0
 for i,b in enumerate(wire):
  if b>=128:
   if start<i:parts.append(wire[start:i])
   parts.append(wire[i:i+1]);start=i+1
 if start<len(wire):parts.append(wire[start:])
 return parts

def main(args):
 output=args.output.resolve();output.mkdir(parents=True,exist_ok=True);records=[];lock=threading.Lock()
 class Handler(BaseHTTPRequestHandler):
  protocol_version='HTTP/1.1'
  def log_message(self,*_):pass
  def do_OPTIONS(self):
   self.send_response(204);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:5174');self.send_header('Access-Control-Allow-Headers','content-type');self.send_header('Content-Length','0');self.end_headers()
  def do_POST(self):
   path=urlparse(self.path).path;body=self.rfile.read(int(self.headers.get('Content-Length',0)))
   if path in ['/report/before','/report/after','/report/errors']:
    data=json.loads(body);stage=path.rsplit('/',1)[-1]
    with lock:
     data['serverRequests']=[r for r in records if r['stage']==stage]
     data['allRequestsNative']=all(r['origin'] is None for r in data['serverRequests'])
     (output/(stage+'-report.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    response=b'OK';self.send_response(200);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:5174');self.send_header('Content-Length',str(len(response)));self.end_headers();self.wfile.write(response)
    print(json.dumps({'stage':stage,'status':data['status'],'checks':len(data['checks']),'nativeRequests':len(data['serverRequests'])},ensure_ascii=False),flush=True);return
   parts=path.strip('/').split('/')
   if len(parts)<4 or parts[0] not in ['before','after','errors'] or parts[1] not in PROTOCOLS or parts[2] not in ['text','object','limited','http-error','read-error']:
    self.send_error(404);return
   stage,protocol,kind=parts[:3];wire=wire_response(protocol,kind);chunks=[wire] if kind in ['http-error','read-error'] else split_bytes(wire)
   record={'stage':stage,'protocol':protocol,'kind':kind,'origin':self.headers.get('Origin'),'httpPath':path,'method':'POST','wireSha256':hashlib.sha256(wire).hexdigest(),'wireBytes':len(wire),'httpChunks':[len(c) for c in chunks],'requestModel':json.loads(body).get('model'),'receivedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
   with lock:records.append(record);(output/'requests.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
   if kind=='http-error':
    error=wire;self.send_response(503);self.send_header('Content-Length',str(len(error)));self.end_headers();self.wfile.write(error);self.wfile.flush();return
   if kind=='read-error':
    self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Transfer-Encoding','chunked');self.end_headers()
    incomplete=wire
    self.wfile.write(('%x\r\n'%len(incomplete)).encode()+incomplete+b'\r\n');self.wfile.flush();time.sleep(.05);self.close_connection=True;self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
   self.connection.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
   self.send_response(200);self.send_header('Content-Type','application/x-ndjson' if protocol=='ollama_native' else 'text/event-stream; charset=utf-8');self.send_header('Transfer-Encoding','chunked');self.end_headers()
   try:
    for chunk in chunks:
     self.wfile.write(('%x\r\n'%len(chunk)).encode()+chunk+b'\r\n');self.wfile.flush();time.sleep(.025)
    self.wfile.write(b'0\r\n\r\n');self.wfile.flush()
   except (BrokenPipeError,ConnectionResetError):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);port=server.server_port
 info={'port':port,'beforeUrl':f'http://127.0.0.1:5174/doc/design-workflow-refactor/evidence/native-utf8/harness.html?port={port}&stage=before','afterUrl':f'http://127.0.0.1:5174/doc/design-workflow-refactor/evidence/native-utf8/harness.html?port={port}&stage=after'}
 (output/'fixture.json').write_text(json.dumps(info,indent=2)+'\n');print(json.dumps(info),flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);main(parser.parse_args())
